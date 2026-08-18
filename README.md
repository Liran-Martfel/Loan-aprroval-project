# 🏦 מערכת לחיזוי אישור הלוואה (Loan Approval Prediction)

מערכת Machine Learning מקצה לקצה לחיזוי אישור/דחיית הלוואה מבוססת מודל Support Vector Classifier (SVC). 
המערכת מבוססת על Pipeline של `scikit-learn` הכולל נרמול ב-`StandardScaler` ואימון מודל, ומפרידה לחלוטין בין שלב האימון לבין ה-API וממשק המשתמש בזמן ריצה.

---

## 📊 ביצועי המודל והנתונים
- **דאטה-סט:** `Project_DB_loan_approval.csv` (סינון גילאי 18+).
- **פיצ'רים נבחרים:** הכנסה, סכום הלוואה, ריבית, אחוז מתוך הכנסה, דירוג אשראי והיסטוריית מחדלי הלוואה קודמים (`previous_loan_defaults_on_file`).
- **אלגוריתם:** `SVC(kernel='rbf', C=10)` שנבחר באמצעות Cross-Validation.
- **תוצאות אימון (Test Set):**
  - **Accuracy:** ~90.44%
  - **Confusion Matrix:** 6,649 שליליים נכונים, 1,491 חיוביים נכונים
  - **F1-Score:** 0.94 (סיווג 0), 0.78 (סיווג 1)
