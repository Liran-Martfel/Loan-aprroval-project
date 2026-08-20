# 🏦 מערכת לחיזוי אישור הלוואה (Loan Approval Prediction)

מערכת Machine Learning מקצה לקצה לחיזוי אישור/דחיית הלוואה מבוססת מודל Support Vector Classifier (SVC). 
המערכת מבוססת על Pipeline של `scikit-learn` הכולל נרמול ב-`StandardScaler` ואימון מודל, ומפרידה לחלוטין בין שלב האימון לבין ה-API וממשק המשתמש בזמן ריצה.

---

## 📁 מבנה הריפוזיטורי
```
main.py, inference.py, request_log.py   - קוד השרת (FastAPI)
templates/, static/                     - HTML/CSS/JS של האתר
notebooks/model_training.ipynb          - ה-notebook שמאמן את המודל הפרוס
notebooks/exploration.ipynb             - notebook לימוד/חקירה (כמה גישות שנוסו לפני הגישה הסופית)
data/Project_DB_loan_approval.csv       - דאטה-סט האימון
model_artifacts/                        - כל מה שהאימון מפיק: קובץ המודל, model_report.json, background_sample.pkl, dashboard_data.json, project_all_ways.pkl
build_dashboard_data.py                 - סקריפט שמחשב את נתוני "לוח בקרת המודל" מתוך model_artifacts/
```

## 📊 ביצועי המודל והנתונים
- **דאטה-סט:** `data/Project_DB_loan_approval.csv` (סינון גילאי 18+).
- **פיצ'רים נבחרים:** הכנסה, סכום הלוואה, ריבית, אחוז מתוך הכנסה, דירוג אשראי והיסטוריית מחדלי הלוואה קודמים (`previous_loan_defaults_on_file`).
- **אלגוריתם:** `SVC(kernel='rbf', C=10)` שנבחר באמצעות Cross-Validation.
- **תוצאות אימון (Test Set):**
  - **Accuracy:** ~90.44%
  - **Confusion Matrix:** 6,649 שליליים נכונים, 1,491 חיוביים נכונים
  - **F1-Score:** 0.94 (סיווג 0), 0.78 (סיווג 1)

---

## 🌐 האתר החי
**כתובת:** https://loan-approval-prediction-1a7a.onrender.com/
**גרסה נוכחית:** v1.0.0 (מוצגת גם בראש העמוד עצמו, ליד הכותרת)

האתר בנוי עם FastAPI (`main.py`) ומגיש שלושה דפים: בדיקת זכאות (עם חיזוי + הסבר SHAP), לוח בקרת מודל (נתונים, גרפים, וגבול ההחלטה של ה-SVM), ויומן פעילות מוגן בסיסמה. כל הלוגיקה של החיזוי נמצאת ב-`inference.py`, כך שהיא לא תלויה בקוד של ה-notebook.

### עדכון מספר הגרסה
מספר הגרסה מוגדר במשתנה `APP_VERSION` בראש הקובץ `main.py`. כדאי לעדכן אותו (ולתעד כאן מה השתנה) בכל פעם שמבצעים שינוי משמעותי ופורסים אותו לאתר החי.

### איך מאמנים מחדש את המודל
1. מריצים את ה-notebook `notebooks/model_training.ipynb` מההתחלה ועד הסוף, מול הדאטה-סט המלא. זה יוצר מחדש את `model_artifacts/Full project.pkl`, `model_artifacts/model_report.json` ו-`model_artifacts/background_sample.pkl`. (חשוב: מריצים אותו כ-notebook תוך שהוא נמצא בתיקיית `notebooks/` - הנתיבים היחסיים בתוכו מבוססים על זה.)
2. מריצים מתיקיית השורש של הפרויקט (לא מתוך `notebooks/`): `python build_dashboard_data.py` — זה מחשב מחדש את נתוני "לוח בקרת המודל" (וקטורי תמיכה, גבול ההחלטה, היסטוגרמת השוליים) ושומר אותם ב-`model_artifacts/dashboard_data.json` ובתמונה `static/img/decision_boundary.png`.
3. עושים commit ו-push לענף `main`.

### איך פורסים מחדש
Render מחובר ישירות למאגר ה-GitHub - כל push לענף `main` מפעיל build ופריסה אוטומטיים. אין צורך בפעולה נוספת.

### שמירה על האתר ער (Keep-Alive)
שכבת ה-Free של Render מכניסה את השירות לשינה אחרי 15 דקות ללא פעילות (מה שגורם ל"עלייה קרה" איטית בכניסה הבאה). כדי למנוע זאת, GitHub Action בקובץ `.github/workflows/keep-alive.yml` פינג את האתר כל כ-12 דקות באופן אוטומטי. אפשר לראות את ההרצות שלו בלשונית Actions במאגר, ואין צורך לגעת בו.

### לוגים
יש שתי דרכים לראות לוגים:
1. **בתוך האתר עצמו** - לשונית "יומן פעילות" בסרגל הצד, מוגנת בסיסמת ניהול (`ADMIN_LOG_KEY`, מוגדרת כמשתנה סביבה ב-Render). מציגה את 300 הבקשות/שגיאות האחרונות, ונשמרת לצמיתות במסד נתונים חיצוני (Postgres חינמי, כתובתו במשתנה הסביבה `DATABASE_URL`) כך שהיא שורדת גם הפעלות מחדש.
2. **בדשבורד של Render** - לוגים חיים (stdout) של כל בקשה, כולל פרטי שגיאה מלאים, נראים תחת הלשונית Logs של השירות. אלה נמחקים בכל הפעלה מחדש של השרת, אז לטווח ארוך עדיף להשתמש ביומן שבתוך האתר.
