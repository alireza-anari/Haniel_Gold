# انتقال سورس HANI-EL GOLD به GitHub (Public موقت)

مخزن مقصد: https://github.com/alireza-anari/Haniel_Gold

**توجه:** برای آپلود کامل باید محتویات این ZIP را ابتدا استخراج کنید؛ فایل ZIP را تنها به‌عنوان یک فایل در GitHub آپلود نکنید.

### روش پیشنهادی: GitHub Desktop
1. GitHub Desktop را نصب و به حساب GitHub خود وارد شوید.
2. Repository → Clone Repository و `alireza-anari/Haniel_Gold` را انتخاب کنید. اگر خالی است، مسیر Clone ساخته می‌شود.
3. **محتویات پوشه استخراج‌شده** را به پوشه clone کپی کنید؛ پوشه‌ای با نام اضافی درون آن ایجاد نکنید.
4. در GitHub Desktop تمام فایل‌ها را مرور، Commit و Push origin کنید.
5. در GitHub → Actions منتظر نتیجه تست‌ها بمانید. تا CI سبز نشده، دیپلوی نکنید.

### روش خط فرمان
در مک/لینوکس پس از استخراج در ترمینال داخل پوشه پروژه: `bash PUSH_TO_GITHUB_MAC_LINUX.sh`
در ویندوز، داخل پوشه پروژه PowerShell را باز کنید: `powershell -ExecutionPolicy Bypass -File .\PUSH_TO_GITHUB_WINDOWS.ps1`

برای اجرای اسکریپت‌ها، Git و Python 3 باید نصب و احراز هویت GitHub در Git/GitHub CLI یا Credential Manager انجام شده باشد. توکن GitHub را در کد یا چت قرار ندهید.

### وضعیت انتشار
- تمام کدهای واقعی داخل ZIP، **نه در مخزن GitHub تا زمان اجرای Push**.
- `SERVIX_API_KEY` و `DJANGO_SECRET_KEY` و `POSTGRES_PASSWORD` فقط روی سرور در `.env` تنظیم می‌شوند.
- Public بودن مخزن به معنی عمومی بودن سورس، تصاویر است؛ مالک باید اجازه انتشار این دارایی‌ها را داشته باشد. فونت تجاری از سورس عمومی حذف شده است؛ راهنمای `docs/FONTS_FA.md` را بخوانید.
- GitHub Actions فقط تست می‌کند؛ انتشار به VPS دستی و وابسته به Secrets و تأیید محیط است.
- این پروژه برای Staging است؛ خرید و پرداخت واقعی تا تکمیل خدمات و آزمون عملیاتی نباید فعال شوند.
