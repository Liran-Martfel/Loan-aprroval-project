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
import os

import joblib
import matplotlib
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.svm import SVC

matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap

from inference import CATEGORICAL_MAPS

PKL_PATH = 'model_artifacts/Full project.pkl'
CSV_PATH = 'data/Project_DB_loan_approval.csv'
REPORT_PATH = 'model_artifacts/model_report.json'
OUT_PATH = 'model_artifacts/dashboard_data.json'
BOUNDARY_IMG_PATH = 'static/img/decision_boundary.png'

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
    'filename': os.path.basename(PKL_PATH),
    'size_bytes': len(file_bytes),
    'sha256': hashlib.sha256(file_bytes).hexdigest(),
}

# ---- Decision boundary visualization: a real, balanced sample of real
# applicants (scaled, true labels), projected to 2D via PCA fit on that
# sample. A second SVC - same kernel and C as the deployed model - is
# trained directly on those 2 components so an actual decision surface,
# margins, and support vectors can be drawn. This is a genuine 2D SVM fit
# on real data (a standard way to visualize a high-dimensional SVM), not a
# synthetic toy example - it's just necessarily a simplification, since the
# real deployed model decides using all 7 features, not 2. ----
df = pd.read_csv(CSV_PATH)
df['previous_loan_defaults_on_file'] = df['previous_loan_defaults_on_file'].map(
    CATEGORICAL_MAPS['previous_loan_defaults_on_file']
)

rng = np.random.RandomState(42)
per_class_n = 200
balanced_idx = np.concatenate([
    rng.choice(df.index[df['loan_status'] == 0], size=per_class_n, replace=False),
    rng.choice(df.index[df['loan_status'] == 1], size=per_class_n, replace=False),
])
sample_df = df.loc[balanced_idx]
sample_x = sample_df[features].to_numpy(dtype=float)
sample_labels = sample_df['loan_status'].to_numpy()
sample_scaled = scaler.transform(sample_x)

pca = PCA(n_components=2, random_state=42)
sample_2d = pca.fit_transform(sample_scaled)

viz_svc = SVC(kernel=svc.kernel, C=svc.C, gamma=svc.gamma)
viz_svc.fit(sample_2d, sample_labels)

x_min, x_max = sample_2d[:, 0].min() - 1, sample_2d[:, 0].max() + 1
y_min, y_max = sample_2d[:, 1].min() - 1, sample_2d[:, 1].max() + 1
xx, yy = np.meshgrid(np.linspace(x_min, x_max, 400), np.linspace(y_min, y_max, 400))
zz = viz_svc.decision_function(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)

fig, ax = plt.subplots(figsize=(9, 6), dpi=150)
fig.patch.set_alpha(0)
ax.set_facecolor('#faf9fc')

region_cmap = ListedColormap(['#fbdfe2', '#d7f0e0'])
ax.contourf(xx, yy, zz, levels=[zz.min(), 0, zz.max()], cmap=region_cmap, alpha=0.75)
ax.contour(xx, yy, zz, levels=[-1, 0, 1], colors=['#d64550', '#3730a3', '#1f9d55'],
           linestyles=['dashed', 'solid', 'dashed'], linewidths=[1.3, 2, 1.3])

denied_mask = sample_labels == 0
ax.scatter(sample_2d[denied_mask, 0], sample_2d[denied_mask, 1], c='#d64550', s=28,
           alpha=0.85, edgecolors='white', linewidths=0.4, label='Loan Not Approved')
ax.scatter(sample_2d[~denied_mask, 0], sample_2d[~denied_mask, 1], c='#1f9d55', s=28,
           alpha=0.85, edgecolors='white', linewidths=0.4, label='Loan Approved')
ax.scatter(sample_2d[viz_svc.support_, 0], sample_2d[viz_svc.support_, 1],
           facecolors='none', edgecolors='#d8ae5e', linewidths=1.6, s=110, label='Support Vectors')

ax.set_xlabel('Principal Component 1', color='#2e2540')
ax.set_ylabel('Principal Component 2', color='#2e2540')
ax.tick_params(colors='#6b6480')
for spine in ax.spines.values():
    spine.set_color('#c9c2dd')
legend = ax.legend(loc='upper right', frameon=True, framealpha=0.85, fontsize=9)
legend.get_frame().set_facecolor('#ffffff')
legend.get_frame().set_edgecolor('#c9c2dd')
fig.tight_layout()

os.makedirs(os.path.dirname(BOUNDARY_IMG_PATH), exist_ok=True)
fig.savefig(BOUNDARY_IMG_PATH, transparent=True)
plt.close(fig)

decision_boundary = {
    'explained_variance_ratio': [float(v) for v in pca.explained_variance_ratio_],
    'viz_accuracy': float(viz_svc.score(sample_2d, sample_labels)),
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
    'decision_boundary': decision_boundary,
    'margin_histogram': margin_histogram,
}

with open(OUT_PATH, 'w') as f:
    json.dump(dashboard_data, f)

print(f'Wrote {OUT_PATH} and {BOUNDARY_IMG_PATH}')
print('support vectors:', model_details['support_vector_count'])
print('pca explained variance ratio:', decision_boundary['explained_variance_ratio'])
print('2D visualization SVC accuracy on its own sample:', decision_boundary['viz_accuracy'])
