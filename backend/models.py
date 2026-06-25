"""
models.py
Very small SQLite data layer — no ORM, just plain SQL, kept readable.
Tables: users, lectures, notes
"""

import sqlite3
import json
import uuid
from datetime import datetime
from config import DATABASE_PATH


def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            picture TEXT,
            created_at TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS lectures (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            subject TEXT,
            transcript TEXT,
            source_type TEXT,           -- 'audio' | 'video' | 'text'
            status TEXT NOT NULL,       -- pending | processing | completed | failed
            error TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL,
            type TEXT NOT NULL,         -- summary | outline | flashcards | quiz
            content TEXT,               -- markdown text for summary/outline
            data_json TEXT,             -- structured JSON for flashcards/quiz
            FOREIGN KEY (lecture_id) REFERENCES lectures(id)
        )
    """)

    conn.commit()
    conn.close()


# ---------- Users ----------

def get_or_create_user(email, name=None, picture=None):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE email = ?", (email,))
    row = c.fetchone()
    if row:
        conn.close()
        return dict(row)

    user_id = str(uuid.uuid4())
    c.execute(
        "INSERT INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, email, name, picture, datetime.utcnow().isoformat())
    )
    conn.commit()
    c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    return dict(row)


def get_user_by_id(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


# ---------- Lectures ----------

def create_lecture(user_id, title, subject, source_type, status="pending"):
    conn = get_db()
    c = conn.cursor()
    lecture_id = str(uuid.uuid4())
    c.execute(
        """INSERT INTO lectures (id, user_id, title, subject, transcript, source_type, status, error, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (lecture_id, user_id, title, subject, None, source_type, status, None, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()
    return lecture_id


def update_lecture(lecture_id, **fields):
    if not fields:
        return
    conn = get_db()
    c = conn.cursor()
    cols = ", ".join(f"{k} = ?" for k in fields.keys())
    values = list(fields.values()) + [lecture_id]
    c.execute(f"UPDATE lectures SET {cols} WHERE id = ?", values)
    conn.commit()
    conn.close()


def list_lectures_for_user(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM lectures WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def get_lecture(lecture_id, user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM lectures WHERE id = ? AND user_id = ?", (lecture_id, user_id))
    row = c.fetchone()
    if not row:
        conn.close()
        return None
    lecture = dict(row)

    c.execute("SELECT * FROM notes WHERE lecture_id = ?", (lecture_id,))
    notes = []
    for n in c.fetchall():
        note = dict(n)
        if note.get("data_json"):
            note["data"] = json.loads(note["data_json"])
            if note["type"] == "flashcards":
                note["flashcards"] = note["data"]
            if note["type"] == "quiz":
                note["questions"] = note["data"]
        del note["data_json"]
        notes.append(note)
    lecture["notes"] = notes

    conn.close()
    return lecture


def delete_lecture(lecture_id, user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM notes WHERE lecture_id = ?", (lecture_id,))
    c.execute("DELETE FROM lectures WHERE id = ? AND user_id = ?", (lecture_id, user_id))
    conn.commit()
    conn.close()


# ---------- Notes ----------

def add_note(lecture_id, note_type, content=None, data=None):
    conn = get_db()
    c = conn.cursor()
    note_id = str(uuid.uuid4())
    c.execute(
        "INSERT INTO notes (id, lecture_id, type, content, data_json) VALUES (?, ?, ?, ?, ?)",
        (note_id, lecture_id, note_type, content, json.dumps(data) if data is not None else None)
    )
    conn.commit()
    conn.close()
    return note_id
