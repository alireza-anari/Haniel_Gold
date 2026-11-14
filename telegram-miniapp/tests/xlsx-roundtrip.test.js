import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function decode(s){return String(s??'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
class XmlNode{
 constructor(tag,attrs='',body=''){this.tag=tag;this.attrs=attrs;this.body=body;}
 getAttribute(name){const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=this.attrs.match(new RegExp('(?:^|\\s)'+safe+'="([^"]*)"'));return m?decode(m[1]):null;}
 get textContent(){return decode(this.body.replace(/<[^>]*>/g,''));}
 getElementsByTagName(name){
  const re=new RegExp('<'+name+'\\b([^>]*?)(?:\\s*/>|>([\\s\\S]*?)<\\/'+name+'\\s*>)','g'),out=[];let m;
  while((m=re.exec(this.body)))out.push(new XmlNode(name,m[1]||'',m[2]||''));
  return out;
 }
 querySelector(){return null;}
}
class FakeDOMParser{parseFromString(xml){return new XmlNode('document','',String(xml));}}

let appPromise;
async function app(){
 if(appPromise)return appPromise;
 appPromise=(async()=>{
  const vendor=await readFile(new URL('../public/vendor/jszip.min.js',import.meta.url),'utf8');
  const source=await readFile(new URL('../public/xlsx.js',import.meta.url),'utf8');
  const sandbox={DOMParser:FakeDOMParser,Buffer,Blob,File,console,setTimeout,clearTimeout,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Promise,Map,Date,Math,RegExp,Error,Number,String,Object,JSON};
  sandbox.window=sandbox;vm.createContext(sandbox);
  vm.runInContext(vendor,sandbox);vm.runInContext(source,sandbox);
  return sandbox;
 })();
 return appPromise;
}
async function makeTemplate(JSZip){
 const zip=new JSZip();
 const rows=(from,to)=>{let x='';for(let i=from;i<=to;i++)x+='<row r="'+i+'"></row>';return x;};
 const sheet=(dim,from,to)=>'<?xml version="1.0" encoding="UTF-8"?><worksheet><dimension ref="'+dim+'"/><sheetData>'+rows(from,to)+'</sheetData></worksheet>';
 zip.file('xl/workbook.xml','<?xml version="1.0"?><workbook><sheets><sheet name="موجودی" sheetId="1" r:id="rId1"/><sheet name="متعلقات" sheetId="2" r:id="rId2"/><sheet name="فروش" sheetId="3" r:id="rId3"/><sheet name="Sheet1" sheetId="4" r:id="rId4"/><sheet name="تامین کننده" sheetId="5" r:id="rId5"/></sheets><calcPr calcId="191029"/></workbook>');
 zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="worksheet" Target="worksheets/sheet4.xml"/><Relationship Id="rId5" Type="worksheet" Target="worksheets/sheet5.xml"/><Relationship Id="rId6" Type="pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition1.xml"/><Relationship Id="rId7" Type="calcChain" Target="calcChain.xml"/></Relationships>');
 zip.file('[Content_Types].xml','<Types><Override PartName="/xl/calcChain.xml" ContentType="application/xml"/></Types>');
 zip.file('xl/worksheets/sheet1.xml',sheet('A1:N204',1,204));
 zip.file('xl/worksheets/sheet2.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>متعلقات - محفوظ</t></is></c></row></sheetData></worksheet>');
 zip.file('xl/worksheets/sheet3.xml',sheet('A1:AA203',1,203));
 zip.file('xl/worksheets/sheet4.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>صندوق طلا - محفوظ</t></is></c></row></sheetData></worksheet>');
 zip.file('xl/worksheets/sheet5.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>تأمین‌کننده - محفوظ</t></is></c></row></sheetData></worksheet>');
 zip.file('xl/pivotCache/pivotCacheDefinition1.xml','<pivotCacheDefinition xmlns="urn:test" recordCount="200"></pivotCacheDefinition>');
 zip.file('xl/calcChain.xml','<calcChain></calcChain>');
 return zip.generateAsync({type:'nodebuffer'});
}
const product={id:1,sku:'HG-TEST000001',name:'گردنبند آزمایشی',weight:'0.5',purchase_gold_rate:'200000000',purchase_labor_pct:'7',purchased_qty:2,available:2,supplier:'کارگاه آزمایشی',purchase_unit_cost:'107000000'};
const sale={id:17,date:'1405/08/23',product_name:product.name,product_sku:product.sku,quantity:1,unit_weight:'0.5',total_weight:'0.5',gold_rate:'220000000',raw_price:'110000000',labor_pct:'7',labor_gold:'0.035',profit_pct:'10',profit_gold:'0.0535',profit_rial:'11770000',accessories:'500000',discount:'1000',final_price:'122469000',purchase_cost:'107000000',net_profit:'14969000',customer:'مشتری آزمایشی',source_ref:'sale-source-17',voided:1,void_reason:'ابطال آزمایشی'};

test('XLSX export preserves all original sheets and updates sales/inventory safely',async()=>{
 const ctx=await app(),template=await makeTemplate(ctx.JSZip);
 const original=await ctx.JSZip.loadAsync(template);
 const ancillaryBefore={};
 for(const n of ['xl/worksheets/sheet2.xml','xl/worksheets/sheet4.xml','xl/worksheets/sheet5.xml'])ancillaryBefore[n]=await original.file(n).async('text');
 const blob=await ctx.exportHanielXlsx({products:[product],sales:[sale]},template);
 const output=await ctx.JSZip.loadAsync(await blob.arrayBuffer());
 for(const n of ['xl/worksheets/sheet2.xml','xl/worksheets/sheet4.xml','xl/worksheets/sheet5.xml'])assert.equal(await output.file(n).async('text'),ancillaryBefore[n]);
 assert.ok(await output.file('xl/worksheets/sheet1.xml'));
 assert.ok(await output.file('xl/worksheets/sheet3.xml'));
 assert.equal(output.file('xl/calcChain.xml'),null);
 const workbook=await output.file('xl/workbook.xml').async('text');
 assert.match(workbook,/fullCalcOnLoad="1"/);
 assert.match(workbook,/forceFullCalc="1"/);
 const pivot=await output.file('xl/pivotCache/pivotCacheDefinition1.xml').async('text');
 assert.match(pivot,/refreshOnLoad="1"/);
 const inv=await output.file('xl/worksheets/sheet1.xml').async('text');
 assert.match(inv,/<c r="O5"[^>]*>.*?HG-TEST000001/s);
 assert.match(inv,/SUMIFS\(فروش!/);
 const salesXml=await output.file('xl/worksheets/sheet3.xml').async('text');
 assert.match(salesXml,/<c r="T4"[^>]*>.*?sale-source-17/s);
 assert.match(salesXml,/<c r="W4"[^>]*>.*?باطل/s);
 assert.match(salesXml,/<c r="X4"[^>]*>.*?ابطال آزمایشی/s);
 assert.match(salesXml,/<c r="Q4"[^>]*>.*?107000000/s);
 assert.match(salesXml,/<c r="E4"[^>]*>.*?0\.5/s);
});
test('XLSX parser reads stable product/sale keys and voided status from exported workbook',async()=>{
 const ctx=await app(),template=await makeTemplate(ctx.JSZip);
 const blob=await ctx.exportHanielXlsx({products:[product],sales:[sale]},template);
 const file=new Uint8Array(await blob.arrayBuffer());Object.defineProperty(file,'name',{value:'Haniel Invoice.xlsx'});Object.defineProperty(file,'size',{value:file.byteLength});
 const parsed=await ctx.parseHanielXlsx(file);
 assert.equal(parsed.products.length,1);
 assert.equal(parsed.products[0].sku,product.sku);
 assert.equal(parsed.sales.length,1);
 assert.equal(parsed.sales[0].ref,sale.source_ref);
 assert.equal(parsed.sales[0].voided,1);
 assert.equal(parsed.sales[0].void_reason,sale.void_reason);
 assert.equal(parsed.sales[0].purchase_cost,sale.purchase_cost);
});

test('owner allocation summary cells and formulas remain untouched by export',async()=>{
 const ctx=await app(),base=await makeTemplate(ctx.JSZip),zip=await ctx.JSZip.loadAsync(base);
 let xml=await zip.file('xl/worksheets/sheet1.xml').async('text');
 const header='<row r="4"><c r="M4" t="inlineStr"><is><t>فاطمه</t></is></c><c r="N4" t="inlineStr"><is><t>خودم</t></is></c></row>';
 const summary='<row r="5"><c r="M5"><v>9.76</v></c><c r="N5"><f>K3-M5</f><v>8.08</v></c></row>';
 xml=xml.replace('<row r="4"></row>',header).replace('<row r="5"></row>',summary);zip.file('xl/worksheets/sheet1.xml',xml);
 const template=await zip.generateAsync({type:'nodebuffer'});
 const blob=await ctx.exportHanielXlsx({products:[product],sales:[]},template);
 const output=await ctx.JSZip.loadAsync(await blob.arrayBuffer());
 const out=await output.file('xl/worksheets/sheet1.xml').async('text');
 assert.match(out,/<c r="M4"[^>]*>.*?فاطمه/s);
 assert.match(out,/<c r="N4"[^>]*>.*?خودم/s);
 assert.match(out,/<c r="M5"[^>]*>.*?<v>9.76<\/v>/s);
 assert.match(out,/<c r="N5"[^>]*>.*?<f>K3-M5<\/f><v>8.08<\/v>/s);
});
