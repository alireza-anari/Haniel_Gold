import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAlphaMask,cutoutQualityMessage} from '../frontend/tryon/asset-quality.mjs';
const create=(w,h,alpha=0)=>({width:w,height:h,data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?alpha:0)});
const paint=(im,x0,y0,x1,y1,alpha=255)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)im.data[(y*im.width+x)*4+3]=alpha;return im;};
test('rejects opaque background even if one small transparent patch is present',()=>{
 const im=create(100,100,255);paint(im,10,10,25,25,0);
 assert.equal(inspectAlphaMask(im).reason,'OPAQUE_BACKGROUND');
});
test('rejects empty transparent file and malformed image data',()=>{
 assert.equal(inspectAlphaMask(create(100,100)).reason,'EMPTY_FOREGROUND');
 assert.throws(()=>inspectAlphaMask({width:1,height:3,data:new Uint8Array(4)}),/INVALID_IMAGE_DATA/);
});
test('preserves exact product bounds and reports frame clipping',()=>{
 const im=paint(create(100,80),20,15,60,65);
 const q=inspectAlphaMask(im);
 assert.equal(q.ok,true);assert.deepEqual(q.bbox,{x:20,y:15,width:41,height:51});
 assert.deepEqual(q.warnings,[]);
 const edge=paint(create(100,80),0,15,60,65);
 assert.ok(inspectAlphaMask(edge).warnings.includes('TOUCHES_FRAME'));
});
test('flags heavy semi-transparent halos and extreme sparse lines',()=>{
 const a=paint(create(80,80),5,5,74,74,100);
 const q=inspectAlphaMask(a);assert.equal(q.ok,true);
 assert.ok(q.warnings.includes('SOFT_OR_HALO_EDGES'));
 assert.match(cutoutQualityMessage(q),/هاله/);
 const l=create(100,100);for(let y=1;y<99;y++)l.data[(y*100+50)*4+3]=255;
 assert.ok(inspectAlphaMask(l).warnings.includes('SPARSE_OR_THIN_PRODUCT'));
});
test('never mistakes missing transparency for a production-ready cutout',()=>{
 const q=inspectAlphaMask(create(100,100,255));
 assert.equal(q.ok,false);
 assert.match(cutoutQualityMessage(q),/شفاف/);
});
