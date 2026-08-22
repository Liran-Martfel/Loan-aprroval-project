"""
Private, per-visitor "Try Your Own Data" models.

A visitor can upload a CSV shaped like the real training data and get a
model trained just for their own browser session - it never touches the
real deployed model, is never written to disk, and is automatically
forgotten after a period of inactivity. The session store lives entirely
in this process's memory (fine for a single-worker deployment; lost on
restart by design - these were never meant to be permanent).
"""
import io
import secrets
import time

import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from inference import CATEGORICAL_MAPS

REQUIRED_FEATURES = [
    'person_income', 'person_emp_exp', 'loan_amnt', 'loan_int_rate',
    'loan_percent_income', 'credit_score', 'previous_loan_defaults_on_file',
]
LABEL_COLUMN = 'loan_status'
REQUIRED_COLUMNS = REQUIRED_FEATURES + [LABEL_COLUMN]

MIN_ROWS = 50
MAX_ROWS = 2_800  # keeps the CalibratedClassifierCV(SVC(...)) fit well under Render's proxy timeout
MIN_ROWS_PER_CLASS = 10  # below this, the train/test split and calibration folds become unstable
MAX_FILE_BYTES = 5 * 1024 * 1024
SESSION_TTL_SECONDS = 2 * 60 * 60
MAX_CONCURRENT_SESSIONS = 20
SVC_C = 10  # matches the real deployed model's own chosen C - no per-upload search, so this stays fast

_sessions = {}  # token -> {pipeline, created_at, last_used_at, accuracy, confusion_matrix, n_rows}


def _evict_stale():
    now = time.time()
    expired = [tok for tok, s in _sessions.items() if now - s['last_used_at'] > SESSION_TTL_SECONDS]
    for tok in expired:
        del _sessions[tok]
    # Safety valve independent of the TTL - if many visitors upload at once,
    # drop the least-recently-used session rather than growing unbounded.
    while len(_sessions) >= MAX_CONCURRENT_SESSIONS:
        oldest = min(_sessions, key=lambda t: _sessions[t]['last_used_at'])
        del _sessions[oldest]


def validate_csv(raw_bytes):
    """Returns (dataframe, errors) - a non-empty errors list means the file was rejected."""
    if len(raw_bytes) > MAX_FILE_BYTES:
        return None, [f"File is too large ({len(raw_bytes) / 1024 / 1024:.1f} MB) - max is {MAX_FILE_BYTES // 1024 // 1024} MB."]
    try:
        df = pd.read_csv(io.BytesIO(raw_bytes))
    except Exception as exc:
        return None, [f"Could not read this as a CSV file ({exc})."]

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        return None, [f"Missing required column(s): {', '.join(missing)}"]

    errors = []
    if not (MIN_ROWS <= len(df) <= MAX_ROWS):
        errors.append(f"Expected between {MIN_ROWS} and {MAX_ROWS} rows, got {len(df)}.")

    df = df[REQUIRED_COLUMNS].copy()

    if not df['previous_loan_defaults_on_file'].isin(CATEGORICAL_MAPS['previous_loan_defaults_on_file']).all():
        errors.append("'previous_loan_defaults_on_file' must only contain 'Yes' or 'No'.")

    if not df[LABEL_COLUMN].isin([0, 1]).all():
        errors.append(f"'{LABEL_COLUMN}' must only contain 0 or 1.")

    numeric_cols = [c for c in REQUIRED_FEATURES if c != 'previous_loan_defaults_on_file']
    for col in numeric_cols:
        if not pd.api.types.is_numeric_dtype(df[col]):
            errors.append(f"'{col}' must be numeric.")

    if df[REQUIRED_COLUMNS].isna().any().any():
        errors.append("File contains missing values in the required columns.")

    if not errors:
        class_counts = df[LABEL_COLUMN].value_counts()
        if class_counts.shape[0] < 2:
            errors.append("The outcome column needs both approved and denied examples to train on.")
        elif class_counts.min() < MIN_ROWS_PER_CLASS:
            errors.append(
                f"Needs at least {MIN_ROWS_PER_CLASS} examples of each outcome (approved and denied) - "
                f"the smaller group only has {int(class_counts.min())}."
            )

    if errors:
        return None, errors
    return df, []


def train_from_dataframe(df):
    """Trains a Pipeline with the same architecture as the real deployed model (StandardScaler + calibrated SVC)."""
    df = df.copy()
    df['previous_loan_defaults_on_file'] = df['previous_loan_defaults_on_file'].map(
        CATEGORICAL_MAPS['previous_loan_defaults_on_file']
    )
    x = df[REQUIRED_FEATURES]
    y = df[LABEL_COLUMN]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42, stratify=y)

    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('model', CalibratedClassifierCV(SVC(kernel='rbf', C=SVC_C, random_state=42), ensemble=False, cv=3)),
    ])
    pipeline.fit(x_train, y_train)
    y_pred = pipeline.predict(x_test)
    accuracy = float(accuracy_score(y_test, y_pred))
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1]).tolist()
    return pipeline, accuracy, cm


def create_session(raw_bytes):
    """Validates and trains a new private session model. Returns (result_dict, errors)."""
    df, errors = validate_csv(raw_bytes)
    if errors:
        return None, errors

    try:
        pipeline, accuracy, cm = train_from_dataframe(df)
    except Exception as exc:
        return None, [f"Training failed: {exc}"]

    _evict_stale()
    token = secrets.token_urlsafe(24)
    now = time.time()
    _sessions[token] = {
        'pipeline': pipeline,
        'created_at': now,
        'last_used_at': now,
        'accuracy': accuracy,
        'confusion_matrix': cm,
        'n_rows': len(df),
    }
    return {'token': token, 'accuracy': accuracy, 'confusion_matrix': cm, 'n_rows': len(df)}, []


def get_pipeline(token):
    """Returns the session's pipeline and refreshes its inactivity timer, or None if unknown/expired."""
    if not token:
        return None
    _evict_stale()
    session = _sessions.get(token)
    if session is None:
        return None
    session['last_used_at'] = time.time()
    return session['pipeline']
