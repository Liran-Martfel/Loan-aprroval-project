// Translation strings + the combined language/currency toggle.
// Clicking the $/₪ button swaps both the UI language (EN<->HE, with RTL)
// and the currency symbol shown next to money fields. The underlying
// numbers never change - see the currency-toggle explanation given to the
// user: this is a display-only swap, not a real exchange-rate conversion.

const TRANSLATIONS = {
  en: {
    dir: 'ltr',
    currencySymbol: '$',
    'page.title': 'Loan Approval Prediction',
    'nav.eligibility': 'Check Eligibility',
    'nav.modelData': 'Model Data',
    'lookWithin.title': 'The Look From Within',
    'lookWithin.input': 'Your Data',
    'lookWithin.kernel': 'Kernel Space',
    'lookWithin.output': 'Decision',
    'lookWithin.caption': "Your details are scaled, then compared against thousands of past applicants inside the model's kernel space to reach a decision.",
    'common.and': 'and',
    'form.title': 'Loan Application Details',
    'form.subtitle': 'Fill in your details to check your eligibility.',
    'form.submit': 'Check Loan Eligibility',
    'field.person_income': 'Annual Income',
    'field.person_emp_exp': 'Employment Experience (years)',
    'field.loan_amnt': 'Requested Loan Amount',
    'field.loan_amnt_range_hint': 'Allowed range:',
    'field.loan_amnt_extrapolation_hint': "Heads up: the model was only trained on loan amounts up to",
    'field.loan_int_rate': 'Interest Rate (%)',
    'field.loan_percent_income': 'Loan-to-Income Ratio',
    'field.loan_percent_income_hint': 'Calculated automatically from income and loan amount.',
    'field.credit_score': 'Credit Score',
    'field.previous_loan_defaults_on_file': 'Previous Loan Defaults',
    'option.no': 'No',
    'option.yes': 'Yes',
    'result.approved': 'Loan Approved',
    'result.denied': 'Loan Not Approved',
    'result.confidence': 'Confidence',
    'result.why': 'Why?',
    'result.explaining': 'Working out why (~10s)...',
    'result.reasonApproved': 'This application was approved mainly because of: {factors}.',
    'result.reasonDenied': 'This application was not approved mainly because of: {factors}.',
    'result.reasonNone': 'No single factor stood out strongly in this decision.',
    'result.invalid': 'Please fix the highlighted fields.',
    'result.error': 'Something went wrong. Please try again.',
    'model.featuresTitle': 'Features',
    'model.sampleTitle': 'Sample Training Data',
    'model.advancedTitle': 'Advanced Metrics',
    'model.confusionTitle': 'Confusion Matrix',
    'model.reportTitle': 'Classification Report',
    'model.marginsTitle': 'Decision Margins (summary)',
    'stat.modelName': 'Model',
    'stat.accuracy': 'Accuracy',
    'stat.rows': 'Training Rows',
    'stat.trained': 'Last Trained',
  },
  he: {
    dir: 'rtl',
    currencySymbol: '₪',
    'page.title': 'חיזוי אישור הלוואה',
    'nav.eligibility': 'בדיקת זכאות',
    'nav.modelData': 'נתוני המודל',
    'lookWithin.title': 'המבט מבפנים',
    'lookWithin.input': 'הנתונים שלך',
    'lookWithin.kernel': 'מרחב הקרנל',
    'lookWithin.output': 'החלטה',
    'lookWithin.caption': 'הפרטים שלך מנורמלים ואז מושווים לאלפי בקשות עבר בתוך מרחב הקרנל של המודל כדי להגיע להחלטה.',
    'common.and': 'ו',
    'form.title': 'פרטי בקשת הלוואה',
    'form.subtitle': 'מלא/י את הפרטים שלך כדי לבדוק זכאות.',
    'form.submit': 'בדיקת זכאות להלוואה',
    'field.person_income': 'הכנסה שנתית',
    'field.person_emp_exp': 'ותק תעסוקתי (שנים)',
    'field.loan_amnt': 'סכום ההלוואה המבוקש',
    'field.loan_amnt_range_hint': 'טווח מותר:',
    'field.loan_amnt_extrapolation_hint': 'שימו לב: המודל אומן רק על סכומי הלוואה עד',
    'field.loan_int_rate': 'שיעור ריבית (%)',
    'field.loan_percent_income': 'יחס הלוואה להכנסה',
    'field.loan_percent_income_hint': 'מחושב אוטומטית מההכנסה וסכום ההלוואה.',
    'field.credit_score': 'דירוג אשראי',
    'field.previous_loan_defaults_on_file': 'פיגורים בעבר',
    'option.no': 'לא',
    'option.yes': 'כן',
    'result.approved': 'הלוואה אושרה',
    'result.denied': 'הלוואה לא אושרה',
    'result.confidence': 'רמת ביטחון',
    'result.why': 'למה?',
    'result.explaining': 'בודקים למה (כ-10 שניות)...',
    'result.reasonApproved': 'הבקשה אושרה בעיקר בשל: {factors}.',
    'result.reasonDenied': 'הבקשה לא אושרה בעיקר בשל: {factors}.',
    'result.reasonNone': 'אף גורם בודד לא בלט במיוחד בהחלטה זו.',
    'result.invalid': 'אנא תקנ/י את השדות המסומנים.',
    'result.error': 'אירעה תקלה. נסו/י שוב.',
    'model.featuresTitle': 'מאפייני המודל',
    'model.sampleTitle': 'מדגם מנתוני האימון',
    'model.advancedTitle': 'מדדים מתקדמים',
    'model.confusionTitle': 'מטריצת בלבול',
    'model.reportTitle': 'דוח סיווג',
    'model.marginsTitle': 'שולי ההחלטה (סיכום)',
    'stat.modelName': 'מודל',
    'stat.accuracy': 'דיוק',
    'stat.rows': 'שורות אימון',
    'stat.trained': 'אומן לאחרונה',
  },
};

const AppI18n = {
  lang: 'en',
  t(key) {
    return (TRANSLATIONS[this.lang] && TRANSLATIONS[this.lang][key]) || key;
  },
  tFormat(key, vars) {
    let text = this.t(key);
    Object.entries(vars || {}).forEach(([k, v]) => { text = text.replace(`{${k}}`, v); });
    return text;
  },
  currencySymbol() {
    return TRANSLATIONS[this.lang].currencySymbol;
  },
  apply() {
    const dict = TRANSLATIONS[this.lang];
    document.documentElement.lang = this.lang;
    document.documentElement.dir = dict.dir;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this.t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-currency]').forEach((el) => {
      const symbolSpot = el.querySelector('.currency-symbol');
      if (symbolSpot) symbolSpot.textContent = dict.currencySymbol;
    });
    const ctSymbol = document.querySelector('.ct-symbol');
    if (ctSymbol) ctSymbol.textContent = this.lang === 'en' ? '$' : '₪';
    document.dispatchEvent(new CustomEvent('app:language-changed', { detail: { lang: this.lang } }));
  },
  toggle() {
    this.lang = this.lang === 'en' ? 'he' : 'en';
    this.apply();
  },
};
