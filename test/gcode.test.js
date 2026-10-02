const { test }=require('node:test');
const assert=require('node:assert/strict');
const { parseGcode,arcPoints,EVENT }=require('../src/gcode');
const { sliced }=require('./fixtures');
test('Bambu layer markers, features, speeds and travel are preserved',()=>{
  const d=parseGcode(sliced); assert.equal(d.layers.length,3); assert.deepEqual(d.layers.map(l=>l.z),[.2,.4,.6]); assert.equal(d.layers[0].extrusion,5); assert.ok(d.types.includes(3)); assert.ok(d.types.includes(5)); assert.ok(d.types.includes(9)); assert.equal(d.speeds[1],20); assert.equal(d.positions.length,d.segmentCount*6); assert.equal(d.widths.length,d.segmentCount); assert.equal(d.heights.length,d.segmentCount); assert.equal(d.layers[2].end,d.segmentCount);
});
test('bead cross-section follows slicer width and height tags with bounded fallback',()=>{
  const d=parseGcode('M83\n; CHANGE_LAYER\n; Z_HEIGHT: .2\n; WIDTH: .6\n; HEIGHT: .18\nG1 X10 Z.2 E1\nG0 X20\n; LINE_WIDTH: .35\nG1 X30 E1\n; CHANGE_LAYER\n; Z_HEIGHT: .45\nG1 X40 Z.45 E1');
  assert.ok(Math.abs(d.widths[0]-.6)<1e-6); assert.ok(Math.abs(d.heights[0]-.18)<1e-6); assert.equal(d.widths[1],0); assert.ok(Math.abs(d.widths[2]-.35)<1e-6); assert.ok(Math.abs(d.heights.at(-1)-.18)<1e-6);
  const fallback=parseGcode('M83\nG1 X10 Z.2 E1\nG1 X20 Z.4 E1'); assert.ok(Math.abs(fallback.widths[0]-.45)<1e-6); assert.ok(Math.abs(fallback.heights[1]-.2)<1e-6);
});
test('absolute extrusion, reset and relative XYZ/E modes',()=>{
  const d=parseGcode('G90\nM82\nG1 X10 Z.2 E1\nG92 E0\nG1 X20 E1\nG91\nM83\nG1 X2 E.2'); assert.equal(d.segmentCount,3); assert.equal(d.positions.at(-3),22);
});
test('retraction recovery is travel rather than deposited material',()=>{
  const d=parseGcode('M83\nG1 Z.2 X10 E1\nG1 E-1\nG1 X20 E1\nG1 X30 E.5'); assert.deepEqual([...d.types],[0,9,0]);
});
test('Bambu time header and motion events are retained without turning retraction into extrusion',()=>{
  const gcode='; HEADER_BLOCK_START\n; model printing time: 2h 6m; total estimated time: 2h 13m\n; HEADER_BLOCK_END\nM83\n; CHANGE_LAYER\n; Z_HEIGHT: .2\nG0 X0 Y0 Z.2\n; FEATURE: Outer wall\nG1 X10 E1\nG1 E-.4\n; WIPE_START\nG1 X9 E0\n; WIPE_END\nG0 X12\nG1 E.4\nG1 X20 E1';
  const d=parseGcode(gcode);
  assert.equal(d.modelTime,'2h 6m'); assert.equal(d.totalTime,'2h 13m');
  assert.deepEqual([...d.eventKinds],[EVENT.OuterWallStart,EVENT.Retract,EVENT.Wipe,EVENT.Unretract,EVENT.OuterWallStart]);
  assert.deepEqual([...d.eventIndices],[2,2,3,4,5]);
  assert.deepEqual(Array.from(d.eventPositions.slice(0,3)),[0,0,Math.fround(.2)]);
  assert.deepEqual(Array.from(d.eventPositions.slice(-3)),[12,0,Math.fround(.2)]);
  assert.equal(d.eventPositions.length,d.eventCount*3); assert.ok(d.eventLayers.every(layer=>layer===0));
  assert.deepEqual([...d.types],[9,1,9,9,1]);
});
test('firmware retract and Prusa time comment are recognized',()=>{
  const d=parseGcode('; estimated printing time (normal mode) = 1h 2m 3s\nM83\nG1 X1 Z.2 E1\nG10\nG11');
  assert.equal(d.totalTime,'1h 2m 3s'); assert.equal(d.modelTime,null);
  assert.deepEqual([...d.eventKinds],[EVENT.Retract,EVENT.Unretract]);
});
test('extrusion decrease during a tagged wipe is one wipe event, not a second retract marker',()=>{
  const d=parseGcode('M83\n; CHANGE_LAYER\n; Z_HEIGHT: .2\nG1 X1 Z.2 E1\nG1 E-.2\n; WIPE_START\nG1 X2 E-.1\n; WIPE_END\nG1 E.3');
  assert.deepEqual([...d.eventKinds],[EVENT.Retract,EVENT.Wipe,EVENT.Unretract]);
});
test('Z-hop does not create an inferred extrusion layer',()=>{
  const d=parseGcode('M83\nG1 X10 Z.2 E1\nG0 Z1\nG0 X20\nG0 Z.2\nG1 X30 E1\nG0 Z.4\nG1 X40 E1'); assert.deepEqual(d.layers.map(l=>l.z),[.2,.4]);
});
test('Prusa/Cura tags and CRLF are recognized',()=>{
  const d=parseGcode('M83\r\n;LAYER:0\r\n;TYPE:WALL-OUTER\r\nG1 X10 Z.2 E1\r\n;LAYER:1\r\n;TYPE:SUPPORT\r\nG1 X20 Z.4 E1'); assert.equal(d.layers.length,2); assert.deepEqual([...d.types],[1,6]);
});
test('startup purge excluded when explicit layer tags exist',()=>{
  const d=parseGcode('M83\nG1 X100 E10\n; CHANGE_LAYER\n; Z_HEIGHT: .2\nG1 Z.2 X20 E1'); assert.equal(d.segmentCount,1); assert.equal(d.layers[0].z,.2);
});
test('startup retraction does not hide first-layer object extrusion',()=>{
  const gcode='M83\nT1\nG1 E-3\nG130 O0 E20\n; CHANGE_LAYER\n; Z_HEIGHT: .2\nG1 E-.3\nG1 E.3\n; FEATURE: Bottom surface\nG1 X5 Y5 Z.2 E.1\nG1 X10 E.1\nG1 E-.3\nG1 E.3\nG1 X10 Y10 E.1\nT0\n; FEATURE: Outer wall\nG1 X5 Y5 E.2';
  const d=parseGcode(gcode);
  assert.deepEqual([...d.types],[4,4,4,1]);
  assert.deepEqual([...d.tools],[1,1,1,0]);
  assert.equal(d.layers[0].extrusion,4);
});
test('duplicate Bambu marker families do not create duplicate layers',()=>{ const d=parseGcode('M83\n; CHANGE_LAYER\n; Z_HEIGHT: .2\nG0 Z.2\n; layer num/total_layer_count: 1/2\nG1 X10 E1\n; CHANGE_LAYER\n; Z_HEIGHT: .4\nG0 Z.4\n; layer num/total_layer_count: 2/2\nG1 X20 E1'); assert.equal(d.layers.length,2); assert.deepEqual(d.layers.map(l=>l.z),[.2,.4]); });
test('negative Cura raft layer numbers are included',()=>{ const d=parseGcode('M83\n;LAYER:-1\nG1 Z.2 X1 E1\n;LAYER:0\nG1 Z.4 X2 E1'); assert.equal(d.layers.length,2); });
test('G92 XYZ changes coordinate frame without moving the nozzle',()=>{
  const d=parseGcode('M83\nG1 X10 Z.2 E1\nG92 X0\nG1 X5 E1'); assert.equal(d.positions.at(-3),15); assert.equal(d.positions[6],10);
});
test('tool switches maintain individual absolute extrusion coordinates',()=>{
  const d=parseGcode('G1 X10 Z.2 E10\nT1\nG1 X20 E1\nT0\nG1 X30 E11'); assert.deepEqual([...d.tools],[0,1,0]); assert.equal(d.layers[0].extrusion,3);
});
test('XY clockwise and counterclockwise arcs preserve exact endpoints',()=>{
  for(const clockwise of [true,false]) { const p=arcPoints([0,0,.2],[10,10,.2],{I:10,J:0},clockwise); assert.ok(p.length>3); assert.deepEqual(p[0],[0,0,.2]); assert.deepEqual(p.at(-1),[10,10,.2]); }
  const d=parseGcode('M83\nG1 Z.2 X0 E1\nG2 X10 Y10 I10 J0 E1'); assert.ok(d.segmentCount>10); assert.ok(d.positions.every(Number.isFinite));
});
test('radius arcs and full circles are tessellated',()=>{ assert.ok(arcPoints([0,0,0],[10,0,0],{R:10},false).length>3); const circle=arcPoints([0,0,0],[0,0,0],{I:10,J:0},true); assert.ok(circle.length>=73); assert.deepEqual(circle[0],circle.at(-1)); assert.ok(circle.some(p=>p[0]>19)); assert.equal(arcPoints([0,0,0],[30,0,0],{R:10},true),null); });
test('non-XY and malformed arcs report warnings instead of drawing chords',()=>{
  const d=parseGcode('M83\nG1 Z.2 X1 E1\nG18\nG2 X10 Z10 I5 E1\nG17\nG2 X30 R1 E1'); assert.equal(d.segmentCount,1); assert.equal(d.warnings.length,3);
});
test('inch units converted to millimeters and mm/s',()=>{ const d=parseGcode('G20\nM83\nG1 X1 Z.01 E.1 F60'); assert.ok(Math.abs(d.positions[3]-25.4)<.0001); assert.ok(Math.abs(d.speeds[0]-25.4)<.0001); });
test('firmware conditionals report preview limitations',()=>{ const d=parseGcode('M622 J1\nM83\nG1 X1 Z.2 E1\nM623'); assert.ok(d.warnings.some(w=>w.startsWith('M622'))); });
test('G-code source line numbers include blank lines',()=>{ const d=parseGcode('M83\n\n; comment\n\nG1 X1 Z.2 E1'); assert.equal(d.lines[0],5); });
test('segment limit and no-extrusion input fail clearly',()=>{ assert.throws(()=>parseGcode(sliced,{maxSegments:2}),/segment preview limit/); assert.throws(()=>parseGcode('G1 X10'),/No printable/); });
