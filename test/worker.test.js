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

test('bundled worker loads standalone G-code, reloads it, and rejects binary input',{timeout:10000},async t=>{
  const worker=new Worker(path.resolve(__dirname,'../dist/worker.js')); t.after(()=>worker.terminate());
  async function request(message) {
    const {once}=require('node:events');
    const response=once(worker,'message'); worker.postMessage(message);
    return (await response)[0];
  }
  const text='M83\n;LAYER:0\n;TYPE:WALL-OUTER\nG1 X10 Z.2 E1 F1200\n;TYPE:FILL\nG1 X20 E1\nT1\n;LAYER:1\n;TYPE:SUPPORT\nG1 X30 Z.4 E1';
  const archive=await request({type:'init',filename:'cura.GCODE',bytes:Buffer.from(text)});
  assert.equal(archive.type,'archive'); assert.deepEqual(archive.plates,['cura.GCODE']); assert.deepEqual(archive.structure,{});
  const first=await request({type:'plate',index:0,id:1});
  assert.equal(first.type,'toolpath'); assert.equal(first.data.layers.length,2);
  assert.deepEqual([...first.data.types],[1,3,6]); assert.deepEqual([...first.data.tools],[0,0,1]);
  assert.equal(first.data.speeds[0],20);
  assert.ok(first.data.sourceTypes instanceof Uint32Array);
  assert.equal(first.data.sourceFeatures[first.data.sourceTypes[0]].name,'WALL-OUTER');
  const repeated=await request({type:'plate',index:0,id:2});
  assert.deepEqual(repeated.data.positions,first.data.positions);
  assert.deepEqual(repeated.data.sourceTypes,first.data.sourceTypes);
  assert.deepEqual(repeated.data.sourceFeatures,first.data.sourceFeatures);
  const invalid=await request({type:'init',filename:'binary.gcode',bytes:Buffer.from([0,1,2])});
  assert.equal(invalid.type,'error'); assert.match(invalid.message,/Binary G-code/);
  const stale=await request({type:'plate',index:0,id:3});
  assert.equal(stale.type,'error'); assert.match(stale.message,/Unknown plate/);
});
