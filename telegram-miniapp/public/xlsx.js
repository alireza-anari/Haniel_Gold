// Excel is parsed locally in the browser, then only validated records go to the private Worker.
// Requires bundled JSZip (MIT); no third-party CDN or external upload.
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
  let id=node.getAttribute('r:id'),target=byId.get(id);
  if(!target)continue;
  let normalized=target.startsWith('/')?target.slice(1):`xl/${target}`;
  normalized=normalized.replace(/^xl\/xl\//,'xl/').replace(/\/\.\//g,'/');
  out[node.getAttribute('name')]=normalized;
 }return out;}
async function getRows(zip,path,shared){if(!zip.file(path))throw Error(`شیت ${path} یافت نشد.`);
 const d=parse(await zip.file(path).async('text'));return [...d.getElementsByTagName('row')].map(r=>({n:Number(r.getAttribute('r')),cells:cellsRow(r,shared)}));}
function clean(x){return String(x??'').trim();}
function numeric(x){const value=clean(x);if(value==='')return '';const n=Number(value);return Number.isFinite(n)?String(Number(n.toPrecision(14))):value;}
window.parseHanielXlsx=async function(file){
 if(!file?.name?.toLowerCase().endsWith('.xlsx')||file.size>8*1024*1024)throw Error('فایل XLSX معتبر با حجم کمتر از ۸ مگابایت انتخاب کن.');
 const zip=await JSZip.loadAsync(file), wb=parse(await zip.file('xl/workbook.xml')?.async('text')||'');
 const rel=parse(await zip.file('xl/_rels/workbook.xml.rels')?.async('text')||'');
 const names=sheetPaths(wb,rel);if(!names['موجودی']||!names['فروش'])throw Error('شیت‌های «موجودی» و «فروش» در فایل پیدا نشدند.');
 const shared=zip.file('xl/sharedStrings.xml')?[...parse(await zip.file('xl/sharedStrings.xml').async('text')).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(x=>x.textContent).join('')):[];
 const inv=await getRows(zip,names['موجودی'],shared),sales=await getRows(zip,names['فروش'],shared);
 return {
  products:inv.filter(r=>r.n>=5&&clean(r.cells.A)).map(r=>({row:r.n,name:clean(r.cells.A),weight:numeric(r.cells.B),purchase_gold_rate:numeric(r.cells.C),purchase_labor_pct:numeric(r.cells.D),purchased_qty:numeric(r.cells.F),supplier:clean(r.cells.L),sku:clean(r.cells.O)})),
  sales:sales.filter(r=>r.n>=4&&clean(r.cells.C)).map(r=>({row:r.n,date:clean(r.cells.B),name:clean(r.cells.C),quantity:numeric(r.cells.D),gold_rate:numeric(r.cells.G),labor_pct:numeric(r.cells.I),profit_pct:numeric(r.cells.K),accessories:numeric(r.cells.N)||'0',discount:numeric(r.cells.O)||'0',customer:clean(r.cells.S),ref:clean(r.cells.T),unit_weight:numeric(r.cells.E),purchase_cost:numeric(r.cells.Q),final_price:numeric(r.cells.P)}))
 };
};
const indexToCol=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
function cell(c,n,formula=null){
 if(n===null||n===undefined||n==='')return '';
 const v=String(n);if(formula){let num=Number(n);return `<c r="${c}"><f>${eXml(formula)}</f><v>${Number.isFinite(num)?num:0}</v></c>`;}
 if(typeof n==='number'||(/^[-+]?\d+(\.\d+)?$/.test(v)&&!/^0\d+/.test(v))){return `<c r="${c}"><v>${eXml(v)}</v></c>`;}
 return `<c r="${c}" t="inlineStr"><is><t xml:space="preserve">${eXml(v)}</t></is></c>`;
}
function xmlSheet(rows,formulaFor=null){let xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetData>';
 rows.forEach((data,i)=>{const rn=i+1;xml+=`<row r="${rn}">`;data.forEach((v,j)=>{const col=indexToCol(j),f=formulaFor?.(rn,col);xml+=cell(col+rn,v,f);});xml+='</row>';});return xml+'</sheetData></worksheet>'}
