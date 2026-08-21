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
  const sentenceEl = document.getElementById('result-explanation-sentence');
  let lastPayload = null;
  let lastResult = null;
  let lastApproved = null;
  let lastContributions = null;
  let explanationLoaded = false;

  function fieldScale(fieldDiv) {
    return Number(fieldDiv.dataset.scale || '1');
  }

  function numberInput(name) {
    return form.querySelector(`input[name="${name}"]`);
  }

  // loan_percent_income is derived, not entered directly - always
  // loan_amnt / person_income, so it can never contradict those two fields.
  function computeRatio() {
    const income = Number(numberInput('person_income')?.value || 0);
    const loanAmnt = Number(numberInput('loan_amnt')?.value || 0);
    if (!income) return null;
    return loanAmnt / income;
  }

  function updateRatioDisplay() {
    const ratio = computeRatio();
    const display = document.getElementById('ratio-display');
    const fieldDiv = document.querySelector('.field[data-field="loan_percent_income"]');
    if (!display || !fieldDiv) return;

    if (ratio === null) {
      display.textContent = '--';
      return;
    }
    display.innerHTML = `<span class="ltr-num">${(ratio * 100).toFixed(1)}%</span>`;

    const range = getRange('loan_percent_income');
    const hint = fieldDiv.querySelector('.field-hint');
    if (range) {
      const low = range[0];
      // Must match inference.py: ceiling is LOAN_TO_INCOME_CAP (loan_amnt's
      // own cap), not the static training-data max, since this ratio is
      // mathematically just loan_amnt / person_income.
      const high = LOAN_TO_INCOME_CAP;
      const inRange = ratio >= low && ratio <= high;
      fieldDiv.classList.toggle('invalid', !inRange);
      if (hint) {
        hint.innerHTML = inRange
          ? AppI18n.t('field.loan_percent_income_hint')
          : `${AppI18n.t('field.loan_percent_income_hint')} <span class="ltr-num">(${(low * 100).toFixed(0)}% - ${(high * 100).toFixed(0)}%)</span>`;
      }
    }
  }

  // loan_amnt has no fixed ceiling - it scales with whatever income is
  // currently entered (up to LOAN_TO_INCOME_CAP x income), matching the
  // same rule inference.py applies server-side in validate_application().
  const LOAN_TO_INCOME_CAP = 10;

  function loanAmntDynamicMax() {
    const income = Number(numberInput('person_income')?.value || 0);
    return income > 0 ? income * LOAN_TO_INCOME_CAP : null;
  }

  function updateLoanAmntBounds() {
    const fieldDiv = document.querySelector('.field[data-field="loan_amnt"]');
    const input = numberInput('loan_amnt');
    const hint = fieldDiv?.querySelector('.field-hint');
    if (!fieldDiv || !input) return;

    const range = getRange('loan_amnt');
    const dynamicMax = loanAmntDynamicMax();
    const low = range ? range[0] : 0;
    const high = dynamicMax !== null ? dynamicMax : (range ? range[1] : Infinity);
    const value = Number(input.value);
    const inRange = value >= low && value <= high;

    fieldDiv.classList.toggle('invalid', !inRange);
    // The model was only ever trained on loans up to the historical dataset
    // max (range[1]) - allowing more is intentional, but predictions past
    // that point are extrapolation, worth a heads-up rather than a block.
    const trainedMax = range ? range[1] : null;
    if (!inRange && hint) {
      hint.innerHTML = `${AppI18n.t('field.loan_amnt_range_hint')} <span class="ltr-num">$${low.toLocaleString()} - $${high.toLocaleString()}</span>`;
    } else if (trainedMax !== null && value > trainedMax && hint) {
      hint.innerHTML = `${AppI18n.t('field.loan_amnt_extrapolation_hint')} <span class="ltr-num">$${trainedMax.toLocaleString()}.</span>`;
    } else if (hint) {
      hint.textContent = '';
    }
  }

  function wireSteppers() {
    document.querySelectorAll('.field').forEach((fieldDiv) => {
      const input = fieldDiv.querySelector('input[type="number"]');
      if (!input) return;
      const minus = fieldDiv.querySelector('.step-minus');
      const plus = fieldDiv.querySelector('.step-plus');
      const step = Number(input.dataset.step || '1');
      const refresh = () => { validateField(fieldDiv); updateRatioDisplay(); updateLoanAmntBounds(); updateIncomeHint(); };
      minus && minus.addEventListener('click', () => {
        input.value = (Number(input.value || 0) - step).toFixed(2).replace(/\.00$/, '');
        refresh();
      });
      plus && plus.addEventListener('click', () => {
        input.value = (Number(input.value || 0) + step).toFixed(2).replace(/\.00$/, '');
        refresh();
      });
      input.addEventListener('change', refresh);
    });
  }

  function getRange(fieldName) {
    const info = window.AppState.modelInfo;
    if (!info || !info.valid_ranges || !info.valid_ranges[fieldName]) return null;
    return info.valid_ranges[fieldName];
  }

  // Income isn't bounded by the training data's observed range (see
  // inference.py) - shows a heads-up past that range instead of blocking.
  function updateIncomeHint() {
    const fieldDiv = document.querySelector('.field[data-field="person_income"]');
    const input = numberInput('person_income');
    const hint = fieldDiv?.querySelector('.field-hint');
    if (!fieldDiv || !input) return;
    fieldDiv.classList.remove('invalid');
    const range = getRange('person_income');
    const value = Number(input.value);
    if (range && hint) {
      const [low, high] = range;
      hint.innerHTML = (value < low || value > high)
        ? `${AppI18n.t('field.person_income_extrapolation_hint')} <span class="ltr-num">$${low.toLocaleString()} - $${high.toLocaleString()}.</span>`
        : '';
    }
  }

  function validateField(fieldDiv) {
    const fieldName = fieldDiv.dataset.field;
    // loan_percent_income, loan_amnt, and person_income have their own dynamic
    // (non-blocking) checks instead of the generic hard range block below.
    if (!fieldName || fieldName === 'loan_percent_income' || fieldName === 'loan_amnt' || fieldName === 'person_income') return true;
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
      hint.innerHTML = inRange
        ? ''
        : `<span class="ltr-num">${(low * scale).toLocaleString()} - ${(high * scale).toLocaleString()}</span>`;
    }
    return inRange;
  }

  function validateAll() {
    let allValid = true;
    document.querySelectorAll('.field[data-field]').forEach((fieldDiv) => {
      if (!validateField(fieldDiv)) allValid = false;
    });
    updateRatioDisplay();
    updateLoanAmntBounds();
    updateIncomeHint();
    if (document.querySelector('.field[data-field="loan_percent_income"]')?.classList.contains('invalid')) {
      allValid = false;
    }
    if (document.querySelector('.field[data-field="loan_amnt"]')?.classList.contains('invalid')) {
      allValid = false;
    }
    return allValid;
  }

  function collectPayload() {
    const payload = {};
    document.querySelectorAll('.field[data-field]').forEach((fieldDiv) => {
      const fieldName = fieldDiv.dataset.field;
      if (fieldName === 'loan_percent_income') return; // filled in below
      const scale = fieldScale(fieldDiv);
      const input = fieldDiv.querySelector('input[type="number"]');
      if (input) payload[fieldName] = Number(input.value) / scale;
    });
    payload.loan_percent_income = computeRatio() || 0;
    const select = form.querySelector('select[name="previous_loan_defaults_on_file"]');
    payload.previous_loan_defaults_on_file = select.value;
    return payload;
  }

  function renderContributions(contributions) {
    contributionsEl.innerHTML = '';
    Object.entries(contributions).forEach(([feature, value]) => {
      const li = document.createElement('li');
      const sign = value >= 0 ? 'positive' : 'negative';
      li.innerHTML = `<span>${AppI18n.t('field.' + feature) || feature}</span><span class="${sign} ltr-num">${value.toFixed(3)}</span>`;
      contributionsEl.appendChild(li);
    });
  }

  // Turns the raw SHAP numbers into one plain-language sentence: the top
  // 1-2 factors that pushed toward the actual outcome (positive values push
  // toward approval, negative toward denial - so for a denial we highlight
  // the strongest negative contributors, and vice versa for an approval).
  function renderExplanationSentence(contributions, approved) {
    const entries = Object.entries(contributions);
    const relevant = approved
      ? entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
      : entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);

    if (!relevant.length) {
      sentenceEl.textContent = AppI18n.t('result.reasonNone');
    } else {
      const names = relevant.slice(0, 2).map(([feature]) => AppI18n.t('field.' + feature) || feature);
      // Hebrew's "and" (ו) prefixes directly onto the next word, unlike
      // English's standalone "and" - joining them the same way reads as a
      // grammar mistake in Hebrew.
      const factors = names.length < 2
        ? names[0]
        : AppI18n.lang === 'he'
          ? `${names[0]} ${AppI18n.t('common.and')}${names[1]}`
          : names.join(` ${AppI18n.t('common.and')} `);
      sentenceEl.textContent = AppI18n.tFormat(
        approved ? 'result.reasonApproved' : 'result.reasonDenied',
        { factors }
      );
    }
    sentenceEl.classList.remove('hidden');
  }

  function renderHeadline(result) {
    if (!result.valid) {
      headlineEl.textContent = AppI18n.t('result.invalid');
      headlineEl.className = 'result-headline denied';
      confidenceEl.textContent = (result.errors || []).join(' ');
      whyToggle.classList.add('hidden');
      return;
    }
    headlineEl.textContent = result.approved ? AppI18n.t('result.approved') : AppI18n.t('result.denied');
    headlineEl.className = `result-headline ${result.approved ? 'approved' : 'denied'}`;
    confidenceEl.innerHTML = `${AppI18n.t('result.confidence')}: <span class="ltr-num">${result.confidence.toFixed(1)}%</span>`;
    whyToggle.classList.remove('hidden');
  }

  function renderResult(result) {
    resultPanel.classList.remove('hidden');
    contributionsEl.classList.add('hidden');
    contributionsEl.innerHTML = '';
    sentenceEl.classList.add('hidden');
    sentenceEl.textContent = '';
    explanationLoaded = false;
    lastResult = result;
    lastContributions = null;
    lastApproved = result.valid ? result.approved : null;
    renderHeadline(result);
  }

  // Dynamically-rendered result text (headline, explanation sentence,
  // contribution labels) isn't covered by AppI18n.apply()'s data-i18n walk,
  // since it didn't exist in the DOM yet when that ran - refresh it here
  // whenever the language toggles, without discarding what's loaded.
  document.addEventListener('app:language-changed', () => {
    if (!lastResult) return;
    renderHeadline(lastResult);
    if (lastContributions) {
      renderExplanationSentence(lastContributions, lastApproved);
      renderContributions(lastContributions);
    }
  });

  let explanationInFlight = false;

  whyToggle.addEventListener('click', async () => {
    if (explanationInFlight) return; // ignore repeat clicks while a request is already loading
    contributionsEl.classList.toggle('hidden');
    if (explanationLoaded || contributionsEl.classList.contains('hidden') || !lastPayload) return;

    explanationInFlight = true;
    contributionsEl.classList.remove('hidden');
    contributionsEl.innerHTML = `<li><span class="spinner"></span>${AppI18n.t('result.explaining')}</li>`;
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastPayload),
      });
      const data = await res.json();
      if (data.valid) {
        lastContributions = data.feature_contributions;
        renderExplanationSentence(data.feature_contributions, lastApproved);
        renderContributions(data.feature_contributions);
        explanationLoaded = true;
      } else {
        contributionsEl.innerHTML = `<li>${AppI18n.t('result.error')}</li>`;
      }
    } catch (err) {
      console.error(err);
      contributionsEl.innerHTML = `<li>${AppI18n.t('result.error')}</li>`;
    } finally {
      explanationInFlight = false;
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
