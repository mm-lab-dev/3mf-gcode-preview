const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {parseGcode}=require('../src/gcode');
const {selectionDimensions}=require('../src/dimensions');
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);

test('thin passes change thickness without changing layer Z or pitch; next layer restores thickness',()=>{
  const d=parseGcode('M83\n;CHANGE_LAYER\n;Z_HEIGHT:.14\n;LAYER_HEIGHT:.14\nG0 Z.14\n;LINE_WIDTH:.5\nG1 X10 E1\n;CHANGE_LAYER\n;Z_HEIGHT:.24\n;LAYER_HEIGHT:.1\nG0 Z.24\nG1 X20 E1\n;FEATURE:Ironing\n;LAYER_HEIGHT:.003\n;LINE_WIDTH:.400644\nG1 X30 E.01\n;CHANGE_LAYER\n;Z_HEIGHT:.39\n;LAYER_HEIGHT:.15\nG0 Z.39\nG1 X40 E1');
  const passes=[...d.types.keys()].filter(i=>d.types[i]!==9);
  passes.forEach((i,n)=>near(d.heights[i],[.14,.1,.003,.15][n]));
  near(d.widths[passes[2]],.400644); near(d.positions[passes[2]*6+5],.24);
  near(d.layers[1].pitch,.1); near(d.layers[2].pitch,.15);
  const selected=selectionDimensions(d.layers,1,1);
  assert.deepEqual(selected.height,[.003,.1]); near(selected.bounds[0],.14); near(selected.bounds[1],.24);
});

test('first-layer and adaptive heights use deposition Z rather than preceding Z-hop',()=>{
  const d=parseGcode('M83\n;LAYER:0\nG0 Z8\nG0 Z.14\nG1 X10 E1\n;LAYER:1\nG0 Z10\nG0 Z.23\nG1 X20 E1\n;LAYER:2\nG0 Z.235\nG1 X30 E1');
  const passes=[...d.types.keys()].filter(i=>d.types[i]!==9);
  passes.forEach((i,n)=>near(d.heights[i],[.14,.09,.005][n]));
  assert.deepEqual(d.layers.map(l=>l.z),[.14,.23,.235]);
  near(selectionDimensions(d.layers,0,2).pitch[0],.005);
  assert.equal(d.dimensionSources[passes[0]],8);
});

test('width estimation requires known material diameter and preserves explicit width',()=>{
  const prefix=';filament_diameter = 1.75\nM83\nG0 Z.2\n';
  const d=parseGcode(prefix+'G1 X10 E.4\n;WIDTH:.6\nG1 X20 E.4');
  const i=d.types.findIndex(t=>t!==9), area=.4*Math.PI*1.75**2/4/10;
  near(d.widths[i],area/.2+.2*(1-Math.PI/4));
  assert.equal(d.dimensionSources[i],10); near(d.widths.at(-1),.6); assert.equal(d.dimensionSources.at(-1),9);
  const unknown=parseGcode('M83\nG0 Z.2\nG1 X10 E.4'); near(unknown.widths.at(-1),.45); assert.equal(unknown.dimensionSources.at(-1)&3,0);
  const flow=parseGcode(prefix+'M221 S95\nG1 X10 E.4'); assert.equal(flow.dimensionSources.at(-1)&3,0);
});

test('volumetric extrusion, per-tool diameter, arc length and circular bridge estimation',()=>{
  const d=parseGcode('M83\nM200 D1.75\nG0 Z.2\nG1 X10 E1\nT1\nM200 D0\nG1 X20 E1');
  near(d.widths[0],.1/.2+.2*(1-Math.PI/4)); near(d.widths.at(-1),.45);
  const bridge=parseGcode(';filament_diameter:1.75\nM83\n;FEATURE:Bridge\nG0 Z.2\nG1 X10 E.4');
  near(bridge.widths[0],Math.sqrt(4*(.4*Math.PI*1.75**2/4/10)/Math.PI)); near(bridge.heights[0],bridge.widths[0]);
  const arc=parseGcode('M83\nM200 D1.75\nG0 X2 Z.2\nG3 X-2 I-2 E1');
  let length=0; for(let i=0;i<arc.segmentCount;i++) if(arc.types[i]!==9) {const p=arc.positions.slice(i*6,i*6+6);length+=Math.hypot(p[3]-p[0],p[4]-p[1]);}
  near(arc.widths.at(-1),1/length/.2+.2*(1-Math.PI/4));
});

test('20-3 sample has a 0.14 mm first layer and 0.003 mm ironing at Z 1.04',{skip:!fs.existsSync('sample/20-3.gcode')},()=>{
  const d=parseGcode(fs.readFileSync('sample/20-3.gcode','utf8'));
  const first=d.types.findIndex(t=>t!==9); near(d.heights[first],.14);
  const l=d.layers[9]; near(l.z,1.04); near(l.pitch,.1);
  let ironing=0;
  for(let i=l.start;i<l.end;i++) if(d.types[i]===13) {ironing++; near(d.heights[i],.003); near(d.widths[i],.400644); near(d.positions[i*6+5],1.04); assert.equal(d.dimensionSources[i],5);}
  assert.equal(ironing,4788); assert.deepEqual(l.heightRange,[.003,.1]);
  assert.ok(Math.abs(l.ironingSpacing-.15)<.001);
  assert.equal(l.ironingSpacingSource,'coordinates');
  for(let i=l.start;i<l.end;i++) if(d.types[i]===13) near(d.displayWidths[i],l.ironingSpacing);
});
