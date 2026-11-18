import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, containSize, mapPointer, defaultOverlay, faceAnchor, poseNeckAnchor, normalizeOverlay } from '../frontend/tryon/geometry.mjs';

test('resizing never enlarges and preserves aspect ratio', () => {
  assert.deepEqual(containSize(4000, 2000, 2000), {width: 2000, height: 1000});
  assert.deepEqual(containSize(400, 200), {width: 400, height: 200});
  assert.throws(() => containSize(0, 1200), /INVALID_DIMENSIONS/);
});
test('pointer coordinates map correctly for responsive canvas', () => {
  assert.deepEqual(mapPointer(60, 110, {left:10,top:10,width:100,height:200},1000,2000), {x:500,y:1000});
});
test('default overlay is bounded and visual size never assumes millimetres', () => {
  const a=defaultOverlay('earring', 1000, 1400, .5);
  assert.equal(a.width,105); assert.equal(a.height,210);
  assert.equal(clamp(-2,0,1),0);
});
test('face landmark geometry refuses missing or implausible geometry', () => {
  assert.equal(faceAnchor([], 'earring', 800, 1200),null);
  const pts=Array.from({length:478},()=>({x:.5,y:.5}));
  pts[234]={x:.3,y:.43};pts[454]={x:.7,y:.45};pts[152]={x:.5,y:.72};pts[10]={x:.5,y:.16};
  const a=faceAnchor(pts,'earring',800,1200,'left');
  assert.ok(a.x<240); assert.ok(a.width>0);
  const n=faceAnchor(pts,'necklace',800,1200);assert.ok(n.y>pts[152].y*1200);
});
test('pose neck estimate rejects occluded or impossible shoulders', () => {
  let p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  p[11]={x:.2,y:.6,visibility:.9};p[12]={x:.8,y:.62,visibility:.9};
  assert.ok(poseNeckAnchor(p,900,1200)?.width>0);
  p[11].visibility=.2;assert.equal(poseNeckAnchor(p,900,1200),null);
});
test('extreme adjustments remain constrained',()=>{
  const o=normalizeOverlay({x:-500,y:50000,width:9999,height:9999,rotation:200},1000,700);
  assert.equal(o.x,0); assert.equal(o.y,700); assert.equal(o.rotation,70);
});