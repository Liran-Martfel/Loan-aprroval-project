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
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

from inference import CATEGORICAL_MAPS

PKL_PATH = 'model_artifacts/Full project.pkl'
CSV_PATH = 'data/project_loan_approval_DB_V2.csv'
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

# The scatter calls above only label the three point series - the shaded
# regions and the three contour lines (margin/boundary/margin) are drawn
# without a `label=`, so they'd otherwise appear on the plot unexplained.
# Adding proxy handles for them here is what a legend.get_legend_handles_labels()
# call alone would miss.
scatter_handles, _ = ax.get_legend_handles_labels()
boundary_handles = [
    Line2D([0], [0], color='#3730a3', linewidth=2, linestyle='solid', label='Decision Boundary'),
    Line2D([0], [0], color='#6b6480', linewidth=1.3, linestyle='dashed', label='Margin (±1)'),
    Patch(facecolor='#d7f0e0', edgecolor='none', alpha=0.75, label='Predicted Region: Approved'),
    Patch(facecolor='#fbdfe2', edgecolor='none', alpha=0.75, label='Predicted Region: Not Approved'),
]
legend = ax.legend(handles=scatter_handles + boundary_handles, loc='upper right',
                    frameon=True, framealpha=0.85, fontsize=9)
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

# ---- Real support vectors: the actual trained SVC's own support vectors,
# converted back to real units (real dollars, real credit score) via the
# pipeline's own StandardScaler. Unlike the PCA section above, nothing here
# is re-fit or simplified - this is exactly what the deployed model learned
# to treat as borderline, one real feature at a time. ----
real_support_vectors = scaler.inverse_transform(svc.support_vectors_)
dual_coef = svc.dual_coef_[0]
n0, n1 = (int(n) for n in svc.n_support_)
sv_class = np.concatenate([np.zeros(n0, dtype=int), np.ones(n1, dtype=int)])

per_class_sample = 250
sv_sample_idx = np.concatenate([
    rng.choice(np.where(sv_class == 0)[0], size=min(per_class_sample, n0), replace=False),
    rng.choice(np.where(sv_class == 1)[0], size=min(per_class_sample, n1), replace=False),
])
sv_sample_values = real_support_vectors[sv_sample_idx]
sv_sample_labels = sv_class[sv_sample_idx]
sv_sample_influence = np.abs(dual_coef[sv_sample_idx])

support_vectors_payload = {
    'total_count': int(len(real_support_vectors)),
    'count_by_class': [n0, n1],
    'sample_size': int(len(sv_sample_idx)),
    'sample': [
        {
            'features': {f: round(float(v), 4) for f, v in zip(features, sv_sample_values[i])},
            'label': int(sv_sample_labels[i]),
            'influence': round(float(sv_sample_influence[i]), 4),
        }
        for i in range(len(sv_sample_idx))
    ],
}

# ---- Per-feature chart: the real applicant population (light histogram)
# with the real sampled support vectors marked along the bottom as a rug,
# colored by class. One panel per feature, in real units throughout. ----
FEATURE_LABELS = {
    'person_income': 'Annual Income ($)',
    'person_emp_exp': 'Employment Experience (yrs)',
    'loan_amnt': 'Loan Amount ($)',
    'loan_int_rate': 'Interest Rate (%)',
    'loan_percent_income': 'Loan-to-Income Ratio',
    'credit_score': 'Credit Score',
    'previous_loan_defaults_on_file': 'Previous Defaults (0=No, 1=Yes)',
}
SV_IMG_PATH = 'static/img/support_vectors.png'

fig2, axes2 = plt.subplots(4, 2, figsize=(11, 13), dpi=150)
# Solid backdrop across the WHOLE image (gutters included), not just each
# subplot - a transparent figure with only the subplot boxes colored looks
# like a checkerboard of pale boxes floating on the page's vivid gradient,
# and the pale histogram bars read as "blank" against that clash.
fig2.patch.set_facecolor('#faf9fc')
axes2_flat = axes2.flatten()
denied_mask_sv = sv_sample_labels == 0

DENIED_RGB = (0.839, 0.271, 0.314)    # #d64550
APPROVED_RGB = (0.122, 0.616, 0.333)  # #1f9d55


def rate_color(approval_rate):
    """Interpolates denied->approved red-to-green by a real bin's approval rate."""
    return tuple(d + (a - d) * approval_rate for d, a in zip(DENIED_RGB, APPROVED_RGB))


