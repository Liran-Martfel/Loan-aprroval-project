// "Try Your Own Data": lets a visitor upload their own CSV and get a
// private model trained just for their browser session (see
// custom_model.py on the server). The session token lives only in
// sessionStorage and is only ever sent back to this site's own
// /api/predict, and only while the visitor has the toggle turned on.

(function () {
  const TOKEN_KEY = 'loanapp_custom_token';
  const META_KEY = 'loanapp_custom_meta';
  const TOGGLE_KEY = 'loanapp_custom_toggle';

  const fileInput = document.getElementById('custom-file-input');
  const uploadBtn = document.getElementById('custom-upload-btn');
  const errorEl = document.getElementById('custom-upload-error');
  const resultEl = document.getElementById('custom-model-result');
  const accuracyEl = document.getElementById('custom-accuracy');
  const realAccuracyEl = document.getElementById('custom-real-accuracy');
  const rowsNoteEl = document.getElementById('custom-rows-note');
  const useToggle = document.getElementById('custom-use-toggle');

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function isActive() {
    return Boolean(getToken()) && Boolean(useToggle && useToggle.checked);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(META_KEY);
    sessionStorage.removeItem(TOGGLE_KEY);
    if (useToggle) useToggle.checked = false;
    if (resultEl) resultEl.classList.add('hidden');
  }

  // Called by predict.js after every prediction. If the toggle was on but
  // the server actually used the real model, the private session must have
  // expired server-side (2-hour TTL) since it was uploaded - without this,
  // the comparison card would keep showing stale numbers for a model that
  // no longer exists.
  function reportModelUsed(modelUsed) {
    if (isActive() && modelUsed !== 'custom') {
      clearSession();
      errorEl.textContent = AppI18n.t('custom.sessionExpired');
    }
  }

  window.AppCustomModel = { isActive, getToken, reportModelUsed };

  function renderRealAccuracy() {
    const info = window.AppState.modelInfo;
    if (info && realAccuracyEl) {
      realAccuracyEl.innerHTML = `<span class="ltr-num">${(info.deployment_accuracy * 100).toFixed(1)}%</span>`;
    }
  }

  function showResult(meta) {
    if (!resultEl) return;
    resultEl.classList.remove('hidden');
    accuracyEl.innerHTML = `<span class="ltr-num">${(meta.accuracy * 100).toFixed(1)}%</span>`;
    renderRealAccuracy();
    rowsNoteEl.innerHTML = AppI18n.tFormat('custom.rowsNote', {
      rows: `<span class="ltr-num">${meta.n_rows.toLocaleString()}</span>`,
    });
  }

  function restoreFromStorage() {
    const token = getToken();
    const metaRaw = sessionStorage.getItem(META_KEY);
    if (!token || !metaRaw) return;
    try {
      showResult(JSON.parse(metaRaw));
      if (useToggle) useToggle.checked = sessionStorage.getItem(TOGGLE_KEY) === '1';
    } catch {
      clearSession();
    }
  }

  async function upload() {
    const file = fileInput.files[0];
    errorEl.textContent = '';
    if (!file) {
      errorEl.textContent = AppI18n.t('custom.noFile');
      return;
    }
    uploadBtn.disabled = true;
    const originalLabel = uploadBtn.textContent;
    uploadBtn.textContent = AppI18n.t('custom.uploading');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/custom-model/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        errorEl.textContent = (data.errors || [AppI18n.t('custom.uploadFailed')]).join(' ');
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(META_KEY, JSON.stringify({ accuracy: data.accuracy, n_rows: data.n_rows }));
      sessionStorage.setItem(TOGGLE_KEY, '1');
      showResult(data);
      useToggle.checked = true;
    } catch (err) {
      console.error(err);
      errorEl.textContent = AppI18n.t('custom.uploadFailed');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = originalLabel;
    }
  }

  uploadBtn && uploadBtn.addEventListener('click', upload);
  useToggle && useToggle.addEventListener('change', () => {
    sessionStorage.setItem(TOGGLE_KEY, useToggle.checked ? '1' : '0');
  });
  document.addEventListener('app:model-info-loaded', renderRealAccuracy);
  document.addEventListener('app:language-changed', () => {
    const metaRaw = sessionStorage.getItem(META_KEY);
    if (metaRaw && getToken()) showResult(JSON.parse(metaRaw));
  });
  document.addEventListener('DOMContentLoaded', restoreFromStorage);
})();
