"""
Support Coach — database layer (SQLite)

Two tables:
  cases  -> one row per support case, kept up to date as turns come in
  turns  -> one row per message, with its analysis attached

This file only defines plain functions — app.py calls into it.
No ORM, so it's easy to read and swap for PostgreSQL later
(same SQL mostly works against Postgres too).
"""

import sqlite3
from datetime import datetime, timezone

DB_PATH = "support_coach.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cases (
            id TEXT PRIMARY KEY,
            opened_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            turns INTEGER NOT NULL DEFAULT 0,
            last_sentiment TEXT,
            last_urgency TEXT,
            key_issue TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS turns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT NOT NULL,
            speaker TEXT NOT NULL,
            text TEXT NOT NULL,
            sentiment TEXT,
            urgency TEXT,
            score INTEGER,
            key_issue TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (case_id) REFERENCES cases (id)
        )
        """
    )
    conn.commit()
    conn.close()


def record_turn(case_id: str, speaker: str, text: str, analysis: dict):
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()

    conn.execute(
        """
        INSERT INTO cases (id, opened_at, status, turns, last_sentiment, last_urgency, key_issue)
        VALUES (?, ?, 'pending', 0, NULL, NULL, NULL)
        ON CONFLICT(id) DO NOTHING
        """,
        (case_id, now),
    )

    conn.execute(
        """
        INSERT INTO turns (case_id, speaker, text, sentiment, urgency, score, key_issue, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            case_id,
            speaker,
            text,
            analysis.get("sentiment"),
            analysis.get("urgencyLevel"),
            analysis.get("score"),
            analysis.get("keyIssue"),
            now,
        ),
    )

    conn.execute(
        """
        UPDATE cases
        SET turns = turns + 1,
            last_sentiment = ?,
            last_urgency = ?,
            key_issue = ?
        WHERE id = ?
        """,
        (analysis.get("sentiment"), analysis.get("urgencyLevel"), analysis.get("keyIssue"), case_id),
    )

    conn.commit()
    conn.close()


def set_case_status(case_id: str, status: str):
    conn = get_connection()
    conn.execute("UPDATE cases SET status = ? WHERE id = ?", (status, case_id))
    conn.commit()
    conn.close()


def get_stats():
    conn = get_connection()

    total_cases = conn.execute("SELECT COUNT(*) AS n FROM cases").fetchone()["n"]
    resolved = conn.execute("SELECT COUNT(*) AS n FROM cases WHERE status = 'resolved'").fetchone()["n"]
    pending = total_cases - resolved

    risk_rows = conn.execute(
        "SELECT LOWER(last_urgency) AS urgency, COUNT(*) AS n FROM cases WHERE last_urgency IS NOT NULL GROUP BY urgency"
    ).fetchall()
    risk = {"low": 0, "medium": 0, "high": 0}
    for row in risk_rows:
        if row["urgency"] in risk:
            risk[row["urgency"]] = row["n"]

    sentiment_rows = conn.execute(
        "SELECT sentiment, COUNT(*) AS n FROM turns WHERE sentiment IS NOT NULL GROUP BY sentiment"
    ).fetchall()
    sentiment = {"positive": 0, "neutral": 0, "negative": 0}
    for row in sentiment_rows:
        key = (row["sentiment"] or "").lower()
        if key in sentiment:
            sentiment[key] = row["n"]

    total_turns = conn.execute("SELECT COUNT(*) AS n FROM turns").fetchone()["n"]
    avg_turns = round(total_turns / total_cases, 1) if total_cases else 0

    conn.close()
    return {
        "totalCases": total_cases,
        "resolved": resolved,
        "pending": pending,
        "risk": risk,
        "sentiment": sentiment,
        "avgTurns": avg_turns,
        "apiCalls": total_turns,
    }


def list_cases():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM cases ORDER BY opened_at DESC LIMIT 100"
    ).fetchall()
    conn.close()

    result = []
    for row in rows:
        urgency = (row["last_urgency"] or "Low").lower()
        sentiment = (row["last_sentiment"] or "Neutral").lower()
        result.append(
            {
                "id": row["id"],
                "issue": row["key_issue"] or "Not yet classified",
                "risk": urgency,
                "sentiment": sentiment,
                "turns": row["turns"],
                "sla": "-",
                "status": row["status"],
                "opened": row["opened_at"],
            }
        )
    return result


def get_stats():
    conn = get_connection()
    cases = conn.execute("SELECT * FROM cases").fetchall()
    total_turns = conn.execute("SELECT COUNT(*) AS c FROM turns").fetchone()["c"]
    conn.close()

    total_cases = len(cases)
    resolved = sum(1 for c in cases if c["status"] == "resolved")

    risk_counts = {"low": 0, "medium": 0, "high": 0}
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    for c in cases:
        risk = (c["last_urgency"] or "Low").lower()
        if risk in risk_counts:
            risk_counts[risk] += 1
        sentiment = (c["last_sentiment"] or "Neutral").lower()
        if sentiment in sentiment_counts:
            sentiment_counts[sentiment] += 1

    avg_turns = round(total_turns / total_cases, 1) if total_cases else 0

    return {
        "totalCases": total_cases,
        "resolved": resolved,
        "resolvedPct": round((resolved / total_cases) * 100) if total_cases else 0,
        "riskCounts": risk_counts,
        "sentimentCounts": sentiment_counts,
        "avgTurns": avg_turns,
        "apiCalls": total_turns,
    }