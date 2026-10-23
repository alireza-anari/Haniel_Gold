# HANI-EL GOLD — Cloudflare-only Staging Setup

## نتیجه معماری
- فرانت‌اند: Cloudflare Pages Git project `haniel-gold`.
- API: Cloudflare Pages Functions، فایل `functions/api/[[path]].js`؛ در همان دامنه و بدون Django.
- داده: Cloudflare D1 (SQLite-compatible)، طرح دیتابیس `cloudflare/schema.sql`.
- تصاویر: Workers KV در پلن Free، بدون کارت بانکی، با Binding به نام `MEDIA_KV` و مسیر `/api/v1/media/...`. R2 فقط جایگزین اختیاری آینده است.
- پنل: `https://haniel-gold.pages.dev/admin.html`؛ ورود با رازهای پیکربندی‌شده در Pages.
- بقیه پروژه Django/PostgreSQL در GitHub باقی مانده، اما در **runtime این Staging استفاده نمی‌شود**.

## وضعیت اتصال واقعی (۲۳ اکتبر ۲۰۲۶)
Cloudflare connector متصل‌شده فقط حساب `2e4e0d025c81b9134fd2d19f17535e30` را نشان داد که پروژه Pages با نام `haniel-gold` در آن **پیدا نشد**. R2 نیز در آن حساب فعال نیست. بنابراین **هیچ دیتابیس یا باکتی روی یک حساب اشتباه ساخته نشده است**. تا زمان شناسایی حسابی که پروژه اصلی Pages در آن است، مراحل اتصال زیر باید در حساب صحیح انجام شوند.

## گام‌های لازم برای فعال‌کردن بک‌اند

1. در Cloudflare Dashboard حسابی را انتخاب کن که زیر **Workers & Pages** پروژه `haniel-gold` را نمایش می‌دهد. اگر می‌خواهی اتصال از طریق ChatGPT انجام شود، همان حساب باید در Cloudflare connector در دسترس باشد.
2. در بخش **Storage & databases → D1** یک دیتابیس با نام `haniel-gold-staging` بساز. در حالت Free اندازه هر دیتابیس محدود است؛ دیتابیس آزمایشی جدا از هر پروژه دیگری باشد.
3. فایل `cloudflare/schema.sql` را **روی همین دیتابیس** اجرا کن، مثلاً با Wrangler با حساب صحیح:
   ```bash
   npx wrangler d1 execute haniel-gold-staging --remote --file=cloudflare/schema.sql
   ```
   هیچ داده نمونه، قیمت، موجودی یا مشتری در schema وجود ندارد.
4. در **Workers & Pages → haniel-gold → Settings → Bindings → Add → D1** دیتابیس را با نام Binding دقیق **`DB`** وصل کن و برای محیط Production/Preview مطابق نیاز جداگانه تنظیم کن؛ سپس redeploy.
5. در **Settings → Variables and Secrets** سه Secret *محرمانه* در بخش runtime تعریف کن:
   - `ADMIN_USERNAME`: نام کاربری دلخواه مالک
   - `ADMIN_PASSWORD`: رمز بسیار قوی حداقل ۱۶ کاراکتر
   - `ADMIN_SESSION_SECRET`: مقدار تصادفی حداقل ۳۲ کاراکتر (مثلاً ۶۴ کاراکتر تصادفی)
   هیچ‌کدام را در GitHub، فرانت‌اند، `runtime-config.js`، یا چت ارسال نکن.
6. برای عکس‌ها بدون کارت بانکی، در Cloudflare به **Storage & databases → KV** برو، روی **Create instance / Create namespace** بزن و نام `haniel-gold-staging-images` را انتخاب کن. از **Workers & Pages → haniel-gold → Settings → Bindings → Add → KV namespace** آن را با **Variable name = `MEDIA_KV`** برای Production متصل کن. حتماً Redeploy انجام بده. اگر KV در حساب فعلی فعال نبود، عکس‌ها را می‌توان به‌صورت فایل‌های ثابت در GitHub → Cloudflare Pages قرار داد؛ هیچ نیازی به R2 نیست.
7. تست سلامت: `/api/v1/health` باید `"database": true` برگرداند. پنل را از `/admin.html` باز کن و دسته‌بندی، محصول آزمایشی **غیرمنتشرشده**، تصویر و ویرایش آن را بررسی کن.
8. پس از تست و تأیید محصول واقعی، در تنظیمات **Build environment variable** مقدار `STAGING_API_ACTIVE=1` را تعیین و Build را دوباره اجرا کن. این کار `frontend/runtime-config.js` را در خروجی Pages به `/api` تغییر می‌دهد؛ تا آن زمان ویترین نمونه فعلی حفظ می‌شود.

### بازگشت سریع به حالت قبلی
`STAGING_API_ACTIVE` را حذف یا به `0` تغییر بده و Rebuild/Redeploy کن. این تغییر فقط اتصال فرانت به API را خاموش می‌کند و داده‌های D1 را حذف نمی‌کند.

## امنیت و حدود فعلی
- نشست مدیر با کوکی HttpOnly، SameSite=Strict و Secure روی HTTPS؛ توکن CSRF برای تغییرات؛ محدودیت پنج بار تلاش ناموفق در ۱۵ دقیقه برای IP هر کاربر.
- مسیرهای admin بدون نشست معتبر داده‌های خصوصی را تحویل نمی‌دهند.
- هر قیمت دستی صرفاً از طرف مدیر تأیید می‌شود، دارای مهلت اعتبار حداکثر ۴۵ دقیقه است و بعد از آن نمایش قیمت خودکار حذف می‌شود.
- فرمول دقیق نرخ طلا، مالیات، اجرت، سود و ارائه‌دهنده Servix هنوز به Functions منتقل نشده‌اند؛ **هیچ محاسبه خودکار یا نرخ ادعایی فعال نیست**.
- سفارش، پرداخت، OTP و SMS.ir در این Staging Cloudflare-native غیرفعال‌اند؛ استفاده از فروش واقعی ممنوع تا زمان تکمیل و تأیید.
- Workers KV عکس‌ها را با کلیدهای تصادفی ذخیره می‌کند. پنل پیش از آپلود تصاویر بزرگ را تا حداکثر ۱.۵ مگابایت WebP می‌کند؛ سرور نیز سقف حجم و امضای JPG/PNG/WebP را بررسی می‌کند. KV **eventual consistency** دارد و نمایش تصویر جدید ممکن است تا حدود ۶۰ ثانیه در مناطق مختلف زمان ببرد. فضای رایگان ۱GB است؛ فایل اصلی محصول را جداگانه برای بکاپ نگه دارید.
- هر تغییر قابل تست در CI است. امکان دسترسی بدون VPN برای همراه اول/ایرانسل **هنوز اثبات نشده است**؛ `pages.dev` برای بازار ایران به عنوان میزبانی قطعی پیشنهاد نمی‌شود.
- برای فعال‌کردن فروش، سیاست قیمت‌گذاری و خدمات پرداخت/پیامک معتبر باید صریح تأیید شوند. قفل‌کردن قیمت با ورودی کلاینت مجاز نیست.

## چرا طرح قدیمی Django حذف نشد؟
برای حفظ تاریخچه و قابلیت بازگشت، کد Django در پوشه `backend` فعلاً نگه داشته شده اما معماری هدف Staging فعلی کاملاً Cloudflare Pages + Functions + D1 + R2 است. نباید دو دیتابیس موازی به عنوان منبع حقیقت محصولات فعال شوند.
