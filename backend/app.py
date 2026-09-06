"""
app.py
Main Flask backend for LectureNote.

Run with:  python app.py
Server listens on http://localhost:5000  (matches API_BASE in the frontend JS)

Routes:
  GET  /api/auth/google/login      -> redirects to Google's OAuth consent screen
  GET  /api/auth/google/callback    -> Google redirects back here with a code
  GET  /api/auth/me                 -> current logged-in user (or 401)
  POST /api/auth/logout             -> clears session

  GET    /api/lectures              -> list lectures for current user (history)
  GET    /api/lectures/<id>         -> full lecture + notes
  DELETE /api/lectures/<id>         -> delete a lecture

  POST /api/transcribe/process/text  -> body: {title, subject, transcript, generateTypes}
  POST /api/transcribe/process/file  -> multipart form: title, subject, generateTypes, file (audio OR video)
"""

import os
import sys
import json
import traceback
from functools import wraps

from flask import Flask, request, jsonify, session, redirect
from flask_cors import CORS
from werkzeug.utils import secure_filename
from authlib.integrations.flask_client import OAuth

sys.path.append(os.path.dirname(__file__))
import config
import models
from ai import transcribe as ai_transcribe
from ai import generate as ai_generate

app = Flask(__name__)
app.secret_key = config.SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH

# Allow the frontend (served from a different port) to call this API with cookies
CORS(app, supports_credentials=True, origins="*")

os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
models.init_db()

# ---------------- Google OAuth setup ----------------
oauth = OAuth(app)
oauth.register(
    name="google",
    client_id=config.GOOGLE_CLIENT_ID,
    client_secret=config.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            user = models.get_or_create_user(email="guest@lecturenote.com", name="Guest User")
            session["user_id"] = user["id"]
        return fn(*args, **kwargs)
    return wrapper


def current_user():
    return models.get_user_by_id(session["user_id"])


# ---------------- Error handling ----------------

@app.errorhandler(Exception)
def handle_exception(e):
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500


# ---------------- Auth routes ----------------

@app.route("/api/auth/google/login")
def google_login():
    if not config.GOOGLE_CLIENT_ID:
        return jsonify({"error": "Google OAuth is not configured on the server (missing GOOGLE_CLIENT_ID)."}), 500
    redirect_uri = config.GOOGLE_REDIRECT_URI
    return oauth.google.authorize_redirect(redirect_uri)


@app.route("/api/auth/google/callback")
def google_callback():
    token = oauth.google.authorize_access_token()
    userinfo = token.get("userinfo") or oauth.google.parse_id_token(token)

    email = userinfo["email"]
    name = userinfo.get("name")
    picture = userinfo.get("picture")

    user = models.get_or_create_user(email=email, name=name, picture=picture)
    session["user_id"] = user["id"]

    # send the user back to the frontend app
    return redirect(config.FRONTEND_ORIGIN)


@app.route("/api/auth/me")
def auth_me():
    if "user_id" not in session:
        user = models.get_or_create_user(email="guest@lecturenote.com", name="Guest User")
        session["user_id"] = user["id"]
    user = current_user()
    if not user:
        user = models.get_or_create_user(email="guest@lecturenote.com", name="Guest User")
        session["user_id"] = user["id"]
    return jsonify({"id": user["id"], "email": user["email"], "name": user["name"], "picture": user.get("picture")})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


# ---------------- Lecture / history routes ----------------

@app.route("/api/lectures")
@login_required
def list_lectures():
    lectures = models.list_lectures_for_user(session["user_id"])
    return jsonify(lectures)


@app.route("/api/lectures/<lecture_id>")
@login_required
def get_lecture(lecture_id):
    lecture = models.get_lecture(lecture_id, session["user_id"])
    if not lecture:
        return jsonify({"error": "Lecture not found"}), 404
    return jsonify(lecture)


@app.route("/api/lectures/<lecture_id>", methods=["DELETE"])
@login_required
def delete_lecture(lecture_id):
    models.delete_lecture(lecture_id, session["user_id"])
    return jsonify({"ok": True})


# ---------------- Generation helper ----------------

def _run_generators(lecture_id, transcript, generate_types):
    """Calls Claude for each requested output type and stores the results."""
    for gtype in generate_types:
        generator = ai_generate.GENERATORS.get(gtype)
        if not generator:
            continue
        if gtype in ("flashcards", "quiz"):
            data = generator(transcript)
            models.add_note(lecture_id, gtype, data=data)
        else:
            content = generator(transcript)
            models.add_note(lecture_id, gtype, content=content)


# ---------------- Process: pasted / recorded text ----------------

@app.route("/api/transcribe/process/text", methods=["POST"])
@login_required
def process_text():
    body = request.get_json(force=True)
    title = (body.get("title") or "").strip()
    subject = (body.get("subject") or "").strip()
    transcript = (body.get("transcript") or "").strip()
    generate_types = body.get("generateTypes") or []

    if not title:
        return jsonify({"error": "Title is required."}), 400
    if not transcript or len(transcript) < 20:
        return jsonify({"error": "Transcript must be at least 20 characters."}), 400

    lecture_id = models.create_lecture(session["user_id"], title, subject, source_type="text", status="processing")
    models.update_lecture(lecture_id, transcript=transcript)

    try:
        _run_generators(lecture_id, transcript, generate_types)
        models.update_lecture(lecture_id, status="completed")
    except Exception as e:
        models.update_lecture(lecture_id, status="failed", error=str(e))
        return jsonify({"error": f"Generation failed: {e}", "lectureId": lecture_id}), 500

    return jsonify({"lectureId": lecture_id})


# ---------------- Process: uploaded audio or video file ----------------

@app.route("/api/transcribe/process/file", methods=["POST"])
@login_required
def process_file():
    title = (request.form.get("title") or "").strip()
    subject = (request.form.get("subject") or "").strip()
    generate_types = json.loads(request.form.get("generateTypes") or "[]")
    file = request.files.get("file")

    if not title:
        return jsonify({"error": "Title is required."}), 400
    if not file:
        return jsonify({"error": "No file uploaded."}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    is_video = ext in config.ALLOWED_VIDEO_EXT
    is_audio = ext in config.ALLOWED_AUDIO_EXT
    if not (is_video or is_audio):
        return jsonify({"error": f"Unsupported file type: .{ext}"}), 400

    save_path = os.path.join(config.UPLOAD_FOLDER, filename)
    file.save(save_path)

    source_type = "video" if is_video else "audio"
    lecture_id = models.create_lecture(session["user_id"], title, subject, source_type=source_type, status="processing")

    try:
        transcript = ai_transcribe.transcribe_file(save_path)
        models.update_lecture(lecture_id, transcript=transcript)
        _run_generators(lecture_id, transcript, generate_types)
        models.update_lecture(lecture_id, status="completed")
    except Exception as e:
        models.update_lecture(lecture_id, status="failed", error=str(e))
        return jsonify({"error": str(e), "lectureId": lecture_id}), 500
    finally:
        if os.path.exists(save_path):
            os.remove(save_path)

    return jsonify({"lectureId": lecture_id})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
