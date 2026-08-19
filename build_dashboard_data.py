"""
One-off script that computes the extra data needed for the "Model Dashboard"
tab (PCA scatter of real applicants + real support vectors, margin histogram,
model file checksum) and writes it to dashboard_data.json.

Not part of the live serving path (inference.py) - this is derived data that
only changes when the model is retrained, so it's precomputed once here
instead of being recalculated on every server start.
"""
import hashlib
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA

from inference import CATEGORICAL_MAPS

PKL_PATH = 'Full project.pkl'
CSV_PATH = 'Project_DB_loan_approval.csv'
REPORT_PATH = 'model_report.json'
OUT_PATH = 'dashboard_data.json'

pipeline = joblib.load(PKL_PATH)
with open(REPORT_PATH) as f:
    report = json.load(f)

scaler = pipeline.named_steps['scaler']
calibrated = pipeline.named_steps['model']
svc = calibrated.calibrated_classifiers_[0].estimator

features = report['features']

# ---- Model details (real hyperparameters read off the fitted SVC) ----
model_details = {
    'algorithm': 'SVC (Support Vector Classifier)',
    'kernel': svc.kernel,
    'C': svc.C,
    'gamma': str(svc.gamma),
    'class_weight': svc.class_weight,
    'classes': [int(c) for c in svc.classes_],
    'class_labels': ['No', 'Yes'],
    'decision_function_shape': svc.decision_function_shape,
    'support_vector_count': int(svc.n_support_.sum()),
    'support_vector_count_by_class': [int(n) for n in svc.n_support_],
}

# ---- Model file: size + checksum, so the dashboard can show real values ----
with open(PKL_PATH, 'rb') as f:
    file_bytes = f.read()
model_file = {
    'filename': PKL_PATH,
    'size_bytes': len(file_bytes),
    'sha256': hashlib.sha256(file_bytes).hexdigest(),
}

# ---- PCA scatter: a sample of real applicants (scaled, true labels) plus
# the model's actual support vectors, projected into the same 2D PCA space
# fit on the sample. This is a genuine dimensionality-reduced view of the
# real 7-feature space, not a synthetic 2-feature toy boundary. ----
df = pd.read_csv(CSV_PATH)
df['previous_loan_defaults_on_file'] = df['previous_loan_defaults_on_file'].map(
    CATEGORICAL_MAPS['previous_loan_defaults_on_file']
)

rng = np.random.RandomState(42)
sample_n = 350
sample_idx = rng.choice(len(df), size=sample_n, replace=False)
sample_df = df.iloc[sample_idx]
sample_x = sample_df[features].to_numpy(dtype=float)
sample_labels = sample_df['loan_status'].to_numpy()
sample_scaled = scaler.transform(sample_x)

sv_scaled = svc.support_vectors_
sv_sample_idx = rng.choice(len(sv_scaled), size=min(150, len(sv_scaled)), replace=False)
sv_sample = sv_scaled[sv_sample_idx]

pca = PCA(n_components=2, random_state=42)
pca.fit(sample_scaled)
sample_2d = pca.transform(sample_scaled)
sv_2d = pca.transform(sv_sample)

pca_scatter = {
    'explained_variance_ratio': [float(v) for v in pca.explained_variance_ratio_],
    'points': [
        {'x': round(float(x), 3), 'y': round(float(y), 3), 'label': int(lbl)}
        for (x, y), lbl in zip(sample_2d, sample_labels)
    ],
    'support_vectors': [
        {'x': round(float(x), 3), 'y': round(float(y), 3)}
        for x, y in sv_2d
    ],
}

# ---- Margin distribution histogram (from the already-computed raw margins
# in model_report.json - binned here so the API doesn't need to ship the
# full per-row array). ----
margin_values = np.array(report['margins']['values'])
counts, bin_edges = np.histogram(margin_values, bins=16)
margin_histogram = {
    'bin_edges': [round(float(e), 3) for e in bin_edges],
    'counts': [int(c) for c in counts],
}

dashboard_data = {
    'model_details': model_details,
    'model_file': model_file,
    'pca_scatter': pca_scatter,
    'margin_histogram': margin_histogram,
}

with open(OUT_PATH, 'w') as f:
    json.dump(dashboard_data, f)

print(f'Wrote {OUT_PATH}')
print('support vectors:', model_details['support_vector_count'])
print('pca explained variance ratio:', pca_scatter['explained_variance_ratio'])
