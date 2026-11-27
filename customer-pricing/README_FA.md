# HANI-EL GOLD — مینی‌اپ عمومی مشاهده قیمت

این سرویس یک Mini App مستقل برای مشتریان کانال تلگرام است. پنل مدیریت فعلی خصوصی باقی می‌ماند و این Worker فقط از همان D1 با دسترسی خواندنی استفاده می‌کند.

## رفتار قطعی سیستم

- نرخ طلای ۱۸ عیار از Servix هر ۳۰ دقیقه توسط Cron دریافت و فقط در جدول `gold_rate_state` ذخیره می‌شود.
- هنگام کلیک مشتری، Worker فقط اطلاعات همان محصول، تنظیمات قیمت همان محصول و آخرین نرخ معتبر را از D1 می‌خواند.
- قیمت همان لحظه با همان تابع محاسباتی `telegram-miniapp/src/finance.js` محاسبه می‌شود.
- قیمت محاسبه‌شده محصول ذخیره نمی‌شود و هیچ محاسبه گروهی روی محصولات اجرا نمی‌شود.
- اگر نرخ بیش از ۴۰ دقیقه قدیمی باشد یا منبع نرخ معتبر نباشد، قیمت به مشتری نمایش داده نمی‌شود.
- مقادیر مالی در دیتابیس به ریال نگهداری می‌شوند و رابط مشتری مبلغ را به تومان نمایش می‌دهد.

## نکته ساختار داده

در ساختار فعلی Mini App مدیریت، جدول `products` مشخصات و اطلاعات خرید را دارد؛ فیلدهای `labor_pct`، `profit_pct`، `accessories` و `discount` در جدول `sales` سوابق تاریخی هر فروش هستند و به‌تنهایی تنظیمات جاری و پایدار هر محصول محسوب نمی‌شوند.

برای جلوگیری از استفاده اشتباه از یک فروش تاریخی، migration زیر جدول `product_public_pricing` را در همان دیتابیس ایجاد می‌کند. مقادیر اولیه، در صورت وجود، از آخرین فروش غیرابطال‌شده همان محصول پیشنهاد می‌شوند؛ در غیر این صورت اجرت خرید فقط به‌عنوان مقدار اولیه پیشنهادی قرار می‌گیرد. **تمام ردیف‌ها غیرفعال هستند** و تا زمانی که مالک/مدیر آن‌ها را بازبینی و فعال نکند، هیچ قیمت عمومی نمایش داده نمی‌شود.

در جزئیات محصول پنل خصوصی، بخش «قیمت‌گذاری قابل نمایش به مشتری» اضافه شده است. این بخش فقط برای نقش مالک و مدیر قابل مشاهده و ویرایش است.

## فایل‌ها

- `src/index.js`: Worker عمومی، API فقط خواندنی و Cron نرخ طلا
- `src/pricing.js`: خروجی عمومی و تبدیل ریال به تومان؛ محاسبه از موتور مالی فعلی
- `public/`: رابط فارسی، مینیمال و مناسب Telegram Mini App
- `wrangler.toml`: Binding دیتابیس و Cron
- `../telegram-miniapp/db/migrations/0003_public_pricing.sql`: migration دیتابیس مدیریت
- `scripts/add-price-buttons.mjs`: افزودن دکمه به پست‌های موجود کانال

## پیش‌نیازهای استقرار

1. از D1 موجود `haniel-gold-db` نسخه پشتیبان بگیر.
2. از صفحه Overview دیتابیس، Database ID واقعی را بردار و به‌جای `PASTE_EXISTING_HANIEL_GOLD_DB_ID_HERE` در `wrangler.toml` قرار بده. دیتابیس جدید نساز.
3. مطمئن شو Wrangler به همان حساب Cloudflare اصلی متصل است.

## اجرای migration — فقط یک بار

از ریشه مخزن:

```bash
npx wrangler d1 execute haniel-gold-db --remote \
  --file=telegram-miniapp/db/migrations/0003_public_pricing.sql \
  --config=customer-pricing/wrangler.toml
```

این migration جدول‌های جدید می‌سازد و ردیف‌های تنظیمات پیش‌نویس را ایجاد می‌کند؛ جدول‌های `products` و `sales` را حذف یا بازنویسی نمی‌کند. قبل از اجرا، پشتیبان D1 ضروری است.

## استقرار Mini App عمومی

```bash
npx wrangler secret put SERVIX_API_KEY --config=customer-pricing/wrangler.toml
npx wrangler deploy --config=customer-pricing/wrangler.toml
```

