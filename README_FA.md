# HANI-EL GOLD — GitHub / Deployment bundle

پروژه HANI-EL GOLD با Django REST Framework + PostgreSQL و فرانت‌اند فارسی V5.

## وضعیت واقعی

- این بسته **برای دیپلوی آزمایشی / Staging آماده‌سازی شده**؛ هیچ سرویس واقعی پیامک، درگاه، موجودی یا قیمت واقعی در فایل‌ها فعال نشده است.
- **فروش واقعی را قبل از تست تراکنش، اتصال پیامک و درگاه، کنترل حسابداری و تأیید اسناد حقوقی فعال نکنید.**
- قیمت هر محصول را مدیر دستی تعیین نمی‌کند. مدیر: وزن، عیار، اجرت، سود و موجودی را ثبت می‌کند؛ بک‌اند تنها با نرخ معتبر و سیاست قیمت‌گذاری تأییدشده، مبلغ را محاسبه می‌کند.
- نرخ رسمی Servix فقط پس از ورود کلید در `.env` و فعال‌کردن پروفایل `rates` دریافت می‌شود.
- تصاویر حال حاضر فرانت‌اند کانسپتی‌اند. داده واقعی محصول تا ورود در پنل مدیریت وجود نخواهد داشت.
- این مخزن به درخواست مالک برند **موقتاً Public** است. هیچ کلید واقعی، اطلاعات مشتری، قیمت یا رمز در سورس قرار ندهید. تصاویر و لوگوهای داخل مخزن برای استفاده در سایت هانی‌ال هستند؛ عمومی بودن مخزن به معنی مجوز استفاده مجدد اشخاص ثالث نیست. تغییر Public بودن فقط با درخواست صریح مالک انجام می‌شود.

## ساختار

- `frontend/`: فرانت‌اند V5، `runtime-config.js` با مسیر same-origin `/api`.
- `backend/`: Django + PostgreSQL، برنامه commerce و migrations، پنل Django Admin.
- `compose.yaml`: PostgreSQL، مهاجرت + collectstatic، Gunicorn، Caddy و سرویس اختیاری نرخ.
- `deploy/Caddyfile`: HTTPS خودکار Caddy وقتی دامنه واقعی و DNS فراهم است.
- `.github/workflows/ci.yml`: تست، بررسی migrations، بررسی فرانت.
- `.github/workflows/deploy.yml`: دیپلوی دستی GitHub Actions بعد از تعریف Secrets و تأیید محیط production.
- `deploy/backup.sh`: پشتیبان‌گیری محلی از دیتابیس (فایل‌ها باید رمزگذاری و خارج از سرور هم نگهداری شوند).
- `docs/DEPLOY_FA.md`: راهنمای گام به گام راه‌اندازی و بازگردانی.

## انتشار در GitHub

مخزن مقصد: `https://github.com/alireza-anari/Haniel_Gold.git` (موقتاً Public). پس از بررسی `python3 tools/preflight.py` و `python3 tools/scan_git_public.py`، با Git/GitHub Desktop ارسال شود. **برای عملکرد سایت، فایل ZIP را بدون استخراج به عنوان یک فایل در مخزن آپلود نکنید.**

## دستورات اولیه در سرور دارای Docker Compose

```bash
cp .env.example .env
# مقدارهای واقعی دامنه، رمزهای قوی و تنظیمات TLS را با ویرایشگر سرور وارد کنید
chmod 600 .env
docker compose config -q
docker compose up -d --build
docker compose ps
# برای ساخت ادمین بعد از بالا آمدن سرویس:
docker compose exec web python manage.py createsuperuser
```

اولین اجرای نرخ پس از قراردادن کلید Servix در فایل سرور:

```bash
docker compose exec web python manage.py check_servix
docker compose --profile rates up -d rate-worker
```

منبع نرخ اولیه باید توسط سوپریوزر تأیید شود. تکمیل سیاست مالی نیز در پنل مدیریت ضروری است.

**برای سایت واقعی همچنان دامنه، سرور، TLS، SMS، درگاه پرداخت، محتوا و قوانین تأییدشده لازم است.**

## وضعیت تست همین بسته

- تست نحوی Python و Node.js و اعتبار نحوی YAML انجام شده است.
- `tools/preflight.py` بررسی وجود فایل‌های ضروری، CSRF و نبود `.env` واقعی را با موفقیت گذرانده است.
- اجرای Django با ۴۶ تست روی SQLite ایزوله و DEBUG=0 تأیید شد. نتیجه PostgreSQL و Python 3.13 در [GitHub Actions](https://github.com/alireza-anari/Haniel_Gold/actions) قابل بررسی است. Docker Compose محلی اجرا نشده؛ قبولی تست‌ها به معنی آمادگی فروش عملیاتی نیست.
- سورس در مخزن عمومی [Haniel_Gold](https://github.com/alireza-anari/Haniel_Gold) روی شاخه `main` ثبت شده است؛ سروری در این مرحله راه‌اندازی نشده است.
