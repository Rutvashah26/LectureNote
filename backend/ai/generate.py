"""
ai/generate.py
Generative AI layer — turns a raw lecture transcript into study materials
using Anthropic's Claude API: summary notes, an outline, flashcards, and a quiz.

This is the "AI based code" file: every generation function below calls the
Claude API with a structured prompt and parses the JSON it returns.
"""

import json
import re
from anthropic import Anthropic
from config import ANTHROPIC_API_KEY

client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

MODEL = "claude-sonnet-4-6"


def _require_client():
    if client is None:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set on the server. Add it to backend/.env to enable AI generation."
        )


def _extract_json(text: str):
    """Claude sometimes wraps JSON in ```json fences — strip them before parsing."""
    cleaned = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(cleaned)


def _ask_claude(system_prompt: str, user_prompt: str) -> str:
    _require_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    )
    return "".join(block.text for block in response.content if block.type == "text")


def generate_summary(transcript: str) -> str:
    """Returns markdown-formatted summary notes."""
    system = (
        "You are an expert academic note-taker. Summarize lecture transcripts into "
        "clear, well-organized study notes using Markdown headings and bullet points. "
        "Be concise but capture every key concept, definition, and example."
    )
    return _ask_claude(system, f"Summarize this lecture transcript into study notes:\n\n{transcript}")


def generate_outline(transcript: str) -> str:
    """Returns a markdown hierarchical outline."""
    system = (
        "You create hierarchical study outlines from lecture transcripts. "
        "Use Markdown headings (##, ###) and nested bullet points to show the structure "
        "of topics and subtopics covered."
    )
    return _ask_claude(system, f"Create a hierarchical outline of this lecture transcript:\n\n{transcript}")


def generate_flashcards(transcript: str, count: int = 10) -> list:
    """Returns a list of {front, back} flashcard dicts."""
    system = (
        "You generate study flashcards from lecture transcripts. "
        f"Respond with ONLY a JSON array of exactly {count} objects, no preamble, no markdown fences. "
        'Each object must look like: {"front": "question or term", "back": "answer or definition"}'
    )
    raw = _ask_claude(system, f"Create {count} flashcards from this lecture transcript:\n\n{transcript}")
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
    raw = _ask_claude(system, f"Create {count} multiple-choice quiz questions from this lecture transcript:\n\n{transcript}")
    return _extract_json(raw)


GENERATORS = {
    "summary": generate_summary,
    "outline": generate_outline,
    "flashcards": generate_flashcards,
    "quiz": generate_quiz,
}
