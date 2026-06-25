# LectureNote — Voice/Video to Study Notes

Converts spoken (or video) lectures into transcripts, then uses generative AI to produce
summary notes, an outline, flashcards, and a quiz.

## Why you were seeing "Failed to fetch"

The original single HTML file called a backend API at `http://localhost:5000/api`,
but no backend server existed — there was nothing listening on that port. This project
adds the actual Flask backend, so once it's running, the error goes away.

## Project structure

```
lecturenote/
├── index.html                 # Page markup only
├── static/
│   ├── css/styles.css         # All styling
│   └── js/app.js              # Frontend logic: auth, recording, upload, history, API calls
├── backend/
│   ├── app.py                 # Flask app: routes, Google OAuth, sessions
│   ├── models.py              # SQLite data layer (users, lectures, notes)
│   ├── config.py              # Reads settings from .env
│   ├── requirements.txt
│   ├── .env.example           # Copy to .env and fill in your keys
│   └── ai/
│       ├── transcribe.py      # Speech-to-text (OpenAI Whisper) — handles audio AND video
│       └── generate.py        # Generative AI (Anthropic Claude) — notes/outline/flashcards/quiz
└── README.md
```

## What's used to build this

| Layer                           | Technology                                        |
| ------------------------------- | ------------------------------------------------- |
| Frontend markup                 | HTML5                                             |
| Frontend styling                | CSS3 (custom, no framework)                       |
| Frontend logic                  | Vanilla JavaScript (fetch API, MediaRecorder API) |
| Backend server                  | Python 3 + Flask                                  |
| Database                        | SQLite (file-based, zero setup)                   |
| Authentication                  | Google OAuth 2.0 via Authlib                      |
| Speech-to-text                  | OpenAI Whisper API                                |
| Video → audio extraction        | ffmpeg (CLI tool, called from Python)             |
| Notes/quiz/flashcard generation | Anthropic Claude API                              |

## Setup

### 1. Install prerequisites

- Python 3.10+
- **ffmpeg** (required for video uploads — extracts the audio track before transcription)
  - Mac: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: download from https://ffmpeg.org/download.html and add to PATH

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and fill in:

- `SECRET_KEY` — any random string
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- `OPENAI_API_KEY` — from https://platform.openai.com (used for Whisper)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — see step 3 below

Run the server:

```bash
python app.py
```

It starts on **http://localhost:5000**. Leave this running.

### 3. Set up Google OAuth (for sign-in)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project (or pick an existing one)
3. Click **Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Add an **Authorized redirect URI**: `http://localhost:5000/api/auth/google/callback`
6. Copy the generated **Client ID** and **Client Secret** into `backend/.env`

### 4. Frontend

The frontend is static files — no build step. Serve the project root with any
simple HTTP server (opening `index.html` directly via `file://` will break
cookies/CORS, so use a real local server):

```bash
# from the lecturenote/ project root, in a new terminal
python -m http.server 8000
```

Open **http://localhost:8000** in your browser.

> Make sure `FRONTEND_ORIGIN=http://localhost:8000` in `backend/.env` matches
> whatever port you serve the frontend on, or CORS/login will fail.

## Using the app

1. Open the app — you'll be asked to **Sign in with Google**.
2. Click **+ New Lecture**.
3. Choose an input method:
   - **Record** — clicking the mic button triggers the browser's microphone
     permission prompt. Once granted, it records; Whisper transcribes automatically
     on submit (or you can type/edit the transcript yourself).
   - **Upload Audio/Video** — toggle between audio and video file types. Video
     files have their audio extracted with ffmpeg server-side, then transcribed.
   - **Paste Text** — skip transcription entirely.
4. Pick which study materials to generate (summary, outline, flashcards, quiz).
5. Click **Generate Study Materials**. Claude generates the content; it's saved
   to your account and appears in **Your Lectures** (history) in the sidebar.
6. Click **Log out** from the user menu (top right) to end your session.

## Notes on costs

Both the OpenAI Whisper API and the Anthropic Claude API are paid, metered APIs.
Running this app will incur small per-request charges on your own API keys.
