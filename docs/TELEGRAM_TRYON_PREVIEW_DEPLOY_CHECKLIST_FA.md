# HANI-EL GOLD — اولین Preview پرو مجازی (راهنمای آزمون)

این فایل صرفاً راهنمای انتشار آزمایشی است؛ هیچ محصول، تصویر، Secret یا دادهٔ مشتری را تغییر نمی‌دهد.

## وضعیت مورد انتظار

- Cloudflare Worker: `haniel-gold-manager`
- Production branch: `feature/telegram-miniapp-cloudflare` — تغییر نکند.
- Preview branch: `feature/telegram-tryon-v1`
- در Cloudflare → Worker → Settings → Builds → Previews Base:
  - Builds for Preview branches = ON
  - Build command = `npm run check && npm test`
  - Preview command = `npx cf previews deploy`
  - Root directory = `telegram-miniapp`
- در Settings → Bindings → Previews Base: `DB` به `haniel-gold-tryon-test` متصل باشد.
- **Production** همچنان به `haniel-gold-db` متصل بماند.

Cloudflare هنگام Push شاخهٔ غیر Production، Build آزمایشی را شروع می‌کند. اگر اولین Preview ایجاد نشد، در تب Builds وقوع Trigger و لاگ‌ها را بررسی کن؛ از `npx cf deploy --force` برای آزمون استفاده نکن.

## معیار حداقلی Build

1. `npm run check && npm test` بدون خطا پایان یابد.
2. خروجی Cloudflare صراحتاً `Preview` باشد؛ نه Production.
3. در لاگ، خطای Binding، `cf/config` یا دسترسی D1 وجود نداشته باشد.
4. URL Preview فقط از خروجی واقعی Cloudflare برداشته شود؛ URL حدسی نساز.
5. پیش از هر تست نوشتنی، پایگاه دادهٔ واقعی Preview تأیید شود.

## محدودیت انتشار

- `TRYON_PUBLIC_ENABLED` عمداً روی `0` است؛ انتظار 404 از API عمومی پرو در این وضعیت طبیعی است.
- برای احراز هویت مدیر در Preview باید Secretهای آزمایشی جداگانه تنظیم شوند.
- بانک اطلاعاتی آزمایشی محصولات و تصاویر ندارد؛ نیازمند کالا و تصویر آزمایشی تأییدشده است.
- صفحهٔ نهایی پرو مشتری و رابط مدیریت دارایی هنوز آماده و تست‌شده نیستند.
- هیچ Merge به `main`، تغییر Production، BotFather یا اطلاعات مالی مجاز نیست.

مأموریت این مرحله فقط ایجاد اولین Build و تشخیص وضعیت زیرساخت Preview است.
