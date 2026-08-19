// Shared app shell: sidebar window-switching, the $/₪ toggle, and a single
// shared fetch of /api/model-info (both the eligibility form's validation
// ranges and the Model Data window need it, so it's fetched once here and
// broadcast via an event).

window.AppState = { modelInfo: null };

function switchWindow(name) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.window === name);
  });
  document.querySelectorAll('.window').forEach((section) => {
    section.classList.toggle('active', section.id === `window-${name}`);
  });
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchWindow(btn.dataset.window));
});

document.getElementById('currency-toggle').addEventListener('click', () => {
  AppI18n.toggle();
});

async function loadModelInfo() {
  try {
    const res = await fetch('/api/model-info');
    if (!res.ok) throw new Error(`status ${res.status}`);
    window.AppState.modelInfo = await res.json();
    const badge = document.getElementById('app-version-badge');
    if (window.AppState.modelInfo.app_version) badge.textContent = `v${window.AppState.modelInfo.app_version}`;
  } catch (err) {
    console.error('Failed to load model info', err);
  }
  document.dispatchEvent(new CustomEvent('app:model-info-loaded', { detail: window.AppState.modelInfo }));
}

document.addEventListener('DOMContentLoaded', () => {
  AppI18n.apply();
  loadModelInfo();
});
