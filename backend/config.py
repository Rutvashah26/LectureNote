"""
config.py
Loads all configuration / secrets from environment variables (.env file).
Nothing here is hardcoded — copy .env.example to .env and fill in your own keys.
"""

import os
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env if present

# --- Flask / session ---
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:8000")

# --- Database ---
DATABASE_PATH = os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "lecturenote.db"))

# --- Google OAuth ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5000/api/auth/google/callback")

# --- AI providers ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# --- Uploads ---
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
MAX_CONTENT_LENGTH = 200 * 1024 * 1024  # 200 MB, video files are bigger than audio
ALLOWED_AUDIO_EXT = {"mp3", "wav", "m4a", "ogg", "webm", "aac", "flac"}
ALLOWED_VIDEO_EXT = {"mp4", "mov", "avi", "mkv", "webm"}
