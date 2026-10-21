# راهنمای Deploy — HANI-EL GOLD

## 1) پیش‌نیازهای ضروری

- مخزن فعلی **موقتاً عمومی** است؛ دسترسی write و deploy باید محدود باشد و هیچ راز، داده مشتری یا فایل سرور وارد آن نشود. تبدیل به Private پس از اتمام کار برنامه‌ریزی شده است.
- یک VPS با Docker Engine و Compose Plugin، بکاپ منظم، محدودسازی دسترسی SSH و دامنه‌ای که DNS آن به VPS اشاره دارد.
- پورت‌های 80 و 443 در فایروال باز باشند. PostgreSQL و Django به اینترنت عمومی publish نمی‌شوند.
- نسخه Python و پکیج‌ها در Dockerfile و requirements مشخص شده‌اند. وابستگی‌های Python باید روی سرور از مسیر معتبر نصب شوند.
- اگر برای اولین بار از Caddy استفاده می‌شود، پیش از DNS مطمئن و باز بودن پورت‌ها آن را راه‌اندازی نکنید.

## 2) ساخت فایل secrets فقط روی سرور

```bash
cp .env.example .env
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'  # SECRET_KEY
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'  # POSTGRES_PASSWORD
chmod 600 .env
```

در `.env` این موارد را با **مقادیر واقعی خودتان** جایگزین کنید:
`SITE_DOMAIN`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `POSTGRES_PASSWORD`.

`DJANGO_DEBUG=0` بماند. `TRUST_REVERSE_PROXY=1` صرفاً چون Caddy و Django در شبکه داخلی Compose هستند.
روی VPS، `SITE_DOMAIN=yourdomain.ir` و `DJANGO_CSRF_TRUSTED_ORIGINS=https://yourdomain.ir` ثبت شود.

برای **تست لوکال HTTP فقط**، `SITE_DOMAIN=:80`, `DJANGO_SECURE_SSL_REDIRECT=0`, و `DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost` بگذارید. این تنظیمات را هرگز در Production حفظ نکنید.

## 3) راه‌اندازی اولیه

```bash
git clone https://github.com/alireza-anari/Haniel_Gold.git haniel-gold
cd haniel-gold
cp .env.example .env
# اطلاعات محرمانه در .env تکمیل شوند
docker compose config -q
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 web gateway
docker compose exec web python manage.py check --deploy
docker compose exec web python manage.py createsuperuser
```

بررسی‌ها:

- `/` باید frontend را نشان دهد؛ تا زمان درج محصولات واقعی ممکن است «محصولی موجود نیست» مشاهده شود.
- `/api/v1/health` وضعیت ساده سرویس را نشان می‌دهد؛ `/api/v1/ready` اتصال DB را بررسی می‌کند.
- `/admin/` پنل امن Django است. تنها پس از ساخت سوپریوزر قابل ورود است.
- `/api/v1/catalog/products` کاتالوگ منتشرشده را برمی‌گرداند.
- هیچ داده یا تصویر نمایشی در دیتابیس به‌عنوان محصول واقعی ذخیره نشده است.

## 4) پنل و قیمت‌گذاری

در Django Admin دسته‌بندی، محصول، تصاویر https واقعی و موجودی را وارد کنید. برای هر محصول در مرحله فروش، وزن، عیار، درصد و/یا اجرت ثابت و سود باید طبق داده‌های واقعی ثبت شوند. سیاست اجرت و مالیات نیز نیازمند تأیید است.

برای فعال‌سازی نرخ نیم‌ساعته **فقط پس از گرفتن کلید Servix**:

1. `SERVIX_API_KEY` را داخل `.env` روی سرور بگذارید.
2. `docker compose exec web python manage.py check_servix` را اجرا کنید.
3. برای دریافت نرخ اولیه `docker compose exec web python manage.py sync_gold_rate` را اجرا کنید.
4. در پنل Admin نرخ اولیه ردشده را پس از بررسی مستقل تأیید کنید؛ مدت اعتبار کوتاه است و در صورت گذشت زمان باید یک نرخ تازه دریافت کنید.
5. `docker compose --profile rates up -d rate-worker` را اجرا کنید.
6. مانیتورینگ وضعیت نرخ و خطاها، به‌خصوص 429 و توقف خودکار فروش، الزامی است.

**نکته مهم:** پلن رایگان Servix با درخواست نیم‌ساعته تقریباً ظرفیت روزانه را مصرف می‌کند؛ هر درخواست دستی اضافه ممکن است سهمیه را تمام کند.

## 5) به‌روزرسانی از GitHub

ابتدا تغییرات در branch جدا و Pull Request بازبینی شود؛ پس از سبزشدن CI merge کنید. برای انتشار:

```bash
cd haniel-gold
./deploy/backup.sh
git pull --ff-only
docker compose up -d --build
docker compose ps
```

در GitHub Actions، workflow `Deploy manually to VPS` با اجرای دستی تنظیم شده است. قبل از اجرای آن، Secrets مربوط به SSH و مسیر پروژه در Environment `production` ثبت شود:
`VPS_SSH_PRIVATE_KEY`, `VPS_SSH_HOST`, `VPS_SSH_USER`, `VPS_SSH_KNOWN_HOSTS`, `VPS_APP_PATH`.
کلید SSH محدود و مخصوص دیپلوی باشد، نه حساب ادمین عمومی.

## 6) بکاپ، بازگردانی و خطا

بکاپ: `./deploy/backup.sh`، فایل در `backups/` ذخیره می‌شود که از Git خارج است؛ آن را رمزگذاری کرده و خارج از VPS نگه دارید.

بازگشت به commit قبلی زمانی امن است که schema پایگاه داده سازگار باقی مانده باشد. بازگردانی DB به فایل dump قبلی ممکن است اطلاعات تراکنش‌های پس از بکاپ را حذف کند و **فقط با تأیید مالک داده و اجرای آزمایشی** انجام شود.

روی سرور production دیتابیس، رسانه‌ها، Caddy state و `.env` داخل volume یا فایل محلی باقی می‌مانند و GitHub نباید آن‌ها را نگهداری کند.

## 7) موارد لازم برای گشایش فروش واقعی

- [ ] تست واقعی Docker + PostgreSQL و CI سبز
- [ ] تست نرخ Servix با کلید حساب شما و بررسی timestamp/واحد
- [ ] تأیید سیاست قیمت‌گذاری و مالیات توسط مسئول مالی
- [ ] احراز هویت OTP با ارائه‌دهنده واقعی و تست abuse/rate-limit
- [ ] اتصال درگاه و تأیید server-to-server + webhook/idempotency
- [ ] اطلاع‌رسانی، ارسال، بازگشت وجه و رویه رسیدگی به سفارش
- [ ] تصاویر/موجودی/نام محصولات واقعی و اسناد شفافیت قیمت
- [ ] مانیتورینگ خطا، بکاپ خارج از سرور و تست دوره‌ای بازیابی
- [ ] تأیید حقوقی متن حریم خصوصی، فروش و مرجوعی
- [ ] تست نهایی تجربه خرید با تراکنش آزمایشی واقعی

پیش از اتمام موارد بالا سایت فقط **Staging / Prelaunch** است، نه آماده ثبت فروش و دریافت پول از مشتری.
