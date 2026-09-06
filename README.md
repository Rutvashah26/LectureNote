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
│   └── js/app.js              # Frontend logic: recording, upload, history, API calls
├── backend/
│   ├── app.py                 # Flask app: routes (no auth, open local app)
│   ├── models.py              # SQLite data layer (users, lectures, notes)
│   ├── config.py              # Reads settings from .env
│   ├── requirements.txt
│   ├── .env.example           # Copy to .env and fill in your keys
│   └── ai/
│       ├── transcribe.py      # Speech-to-text (Groq Whisper) — handles audio AND video
│       └── generate.py        # Generative AI (Groq LLM) — notes/outline/flashcards/quiz
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
| Speech-to-text                  | Groq Whisper API                                  |
| Video → audio extraction        | ffmpeg (CLI tool, called from Python)             |
| Notes/quiz/flashcard generation | Groq LLM API                                      |

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
- `GROQ_API_KEY` — from https://console.groq.com (LLM + Whisper)

Run the server:

```bash
python app.py
```

It starts on **http://localhost:5000**. Leave this running.

### 3. Frontend

The frontend is static files — no build step. Serve the project root with any
simple HTTP server (opening `index.html` directly via `file://` will break
cookies/CORS, so use a real local server):

```bash
# from the lecturenote/ project root, in a new terminal
python -m http.server 8000
```

Open **http://localhost:8000** in your browser.

> Make sure `FRONTEND_ORIGIN=http://localhost:8000` in `backend/.env` matches
> whatever port you serve the frontend on, or CORS will fail.

## Using the app

1. Open the app — homepage loads directly, no sign-in.
2. Click **+ New Lecture**.
3. Choose an input method:
   - **Record** — clicking the mic button triggers the browser's microphone
     permission prompt. Once granted, it records; Whisper transcribes automatically
     on submit (or you can type/edit the transcript yourself).
   - **Upload Audio/Video** — toggle between audio and video file types. Video
     files have their audio extracted with ffmpeg server-side, then transcribed.
   - **Paste Text** — skip transcription entirely.
4. Pick which study materials to generate (summary, outline, flashcards, quiz).
5. Click **Generate Study Materials**. Groq generates the content; it's saved
   and appears in **Your Lectures** (history) in the sidebar.

## Notes on costs

Both Groq LLM and Whisper APIs have a free tier.
Running this app uses your own `GROQ_API_KEY`.
