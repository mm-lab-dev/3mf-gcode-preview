const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const {slicedArchive}=require('./fixtures');
test('bundled worker loads archive and transfers packed toolpaths for selected plates',{timeout:10000},async t=>{
  const worker=new Worker(path.resolve(__dirname,'../dist/worker.js')); t.after(()=>worker.terminate());
  function request(message) { return new Promise((resolve,reject)=>{ worker.once('message',resolve); worker.once('error',reject); worker.postMessage(message); }); }
  const archive=await request({type:'init',bytes:slicedArchive()}); assert.equal(archive.type,'archive'); assert.equal(archive.plates.length,2); assert.match(archive.structure.settings,/body_bottom/);
  const plate=await request({type:'plate',index:1,id:77}); assert.equal(plate.type,'toolpath'); assert.equal(plate.id,77); assert.ok(plate.data.positions instanceof Float32Array); assert.ok(plate.data.widths instanceof Float32Array); assert.equal(plate.data.widths.length,plate.data.segmentCount); assert.equal(plate.data.heights.length,plate.data.segmentCount); assert.equal(plate.data.layers.length,3); assert.equal(plate.data.layers[0].z,1.2); assert.ok(plate.data.eventPositions instanceof Float32Array); assert.equal(plate.data.eventPositions.length,plate.data.eventCount*3);
  const error=await request({type:'plate',index:999,id:78}); assert.equal(error.type,'error'); assert.equal(error.id,78);
});
