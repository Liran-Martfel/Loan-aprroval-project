// Model Data window: renders whatever /api/model-info returns (fetched
// once by app.js) into stat cards, a feature list, a data sample table,
// and a collapsible "advanced metrics" section.

(function () {
  function statCard(labelKey, value) {
    const div = document.createElement('div');
    div.className = 'stat-card';
    div.innerHTML = `<div class="stat-label">${AppI18n.t(labelKey)}</div><div class="stat-value">${value}</div>`;
    return div;
  }

  function renderStats(info) {
    const row = document.getElementById('stat-cards');
    row.innerHTML = '';
    row.appendChild(statCard('stat.modelName', info.model_name));
    row.appendChild(statCard('stat.accuracy', `${(info.deployment_accuracy * 100).toFixed(1)}%`));
    row.appendChild(statCard('stat.rows', info.n_training_rows.toLocaleString()));
    row.appendChild(statCard('stat.trained', new Date(info.timestamp).toLocaleDateString()));
  }

  function renderFeatures(info) {
    const container = document.getElementById('feature-list');
    container.innerHTML = '';
    info.features.forEach((feature) => {
      const div = document.createElement('div');
      div.className = 'feature-item';
      const range = info.valid_ranges[feature];
      const isBinary = feature === 'previous_loan_defaults_on_file';
      const rangeText = isBinary ? 'No / Yes' : `${range[0].toLocaleString()} - ${range[1].toLocaleString()}`;
      div.innerHTML = `<div class="fname">${AppI18n.t('field.' + feature) || feature}</div>
                        <div class="frange">${rangeText} (${info.input_schema[feature]})</div>`;
      container.appendChild(div);
    });
  }

  function renderTable(tableEl, columns, rows) {
    const thead = `<thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>`;
    tableEl.innerHTML = thead + tbody;
  }

  function renderSample(info) {
    if (!info.data_sample.length) return;
    const columns = Object.keys(info.data_sample[0]);
    const rows = info.data_sample.map((row) => columns.map((c) => row[c]));
    renderTable(document.getElementById('sample-table'), columns, rows);
  }

  function renderConfusion(info) {
    const cm = info.confusion_matrix;
    renderTable(
      document.getElementById('confusion-table'),
      ['', 'Predicted: No', 'Predicted: Yes'],
      [['Actual: No', cm[0][0], cm[0][1]], ['Actual: Yes', cm[1][0], cm[1][1]]]
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
    renderTable(document.getElementById('report-table'), columns, rows);
  }

  function renderMargins(info) {
    const m = info.margins_summary;
    renderTable(
      document.getElementById('margins-table'),
      ['min', 'max', 'mean', 'std'],
      [[m.min.toFixed(3), m.max.toFixed(3), m.mean.toFixed(3), m.std.toFixed(3)]]
    );
  }

  function renderAll() {
    const info = window.AppState.modelInfo;
    if (!info) return;
    renderStats(info);
    renderFeatures(info);
    renderSample(info);
    renderConfusion(info);
    renderReport(info);
    renderMargins(info);
  }

  document.getElementById('advanced-toggle').addEventListener('click', () => {
    document.getElementById('advanced-content').classList.toggle('hidden');
  });

  document.addEventListener('app:model-info-loaded', renderAll);
  document.addEventListener('app:language-changed', renderAll);
})();
