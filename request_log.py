"""
Persistent request/error logging for the in-app Logs page.

Writes to a Postgres database (DATABASE_URL env var) instead of a local
file, because Render's free-tier disk is wiped on every restart/redeploy -
a file would lose history exactly when you'd want to look back at it.

Deliberately stores no applicant data (income, credit score, etc.) - only
request metadata and error messages - so the logs page can be shown behind
a simple password without risking exposing anyone's financial details.

If DATABASE_URL isn't set (e.g. running locally without it configured),
every function here becomes a no-op instead of failing, so the rest of
the site keeps working without persistent logging.
"""
import logging
import os
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL")
logger = logging.getLogger("loan_approval")


def init_db():
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set - persistent request logging is disabled.")
        return
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS request_log (
                    id SERIAL PRIMARY KEY,
                    ts TIMESTAMPTZ NOT NULL,
                    method TEXT NOT NULL,
                    path TEXT NOT NULL,
                    status_code INTEGER NOT NULL,
                    duration_ms REAL NOT NULL,
                    error_message TEXT
                )
            """)
        conn.commit()


def log_request(method, path, status_code, duration_ms, error_message=None):
    if not DATABASE_URL:
        return
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO request_log (ts, method, path, status_code, duration_ms, error_message) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (datetime.now(timezone.utc), method, path, status_code, duration_ms, error_message),
                )
            conn.commit()
    except Exception:
        logger.exception("Failed to write to the persistent request log")


def get_recent(limit=300):
    if not DATABASE_URL:
        return []
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT ts, method, path, status_code, duration_ms, error_message "
                "FROM request_log ORDER BY id DESC LIMIT %s",
                (limit,),
            )
            rows = cur.fetchall()
    return [
        {
            "timestamp": row["ts"].isoformat(),
            "method": row["method"],
            "path": row["path"],
            "status_code": row["status_code"],
            "duration_ms": round(row["duration_ms"], 1),
            "error_message": row["error_message"],
        }
        for row in rows
    ]
