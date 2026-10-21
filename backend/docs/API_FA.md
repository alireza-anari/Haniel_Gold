# قرارداد API — HANI-EL GOLD /v1/

تمام پاسخ‌ها JSON هستند. تمام درخواست‌های تغییردهنده داده به کوکی نشست معتبر، و هدر `X-CSRFToken` نیاز دارند. در یک دامنه و با HTTPS سرو کنید.

## عمومی

| متد | مسیر | کاربرد |
|---|---|---|
| GET | `/v1/health` | وضعیت API (بدون تست دیتابیس) |
| GET | `/v1/auth/csrf` | دریافت `csrfToken` و کوکی CSRF |
| GET | `/v1/catalog/categories` | دسته‌بندی‌های فعال |
| GET | `/v1/catalog/products?limit=24&offset=0&category=necklace&style=minimal&q=` | کاتالوگ؛ خروجی `items`, `total`, `nextOffset` |
| GET | `/v1/catalog/products/{slug}` | جزئیات محصول |
| POST | `/v1/auth/otp/request` | `{ "mobile": "09xxxxxxxxx" }`؛ نیازمند ارائه‌دهنده پیامک |
| POST | `/v1/auth/otp/verify` | `{ "mobile": "09xxxxxxxxx", "code": "******" }` |
| POST | `/v1/support/messages` | `{ "name":"...", "mobile":"...", "topic":"...", "message":"..." }`؛ ذخیره پیام |
| GET | `/v1/store/content/{key}` | فقط محتوای تأییدشده مدیر |

## نیازمند نشست معتبر

| متد | مسیر | کاربرد |
|---|---|---|
| GET | `/v1/account/me` | حساب فعلی |
| POST | `/v1/auth/logout` | خروج |
| GET, POST | `/v1/account/addresses` | نشانی‌های کاربر و افزودن نشانی |
| PATCH, DELETE | `/v1/account/addresses/{id}` | تغییر/حذف نشانی خود کاربر |
| GET, POST | `/v1/account/favorites` | لیست/ذخیره محصول |
| DELETE | `/v1/account/favorites/{slug}` | حذف علاقه‌مندی |
| POST | `/v1/cart/quote` | استعلام قیمت معتبر از داده‌های سرور |
| GET, POST | `/v1/orders` | سفارش‌های کاربر / ثبت سفارش از quote معتبر |
| GET | `/v1/orders/{uuid}` | جزئیات سفارش خود کاربر |
| POST | `/v1/payments/start` | فعلاً HTTP 503؛ باید به درگاه واقعی وصل شود |

### نمونه quote

```json
{ "items": [{"productId":"real-sku","quantity":1}] }
```

`201`: شناسه `quoteId`، `expiresAt`، تفکیک `raw / workmanship / profit / tax` در `items` و مبالغ نهایی بر حسب **تومان**. اطلاعات مالی از کلاینت به‌عنوان مبنای صدور quote پذیرفته نمی‌شود. نداشتن نرخ تأییدشده، وزن، اجرت، سود، هزینه ارسال یا تنظیمات تأییدشده، پاسخ `503` یا `409` می‌دهد؛ هیچ مبلغی حدس زده نمی‌شود.

### نمونه سفارش

هدر: `Idempotency-Key: 8-plus-random-characters`

```json
{ "quoteId":"uuid-from-server", "addressId":1 }
```

فقط پس از بررسی انقضا، نرخ جاری و موجودی، رزرو کوتاه‌مدت و سفارش با وضعیت `pending_payment` صادر می‌شود. این وضعیت به معنی پرداخت **نیست**. رزرو منقضی باید با دستور زمان‌بندی‌شده آزاد شود.

### هماهنگی با V5

V5 در `normalizeProduct` انتظار `id`, `name`, `category` فارسی، `style` فارسی، `images` با URL امن، `weightGrams`, `karat`, `price.amountToman`, `inventoryStatus` دارد. API دقیقاً این کلیدها را تولید می‌کند؛ قیمت بدون استعلام معتبر عمداً `null` است. در فرانت باید با ورود از OTP موفق، `GET /v1/account/me` اجرا شود، و پیش از هر POST/PATCH/DELETE توکن CSRF ست شود. فرآیند سبد/خرید دمو هنوز باید در V5 به endpointهای quote و orders متصل شود.

## V2: نرخ طلا و قیمت لحظه‌ای

- `GET /v1/market/gold` نرخ تأییدشده ۱۸ عیار، زمان منبع و وضعیت اعتبار
- `GET /v1/catalog/products` فیلد `price.amountToman` و `price.breakdown` در صورت موجود بودن نرخ معتبر و سیاست تأییدشده
- `POST /v1/cart/quote` محاسبه سروری مبلغ خرید بر مبنای نرخ فعال؛ قیمت ورودی کلاینت نادیده گرفته می‌شود

برای قرارداد کامل و نحوه فعال‌سازی API رسمی منبع، `AUTOMATIC_GOLD_RATES_FA.md` را بخوانید.
