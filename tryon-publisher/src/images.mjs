export const MAX_CUTOUT=400*1024;
export const bytes=v=>v instanceof Uint8Array?v:v instanceof ArrayBuffer?new Uint8Array(v):Array.isArray(v)?Uint8Array.from(v):null;
export function validSourcePhoto(v,mime){
 const b=bytes(v);if(!b||b.length<16||b.length>MAX_CUTOUT)return false;
 if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n);
 if(mime==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
 if(mime==='image/webp')return [82,73,70,70].every((n,i)=>b[i]===n)&&[87,69,66,80].every((n,i)=>b[i+8]===n);
 return false;
}
export function validRgbaPng(v){
 const b=bytes(v);if(!b||b.length<33||b.length>MAX_CUTOUT||![137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))return false;
 if(String.fromCharCode(...b.slice(12,16))!=='IHDR')return false;
 const d=new DataView(b.buffer,b.byteOffset,b.byteLength);
 return d.getUint32(8)===13&&d.getUint32(16)>=32&&d.getUint32(16)<=2048&&d.getUint32(20)>=32&&d.getUint32(20)<=2048&&b[24]===8&&b[25]===6;
}
export function decodePngBase64(s){
 if(typeof s!=='string'||s.length<44||s.length>Math.ceil(MAX_CUTOUT/3)*4+4||! /^[A-Za-z0-9+/]+={0,2}$/.test(s)||s.length%4!==0)return null;
 try{const b=Uint8Array.from(atob(s),x=>x.charCodeAt(0));return validRgbaPng(b)?b:null;}catch{return null;}
}
