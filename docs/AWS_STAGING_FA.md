# HANI-EL GOLD — Backend Staging روی AWS EC2 (بدون خرید دامنه)

> این سند صرفاً نقشه آماده‌سازی است؛ **هیچ سرور AWS با Commit شدن این فایل ساخته نمی‌شود.** هزینه و مجازبودن سرویس باید در حساب صاحب پروژه تأیید شود.

## معماری انتخابی برای کمترین هزینه

- فرانت روی Cloudflare Pages: `https://haniel-gold.pages.dev`، از GitHub شاخه `main`.
- یک EC2 لینوکسی **t3.small با ۲ GiB RAM** (در صورت موجود بودن و Free Tier eligibility)، Docker Compose شامل Django/Gunicorn و PostgreSQL روی همان ماشین.
- نه RDS، نه Load Balancer، نه NAT Gateway و نه سرویس پولی غیرضروری.
- دیسک نمونه پیشنهادی: ۲۰ GiB gp3، بدون فضای ذخیره‌سازی ساختگی. EBS و IPv4 عمومی و انتقال داده ممکن است هزینه داشته باشند.
- سرویس `rate-worker` و SMS در شروع غیرفعال. هیچ سفارش یا پرداخت واقعی فعال نشود.
- AWS Free plan با تمام‌شدن اعتبار یا پایان شش ماه متوقف می‌شود؛ نسخه خارج از AWS از DB و Media داشته باشید.

## پیش از روشن‌کردن EC2

1. AWS Billing > Free Tier: نوع پلن، مانده Credit، زمان انقضا و Region را بررسی کن.
2. AWS Budgets: هشدار هزینه/مصرف در آستانه‌های مناسب بساز. Budget هشدار می‌دهد و خودبه‌خود منابع را متوقف نمی‌کند مگر Action مشخصی تنظیم شده باشد.
3. شرایط قانونی و تجاری AWS برای نوع استفاده از سرویس با مشتریان ایران را بررسی کن؛ استفاده مجاز را فرض نکن.
4. قیمت واقعی instance انتخابی در همان Region، EBS و Public IPv4 را در صفحه Launch EC2 بررسی کن. بدون تأیید نهایی هزینه ایجاد نکن.
5. از Ubuntu LTS رسمی، نه AMI ناشناس، استفاده کن؛ SSH key امن و `Security Group` محدود.

## راه‌اندازی سرور بعد از تأیید در حساب AWS

- EC2 > Launch instance: نام پیشنهادی `haniel-stage-api`.
- Instance: `t3.small` فقط اگر واجد شرایط/موجود بود؛ نوع دیگر نیازمند ارزیابی مجدد RAM و هزینه است.
- Storage نمونه: ۲۰ GiB gp3.
- Security Group: SSH TCP 22 **فقط از IP مدیر**؛ 80/443 برای صدور TLS و دسترسی Staging بعد از آماده‌شدن endpoint. PostgreSQL 5432 و Gunicorn 8000 هرگز به اینترنت publish نشوند.
- Public IPv4 و هزینه جداگانه را بررسی کن. IP معمول EC2 با Stop/Start ممکن است تغییر کند؛ برای Staging مجاز، اما روی URL اثر دارد.
- در صورت استفاده از HTTP بدون TLS یا گواهی نامعتبر، **پنل Admin و ورود کاربران نباید عمومی شوند**.
- پس از به‌روزرسانی Ubuntu، Docker Engine و Compose Plugin را طبق راهنمای رسمی Docker نصب کن و سرویس‌ها را با کاربر محدود اجرا کن.

نمونه آماده‌سازی پروژه روی ماشین (بعد از نصب Docker و Git):

```bash
git clone --depth=1 --branch main https://github.com/alireza-anari/Haniel_Gold.git
cd Haniel_Gold
cp .env.example .env
chmod 600 .env
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
# خروجی دو دستور بالا فقط داخل فایل امن .env روی سرور قرار گیرد؛ در چت یا GitHub ارسال نشود.
```

### SSL موقت بدون خرید دامنه

