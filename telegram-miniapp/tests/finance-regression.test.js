import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { quote, purchaseUnitCost, fmt, dec, quantity } from '../src/finance.js';

const product = {weight:'0.5',purchase_gold_rate:'200000000',purchase_labor_pct:'7'};
const base = {quantity:1,gold_rate:'220000000',labor_pct:'7',profit_pct:'10',accessories:'500000',discount:'1000'};

test('zero labor/profit preserves raw price with accessories and discount',()=>{
 const q=quote(product,{...base,quantity:'2',labor_pct:'0',profit_pct:'0',accessories:'6000',discount:'1000'});
 assert.equal(q.total_weight,'1');
 assert.equal(q.raw_price,'220000000');
 assert.equal(q.labor_gold,'0');
 assert.equal(q.profit_gold,'0');
 assert.equal(q.final_price,'220005000');
});
test('independent Excel-formula reference for multiple-quantity sale',()=>{
 const q=quote(product,{...base,quantity:2});
 // Excel: totalWeight = 0.5*2 = 1 gram
 // laborGold = 1*7/100 = 0.07 grams
 // profitGold = (1+0.07)*10/100 = 0.107 grams
 // final = 220m + 0.07*220m + 0.107*220m + 500000 - 1000
 assert.equal(q.total_weight,'1');
 assert.equal(q.raw_price,'220000000');
 assert.equal(q.labor_gold,'0.07');
 assert.equal(q.profit_gold,'0.107');
 assert.equal(q.profit_rial,'23540000');
 assert.equal(q.final_price,'259439000');
 assert.equal(q.purchase_cost,'214000000');
 assert.equal(q.net_profit,'44939000');
});
test('purchase labor is a percentage of weight, not a percentage of currency twice',()=>{
 assert.equal(fmt(purchaseUnitCost(product)),'107000000');
 assert.equal(fmt(purchaseUnitCost({...product,purchase_labor_pct:0})),'100000000');
});
test('parse Persian and Arabic digits with separators',()=>{
 assert.equal(fmt(dec('۱٬۲۳۴٬۵۶۷.۸۹')),'1234567.89');
 assert.equal(fmt(dec('١٢٣٤٥٦٧٫٨٩'.replace('٫','.'))),'1234567.89');
 assert.equal(quantity('۳'),'3'===3 ? '3' : 3);
});
test('invalid quantity, negative price and discount exceeding invoice are rejected',()=>{
 for(const input of [
  {...base,quantity:'0'}, {...base,quantity:'1.25'},
  {...base,gold_rate:'0'}, {...base,gold_rate:'-1'},
  {...base,labor_pct:'101'}, {...base,profit_pct:'-1'},
  {...base,accessories:'-2'}, {...base,discount:'9999999999999999'}
 ]) assert.throws(()=>quote(product,input));
});
test('selling at a loss is reported as negative net profit rather than silently suppressed',()=>{
 const q=quote(product,{quantity:1,gold_rate:'100000000',labor_pct:0,profit_pct:0,discount:0,accessories:0});
 assert.equal(q.final_price,'50000000');
 assert.equal(q.net_profit,'-57000000');
});
test('fixed-point decimal does not accumulate binary floating-point error',()=>{
 const q=quote({weight:'0.1',purchase_gold_rate:'1',purchase_labor_pct:'0'},
  {quantity:3,gold_rate:'1',labor_pct:0,profit_pct:0,discount:0,accessories:0});
 assert.equal(q.total_weight,'0.3');
 assert.equal(q.raw_price,'0.3');
});
test('single sub-microgram weight is not rounded to zero',()=>{
 const q=quote({weight:'0.000000000000001',purchase_gold_rate:'1000000000000000',purchase_labor_pct:0},
  {quantity:1,gold_rate:'1000000000000000',labor_pct:0,profit_pct:0,discount:0,accessories:0});
 assert.equal(q.raw_price,'1');
});
test('an invalid Persian decimal in excess of 15 places is rejected',()=>{
 assert.throws(()=>dec('۰.۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶'));
});
