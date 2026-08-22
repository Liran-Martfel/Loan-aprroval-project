// Model Data window: renders whatever /api/model-info returns (fetched
// once by app.js) into stat cards, a feature list, a data sample table,
// and a collapsible "advanced metrics" section.

(function () {
  function statCard(labelKey, value, isNumeric) {
    const div = document.createElement('div');
    div.className = 'stat-card';
    const valueHtml = isNumeric ? `<span class="ltr-num">${value}</span>` : value;
    div.innerHTML = `<div class="stat-label">${AppI18n.t(labelKey)}</div><div class="stat-value">${valueHtml}</div>`;
    return div;
  }

  function renderStats(info) {
    const row = document.getElementById('stat-cards');
    row.innerHTML = '';
    // model_name is a long descriptive string (e.g. "SVC (kernel=rbf),
    // calibrated via CalibratedClassifierCV for deployment") - only the
    // part before the first comma belongs on a compact stat card.
    row.appendChild(statCard('stat.modelName', info.model_name.split(',')[0], false));
    row.appendChild(statCard('stat.accuracy', `${(info.deployment_accuracy * 100).toFixed(1)}%`, true));
    row.appendChild(statCard('stat.rows', info.n_training_rows.toLocaleString(), true));
    row.appendChild(statCard('stat.trained', new Date(info.timestamp).toLocaleDateString(), true));
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
                        <div class="frange"><span class="ltr-num">${rangeText}</span> (${info.input_schema[feature]})</div>`;
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

  // Shown only while a "Try Your Own Data" session is ready, so a visitor
  // can see their own upload's basic stats reflected here too, clearly
  // separated from the real deployed model's section right below it.
  function renderCustomData() {
    const card = document.getElementById('custom-data-card');
    const label = document.getElementById('model-data-original-label');
    if (!card || !label) return;
    const meta = window.AppCustomModel && window.AppCustomModel.getMeta();
    if (!meta) {
      card.classList.add('hidden');
      label.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    label.classList.remove('hidden');
    const row = document.getElementById('custom-data-stat-cards');
    row.innerHTML = '';
    row.appendChild(statCard('stat.accuracy', `${(meta.accuracy * 100).toFixed(1)}%`, true));
    row.appendChild(statCard('stat.rows', meta.n_rows.toLocaleString(), true));
    if (meta.confusion_matrix) {
      const cm = meta.confusion_matrix;
      renderTable(
        document.getElementById('custom-data-confusion-table'),
        ['', 'Predicted: No', 'Predicted: Yes'],
        [['Actual: No', cm[0][0], cm[0][1]], ['Actual: Yes', cm[1][0], cm[1][1]]]
      );
    }
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
    renderCustomData();
  }

  document.getElementById('advanced-toggle').addEventListener('click', () => {
    document.getElementById('advanced-content').classList.toggle('hidden');
  });

  document.addEventListener('app:model-info-loaded', renderAll);
  document.addEventListener('app:language-changed', renderAll);
  document.addEventListener('app:custom-model-ready', renderCustomData);
  document.addEventListener('app:custom-model-cleared', renderCustomData);
})();
