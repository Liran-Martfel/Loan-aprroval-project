// Logs window: gates access behind an admin key (checked server-side via
// the X-Admin-Key header on /api/logs and /api/logs/predictions), then
// renders the persistent request/error history and the eligibility-check
// submission history. The key is kept only in sessionStorage - it's
// cleared when the browser tab closes, and never touches the URL or logs.

(function () {
  const STORAGE_KEY = 'loanapp_admin_key';
  let lastEvents = null;
  let lastPredictions = null;

  function getStoredKey() {
    return sessionStorage.getItem(STORAGE_KEY);
  }

  function showGate() {
    document.getElementById('logs-gate').classList.remove('hidden');
    document.getElementById('logs-content').classList.add('hidden');
    document.getElementById('predictions-content').classList.add('hidden');
  }

  function showContent() {
    document.getElementById('logs-gate').classList.add('hidden');
    document.getElementById('logs-content').classList.remove('hidden');
    document.getElementById('predictions-content').classList.remove('hidden');
  }

  function statusClass(status) {
    if (status >= 500) return 'log-status-error';
    if (status >= 400) return 'log-status-warn';
    return 'log-status-ok';
  }

  function renderLogs(events) {
    lastEvents = events;
    const table = document.getElementById('logs-table');
    const columns = ['logs.colTime', 'logs.colMethod', 'logs.colPath', 'logs.colStatus', 'logs.colDuration', 'logs.colError']
      .map((k) => AppI18n.t(k));
    if (!events.length) {
      table.innerHTML = `<thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
                          <tbody><tr><td colspan="6">${AppI18n.t('logs.empty')}</td></tr></tbody>`;
      return;
    }
    const rows = events.map((e) => `
      <tr>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td>${e.method}</td>
        <td>${e.path}</td>
        <td class="${statusClass(e.status_code)}">${e.status_code}</td>
        <td>${e.duration_ms.toFixed(1)}ms</td>
        <td class="log-error-cell">${e.error_message || ''}</td>
      </tr>
    `).join('');
    table.innerHTML = `<thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>`;
  }

  function renderPredictions(predictions) {
    lastPredictions = predictions;
    const table = document.getElementById('predictions-table');
    const columns = [
      'logs.colTime', 'field.person_income', 'field.person_emp_exp', 'field.loan_amnt',
      'field.loan_int_rate', 'field.loan_percent_income', 'field.credit_score',
      'field.previous_loan_defaults_on_file', 'logs.colOutcome', 'logs.colConfidence', 'logs.colSource',
    ].map((k) => AppI18n.t(k));
    if (!predictions.length) {
      table.innerHTML = `<thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
                          <tbody><tr><td colspan="${columns.length}">${AppI18n.t('logs.empty')}</td></tr></tbody>`;
      return;
    }
    const rows = predictions.map((p) => {
      const outcome = !p.valid
        ? `<span class="log-status-warn">${p.errors || AppI18n.t('logs.invalid')}</span>`
        : p.approved
          ? `<span class="log-status-ok">${AppI18n.t('result.approved')}</span>`
          : `<span class="log-status-error">${AppI18n.t('result.denied')}</span>`;
      const source = p.model_used === 'custom' ? AppI18n.t('logs.sourceCustom') : AppI18n.t('logs.sourceOriginal');
      return `
        <tr>
          <td>${new Date(p.timestamp).toLocaleString()}</td>
          <td>${p.person_income ?? ''}</td>
          <td>${p.person_emp_exp ?? ''}</td>
          <td>${p.loan_amnt ?? ''}</td>
          <td>${p.loan_int_rate ?? ''}</td>
          <td>${p.loan_percent_income ?? ''}</td>
          <td>${p.credit_score ?? ''}</td>
          <td>${p.previous_loan_defaults_on_file === 'Yes' ? AppI18n.t('option.yes') : p.previous_loan_defaults_on_file === 'No' ? AppI18n.t('option.no') : (p.previous_loan_defaults_on_file ?? '')}</td>
          <td>${outcome}</td>
          <td>${p.confidence != null ? `${p.confidence}%` : ''}</td>
          <td>${source}</td>
        </tr>
      `;
    }).join('');
    table.innerHTML = `<thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>`;
  }

  async function fetchLogs(key) {
    const errorEl = document.getElementById('logs-gate-error');
    errorEl.classList.add('hidden');
    try {
      const [logsRes, predictionsRes] = await Promise.all([
        fetch('/api/logs?limit=10', { headers: { 'X-Admin-Key': key } }),
        fetch('/api/logs/predictions?limit=10', { headers: { 'X-Admin-Key': key } }),
      ]);
      if (logsRes.status === 401 || predictionsRes.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        errorEl.classList.remove('hidden');
        showGate();
        return;
      }
      if (!logsRes.ok || !predictionsRes.ok) throw new Error(`status ${logsRes.status}/${predictionsRes.status}`);
      const logsData = await logsRes.json();
      const predictionsData = await predictionsRes.json();
      sessionStorage.setItem(STORAGE_KEY, key);
      showContent();
      renderLogs(logsData.events);
      renderPredictions(predictionsData.predictions);
    } catch (err) {
      console.error('Failed to load logs', err);
      errorEl.classList.remove('hidden');
    }
  }

  document.getElementById('logs-unlock-btn').addEventListener('click', () => {
    const key = document.getElementById('logs-key-input').value;
    if (key) fetchLogs(key);
  });

  document.getElementById('logs-key-input').addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') document.getElementById('logs-unlock-btn').click();
  });

  document.getElementById('logs-refresh-btn').addEventListener('click', () => {
    const key = getStoredKey();
    if (key) fetchLogs(key);
  });

  document.getElementById('predictions-refresh-btn').addEventListener('click', () => {
    const key = getStoredKey();
    if (key) fetchLogs(key);
  });

  async function downloadCsv(exportPath, filename) {
    const key = getStoredKey();
    if (!key) return;
    const res = await fetch(exportPath, { headers: { 'X-Admin-Key': key } });
    if (!res.ok) {
      console.error('Export failed', res.status);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  document.getElementById('logs-download-btn').addEventListener('click', () => {
    downloadCsv('/api/logs/export', 'request_log.csv');
  });

  document.getElementById('predictions-download-btn').addEventListener('click', () => {
    downloadCsv('/api/logs/predictions/export', 'prediction_log.csv');
  });

  document.getElementById('logs-lock-btn').addEventListener('click', () => {
    sessionStorage.removeItem(STORAGE_KEY);
    showGate();
  });

  document.querySelector('.nav-item[data-window="logs"]').addEventListener('click', () => {
    const key = getStoredKey();
    if (key) fetchLogs(key);
  });

  document.addEventListener('app:language-changed', () => {
    if (lastEvents) renderLogs(lastEvents);
    if (lastPredictions) renderPredictions(lastPredictions);
  });
})();
