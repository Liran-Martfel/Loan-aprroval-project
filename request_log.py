"""
Persistent request/error and prediction logging for the in-app Logs page.

Writes to a Postgres database (DATABASE_URL env var) instead of a local
file, because Render's free-tier disk is wiped on every restart/redeploy -
a file would lose history exactly when you'd want to look back at it.

Two tables: request_log (method/path/status/timing/errors - no applicant
data) and prediction_log (the applicant values submitted to "Check Loan
Eligibility" plus the outcome). Both sit behind the same admin-key gate on
the Logs page - see main.py's /api/logs and /api/logs/predictions.

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
    """
    Creates the log tables if needed. Deliberately swallows connection
    failures (e.g. Neon's free-tier database waking up from idle-suspend
    can briefly refuse connections) - this runs during app startup, and a
    slow/unavailable database must never take the whole site down over a
    feature as non-essential as logging.
    """
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set - persistent request logging is disabled.")
        return
    try:
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
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS prediction_log (
                        id SERIAL PRIMARY KEY,
                        ts TIMESTAMPTZ NOT NULL,
                        person_income DOUBLE PRECISION,
                        person_emp_exp DOUBLE PRECISION,
                        loan_amnt DOUBLE PRECISION,
                        loan_int_rate DOUBLE PRECISION,
                        loan_percent_income DOUBLE PRECISION,
                        credit_score DOUBLE PRECISION,
                        previous_loan_defaults_on_file TEXT,
                        valid BOOLEAN NOT NULL,
                        approved BOOLEAN,
                        confidence DOUBLE PRECISION,
                        errors TEXT,
                        model_used TEXT NOT NULL DEFAULT 'real'
                    )
                """)
                # Additive migration for a table created before model_used
                # existed - safe to run on every startup.
                cur.execute("""
                    ALTER TABLE prediction_log
                    ADD COLUMN IF NOT EXISTS model_used TEXT NOT NULL DEFAULT 'real'
                """)
            conn.commit()
    except Exception:
        logger.exception("Failed to initialize the persistent log database - continuing without it")


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


def log_prediction(raw_applicant, result, model_used="real"):
    """
    Records one "Check Loan Eligibility" submission: the raw form values
    plus the outcome (or the validation errors, if the input was rejected).
    model_used is "real" or "custom" (a visitor's own "Try Your Own Data"
    model), shown in the Logs page so the two are never confused.
    """
    if not DATABASE_URL:
        return
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO prediction_log (
                        ts, person_income, person_emp_exp, loan_amnt, loan_int_rate,
                        loan_percent_income, credit_score, previous_loan_defaults_on_file,
                        valid, approved, confidence, errors, model_used
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        datetime.now(timezone.utc),
                        raw_applicant.get("person_income"),
                        raw_applicant.get("person_emp_exp"),
                        raw_applicant.get("loan_amnt"),
                        raw_applicant.get("loan_int_rate"),
                        raw_applicant.get("loan_percent_income"),
                        raw_applicant.get("credit_score"),
                        raw_applicant.get("previous_loan_defaults_on_file"),
                        result.get("valid", False),
                        result.get("approved"),
                        result.get("confidence"),
                        "; ".join(result["errors"]) if result.get("errors") else None,
                        model_used,
                    ),
                )
            conn.commit()
    except Exception:
        logger.exception("Failed to write to the persistent prediction log")


def _query_predictions(limit=None):
    """Shared by get_recent_predictions() (limit=300) and get_all_predictions() (limit=None, for exports)."""
    if not DATABASE_URL:
        return []
    sql = """
        SELECT ts, person_income, person_emp_exp, loan_amnt, loan_int_rate,
               loan_percent_income, credit_score, previous_loan_defaults_on_file,
               valid, approved, confidence, errors, model_used
        FROM prediction_log ORDER BY id DESC
    """
    params = ()
    if limit is not None:
        sql += " LIMIT %s"
        params = (limit,)
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    return [
        {
            "timestamp": row["ts"].isoformat(),
            "person_income": row["person_income"],
            "person_emp_exp": row["person_emp_exp"],
            "loan_amnt": row["loan_amnt"],
            "loan_int_rate": row["loan_int_rate"],
            "loan_percent_income": row["loan_percent_income"],
            "credit_score": row["credit_score"],
            "previous_loan_defaults_on_file": row["previous_loan_defaults_on_file"],
            "valid": row["valid"],
            "approved": row["approved"],
            "confidence": round(row["confidence"], 1) if row["confidence"] is not None else None,
            "errors": row["errors"],
            "model_used": row["model_used"],
        }
        for row in rows
    ]


def get_recent_predictions(limit=300):
    return _query_predictions(limit=limit)


def get_all_predictions():
    """Every prediction ever logged, oldest last - for the Logs page's "download all" export."""
    return _query_predictions(limit=None)


def _query_requests(limit=None):
    """Shared by get_recent() (limit=300) and get_all() (limit=None, for exports)."""
    if not DATABASE_URL:
        return []
    sql = "SELECT ts, method, path, status_code, duration_ms, error_message FROM request_log ORDER BY id DESC"
    params = ()
    if limit is not None:
        sql += " LIMIT %s"
        params = (limit,)
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
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


def get_recent(limit=300):
    return _query_requests(limit=limit)


def get_all():
    """Every request/error ever logged, oldest last - for the Logs page's "download all" export."""
    return _query_requests(limit=None)
