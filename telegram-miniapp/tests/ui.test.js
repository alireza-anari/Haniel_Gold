import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url));
const text = (relative) => read(relative).toString('utf8');

test('mini-app uses the exact official storefront brand assets, without re-drawing logos',()=>{
 assert.deepEqual(read('../public/assets/logo.png'),read('../../frontend/assets/brand-gold.png'));
 assert.deepEqual(read('../public/assets/clover.png'),read('../../frontend/assets/clover-gold.png'));
});
test('font CSS is sourced from canonical Yekan Bakh FaNum faces',()=>{
 const fonts=text('../../frontend/brand-fonts.css');
 for(const weight of [300,400,600,700]){
  assert.match(fonts,new RegExp('font-weight:'+weight));
 }
 const html=text('../index.html');
 assert.ok(html.indexOf('/brand-fonts.css')>=0);
 assert.ok(html.indexOf('/brand-fonts.css')<html.indexOf('/styles.css'));
 assert.match(text('../vite.config.ts'),/frontend\/brand-fonts\.css/);
 assert.match(text('../public/styles.css'),/Yekan Bakh FaNum/);
});
test('responsive dashboard contains accessible mobile icons and product filter controls',()=>{
 const app=text('../public/app.js');
 const styles=text('../public/styles.css');
 assert.match(app,/aria-current="page"/);
 assert.match(app,/data-stock-filter="available"/);
 assert.match(app,/function updateProductGrid\(\)/);
 assert.match(app,/class="product-card"/);
 assert.match(styles,/@media\(max-width:750px\)/);
 assert.match(styles,/prefers-reduced-motion/);
 assert.match(styles,/\.metric-number/);
});


test('dashboard focuses on operational KPIs and total purchased gold weight',()=>{
 const app=text('../public/app.js'),worker=text('../src/index.js'),css=text('../public/styles.css');
 const start=app.indexOf('function dashboard(){'),end=app.indexOf('function cardPhoto(',start);
 const dashboard=app.slice(start,end);
 assert.match(dashboard,/total_purchased_weight/);
 assert.match(dashboard,/طلای کل ثبت‌شده از ابتدا/);
 assert.match(dashboard,/وزن طلای موجود/);
 assert.doesNotMatch(dashboard,/نمای مالی|دسترسی سریع|financial-grid|action-grid|hero-actions/);
 assert.match(worker,/total_purchased_weight=fmt\(ps.reduce/);
 assert.match(css,/metric-total-gold/);
});
test('back navigation is visible in inner pages and supported by Telegram BackButton',()=>{
 const app=text('../public/app.js'),html=text('../index.html'),css=text('../public/styles.css');
 assert.match(html,/id="back"/);
 assert.match(html,/aria-label="بازگشت به صفحه قبل"/);
 assert.match(app,/async function navigateBack\(\)/);
 assert.match(app,/pageHistory\.pop\(\)/);
 assert.match(app,/tg\?\.BackButton\?\.onClick\(navigateBack\)/);
 assert.match(app,/function updateBackButton\(\)/);
 assert.match(css,/\.back-button\[hidden\]/);
});
test('financial amounts keep all digits and use comma grouping with integer presentation',()=>{
 const app=text('../public/app.js'),css=text('../public/styles.css');
 assert.match(app,/function moneyMetric\(label,value,foot=/);
 assert.match(app,/metric-currency-number/);
 assert.match(app,/number\(value,0\)/);
 assert.match(app,/const rial=x=>/);
 assert.match(app,/number\(x,0\)/);
 assert.match(app,/function formatTypedNumber\(raw\)/);
 assert.match(app,/function formObject\(form\)/);
 assert.match(app,/data-numeric="true"/);
 assert.match(css,/\.num-money/);
 assert.match(css,/\.numeric-input/);
});
