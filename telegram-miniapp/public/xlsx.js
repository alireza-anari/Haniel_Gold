// XLSX is parsed and updated locally in the browser. The original workbook template stays in IndexedDB;
// only validated product/sale records are sent to the private Worker. JSZip is bundled locally (MIT).
(function(){
'use strict';
const eXml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const parse=xml=>{let doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('ساختار XML فایل اکسل معتبر نیست.');return doc;};
const firstChildText=(node,tag)=>node.getElementsByTagName(tag)[0]?.textContent??'';
const cellsRow=(r,shared)=>{const cells={};for(const c of r.getElementsByTagName('c')){
 const ref=c.getAttribute('r'),m=ref?.match(/^[A-Z]+/);if(!m)continue;
 let t=c.getAttribute('t'),v=firstChildText(c,'v');
 if(t==='s')v=shared[Number(v)]??'';
 if(t==='inlineStr')v=[...c.getElementsByTagName('t')].map(t=>t.textContent).join('');
 cells[m[0]]=v;
 }return cells;};
function sheetPaths(wb,rels){const out={};const byId=new Map([...rels.getElementsByTagName('Relationship')].map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
 for(const node of wb.getElementsByTagName('sheet')){
  let id=node.getAttribute('r:id'),target=byId.get(id);if(!target)continue;
  let normalized=target.startsWith('/')?target.slice(1):'xl/'+target;
  normalized=normalized.replace(/^xl\/xl\//,'xl/').replace(/\/\.\//g,'/');
  out[node.getAttribute('name')]=normalized;
 }return out;}
async function getRows(zip,path,shared){if(!zip.file(path))throw Error('شیت '+path+' یافت نشد.');
 const d=parse(await zip.file(path).async('text'));return [...d.getElementsByTagName('row')].map(r=>({n:Number(r.getAttribute('r')),cells:cellsRow(r,shared)}));}
function clean(x){return String(x??'').trim();}
function numeric(x){const value=clean(x);if(value==='')return '';const n=Number(value);return Number.isFinite(n)?String(Number(n.toPrecision(14))):value;}
const asciiDigits=x=>String(x??'').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
const TEMPLATE_DB='hani-el-gold-xlsx-template-v1';
let memoryTemplate=null;
function openTemplateDb(){
 if(!window.indexedDB)return Promise.resolve(null);
 return new Promise((resolve,reject)=>{
  const req=window.indexedDB.open(TEMPLATE_DB,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('files'))db.createObjectStore('files');};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('ذخیره محلی قالب اکسل ممکن نشد.'));
 });
}
window.storeHanielXlsxTemplate=async function(file){
 const bytes=await file.arrayBuffer();memoryTemplate=bytes;
 const db=await openTemplateDb();if(!db)return {persistent:false};
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put({bytes,name:file.name||'Haniel Invoice.xlsx',savedAt:Date.now()},'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('ذخیره قالب اکسل لغو شد.'));});}
 finally{db.close();}
 return {persistent:true};
};
async function storedTemplate(){
 if(memoryTemplate)return memoryTemplate;
 const db=await openTemplateDb();if(!db)return null;
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files','readonly'),req=tx.objectStore('files').get('current');req.onsuccess=()=>resolve(req.result?.bytes||null);req.onerror=()=>reject(req.error);});}
 finally{db.close();}
}
window.hasHanielXlsxTemplate=async function(){try{return !!(await storedTemplate());}catch{return false;}};
window.parseHanielXlsx=async function(file){
 if(!file?.name?.toLowerCase().endsWith('.xlsx')||file.size>8*1024*1024)throw Error('فایل XLSX معتبر با حجم کمتر از ۸ مگابایت انتخاب کن.');
 const zip=await JSZip.loadAsync(file),wb=parse(await zip.file('xl/workbook.xml')?.async('text')||''),rel=parse(await zip.file('xl/_rels/workbook.xml.rels')?.async('text')||'');
 const names=sheetPaths(wb,rel);if(!names['موجودی']||!names['فروش'])throw Error('شیت‌های «موجودی» و «فروش» در فایل پیدا نشدند.');
 const shared=zip.file('xl/sharedStrings.xml')?[...parse(await zip.file('xl/sharedStrings.xml').async('text')).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(x=>x.textContent).join('')):[];
 const inv=await getRows(zip,names['موجودی'],shared),sales=await getRows(zip,names['فروش'],shared);
 return {
  products:inv.filter(r=>r.n>=5&&clean(r.cells.A)).map(r=>({row:r.n,name:clean(r.cells.A),weight:numeric(r.cells.B),purchase_gold_rate:numeric(r.cells.C),purchase_labor_pct:numeric(r.cells.D),purchased_qty:numeric(r.cells.F),supplier:clean(r.cells.L),sku:clean(r.cells.O)})),
  sales:sales.filter(r=>r.n>=4&&clean(r.cells.C)).map(r=>({row:r.n,date:clean(r.cells.B),name:clean(r.cells.C),quantity:numeric(r.cells.D),gold_rate:numeric(r.cells.G),labor_pct:numeric(r.cells.I),profit_pct:numeric(r.cells.K),accessories:numeric(r.cells.N)||'0',discount:numeric(r.cells.O)||'0',customer:clean(r.cells.S),ref:clean(r.cells.T),unit_weight:numeric(r.cells.V||r.cells.E),purchase_cost:numeric(r.cells.U||r.cells.Q),final_price:numeric(r.cells.P),voided:clean(r.cells.W)==='باطل'?1:0,void_reason:clean(r.cells.X)}))
 };
};
function colIndex(ref){let letters=String(ref).match(/^[A-Z]+/)[0],n=0;for(const c of letters)n=n*26+c.charCodeAt(0)-64;return n;}
function cellMatch(xml,ref){const re=new RegExp('<c\\b(?=[^>]*\\br="'+ref+'")[^>]*(?:\\/\\s*>|>[\\s\\S]*?<\\/c>)');return xml.match(re);}
function writeCellInRow(row,ref,value,formula=null){
 const found=cellMatch(row,ref),old=found?.[0]||'',open=old.match(/^<c\b[^>]*\/?\s*>/)?.[0]||'';
 let attrs=open?open.slice(2,-1).replace(/\/$/,''):' r="'+ref+'"';
 attrs=attrs.replace(/\s+t="[^"]*"/g,'').trim();
 let inner='';
 if(formula!==null){
  const cache=value===null||value===undefined?'':String(value);
  inner='<f>'+eXml(formula)+'</f><v>'+eXml(cache)+'</v>';
 }else if(value!==null&&value!==undefined&&value!==''){
  const v=String(value);
  if(typeof value==='number'||/^-?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?$/.test(v))inner='<v>'+eXml(v)+'</v>';
  else{attrs+=' t="inlineStr"';inner='<is><t xml:space="preserve">'+eXml(v)+'</t></is>';}
 }
 const next=inner?'<c '+attrs+'>'+inner+'</c>':'<c '+attrs+'/>';
 if(found)return row.replace(found[0],next);
 const close=row.lastIndexOf('</row>');if(close<0)throw Error('ساختار ردیف اکسل معتبر نیست.');
 const cells=[...row.matchAll(/<c\\b[^>]*(?:\\/\\s*>|>[\\s\\S]*?<\\/c>)/g)];
 const target=colIndex(ref);let at=close;
 for(const c of cells){const m=c[0].match(/\br="([A-Z]+\d+)"/);if(m&&colIndex(m[1])>target){at=c.index;break;}}
 return row.slice(0,at)+next+row.slice(at);
}
function updateSheet(xml,updates){
 const byRow=new Map();
 for(const [ref,value,formula] of updates){const n=Number(String(ref).match(/\d+$/)[0]);if(!byRow.has(n))byRow.set(n,[]);byRow.get(n).push([ref,value,formula??null]);}
 for(const [n,changes] of byRow){
  const re=new RegExp('<row\\b(?=[^>]*\\br="'+n+'")[^>]*(?:\\/\\s*>|>[\\s\\S]*?<\\/row>)');
  const found=xml.match(re);if(!found)throw Error('ردیف '+n+' در قالب اصلی اکسل وجود ندارد.');
  let row=found[0];for(const [ref,value,formula] of changes)row=writeCellInRow(row,ref,value,formula);
  xml=xml.replace(found[0],row);
 }
 return xml;
}
function num(v){const n=Number(v??0);return Number.isFinite(n)?n:0;}
function addAttr(xml,tag,attr,value){
 const re=new RegExp('<'+tag+'\\b([^>]*)>'),m=xml.match(re);if(!m)return xml;
 const attrs=m[1].replace(new RegExp('\\s'+attr+'="[^"]*"','g'),'');
 return xml.replace(m[0],'<'+tag+attrs+' '+attr+'="'+value+'">');
}
function removeCalcChain(zip,rels,types){
 zip.remove('xl/calcChain.xml');
 rels=rels.replace(/<Relationship\b(?=[^>]*Type="[^"]*\/calcChain")[^>]*\/>/g,'');
 types=types.replace(/<Override\b(?=[^>]*PartName="\/xl\/calcChain\.xml")[^>]*\/>/g,'');
 return {rels,types};
}
async function updateWorkbookTemplate(zip,data){
 const wbPath='xl/workbook.xml',relsPath='xl/_rels/workbook.xml.rels',typesPath='[Content_Types].xml';
 const wb=parse(await zip.file(wbPath).async('text')),rels=parse(await zip.file(relsPath).async('text'));
 const paths=sheetPaths(wb,rels);if(!paths['موجودی']||!paths['فروش'])throw Error('قالب اصلی باید شیت‌های «موجودی» و «فروش» را داشته باشد.');
 const products=data.products||[],sales=(data.sales||[]).slice().sort((a,b)=>num(a.id)-num(b.id));
 if(products.length>200)throw Error('قالب اصلی برای ۲۰۰ محصول آماده شده است؛ تعداد محصولات فعلی '+products.length+' است. برای جلوگیری از حذف اطلاعات، خروجی ساخته نشد.');
 if(sales.length>200)throw Error('قالب اصلی برای ۲۰۰ ردیف فروش آماده شده است؛ تعداد فروش‌های ثبت‌شده '+sales.length+' است. برای جلوگیری از حذف اطلاعات، خروجی ساخته نشد.');
 let invXml=await zip.file(paths['موجودی']).async('text'),salesXml=await zip.file(paths['فروش']).async('text');
 const invUpdates=[['O4','کد محصول HANI-EL']];
 const salesUpdates=[['S3','مشتری'],['T3','شناسه ثابت فروش'],['U3','بهای خرید ثبت‌شده'],['V3','وزن واحد در زمان فروش'],['W3','وضعیت سند'],['X3','علت ابطال']];
 const soldByName=new Map();for(const s of sales)if(!s.voided){const k=String(s.product_name||'');soldByName.set(k,(soldByName.get(k)||0)+num(s.quantity));}
 for(let i=0;i<200;i++){
  const r=5+i,p=products[i]||null,w=p?num(p.weight):0,pct=p?num(p.purchase_labor_pct):0,rate=p?num(p.purchase_gold_rate):0,buy=p?num(p.purchased_qty):0;
  const sold=p?(soldByName.get(String(p.name))||0):0,available=p?num(p.available):0;
  const labor=p?w*pct/100:null;
  const unitCost=p?(p.purchase_unit_cost!==undefined?num(p.purchase_unit_cost):(w+(labor||0))*rate):null;
  const set=(col,val,formula=null)=>invUpdates.push([col+r,val,formula]);
  set('A',p?p.name:null);set('B',p?p.weight:null);set('C',p?p.purchase_gold_rate:null);set('D',p?p.purchase_labor_pct:null);
  set('F',p?p.purchased_qty:null);set('L',p?(p.supplier||''):null);set('O',p?p.sku:null);
  set('E',p?labor:null,'IF(A'+r+'="","",B'+r+'*D'+r+'/100)');
  set('G',p?sold:null,'IF(A'+r+'="","",SUMIFS(فروش!$D$4:$D$203,فروش!$C$4:$C$203,A'+r+',فروش!$W$4:$W$203,"<>باطل"))');
  set('H',p?available:null,'IF(A'+r+'="","",F'+r+'-G'+r+')');
  set('I',p?w*available:null,'IF(A'+r+'="","",B'+r+'*H'+r+')');
  set('J',p?unitCost*buy:null,'IF(A'+r+'="","",(B'+r+'+E'+r+')*C'+r+'*F'+r+')');
  set('K',p?w+(labor||0):0,'IF(B'+r+'="",0,B'+r+'+E'+r+')');
 }
 const sum=(fn)=>products.reduce((a,p)=>a+fn(p),0);
 const invTotals={
  B3:sum(p=>num(p.weight)),E3:sum(p=>num(p.weight)*num(p.purchase_labor_pct)/100),
  F3:sum(p=>num(p.purchased_qty)),G3:sum(p=>soldByName.get(String(p.name))||0),
  H3:sum(p=>num(p.available)),I3:sum(p=>num(p.weight)*num(p.available)),
  J3:sum(p=>num(p.purchase_unit_cost)*num(p.purchased_qty)),K3:sum(p=>num(p.weight)*(1+num(p.purchase_labor_pct)/100))
 };
 const invTotalFormulas={B3:'SUM(B5:B204)',E3:'SUM(E5:E204)',F3:'SUM(F5:F204)',G3:'SUM(G5:G204)',H3:'SUM(H5:H204)',I3:'SUM(I5:I204)',J3:'SUM(J5:J204)',K3:'SUM(K5:K204)'};
 for(const [ref,value] of Object.entries(invTotals))invUpdates.push([ref,value,invTotalFormulas[ref]]);
 const salesTotals={D:0,F:0,H:0,J:0,L:0,M:0,N:0,O:0,P:0,Q:0,R:0};
 for(let i=0;i<200;i++){
  const r=4+i,s=sales[i]||null,active=s&&!s.voided;
  const set=(col,val,formula=null)=>salesUpdates.push([col+r,val,formula]);
  set('A',s?i+1:null);set('B',s?s.date:null);set('C',s?s.product_name:null);set('D',s?s.quantity:null);
  set('E',s?s.unit_weight:null,'IF(C'+r+'="","",IFERROR(VLOOKUP(C'+r+',موجودی!$A$5:$J$204,2,FALSE),0))');
  set('F',s?s.total_weight:null,'IF(C'+r+'="","",D'+r+'*E'+r+')');
  set('G',s?s.gold_rate:null);set('H',s?s.raw_price:null,'IF(C'+r+'="","",F'+r+'*G'+r+')');
  set('I',s?s.labor_pct:null);set('J',s?s.labor_gold:null,'IF(C'+r+'="","",F'+r+'*I'+r+'/100)');
  set('K',s?s.profit_pct:null);set('L',s?s.profit_gold:null,'IF(C'+r+'="","",(F'+r+'+J'+r+')*K'+r+'/100)');
  set('M',s?s.profit_rial:null,'IF(C'+r+'="","",L'+r+'*G'+r+')');
  set('N',s?s.accessories:null);set('O',s?s.discount:null);
  set('P',s?s.final_price:null,'IF(C'+r+'="","",H'+r+'+(J'+r+'*G'+r+')+M'+r+'+N'+r+'-O'+r+')');
  set('Q',s?s.purchase_cost:null);set('R',s?s.net_profit:null,'IF(C'+r+'="","",P'+r+'-Q'+r+'-N'+r+')');
  set('S',s?(s.customer||''):null);set('T',s?(s.source_ref||('app-sale-'+s.id)):null);
  set('U',s?s.purchase_cost:null);set('V',s?s.unit_weight:null);set('W',s?(s.voided?'باطل':'فعال'):null);set('X',s?(s.void_reason||''):null);
  if(active)for(const k of Object.keys(salesTotals))salesTotals[k]+=num(s[{D:'quantity',F:'total_weight',H:'raw_price',J:'labor_gold',L:'profit_gold',M:'profit_rial',N:'accessories',O:'discount',P:'final_price',Q:'purchase_cost',R:'net_profit'}[k]]);
 }
 const totalCols={D:'quantity',F:'total_weight',H:'raw_price',J:'labor_gold',L:'profit_gold',M:'profit_rial',N:'accessories',O:'discount',P:'final_price',Q:'purchase_cost',R:'net_profit'};
 for(const [col,field] of Object.entries(totalCols))salesUpdates.push([col+'2',salesTotals[col],'SUMIFS('+col+'4:'+col+'203,W4:W203,"<>باطل")']);
 invXml=updateSheet(invXml,invUpdates);salesXml=updateSheet(salesXml,salesUpdates);
 invXml=invXml.replace(/<dimension\b[^>]*ref="A1:N204"[^>]*\/>/,'<dimension ref="A1:O204"/>');
 zip.file(paths['موجودی'],invXml);zip.file(paths['فروش'],salesXml);
 let wbXml=await zip.file(wbPath).async('text');
 wbXml=wbXml.replace(/<calcPr\b([^>]*)\/>/,(m,a)=>'<calcPr'+a.replace(/\s(fullCalcOnLoad|forceFullCalc|calcMode)="[^"]*"/g,'')+' fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/>');
 if(!/<calcPr\b/.test(wbXml))wbXml=wbXml.replace('</workbook>','<calcPr fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/></workbook>');
 zip.file(wbPath,wbXml);
 let pivotPath='xl/pivotCache/pivotCacheDefinition1.xml';
 if(zip.file(pivotPath)){let pivot=await zip.file(pivotPath).async('text');pivot=addAttr(pivot,'pivotCacheDefinition','refreshOnLoad','1');zip.file(pivotPath,pivot);}
 let relsXml=await zip.file(relsPath).async('text'),typesXml=await zip.file(typesPath).async('text');
 const cleaned=removeCalcChain(zip,relsXml,typesXml);zip.file(relsPath,cleaned.rels);zip.file(typesPath,cleaned.types);
}
window.exportHanielXlsx=async function(data,templateFile){
 let source=templateFile;
 if(!source)source=await storedTemplate();
 if(!source)throw Error('برای حفظ همه شیت‌های اکسل، ابتدا فایل اصلی Haniel Invoice را در همین دستگاه یک‌بار از بخش «ورود اکسل» انتخاب کن.');
 const zip=await JSZip.loadAsync(source);await updateWorkbookTemplate(zip,data);
 return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6},mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
};
})();