# HANI-EL GOLD — راه‌اندازی خودکار نرخ Servix از داشبورد Cloudflare

**بدون کارت بانکی، سرور، AWS یا نصب Wrangler.** از همان Account میزبان `haniel-gold` استفاده کن.

## پیش‌نیاز
- همان D1 با نام `haniel-gold-staging` وجود دارد و دارای جدول‌های `gold_market_state`, `gold_rate_audit`, `pricing_policy` است.
- `SERVIX_API_KEY` روی Pages تعریف شده؛ برای Worker جدید هم Secret جداگانه با همان نام لازم است.
- سیاست مالی در D1 تأیید شده است؛ این Worker هرگز درصد مالیات یا اجرت/سود محصولات را تغییر نمی‌دهد.

## مراحل در Cloudflare Dashboard

1. در همان حساب **Workers & Pages → Create application → Create Worker** برو.
2. روش **Start with Hello World** یا Worker خالی را انتخاب کن و نام `haniel-gold-rate-staging` بگذار.
3. Worker را Deploy اولیه کن، سپس **Edit code** را باز کن. کد نمونه را کامل حذف و **متن کامل فایل** `cloudflare/gold-scheduler-dashboard.js` را پیست کن، سپس **Deploy**.
   - https://github.com/alireza-anari/Haniel_Gold/blob/main/cloudflare/gold-scheduler-dashboard.js
   - از **Raw** برای کپی کل فایل استفاده کن. این نسخه مستقل است و به import از فایل دیگر نیاز ندارد.
   - این نسخه **از همان ماژول اصلی** `functions/_lib/gold-market.js` تولید شده و با `node tools/build_gold_scheduler.mjs --check` در CI کنترل می‌شود.
4. داخل Worker جدید به **Bindings → Add binding → D1 Database** برو، در **Variable name** مقدار `DB` و در Database همان `haniel-gold-staging` را انتخاب و ذخیره کن. دیتابیس جدید نساز.
5. در **Settings → Variables and Secrets → Add**، `SERVIX_API_KEY` را **از نوع Secret / Encrypt** بساز. کلید اصلی را از حساب شخصی Servix بگیر؛ در گفتگو، GitHub یا کد کپی نکن.
6. قبل از افزودن Cron مطمئن شو که Worker جدید Deployment موفق، Binding `DB` و Secret `SERVIX_API_KEY` دارد.
7. در **Settings → Triggers → Cron Triggers → Add**، عبارت زیر را وارد و ذخیره کن:
   ```cron
   0,30 * * * *
   ```
   Cloudflare زمان Cron را **UTC** درنظر می‌گیرد و اجرا تقریباً هر نیم ساعت است.
8. در **Settings → Trigger Events → View events** یا **Observability → Logs**، رویدادهای `scheduled` را ببین. تغییر برنامه ممکن است تا ۱۵ دقیقه برای انتشار زمان ببرد و اولین رویدادها گاهی با تأخیر بیشتری در تاریخچه دیده شوند.

## تفسیر نتایج
- `accepted`: نرخ جدیدتر و در سقف تغییر مصوب، در D1 تأیید و به‌روز شد.
- `unchanged`: زمان businessTime همان نرخ قبلی یا قدیمی‌تر است؛ اعتبار تمدید نشده.
- `pending`: نرخ جدید نخستین نرخ یا تغییر مشکوک است و منتظر تأیید دستی مدیر می‌ماند.
- `cooldown`: درخواست جدید به‌دلیل محافظت فاصله ۲۰ دقیقه‌ای **ارسال نشد**.
- `quota_exceeded`: سرویکس HTTP 429 داده، دریافت‌ها موقتاً متوقف شدند.
- `failed`: دریافت/اعتبارسنجی ناموفق؛ قیمت منقضی نمایش داده نمی‌شود.

### نکات مهم
- تا قبل از راه‌اندازی Worker جدید نرخ را در ادمین دستی بروزرسانی کن؛ خودکارسازی هنوز فعال نشده.
- API عمومی سایت `/api/v1/market/gold` فقط وضعیت نرخ را گزارش می‌دهد؛ خودش Servix را فراخوانی نمی‌کند.
- با Cron نیم‌ساعته حدود **۴۸ فراخوانی در روز** در صورت کار عادی ارسال می‌شود. اگر سقف سرویس تو ۵۰ درخواست در روز است، آزمایش دستی مکرر نکن؛ بعداً می‌توان برنامه را به ساعتی تغییر داد (با احتمال وقفه نمایش قیمت، چون داده بیش از ۴۰ دقیقه منقضی می‌شود).
- `fetch()` عمومی Worker عمداً ۴۰۴ برمی‌گرداند؛ با بازکردن آدرس workers.dev نمی‌توان Cron را تست کرد.
- ورود مدیر و تنظیمات Pages تغییری نمی‌کنند؛ سرور جدیدی لازم نیست. Worker فقط به دیتابیس D1 مشترک متصل می‌شود.
- در صورت تغییر الگوریتم منبع، فایل `gold-scheduler-dashboard.js` را **دوباره در Worker** جایگزین کن یا به‌جای روش دستی، Worker را به GitHub Builds وصل کن.
- روشن‌کردن `STAGING_API_ACTIVE=1` برای ویترین عمومی را تا تکمیل آزمون دریافت نرخ معتبر، نمایش قیمت و تایید تجربه کاربری عقب بینداز.
- **دسترسی بدون VPN برای همراه اول و ایرانسل همچنان حل نشده است**؛ صرفاً تست Staging روی Cloudflare به معنی امکان استفاده عموم در ایران نیست.

مستندات رسمی:
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/workers/configuration/secrets/
