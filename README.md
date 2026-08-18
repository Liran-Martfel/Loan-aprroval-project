# 🏦 מערכת לחיזוי אישור הלוואה (Loan Approval Prediction)

מערכת Machine Learning מקצה לקצה לחיזוי אישור/דחיית הלוואה מבוססת מודל Support Vector Classifier (SVC). 
המערכת מבוססת על Pipeline של `scikit-learn` הכולל נרמול ב-`StandardScaler` ואימון מודל, ומפרידה לחלוטין בין שלב האימון לבין ה-API וממשק המשתמש בזמן ריצה.

---

## 📊 ביצועי המודל והנתונים
- **דאטה-סט:** `Project_DB_loan_approval.csv` (סינון גילאי 18+).
- **פיצ'רים נבחרים:** הכנסה, סכום הלוואה, ריבית, אחוז מתוך הכנסה, דירוג אשראי והיסטוריית מחדלי הלוואה קודמים (`previous_loan_defaults_on_file`)[cite: 2].
- **אלגוריתם:** `SVC(kernel='rbf', C=10)` שנבחר באמצעות Cross-Validation[cite: 2].
- **תוצאות אימון (Test Set):**
  - **Accuracy:** ~90.44%[cite: 2]
  - **Confusion Matrix:** 6,649 שליליים נכונים, 1,491 חיוביים נכונים[cite: 2]
  - **F1-Score:** 0.94 (סיווג 0), 0.78 (סיווג 1)[cite: 2]

---

## 🛠️ ארכיטקטורה ומבנה הפרויקט

```text
├── Project_DB_loan_approval.csv  # דאטה-סט מקורי[cite: 2]
├── Full project.pkl               # Pipeline מאומן שמור (StandardScaler + SVC)[cite: 2]
├── model_training.ipynb           # מחברת אימון המודל וחיפוש פרמטרים[cite: 2]
├── app.py                         # שרת REST API להרצת תחזיות והצגת דשבורד
├── templates/
│   ├── index.html                 # ממשק בדיקת זכאות להלוואה (UI)
│   └── dashboard.html             # דף נתוני ומטריקות המודל
└── requirements.txt               # תלויות פייתון
