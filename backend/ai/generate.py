"""
ai/generate.py
Generative AI layer — turns a raw lecture transcript into study materials
using Groq's LLM API: summary notes, an outline, flashcards, and a quiz.

Uses Groq's free-tier LLMs (llama-3.3-70b-versatile) for fast and free generation.
"""

import json
import re
from groq import Groq
from config import GROQ_API_KEY

client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

MODEL = "llama-3.3-70b-versatile"


def _require_client():
    if client is None:
        raise RuntimeError(
            "GROQ_API_KEY is not set on the server. Add it to backend/.env to enable AI generation. "
            "Get a free key at https://console.groq.com"
        )


def _extract_json(text: str):
    """Groq sometimes wraps JSON in ```json fences — strip them before parsing."""
    cleaned = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(cleaned)


def _ask_groq(system_prompt: str, user_prompt: str) -> str:
    _require_client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=4096,
        temperature=0.7,
    )
    return response.choices[0].message.content


def generate_summary(transcript: str) -> str:
    """Returns markdown-formatted summary notes."""
    system = (
        "You are an expert academic note-taker. Summarize lecture transcripts into "
        "clear, well-organized study notes using Markdown headings and bullet points. "
        "Be concise but capture every key concept, definition, and example."
    )
    return _ask_groq(system, f"Summarize this lecture transcript into study notes:\n\n{transcript}")


def generate_outline(transcript: str) -> str:
    """Returns a markdown hierarchical outline."""
    system = (
        "You create hierarchical study outlines from lecture transcripts. "
        "Use Markdown headings (##, ###) and nested bullet points to show the structure "
        "of topics and subtopics covered."
    )
    return _ask_groq(system, f"Create a hierarchical outline of this lecture transcript:\n\n{transcript}")


def generate_flashcards(transcript: str, count: int = 10) -> list:
    """Returns a list of {front, back} flashcard dicts."""
    system = (
        "You generate study flashcards from lecture transcripts. "
        f"Respond with ONLY a JSON array of exactly {count} objects, no preamble, no markdown fences. "
        'Each object must look like: {"front": "question or term", "back": "answer or definition"}'
    )
    raw = _ask_groq(system, f"Create {count} flashcards from this lecture transcript:\n\n{transcript}")
    return _extract_json(raw)


def generate_quiz(transcript: str, count: int = 5) -> list:
    """Returns a list of multiple-choice question dicts."""
    system = (
        "You generate multiple-choice quiz questions from lecture transcripts. "
        f"Respond with ONLY a JSON array of exactly {count} objects, no preamble, no markdown fences. "
        'Each object must look like: {"question": "...", "option_a": "...", "option_b": "...", '
        '"option_c": "...", "option_d": "...", "correct_answer": "a"} '
        '(correct_answer is one of "a","b","c","d")'
    )
    raw = _ask_groq(system, f"Create {count} multiple-choice quiz questions from this lecture transcript:\n\n{transcript}")
    return _extract_json(raw)


GENERATORS = {
    "summary": generate_summary,
    "outline": generate_outline,
    "flashcards": generate_flashcards,
    "quiz": generate_quiz,
}
