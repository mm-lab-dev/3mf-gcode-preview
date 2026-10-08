const {test}=require('node:test');
const assert=require('node:assert/strict');
const {zipSync,strToU8}=require('fflate');
const {inspectArchive}=require('../src/archive');
const {modelArchive,slicedArchive}=require('./fixtures');
test('extract multiple plates and structure metadata without changing source bytes',()=>{ const bytes=slicedArchive(),before=bytes.slice(); const result=inspectArchive(bytes); assert.equal(result.plates.length,2); assert.equal(result.plates[0].name,'Metadata/plate_1.gcode'); assert.match(result.structure.settings,/body_text/); assert.equal(result.structure.model,null); assert.deepEqual(bytes,before); });
test('shape-only 3MF is distinguishable from sliced 3MF and keeps its model tree source',()=>{ const result=inspectArchive(modelArchive()); assert.equal(result.plates.length,0); assert.match(result.structure.model,/<build>/); });
test('project and slice settings are extracted for parameter display',()=>{
  const result=inspectArchive(zipSync({
    'Metadata/project_settings.config':strToU8('{"layer_height":"0.2"}'),
    'Metadata/slice_info.config':strToU8('<config><plate><metadata key="nozzle_diameters" value="0.4"/></plate></config>')
  }));
  assert.equal(JSON.parse(result.structure.projectSettings).layer_height,'0.2');
  assert.match(result.structure.sliceInfo,/nozzle_diameters/);
});
test('plate order is numeric and case-insensitive G-code extension is accepted',()=>{ const bytes=zipSync({'Metadata/plate_10.gcode':strToU8('ten'),'Metadata/plate_2.GCODE':strToU8('two')}); assert.deepEqual(inspectArchive(bytes).plates.map(p=>p.gcode),['two','ten']); });
test('invalid archives fail',()=>{ assert.throws(()=>inspectArchive(strToU8('not a zip')),/not a ZIP/); assert.throws(()=>inspectArchive(Uint8Array.from([80,75,0,0]))); });
test('excessive declared uncompressed size rejected before decompression',()=>{ const bytes=zipSync({'Metadata/plate_1.gcode':strToU8('G1')}); const copy=bytes.slice(); for(let i=0;i<copy.length-4;i++) if(copy[i]===80&&copy[i+1]===75&&copy[i+2]===1&&copy[i+3]===2) new DataView(copy.buffer).setUint32(i+24,129*1024*1024,true); assert.throws(()=>inspectArchive(copy),/expanded size/); });
