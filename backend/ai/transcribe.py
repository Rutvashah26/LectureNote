"""
ai/transcribe.py
Speech-to-text using OpenAI's Whisper API.

Handles both AUDIO and VIDEO input:
  - Audio files are sent to Whisper directly.
  - Video files have their audio track extracted with ffmpeg first
    (Whisper's API only accepts audio/short video, and large video files
    need to be shrunk to an audio-only stream anyway).
"""

import os
import subprocess
import uuid
from openai import OpenAI
from config import OPENAI_API_KEY, UPLOAD_FOLDER, ALLOWED_VIDEO_EXT

client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


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
    Transcribes an audio OR video file and returns plain text.
    Raises RuntimeError with a clear message if anything goes wrong.
    """
    if client is None:
        raise RuntimeError(
            "OPENAI_API_KEY is not set on the server. Add it to backend/.env to enable transcription."
        )

    ext = filepath.rsplit(".", 1)[-1].lower()
    audio_path = filepath
    temp_audio_created = False

    try:
        if ext in ALLOWED_VIDEO_EXT:
            audio_path = _extract_audio_from_video(filepath)
            temp_audio_created = True

        with open(audio_path, "rb") as f:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="text"
            )
        # SDK returns either a string or an object depending on version
        text = transcript if isinstance(transcript, str) else getattr(transcript, "text", str(transcript))
        return text.strip()

    except Exception as e:
        raise RuntimeError(f"Transcription failed: {e}")

    finally:
        if temp_audio_created and os.path.exists(audio_path):
            os.remove(audio_path)
