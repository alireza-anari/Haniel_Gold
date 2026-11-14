import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { planImport } from '../src/index.js';
import { quote } from '../src/finance.js';

const product={name:'گردنبند آزمایشی',weight:'0.5',purchase_gold_rate:'200000000',purchase_labor_pct:'7',purchased_qty:2,supplier:'آزمایشی',row:5};
const saleInput={quantity:1,gold_rate:'220000000',labor_pct:'7',profit_pct:'10',accessories:'500000',discount:'1000'};
const computed=quote(product,saleInput);
const sale={...saleInput,name:product.name,date:'1405/08/23',unit_weight:product.weight,
 final_price:computed.final_price,purchase_cost:computed.purchase_cost,ref:'legacy-row-4',row:4,customer:'آزمایشی'};
function mockDb(products=[],sales=[]){
 return {prepare(sql){return {
  bind(){return this;},
  async all(){
   if(sql.includes('FROM products p ORDER BY'))return {results:products};
   if(sql.includes('FROM sales s JOIN'))return {results:sales};
   throw Error('Unexpected database query: '+sql);
  }
 }}};
}
const workbook=(p=[product],s=[sale])=>({products:p.map(x=>({...x})),sales:s.map(x=>({...x}))});

test('safe import preview inserts only synthetic products and sales',async()=>{
 const r=await planImport(mockDb(),workbook());
 assert.deepEqual(r.errors,[]);
 assert.deepEqual(r.conflicts,[]);
 assert.equal(r.counts.products_new,1);
 assert.equal(r.counts.sales_new,1);
 assert.equal(r.plan.newSales[0].source_ref,'legacy-row-4');
});
test('reimporting identical workbook does not double-sell or duplicate products',async()=>{
 const first=await planImport(mockDb(),workbook());
 const p={...first.plan.productNews[0],id:1,version:1};
 const s={...first.plan.newSales[0],product_name:p.name,product_id:p.id,source_ref:'legacy-row-4',id:1,voided:0};
 const again=await planImport(mockDb([p],[s]),workbook());
 assert.deepEqual(again.errors,[]);
 assert.deepEqual(again.conflicts,[]);
 assert.equal(again.counts.products_new,0);
 assert.equal(again.counts.products_unchanged,1);
 assert.equal(again.counts.sales_new,0);
 assert.equal(again.counts.sales_unchanged,1);
});
test('previews block overselling within the same workbook',async()=>{
 const secondQuote=quote(product,{...saleInput,quantity:2});
 const sale2={...sale,ref:'legacy-row-5',row:5,date:'1405/08/24',quantity:2,final_price:secondQuote.final_price,purchase_cost:secondQuote.purchase_cost};
 const r=await planImport(mockDb(),workbook([product],[sale,sale2]));
 assert.equal(r.counts.sales_new,1);
 assert.equal(r.counts.sales_conflicts,1);
 assert.ok(r.conflicts.some(e=>e.includes('موجودی')));
});
test('previews reject mismatched historical final price',async()=>{
 const bad={...sale,final_price:String(Number(sale.final_price)+100)};
 const r=await planImport(mockDb(),workbook([product],[bad]));
 assert.equal(r.counts.sales_new,0);
 assert.ok(r.errors.some(e=>e.includes('مبلغ نهایی')));
});
test('previews reject duplicate sale references',async()=>{
 const s2={...sale,date:'1405/08/24',row:5};
 const r=await planImport(mockDb(),workbook([product],[sale,s2]));
 assert.ok(r.errors.some(e=>e.includes('شناسه تکراری')));
});
test('previews never delete a product omitted from a later Excel file',async()=>{
 const existing=[{...product,id:1,sku:'HG-EXIST1'},{...product,id:2,sku:'HG-EXIST2',name:'انگشتر آزمایشی'}];
 const r=await planImport(mockDb(existing),workbook([product],[]));
 assert.equal(r.counts.products_unchanged,1);
 assert.equal(r.plan.productUpdates.length,0);
 assert.ok(r.warnings.some(x=>x.includes('حذف')));
});
test('preview blocks reduction below the already sold stock',async()=>{
 const existing={...product,id:1,sku:'HG-EXIST1',purchased_qty:2};
 const oldSale={...sale,product_id:1,product_name:product.name,source_ref:'app-sale-1',voided:0,id:1,quantity:2};
 const lower={...product,purchased_qty:1,sku:'HG-EXIST1'};
 const r=await planImport(mockDb([existing],[oldSale]),workbook([lower],[]));
 assert.ok(r.conflicts.some(x=>x.includes('موجودی')));
});
