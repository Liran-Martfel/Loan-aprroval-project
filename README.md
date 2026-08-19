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

---

## 🌐 האתר החי
**כתובת:** https://loan-approval-prediction-1a7a.onrender.com/

האתר בנוי עם FastAPI (`main.py`) ומגיש שני דפים: בדיקת זכאות (עם חיזוי + הסבר SHAP) ולוח בקרת מודל (נתונים, גרפים, וגבול ההחלטה של ה-SVM). כל הלוגיקה של החיזוי נמצאת ב-`inference.py`, כך שהיא לא תלויה בקוד של ה-notebook.

### איך מאמנים מחדש את המודל
1. מריצים את ה-notebook (`final code for Loan Approval Prediction Project.ipynb`) מההתחלה ועד הסוף, מול הדאטה-סט המלא. זה יוצר מחדש את `Full project.pkl`, `model_report.json` ו-`background_sample.pkl`.
2. מריצים `python build_dashboard_data.py` — זה מחשב מחדש את נתוני "לוח בקרת המודל" (וקטורי תמיכה, גבול ההחלטה, היסטוגרמת השוליים) ושומר אותם ב-`dashboard_data.json` ובתמונה `static/img/decision_boundary.png`.
3. עושים commit ו-push לענף `main`.

### איך פורסים מחדש
Render מחובר ישירות למאגר ה-GitHub - כל push לענף `main` מפעיל build ופריסה אוטומטיים. אין צורך בפעולה נוספת.

### שמירה על האתר ער (Keep-Alive)
שכבת ה-Free של Render מכניסה את השירות לשינה אחרי 15 דקות ללא פעילות (מה שגורם ל"עלייה קרה" איטית בכניסה הבאה). כדי למנוע זאת, GitHub Action בקובץ `.github/workflows/keep-alive.yml` פינג את האתר כל כ-12 דקות באופן אוטומטי. אפשר לראות את ההרצות שלו בלשונית Actions במאגר, ואין צורך לגעת בו.

### לוגים
לוגים חיים (כולל כל בקשה ל-API והתראות שגיאה) נראים תחת הלשונית Logs של השירות בדשבורד של Render.
