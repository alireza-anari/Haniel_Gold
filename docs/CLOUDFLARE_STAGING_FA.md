# انتشار آزمایشی HANI-EL GOLD روی Cloudflare Pages

## معماری و محدودیت

Cloudflare Pages صرفاً فرانت‌اند استاتیک هانی‌ال را روی یک زیردامنه `pages.dev` منتشر می‌کند. **Django، PostgreSQL، Docker، API واقعی، قیمت روز، حساب کاربری و ثبت سفارش روی Pages اجرا نمی‌شوند** و در این مرحله غیرفعال‌اند. صفحه‌ها برای بازبینی رابط، تعاملات و ظاهر مناسب‌اند؛ فروش واقعی انجام نمی‌شود.

## راه‌اندازی از GitHub بدون دامنه

1. Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git.
2. GitHub را متصل و مخزن `alireza-anari/Haniel_Gold` را انتخاب کن.
3. نام پیشنهادی پروژه: `haniel-gold-staging` (نام باید آزاد باشد).
4. Framework preset: None.
5. Production branch: `main`.
6. Root directory: ریشه مخزن (`/` یا خالی).
7. Build command: `bash tools/build_cloudflare_pages.sh`
8. Build output directory: `.cloudflare-pages-dist`
9. Environment Variables: برای فرانت استاتیک لازم نیست؛ **Servix API Key، رمز دیتابیس و Django SECRET_KEY را اینجا قرار نده.**
10. Save and Deploy. پس از موفقیت، Cloudflare آدرس واقعی `*.pages.dev` را اعلام می‌کند. بدون استناد به پنل، آدرس را حدس نزن.

پس از اتصال Git، هر Push در شاخه `main` می‌تواند سایت را دوباره Build و Deploy کند. برای جلوگیری از Build اضافه در مونوریپو، می‌توان Build watch paths را به `frontend/**` و `tools/build_cloudflare_pages.sh` محدود کرد.

## بررسی بعد از انتشار

- صفحه اصلی و تصاویر در موبایل و دسکتاپ بارگذاری شوند.
- تم روشن/تاریک، منو، جست‌وجو، کاتالوگ نمونه و صفحات داخلی با URLهای `#/...` باز شوند.
- فایل `runtime-config.js` باید `apiBaseUrl:''` داشته باشد و درخواست به `/api` ارسال نشود.
- قیمت واقعی، ثبت سفارش و پیامک در این نسخه وجود ندارند؛ نمایش نمونه در سایت باید روشن باشد.
- پاسخ‌ها شامل `X-Robots-Tag: noindex` باشند. **این گزینه سایت را خصوصی نمی‌کند**؛ زیردامنه Pages ممکن است برای دیگران باز باشد.
- برای محدودسازی بازدید، Cloudflare Access را جداگانه روی دامنه اصلی Pages هم پیکربندی کن.

## انتقال بعدی به سرور و دامنه

`frontend/runtime-config.js` اصلی در GitHub همچنان `/api` است و اسکریپت Build فقط نسخه خروجی Cloudflare را به حالت دمو تبدیل می‌کند. سرور Django/PostgreSQL طبق `compose.yaml` مستقل باقی می‌ماند و بعداً روی VPS به همراه دامنه و HTTPS منتشر می‌شود. برای حالت کامل Staging با بک‌اند واقعی، باید Django/PostgreSQL جداگانه Deploy شوند و سپس CORS/CSRF/احراز هویت/دامنه API امن تنظیم شود.