for i, feat in enumerate(features):
    ax = axes2_flat[i]
    ax.set_facecolor('#faf9fc')
    full_values = df[feat].to_numpy(dtype=float)
    if feat == 'previous_loan_defaults_on_file':
        bin_edges = np.array([-0.5, 0.5, 1.5])
    else:
        # A handful of extreme real outliers (e.g. one $7.2M income) would
        # otherwise squash the whole real distribution into a single bar -
        # clip the viewing window to the 1st-99th percentile (disclosed in
        # the figure's footnote) so the bulk of real applicants is legible.
        lo, hi = np.percentile(full_values, [1, 99])
        bin_edges = np.linspace(lo, hi, 41)
    hist_range = (bin_edges[0], bin_edges[-1])

    # Color each bar by its own real approval rate (red=denied, green=approved)
    # instead of one flat color - the bars themselves now carry real signal,
    # not just the rug marks underneath them.
    denied_counts, _ = np.histogram(df.loc[df['loan_status'] == 0, feat], bins=bin_edges)
    approved_counts, _ = np.histogram(df.loc[df['loan_status'] == 1, feat], bins=bin_edges)
    totals = denied_counts + approved_counts
    rates = np.divide(approved_counts, totals, out=np.full(len(totals), 0.5), where=totals > 0)
    bar_colors = [rate_color(r) for r in rates]
    ax.bar(bin_edges[:-1], totals, width=np.diff(bin_edges), align='edge',
           color=bar_colors, alpha=0.9, edgecolor='white', linewidth=0.5)
    top = totals.max() if len(totals) else 1
    ax.set_xlim(hist_range)
    ax.set_ylim(bottom=-0.08 * top, top=top * 1.05)

    sv_values_feat = sv_sample_values[:, i]
    if feat == 'previous_loan_defaults_on_file':
        sv_values_feat = sv_values_feat + rng.normal(0, 0.02, size=len(sv_values_feat))
    ax.scatter(sv_values_feat[denied_mask_sv], np.full(denied_mask_sv.sum(), -0.04 * top),
               marker='|', s=40, color='#d64550', alpha=0.65)
    ax.scatter(sv_values_feat[~denied_mask_sv], np.full((~denied_mask_sv).sum(), -0.04 * top),
               marker='|', s=40, color='#1f9d55', alpha=0.65)

    ax.set_title(FEATURE_LABELS[feat], fontsize=10, color='#2e2540')
    ax.tick_params(colors='#6b6480', labelsize=8)
    for spine in ax.spines.values():
        spine.set_color('#c9c2dd')

axes2_flat[7].axis('off')
legend_handles = [
    plt.Line2D([0], [0], color=rate_color(0.0), lw=8, alpha=0.9, label='Bin is mostly denied (real data)'),
    plt.Line2D([0], [0], color=rate_color(0.5), lw=8, alpha=0.9, label='Bin is a real 50/50 mix'),
    plt.Line2D([0], [0], color=rate_color(1.0), lw=8, alpha=0.9, label='Bin is mostly approved (real data)'),
    plt.Line2D([0], [0], marker='|', color='#d64550', linestyle='None', markersize=12, label='Real support vector - Not Approved'),
    plt.Line2D([0], [0], marker='|', color='#1f9d55', linestyle='None', markersize=12, label='Real support vector - Approved'),
]
axes2_flat[7].legend(handles=legend_handles, loc='center', frameon=False, fontsize=9)
fig2.suptitle('Where the Real Support Vectors Sit (per feature, real units)', fontsize=13, color='#2e2540', y=0.995)
fig2.text(0.5, 0.005, 'Histograms are clipped to the 1st-99th percentile of real applicants for readability; a few extreme outliers fall outside view.',
          ha='center', fontsize=8, color='#6b6480')
fig2.tight_layout(rect=[0, 0.015, 1, 0.98])
fig2.savefig(SV_IMG_PATH, transparent=False, facecolor=fig2.get_facecolor())
plt.close(fig2)

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
    'support_vectors': support_vectors_payload,
}

with open(OUT_PATH, 'w') as f:
    json.dump(dashboard_data, f)

print(f'Wrote {OUT_PATH}, {BOUNDARY_IMG_PATH}, and {SV_IMG_PATH}')
print('support vectors:', model_details['support_vector_count'])
print('pca explained variance ratio:', decision_boundary['explained_variance_ratio'])
print('2D visualization SVC accuracy on its own sample:', decision_boundary['viz_accuracy'])
print('real support vector sample size:', support_vectors_payload['sample_size'])
