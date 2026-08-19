// Eligibility form: numeric steppers, client-side validation against the
// model's real valid_ranges (fetched from /api/model-info), submission to
// /api/predict, and rendering the bilingual approve/deny result.

(function () {
  const form = document.getElementById('predict-form');
  const resultPanel = document.getElementById('result-panel');
  const headlineEl = document.getElementById('result-headline');
  const confidenceEl = document.getElementById('result-confidence');
  const whyToggle = document.getElementById('why-toggle');
  const contributionsEl = document.getElementById('result-contributions');
  let lastPayload = null;
  let explanationLoaded = false;

  function fieldScale(fieldDiv) {
    return Number(fieldDiv.dataset.scale || '1');
  }

  function wireSteppers() {
    document.querySelectorAll('.field').forEach((fieldDiv) => {
      const input = fieldDiv.querySelector('input[type="number"]');
      if (!input) return;
      const minus = fieldDiv.querySelector('.step-minus');
      const plus = fieldDiv.querySelector('.step-plus');
      const step = Number(input.step || '1');
      minus && minus.addEventListener('click', () => {
        input.value = (Number(input.value || 0) - step).toFixed(2).replace(/\.00$/, '');
        validateField(fieldDiv);
      });
      plus && plus.addEventListener('click', () => {
        input.value = (Number(input.value || 0) + step).toFixed(2).replace(/\.00$/, '');
        validateField(fieldDiv);
      });
      input.addEventListener('change', () => validateField(fieldDiv));
    });
  }

  function getRange(fieldName) {
    const info = window.AppState.modelInfo;
    if (!info || !info.valid_ranges || !info.valid_ranges[fieldName]) return null;
    return info.valid_ranges[fieldName];
  }

  function validateField(fieldDiv) {
    const fieldName = fieldDiv.dataset.field;
    if (!fieldName) return true;
    const input = fieldDiv.querySelector('input[type="number"]');
    const hint = fieldDiv.querySelector('.field-hint');
    const range = getRange(fieldName);
    if (!input || !range) return true;

    const scale = fieldScale(fieldDiv);
    const rawValue = Number(input.value) / scale;
    const [low, high] = range;
    const inRange = rawValue >= low && rawValue <= high;

    fieldDiv.classList.toggle('invalid', !inRange);
    if (hint) {
      hint.textContent = inRange
        ? ''
        : `${(low * scale).toLocaleString()} - ${(high * scale).toLocaleString()}`;
    }
    return inRange;
  }

  function validateAll() {
    let allValid = true;
    document.querySelectorAll('.field[data-field]').forEach((fieldDiv) => {
      if (!validateField(fieldDiv)) allValid = false;
    });
    return allValid;
  }

  function collectPayload() {
    const payload = {};
    document.querySelectorAll('.field[data-field]').forEach((fieldDiv) => {
      const fieldName = fieldDiv.dataset.field;
      const scale = fieldScale(fieldDiv);
      const input = fieldDiv.querySelector('input[type="number"]');
      if (input) payload[fieldName] = Number(input.value) / scale;
    });
    const select = form.querySelector('select[name="previous_loan_defaults_on_file"]');
    payload.previous_loan_defaults_on_file = select.value;
    return payload;
  }

  function renderContributions(contributions) {
    contributionsEl.innerHTML = '';
    Object.entries(contributions).forEach(([feature, value]) => {
      const li = document.createElement('li');
      const sign = value >= 0 ? 'positive' : 'negative';
      li.innerHTML = `<span>${AppI18n.t('field.' + feature) || feature}</span><span class="${sign}">${value.toFixed(3)}</span>`;
      contributionsEl.appendChild(li);
    });
  }

  function renderResult(result) {
    resultPanel.classList.remove('hidden');
    contributionsEl.classList.add('hidden');
    contributionsEl.innerHTML = '';
    explanationLoaded = false;

    if (!result.valid) {
      headlineEl.textContent = AppI18n.t('result.invalid');
      headlineEl.className = 'result-headline denied';
      confidenceEl.textContent = (result.errors || []).join(' ');
      whyToggle.classList.add('hidden');
      return;
    }

    headlineEl.textContent = result.approved ? AppI18n.t('result.approved') : AppI18n.t('result.denied');
    headlineEl.className = `result-headline ${result.approved ? 'approved' : 'denied'}`;
    confidenceEl.textContent = `${AppI18n.t('result.confidence')}: ${result.confidence.toFixed(1)}%`;
    whyToggle.classList.remove('hidden');
  }

  whyToggle.addEventListener('click', async () => {
    contributionsEl.classList.toggle('hidden');
    if (explanationLoaded || contributionsEl.classList.contains('hidden') || !lastPayload) return;

    contributionsEl.classList.remove('hidden');
    contributionsEl.innerHTML = '<li>...</li>';
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastPayload),
      });
      const data = await res.json();
      if (data.valid) {
        renderContributions(data.feature_contributions);
        explanationLoaded = true;
      } else {
        contributionsEl.innerHTML = `<li>${AppI18n.t('result.error')}</li>`;
      }
    } catch (err) {
      console.error(err);
      contributionsEl.innerHTML = `<li>${AppI18n.t('result.error')}</li>`;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateAll()) {
      renderResult({ valid: false, errors: [AppI18n.t('result.invalid')] });
      return;
    }
    try {
      const payload = collectPayload();
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      lastPayload = result.valid ? payload : null;
      renderResult(result);
    } catch (err) {
      console.error(err);
      renderResult({ valid: false, errors: [AppI18n.t('result.error')] });
    }
  });

  document.addEventListener('app:model-info-loaded', () => validateAll());
  wireSteppers();
})();
