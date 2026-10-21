# ایجاد ریپازیتوری اختصاصی در GitHub

۱. وارد https://github.com/alireza-anari/Haniel_Gold شوید.
۲. مخزن فعلی `alireza-anari/Haniel_Gold` موجود و به درخواست مالک **Public** است.
۳. مخزن در زمان آماده‌سازی خالی بوده است. برای جلوگیری از برخورد، پیش از push بررسی کنید که روی شاخه main فایلی اضافه نشده باشد.
۴. پوشه فایل ZIP آماده‌شده را در رایانه استخراج کنید.
۵. در همان پوشه ترمینال باز کنید و دستورهای زیر را با نام کاربری واقعی خود اجرا کنید:

```bash
git init -b main
git add .
git commit -m "chore: initial HANI-EL GOLD staging deploy"
git remote add origin https://github.com/alireza-anari/Haniel_Gold.git
git push -u origin main
```

احراز هویت GitHub باید از طریق Git Credential Manager یا GitHub CLI / PAT با دسترسی صحیح انجام شود؛ رمز عادی GitHub جای توکن نیست. هیچ توکنی را در فایل‌های پروژه، تاریخچه shell یا چت نفرستید.

بعد از اولین Push، در تب **Actions** باید workflow `HANI-EL CI` اجرا شود. **اگر قرمز بود، دیپلوی نکنید.**

برای انتشارهای بعدی یک branch جدید، Pull Request و بازبینی تغییرات پیشنهاد می‌شود. workflow `Deploy manually to VPS` فقط با تنظیم environment و Secrets سرور قابل استفاده است.
