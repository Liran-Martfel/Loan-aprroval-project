// Model Dashboard window: fetches /api/dashboard-data (real SVC hyperparameters,
// model file checksum, a PCA scatter of real applicants + real support vectors,
// and a margin-distribution histogram) and /api/model-info (reused for accuracy /
// confusion matrix / classification report), and renders the whole tab.

(function () {
  const COLORS = {
    denied: '#d64550',
    approved: '#1f9d55',
    supportVector: '#d8ae5e',
    accent: '#6366f1',
    accentDark: '#3730a3',
  };

  window.AppState.dashboardData = null;

  function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function detailRow(labelKey, value) {
    const div = document.createElement('div');
    div.className = 'detail-row';
    div.innerHTML = `<span class="detail-label">${AppI18n.t(labelKey)}</span><span class="detail-value ltr-num">${value}</span>`;
    return div;
  }

  function renderHero(details) {
    const badge = document.getElementById('dashboard-kernel-badge');
    badge.textContent = `SVC (kernel=${details.kernel})`;
  }

  function weightedAvg(report) {
    return report['weighted avg'] || {};
  }

  function statCard(labelKey, value) {
    const div = document.createElement('div');
    div.className = 'stat-card';
    div.innerHTML = `<div class="stat-label">${AppI18n.t(labelKey)}</div><div class="stat-value ltr-num">${value}</div>`;
    return div;
  }

  function renderStatCards(info, details) {
    const row = document.getElementById('dashboard-stat-cards');
    row.innerHTML = '';
    const wavg = weightedAvg(info.classification_report);
    row.appendChild(statCard('stat.accuracy', `${(info.deployment_accuracy * 100).toFixed(1)}%`));
    row.appendChild(statCard('dashboard.precision', wavg.precision != null ? `${(wavg.precision * 100).toFixed(1)}%` : '-'));
    row.appendChild(statCard('dashboard.recall', wavg.recall != null ? `${(wavg.recall * 100).toFixed(1)}%` : '-'));
    row.appendChild(statCard('dashboard.f1', wavg['f1-score'] != null ? `${(wavg['f1-score'] * 100).toFixed(1)}%` : '-'));
    row.appendChild(statCard('dashboard.supportVectors', details.support_vector_count.toLocaleString()));
  }

  function renderDetailsList(details, info) {
    const container = document.getElementById('dashboard-details-list');
    container.innerHTML = '';
    container.appendChild(detailRow('dashboard.algorithm', details.algorithm));
    container.appendChild(detailRow('dashboard.kernel', details.kernel.toUpperCase()));
    container.appendChild(detailRow('dashboard.regularization', details.C));
    container.appendChild(detailRow('dashboard.gamma', details.gamma));
    container.appendChild(detailRow('dashboard.classWeight', details.class_weight === null ? AppI18n.t('dashboard.none') : details.class_weight));
    container.appendChild(detailRow('dashboard.classes', details.class_labels.join(' / ')));
    container.appendChild(detailRow('dashboard.supportVectors', details.support_vector_count.toLocaleString()));
    container.appendChild(detailRow('stat.trained', new Date(info.timestamp).toLocaleDateString()));
  }

  function renderApiList() {
    const container = document.getElementById('dashboard-api-list');
    container.innerHTML = '';
    const endpoints = [
      { method: 'GET', path: '/api/model-info', descKey: 'dashboard.api.info' },
      { method: 'GET', path: '/api/dashboard-data', descKey: 'dashboard.api.dashboard' },
      { method: 'POST', path: '/api/predict', descKey: 'dashboard.api.predict' },
      { method: 'POST', path: '/api/explain', descKey: 'dashboard.api.explain' },
      { method: 'GET', path: '/api/model-file', descKey: 'dashboard.api.file' },
    ];
    endpoints.forEach((ep) => {
      const div = document.createElement('div');
      div.className = 'api-row';
      div.innerHTML = `<span class="api-method api-method-${ep.method.toLowerCase()}">${ep.method}</span>
                        <span class="api-path ltr-num">${ep.path}</span>
                        <span class="api-desc">${AppI18n.t(ep.descKey)}</span>`;
      container.appendChild(div);
    });
  }

  function renderFileInfo(fileInfo) {
    const container = document.getElementById('dashboard-file-info');
    container.innerHTML = '';
    container.appendChild(detailRow('dashboard.filename', fileInfo.filename));
    container.appendChild(detailRow('dashboard.fileSize', formatBytes(fileInfo.size_bytes)));
    const shaRow = detailRow('dashboard.checksum', `${fileInfo.sha256.slice(0, 16)}...`);
    shaRow.title = fileInfo.sha256;
    container.appendChild(shaRow);
  }

  function renderTable(tableEl, columns, rows) {
    const thead = `<thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
    tableEl.innerHTML = thead + tbody;
  }

  function renderConfusion(info) {
    const cm = info.confusion_matrix;
    renderTable(
      document.getElementById('dashboard-confusion-table'),
      ['', 'Predicted: No', 'Predicted: Yes'],
      [
        ['Actual: No', `<span class="cm-correct">${cm[0][0]}</span>`, cm[0][1]],
        ['Actual: Yes', cm[1][0], `<span class="cm-correct">${cm[1][1]}</span>`],
      ]
    );
  }

  function renderReport(info) {
    const report = info.classification_report;
    const columns = ['', 'precision', 'recall', 'f1-score', 'support'];
    const rows = Object.entries(report)
      .filter(([key]) => key !== 'accuracy')
      .map(([key, metrics]) => [
        key,
        metrics.precision?.toFixed(2) ?? '-',
        metrics.recall?.toFixed(2) ?? '-',
        metrics['f1-score']?.toFixed(2) ?? '-',
        metrics.support,
      ]);
    renderTable(document.getElementById('dashboard-report-table'), columns, rows);
  }

  let pcaChart = null;
  let marginChart = null;

  function renderPcaChart(pca) {
    const ctx = document.getElementById('pca-chart');
    const deniedPoints = pca.points.filter((p) => p.label === 0).map((p) => ({ x: p.x, y: p.y }));
    const approvedPoints = pca.points.filter((p) => p.label === 1).map((p) => ({ x: p.x, y: p.y }));
    const svPoints = pca.support_vectors.map((p) => ({ x: p.x, y: p.y }));

    if (pcaChart) pcaChart.destroy();
    pcaChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          { label: AppI18n.t('result.denied'), data: deniedPoints, backgroundColor: `${COLORS.denied}99`, pointRadius: 4 },
          { label: AppI18n.t('result.approved'), data: approvedPoints, backgroundColor: `${COLORS.approved}99`, pointRadius: 4 },
          {
            label: AppI18n.t('dashboard.supportVectors'),
            data: svPoints,
            backgroundColor: 'transparent',
            borderColor: COLORS.supportVector,
            borderWidth: 1.5,
            pointStyle: 'circle',
            pointRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'PC1' } },
          y: { title: { display: true, text: 'PC2' } },
        },
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  function renderMarginChart(hist) {
    const ctx = document.getElementById('margin-chart');
    const labels = hist.counts.map((_, i) => `${hist.bin_edges[i].toFixed(1)}`);
    if (marginChart) marginChart.destroy();
    marginChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: AppI18n.t('dashboard.marginTitle'),
          data: hist.counts,
          backgroundColor: hist.bin_edges.map((e) => (e < 0 ? `${COLORS.denied}88` : `${COLORS.approved}88`)),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { title: { display: true, text: 'margin' } }, y: { title: { display: true, text: 'count' } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  function renderAll() {
    const info = window.AppState.modelInfo;
    const dash = window.AppState.dashboardData;
    if (!info || !dash) return;
    renderHero(dash.model_details);
    renderStatCards(info, dash.model_details);
    renderDetailsList(dash.model_details, info);
    renderApiList();
    renderFileInfo(dash.model_file);
    renderConfusion(info);
    renderReport(info);
    renderPcaChart(dash.pca_scatter);
    renderMarginChart(dash.margin_histogram);
  }

  async function loadDashboardData() {
    try {
      const res = await fetch('/api/dashboard-data');
      if (!res.ok) throw new Error(`status ${res.status}`);
      window.AppState.dashboardData = await res.json();
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    }
    renderAll();
  }

  document.addEventListener('app:model-info-loaded', renderAll);
  document.addEventListener('app:language-changed', renderAll);
  document.addEventListener('DOMContentLoaded', loadDashboardData);
})();
