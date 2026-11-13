import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { quote, purchaseUnitCost, fmt, dec } from '../src/finance.js';
test('purchase formula from the supplied Excel sheet',()=>{
 const p={weight:'0.427',purchase_gold_rate:'180500000',purchase_labor_pct:'7'};
 assert.equal(fmt(purchaseUnitCost(p)),'82468645');
});
test('sales quote matches a user workbook row',()=>{
 const p={weight:'0.39',purchase_gold_rate:'180500000',purchase_labor_pct:'7'};
 const q=quote(p,{quantity:1,gold_rate:'270000000',labor_pct:'7',profit_pct:'13.6055',accessories:0,discount:'453'});
 assert.equal(q.final_price,'127999999.905');
 assert.equal(q.net_profit,'52677349.905');
});
test('Persian numerals parse',()=> assert.equal(fmt(dec('۱۴۰۵.۱۲۵')),'1405.125'));
test('bad input rejected',()=>assert.throws(()=>quote({weight:'0.2',purchase_gold_rate:'1',purchase_labor_pct:'5'},{quantity:'1.5',gold_rate:'4',labor_pct:2,profit_pct:7,discount:0,accessories:0})));
