import test from 'node:test';
import assert from 'node:assert/strict';
import {foldAmount,hingePoint,smoothAngle} from '../public/laptop/hinge.js';
test('calibration, both directions, strength and malformed sensor data',()=>{
 assert.equal(foldAmount(110),0);assert.equal(foldAmount(65),.5);assert.equal(foldAmount(155),.5);
 assert.equal(foldAmount(0,110,1.5),1);assert.equal(foldAmount(NaN),0);assert.equal(foldAmount(0,110,0),0);
});
test('bottom edge is fixed, neutral is identity and mesh stays finite without inverted rows',()=>{
 for(const a of [0,.25,.5,.75,1]){
  assert.deepEqual(hingePoint(-1,-1,a),[-1,-1]);assert.deepEqual(hingePoint(1,-1,a),[1,-1]);
  let previous=-2;
  for(let i=0;i<=128;i++) {const y=i/64-1,p=hingePoint(1,y,a);assert(p.every(Number.isFinite));assert(p[1]>=previous,`row inversion at ${i}, fold ${a}`);previous=p[1];if(a===0)assert.deepEqual(p,[1,y]);}
 }
});
test('smoothing is frame-rate independent and never overshoots',()=>{
 const once=smoothAngle(110,30,32),twice=smoothAngle(smoothAngle(110,30,16),30,16);assert(Math.abs(once-twice)<1e-9);
 assert.equal(smoothAngle(110,0,-1),110);assert(smoothAngle(110,0,500)>0);
});