function sNum(v){let n=Number(v||0);return Number.isFinite(n)?n:0;}
window.exportHanielXlsx=async function(d){
 const p=d.products||[],s=d.sales||[];
 const iRows=[['موجودی کالا'],[],[],['نام محصول','وزن هر عدد','قیمت خرید طلا (ریال)','درصد اجرت','اجرت معادل طلا (گرم)','تعداد خرید','تعداد فروخته','موجودی','وزن مانده (گرم)','بهای تمام‌شده خرید','وزن تمام شده','تأمین‌کننده','','','کد محصول HANI-EL']];
 for(const x of p){const sold=s.filter(y=>y.product_sku===x.sku).reduce((a,b)=>a+sNum(b.quantity),0);
 const w=sNum(x.weight),pct=sNum(x.purchase_labor_pct),rate=sNum(x.purchase_gold_rate);
 iRows.push([x.name,w,rate,pct,w*pct/100,sNum(x.purchased_qty),sold,sNum(x.available),w*sNum(x.available),(w+w*pct/100)*rate*sNum(x.purchased_qty),(w+w*pct/100)*sNum(x.purchased_qty),x.supplier||'','','',x.sku]);}
 const sRows=[['فروش'],[],['ردیف','تاریخ','نام محصول','تعداد','وزن واحد (گرم)','وزن کل (گرم)','قیمت روز طلا (ریال)','قیمت طلای خام','درصد اجرت','اجرت به طلا (گرم)','درصد سود','معادل طلای سود (گرم)','سود ریالی','قیمت متعلقات','تخفیف','قیمت نهایی','بهای ریالی خرید','سود کلی ریالی','مشتری','شناسه ثابت فروش','بهای خرید ثبت‌شده','وزن واحد در زمان فروش']];
 s.forEach((x,i)=>sRows.push([i+1,x.date,x.product_name,sNum(x.quantity),sNum(x.unit_weight),sNum(x.total_weight),sNum(x.gold_rate),sNum(x.raw_price),sNum(x.labor_pct),sNum(x.labor_gold),sNum(x.profit_pct),sNum(x.profit_gold),sNum(x.profit_rial),sNum(x.accessories),sNum(x.discount),sNum(x.final_price),sNum(x.purchase_cost),sNum(x.net_profit),x.customer,x.source_ref||`app-sale-${x.id}`,sNum(x.purchase_cost),sNum(x.unit_weight)]));
 const inventoryFormula=(r,c)=>{if(r<=4)return null;return ({E:`B${r}*D${r}/100`,G:`SUMIF('فروش'!C:C,A${r},'فروش'!D:D)`,H:`F${r}-G${r}`,I:`H${r}*B${r}`,J:`(B${r}+E${r})*C${r}*F${r}`,K:`(B${r}+E${r})*F${r}`})[c]||null;};
 const salesFormula=(r,c)=>{if(r<=3)return null;return ({F:`D${r}*E${r}`,H:`F${r}*G${r}`,J:`F${r}*I${r}/100`,L:`(F${r}+J${r})*K${r}/100`,M:`L${r}*G${r}`,P:`H${r}+J${r}*G${r}+M${r}+N${r}-O${r}`,Q:`U${r}`,R:`P${r}-Q${r}-N${r}`})[c]||null;};
 const files={
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="موجودی" sheetId="1" r:id="rId1"/><sheet name="فروش" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
 'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>',
 'xl/worksheets/sheet1.xml':xmlSheet(iRows,inventoryFormula),'xl/worksheets/sheet2.xml':xmlSheet(sRows,salesFormula)
 };
 const zip=new JSZip();for(const [k,v] of Object.entries(files))zip.file(k,v);
 return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6},mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
};
})();
