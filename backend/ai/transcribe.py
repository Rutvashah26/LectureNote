"""
ai/transcribe.py
Speech-to-text using Groq's Whisper API (whisper-large-v3).

Handles both AUDIO and VIDEO input:
  - Audio files are sent to Groq Whisper directly.
  - Video files have their audio track extracted with ffmpeg first.

Groq's Whisper API is free-tier supported and extremely fast.
"""

import os
import subprocess
import uuid
from groq import Groq
from config import GROQ_API_KEY, UPLOAD_FOLDER, ALLOWED_VIDEO_EXT

client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


def _extract_audio_from_video(video_path: str) -> str:
    """Uses ffmpeg to pull the audio track out of a video file as mp3."""
    audio_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}.mp3")
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn",                # no video
        "-acodec", "libmp3lame",
        "-ar", "16000",       # whisper-friendly sample rate
        "-ac", "1",
        audio_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed to extract audio: {result.stderr[-500:]}")
    return audio_path


def transcribe_file(filepath: str) -> str:
    """
    Transcribes an audio OR video file using Groq Whisper and returns plain text.
    Raises RuntimeError with a clear message if anything goes wrong.
    """
    if client is None:
        raise RuntimeError(
            "GROQ_API_KEY is not set on the server. Add it to backend/.env to enable transcription. "
            "Get a free key at https://console.groq.com"
        )

    ext = filepath.rsplit(".", 1)[-1].lower()
    audio_path = filepath
    temp_audio_created = False

    try:
        if ext in ALLOWED_VIDEO_EXT:
            audio_path = _extract_audio_from_video(filepath)
            temp_audio_created = True

        with open(audio_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                file=(os.path.basename(audio_path), f.read()),
                model="whisper-large-v3",
                response_format="text",
                language="en",
            )

        # Groq returns a string directly for response_format="text"
        text = transcription if isinstance(transcription, str) else getattr(transcription, "text", str(transcription))
        return text.strip()

    except Exception as e:
        raise RuntimeError(f"Transcription failed: {e}")

    finally:
        if temp_audio_created and os.path.exists(audio_path):
            os.remove(audio_path)
