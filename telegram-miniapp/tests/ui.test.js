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
