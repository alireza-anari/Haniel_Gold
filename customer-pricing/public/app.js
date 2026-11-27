const tg = window.Telegram?.WebApp;
try {
  tg?.ready();
  tg?.setHeaderColor('#F7F5F0');
  tg?.setBackgroundColor('#F7F5F0');
} catch {}

const view = document.getElementById('view');
const digits = value => String(value ?? '').replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const group = value => digits(String(value ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
const money = value => `${group(value)} <small>تومان</small>`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function productIdFromTelegram() {
  const query = new URLSearchParams(location.search);
  const raw = tg?.initDataUnsafe?.start_param || query.get('tgWebAppStartParam') || query.get('startapp') || '';
  const match = /^product_(\d{1,10})$/.exec(raw);
  if (match) return Number(match[1]);
  const path = /^\/product\/(\d+)$/.exec(location.pathname);
  return path ? Number(path[1]) : null;
}

function timeLabel(value) {
  if (!value) return 'زمان ثبت نامشخص';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return 'زمان ثبت نامشخص';
  }
}

function row(label, value, options = {}) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="price-row ${options.strong ? 'strong-row' : ''}">
    <span class="row-label">${label}</span>
    <span class="row-value">${options.money ? money(value) : escapeHtml(value)}</span>
  </div>`;
}

function render(data) {
  const p = data.product, b = data.breakdown, rate = data.rate;
  const profitLabel = b.profitPercent === null
    ? 'سهم قیمت‌گذاری فروشگاه'
    : `سود فروشگاه · ${escapeHtml(b.profitPercent)}٪`;
  const image = p.imageUrl
    ? `<img class="product-image" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}">`
    : '<div class="image-placeholder">HANI-EL</div>';
  const availability = p.available
    ? '<span class="availability available">قابل سفارش</span>'
    : '<span class="availability unavailable">در حال حاضر ناموجود</span>';

  view.innerHTML = `
    <section class="product-card">
      ${image}
      <div class="product-heading">
        <div class="eyebrow">PRODUCT PRICE</div>
        <h1>${escapeHtml(p.name)}</h1>
        <div class="product-meta"><span>کد ${escapeHtml(p.sku)}</span><span>${escapeHtml(p.weightGrams)} گرم</span>${availability}</div>
      </div>
    </section>
    <section class="rate-card">
      <div><span class="rate-label">نرخ هر گرم طلای ۱۸ عیار</span><strong>${group(rate.tomanPerGram)} <small>تومان</small></strong></div>
      <div class="rate-time">آخرین دریافت نرخ<br><bdi>${timeLabel(rate.fetchedAt)}</bdi></div>
    </section>
    <section class="breakdown-card">
      <div class="section-title">جزئیات محاسبه قیمت</div>
      ${row('ارزش طلای خام', b.rawGoldToman, { money: true })}
      ${row(`اجرت فروش · ${escapeHtml(b.laborPercent)}٪`, b.laborToman, { money: true })}
      ${row(profitLabel, b.profitToman, { money: true })}
      ${BigInt(b.accessoriesToman || '0') > 0n ? row('متعلقات', b.accessoriesToman, { money: true }) : ''}
      ${BigInt(b.discountToman || '0') > 0n ? row('تخفیف', b.discountToman, { money: true }) : ''}
      <div class="final-price">
        <span>قیمت نهایی محصول</span>
        <strong>${money(b.finalToman)}</strong>
      </div>
    </section>
    <p class="disclaimer">این مبلغ بر اساس نرخ ثبت‌شده در زمان مشاهده محاسبه شده است. قیمت محصول در دیتابیس ذخیره نمی‌شود و با به‌روزرسانی نرخ طلا تغییر می‌کند.</p>
  `;
}

function showError(message) {
  view.innerHTML = `<section class="error-card">
    <div class="error-mark">!</div>
    <h1>امکان نمایش قیمت وجود ندارد</h1>
    <p>${escapeHtml(message)}</p>
    <button type="button" id="retry">تلاش دوباره</button>
  </section>`;
  document.getElementById('retry')?.addEventListener('click', load);
}

async function load() {
  const id = productIdFromTelegram();
  if (!id) {
    showError('لینک محصول معتبر نیست. لطفاً از دکمه مشاهده قیمت زیر پست کانال وارد شو.');
    return;
  }
  view.innerHTML = '<div class="loading"><span></span> در حال محاسبه قیمت…</div>';
  try {
    const response = await fetch(`/api/v1/products/${id}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'دریافت اطلاعات محصول ناموفق بود.');
    render(data);
  } catch (error) {
    showError(error.message || 'ارتباط با سرویس قیمت برقرار نشد.');
  }
}

load();