درصورت نیاز، برای محیط **صرفاً آزمایشی** می‌توان یک نام DNS عمومی رایگان که IP را به دامنه نگاشت می‌کند (مثل `api.<PUBLIC_IP>.sslip.io`) را آزمایش کرد. این دامنه وابسته به سرویس شخص ثالث است و برای Production توصیه نمی‌شود. فقط پس از تأیید دسترسی و صدور گواهی HTTPS معتبر، آن را به‌عنوان Backend Origin استفاده کن.

در فایل `.env` روی AWS:
- `SITE_DOMAIN=api.<PUBLIC_IP>.sslip.io` (نام واقعی را جایگزین کن)
- `DJANGO_ALLOWED_HOSTS=api.<PUBLIC_IP>.sslip.io`
- `DJANGO_CSRF_TRUSTED_ORIGINS=https://api.<PUBLIC_IP>.sslip.io,https://haniel-gold.pages.dev`
- `DJANGO_DEBUG=0`
- `DJANGO_SECURE_SSL_REDIRECT=1`
- `DJANGO_SECRET_KEY` و `POSTGRES_PASSWORD` مقادیر تصادفی مخصوص همین محیط
- `SERVIX_API_KEY` خالی؛ `SMS_BACKEND=disabled`

و سپس:

```bash
docker compose config -q
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 web gateway
docker compose exec web python manage.py check --deploy
docker compose exec web python manage.py createsuperuser
```

تنها پس از بالا آمدن HTTPS:
- `https://api.<PUBLIC_IP>.sslip.io/api/v1/health` => API
- `https://api.<PUBLIC_IP>.sslip.io/api/v1/ready` => DB readiness
- `https://api.<PUBLIC_IP>.sslip.io/admin/` => Django Admin (نام کاربری و رمز قوی)

## اتصال ایمن Cloudflare Pages به API

در ریشه Repo، `functions/api/[[path]].js` وجود دارد. این Pages Function فقط مسیر `/api/v1/*` را به `STAGING_BACKEND_ORIGIN` از تنظیمات سرور Cloudflare منتقل می‌کند، نه از متن URL کاربر. اگر Origin تعریف نشده باشد، خطای 503 امن می‌دهد.

بعد از تست کامل Django با HTTPS، در **Cloudflare Pages > Settings > Variables and Secrets**:
- `STAGING_BACKEND_ORIGIN`: مقدار `https://api.<PUBLIC_IP>.sslip.io` (بدون اسلش نهایی)
- `STAGING_API_ACTIVE`: `1`

بعد از ذخیره، Deploy جدید را اجرا کن. اسکریپت build فقط در صورت `STAGING_API_ACTIVE=1` مقدار `apiBaseUrl:'/api'` می‌گذارد. برای بازگشت سریع به پیش‌نمایش مستقل، `STAGING_API_ACTIVE=0` و Redeploy.

**مهم:** GitHub Actions مربوط به CI نمی‌تواند تضمین کند که ورود Session/CSRF از Cloudflare Pages تا Django درست کار می‌کند؛ حتماً OTP (در صورت فعال‌شدن)، CSRF، تصاویر و Admin را به‌صورت end-to-end آزمایش کن.

## مراقبت و پایان دوره Free Tier

- `.env`، Media و PostgreSQL volume خارج از GitHub و پشتیبان رمزگذاری‌شده خارج از AWS.
- بعد از هر migration، health و readiness؛ در صورت خطای نرخ یا موجودی، قیمت قطعی/سفارش صادر نشود.
- قبل از پایان اعتبار یا شش ماه، انتقال PostgreSQL/Media و تست بازیابی روی سرور ایران؛ پس از آن EC2 و منابع جانبی اضافه را پاک کن.
- دامنه اصلی و SSL روی هاست ایران؛ Cloudflare Pages فقط Staging توسعه باقی می‌ماند.

## وضعیت

**هنوز EC2 ساخته نشده، اکانت AWS وصل نشده و HTTPS واقعی آزمایش نشده است.** اجرای این مراحل فقط بعد از ورود امن مالک AWS و تأیید هزینه انجام می‌شود.