کلید Servix را فقط در prompt مخفی Wrangler وارد کن؛ آن را در GitHub یا فایل عمومی قرار نده. این Worker به Secretهای ربات یا شناسه مالک نیاز ندارد.

پس از deploy، آدرس واقعی `workers.dev` را از خروجی Wrangler بردار. تا اجرای اولین Cron موفق، API عمداً قیمت را در دسترس اعلام نمی‌کند. Cron با برنامه `*/30 * * * *` اجرا می‌شود.

برای مشاهده لاگ:

```bash
npx wrangler tail haniel-gold-customer-pricing --config=customer-pricing/wrangler.toml
```

## به‌روزرسانی پنل مدیریت خصوصی

بعد از اجرای migration، از پوشه `telegram-miniapp` تست‌ها و سپس deploy فعلی پروژه را اجرا کن:

```bash
npm run check
npm test
npx cf deploy --secrets-file ./secrets.local.json
```

این تغییر، API قیمت‌گذاری محصول را فقط برای نقش‌های `owner` و `manager` اضافه می‌کند. مسیرهای مدیریت قبلی همچنان احراز هویت Telegram را انجام می‌دهند.

## تنظیم Mini App در تلگرام

در BotFather برای همان ربات مدیریت، یک Direct Mini App جدید بساز (مثلاً short name برابر `pricing`) و URL آن را روی آدرس واقعی Worker عمومی قرار بده. این Mini App نام‌گذاری‌شده مستقل از دکمه منوی مدیریت باقی می‌ماند.

قالب لینک محصول:

```text
https://t.me/Hani_El_manager_bot/pricing?startapp=product_15&mode=compact
```

عدد انتهایی شناسه واقعی محصول در D1 است. پارامتر `mode=compact` Mini App را در حالت نیم‌صفحه باز می‌کند.

## افزودن دکمه به پست‌های کانال

ربات باید در کانال ادمین و دارای مجوز ویرایش پیام‌ها باشد. در فایل JSON برای هر پست، شناسه پیام و شناسه محصول را قرار بده. نمونه در `scripts/posts.example.json` است.

متغیرهای محیطی لازم:

- `BOT_TOKEN`: توکن ربات؛ فقط در محیط محلی خودت
- `CHANNEL_ID`: مانند `@channelname` یا شناسه عددی کانال خصوصی
- `PRICE_APP_LINK`: مانند `https://t.me/Hani_El_manager_bot/pricing`

ابتدا Dry Run:

```bash
cd customer-pricing
BOT_TOKEN='...' CHANNEL_ID='@channelname' \
PRICE_APP_LINK='https://t.me/Hani_El_manager_bot/pricing' DRY_RUN=1 \
node scripts/add-price-buttons.mjs scripts/posts.json
```

پس از بررسی لینک‌ها، `DRY_RUN` را حذف کن و فرمان را دوباره اجرا کن. Telegram Bot API در `editMessageReplyMarkup` صفحه‌کلید قبلی پیام را جایگزین می‌کند؛ اگر پست از قبل دکمه دارد، آرایه `existing_keyboard` آن را در فایل mapping قرار بده تا دکمه‌های قبلی حفظ شوند.

## امنیت و حریم خصوصی

- Worker عمومی فقط `id`، `sku`، نام، وزن، وضعیت موجودی، تصویر عمومی و اجزای مجاز قیمت را برمی‌گرداند.
- نرخ خرید، اجرت خرید، تأمین‌کننده، یادداشت داخلی، نام مشتری، بهای خرید، سود خالص و سایر سوابق فروش در پاسخ عمومی وجود ندارند.
- تصویر فقط برای محصولی قابل دریافت است که نمایش عمومی آن فعال شده باشد.
- API عمومی فقط GET دارد؛ هیچ مسیر نوشتن محصول یا فروش در این Worker وجود ندارد.
- API عمومی Telegram initData را برای مشاهده قیمت لازم نمی‌داند؛ این اطلاعات عمداً برای هر دارنده لینک عمومی هستند.
- تنظیمات قیمت عمومی و فعال‌سازی محصول فقط از پنل خصوصی و پس از احراز هویت و بررسی نقش مالک/مدیر ممکن است.

## تست

```bash
cd customer-pricing
npm run check
npm test
```

این تست‌ها فرمول قیمت را با موتور مالی پنل مدیریت تطبیق می‌دهند، تبدیل ریال به تومان را بررسی می‌کنند و عدم افشای فیلدهای مالی داخلی را کنترل می‌کنند.

**وضعیت:** کد و migration آماده بازبینی هستند؛ تا زمان اجرای migration، deploy دو Worker، تنظیم Secret و ساخت Mini App در BotFather، Production فعال محسوب نمی‌شود.
