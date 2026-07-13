#!/bin/bash
# ── رفع تلقائي لـ GitHub ────────────────────────────────────────────────────
# الاستخدام: bash autopush.sh "رسالة الـ commit" (اختياري)
# أو ببساطة: bash autopush.sh

MESSAGE="${1:-تحديث تلقائي - $(date '+%Y-%m-%d %H:%M')}"

echo "📦 إضافة التغييرات..."
git add -A

# تحقق إذا في تغييرات فعلية
if git diff --cached --quiet; then
  echo "✅ لا توجد تغييرات جديدة."
  exit 0
fi

echo "✍️  Commit: $MESSAGE"
git commit -m "$MESSAGE"

echo "🚀 رفع إلى GitHub..."
git push origin main

if [ $? -eq 0 ]; then
  echo "✅ تم الرفع بنجاح إلى GitHub!"
else
  echo "❌ فشل الرفع. تأكد من ربط حساب GitHub في Replit."
fi
