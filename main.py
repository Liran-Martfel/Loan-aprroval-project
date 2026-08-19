"""
FastAPI server for the loan-approval website.

Exposes the trained model's metadata (for the Model Data page) and a
prediction endpoint (for the applicant form) as a REST API, and serves the
two HTML pages. All prediction logic is delegated to inference.py - this
file only wires it up to HTTP.
"""
import logging
import sys
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from inference import encode_application, evaluate_application, explain_prediction, load_artifacts, validate_application

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("loan_approval")
logging.getLogger("shap").setLevel(logging.WARNING)

# Keys from model_report.json worth sending to the browser. Excludes
# 'margins' (replaced below with just its summary stats) and nothing else
# is large enough to bother trimming.
MODEL_INFO_KEYS = [
    "model_name", "best_C", "features", "input_schema", "categorical_mappings",
    "valid_ranges", "data_sample", "cv_accuracy", "test_accuracy",
    "deployment_accuracy", "confusion_matrix", "classification_report",
    "training_data_hash", "n_training_rows", "timestamp",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading model artifacts...")
    pipeline, report, background = load_artifacts()
    app.state.pipeline = pipeline
    app.state.report = report
    app.state.background = background
    logger.info(
        "Model loaded: %s (deployment_accuracy=%.4f, trained_at=%s)",
        report["model_name"], report["deployment_accuracy"], report["timestamp"],
    )
    yield
    logger.info("Shutting down.")


app = FastAPI(title="Loan Approval API", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Appended to static asset URLs as ?v=... so browsers fetch fresh JS/CSS
# after every deploy instead of serving a stale cached copy under the same
# unchanged /static/... URL.
STATIC_VERSION = str(int(time.time()))


class ApplicantInput(BaseModel):
    person_income: float
    person_emp_exp: int
    loan_amnt: float
    loan_int_rate: float
    loan_percent_income: float
    credit_score: int
    previous_loan_defaults_on_file: Literal["Yes", "No"]


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    logger.info(
        "%s %s -> %s (%.1fms)",
        request.method, request.url.path, response.status_code, duration_ms,
    )
    return response


@app.get("/")
def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {"static_version": STATIC_VERSION})


@app.get("/api/model-info")
def get_model_summary():
    """
    Returns the saved model report (features, sample data, accuracy,
    margins summary, valid ranges, version stamp) for display on the
    Model Data page. The full per-row margin values are dropped in favor
    of their summary stats, to keep the payload small.
    """
    report = app.state.report
    summary = {key: report[key] for key in MODEL_INFO_KEYS}
    summary["margins_summary"] = {k: v for k, v in report["margins"].items() if k != "values"}
    return summary


@app.post("/api/predict")
def predict(applicant: ApplicantInput):
    """
    Runs one applicant's data through the trained pipeline and returns
    whether the loan would be approved and a confidence score. Deliberately
    does NOT compute the SHAP explanation here - that takes ~10 seconds
    (see explain_prediction's docstring in inference.py) and would make the
    "Check Loan Eligibility" button feel broken. The frontend fetches the
    explanation separately, lazily, only if the user opens "Why?".
    """
    try:
        return evaluate_application(
            app.state.pipeline, applicant.model_dump(), app.state.background,
            app.state.report, explain=False,
        )
    except Exception:
        logger.exception("Prediction failed for input: %s", applicant.model_dump())
        return JSONResponse(
            status_code=500,
            content={"valid": False, "errors": ["Internal server error"]},
        )


@app.post("/api/explain")
def explain(applicant: ApplicantInput):
    """
    Computes the (slow) SHAP explanation for one applicant, fetched lazily
    by the frontend only when the user opens the "Why?" panel.
    """
    raw_applicant = applicant.model_dump()
    errors = validate_application(raw_applicant, app.state.report)
    if errors:
        return JSONResponse(status_code=400, content={"valid": False, "errors": errors})
    try:
        x_row = encode_application(raw_applicant, app.state.report["features"])
        contributions = explain_prediction(app.state.pipeline, x_row, app.state.background)
        return {"valid": True, "feature_contributions": contributions}
    except Exception:
        logger.exception("Explanation failed for input: %s", raw_applicant)
        return JSONResponse(
            status_code=500,
            content={"valid": False, "errors": ["Internal server error"]},
        )
