// Logs window: gates access behind an admin key (checked server-side via
// the X-Admin-Key header on /api/logs), then renders the persistent
// request/error history. The key is kept only in sessionStorage - it's
// cleared when the browser tab closes, and never touches the URL or logs.

(function () {
  const STORAGE_KEY = 'loanapp_admin_key';
  let lastEvents = null;

  function getStoredKey() {
    return sessionStorage.getItem(STORAGE_KEY);
  }

  function showGate() {
    document.getElementById('logs-gate').classList.remove('hidden');
    document.getElementById('logs-content').classList.add('hidden');
  }

  function showContent() {
    document.getElementById('logs-gate').classList.add('hidden');
    document.getElementById('logs-content').classList.remove('hidden');
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

  async function fetchLogs(key) {
    const errorEl = document.getElementById('logs-gate-error');
    errorEl.classList.add('hidden');
    try {
      const res = await fetch('/api/logs', { headers: { 'X-Admin-Key': key } });
      if (res.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        errorEl.classList.remove('hidden');
        showGate();
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      sessionStorage.setItem(STORAGE_KEY, key);
      showContent();
      renderLogs(data.events);
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
  });
})();
