"""
Standalone inference module for the loan-approval model.

This is what a website backend should import - it has no dependency on the
training notebook. It expects three artifacts (produced by the notebook) in
the 'model_artifacts/' folder: 'Full project.pkl' (the trained pipeline),
'model_report.json' (feature order + valid ranges), and
'background_sample.pkl' (a small reference sample used for SHAP explanations).
"""
import json

import joblib
import numpy as np
import pandas as pd
import shap

CATEGORICAL_MAPS = {'previous_loan_defaults_on_file': {'No': 0, 'Yes': 1}}

# loan_amnt's real ceiling shouldn't sit at the training data's own $35,000
# cap - that says nothing about what an applicant could reasonably ask for.
# A flat, generous ceiling instead of scaling with income, so a lower-income
# applicant testing a large loan isn't blocked before the model even runs.
MAX_LOAN_AMOUNT = 10_000_000


def load_artifacts(pkl_path='model_artifacts/Full project.pkl', report_path='model_artifacts/model_report.json',
                    background_path='model_artifacts/background_sample.pkl'):
    """Loads the trained pipeline, its report (feature order + valid ranges), and the SHAP background sample."""
    pipeline = joblib.load(pkl_path)
    with open(report_path) as f:
        report = json.load(f)
    background_data = joblib.load(background_path)
    return pipeline, report, background_data


def validate_application(raw_applicant, report):
    """
    Checks each numeric field against the range seen during training (see
    'valid_ranges' in model_report.json). Returns a list of human-readable
    error messages; an empty list means the input is valid.
    """
    errors = []
    for feature, bounds in report['valid_ranges'].items():
        low, high = bounds
        if feature == 'person_income':
            # A real applicant's income isn't bounded by whatever happened to
            # appear in the training CSV - only guard against a nonsensical
            # (non-positive) value. Predictions on incomes outside the
            # training range are extrapolation, flagged to the user in the
            # UI rather than blocked here.
            low, high = 0, float('inf')
        elif feature == 'loan_amnt':
            high = MAX_LOAN_AMOUNT
        elif feature == 'loan_percent_income':
            # Mathematically loan_amnt / person_income - now that neither of
            # those two is capped relative to the other, this ratio isn't
            # either. Only guard against a nonsensical (negative) value.
            low, high = 0, float('inf')
        value = raw_applicant.get(feature)
        if value is None:
            errors.append(f"Missing value for '{feature}'")
        elif isinstance(value, (int, float)) and not (low <= value <= high):
            errors.append(f"'{feature}' value {value} is outside the expected range [{low}, {high}]")
    return errors


def encode_application(raw_applicant, feature_order):
    """
    Converts one applicant's raw form values into the row shape the pipeline
    expects. `raw_applicant` should have exactly the columns in
    `feature_order`, with previous_loan_defaults_on_file as 'Yes'/'No'.
    """
    row = dict(raw_applicant)
    for column, mapping in CATEGORICAL_MAPS.items():
        if isinstance(row.get(column), str):
            row[column] = mapping[row[column]]
    return pd.DataFrame([row], columns=feature_order)


def predict_with_confidence(pipeline, x_row):
    """Predicts a single applicant's loan status and a 0-100 confidence score."""
    proba = pipeline.predict_proba(x_row)[0]
    predicted_class = int(pipeline.classes_[np.argmax(proba)])
    confidence = float(proba.max() * 100)
    return predicted_class, confidence


def explain_prediction(pipeline, x_row, background_data, n_background=100, n_samples=100):
    """
    Returns each feature's contribution to the approval probability via SHAP.

    Note: SHAP's KernelExplainer is model-agnostic but slow (it re-queries
    the pipeline many times per explanation) - fine for previewing, but worth
    caching or precomputing before using it on a live request path.
    """
    feature_names = list(x_row.columns)
    background = shap.sample(background_data, min(n_background, len(background_data)), random_state=42)

    def predict_fn(data):
        return pipeline.predict_proba(pd.DataFrame(data, columns=feature_names))

    explainer = shap.KernelExplainer(predict_fn, background)
    shap_values = explainer.shap_values(x_row, nsamples=n_samples)
    approved_class_index = list(pipeline.classes_).index(1)
    contributions = dict(zip(feature_names, shap_values[0, :, approved_class_index]))
    return dict(sorted(contributions.items(), key=lambda item: abs(item[1]), reverse=True))


def evaluate_application(pipeline, raw_applicant, background_data, report, explain=True):
    """
    Single entry point for a website backend: validates, encodes, predicts,
    and (optionally) explains one applicant's raw form values.
    """
    errors = validate_application(raw_applicant, report)
    if errors:
        return {'valid': False, 'errors': errors}

    x_row = encode_application(raw_applicant, report['features'])
    predicted_class, confidence = predict_with_confidence(pipeline, x_row)
    result = {'valid': True, 'approved': bool(predicted_class == 1), 'confidence': confidence}
    if explain:
        result['feature_contributions'] = explain_prediction(pipeline, x_row, background_data)
    return result
