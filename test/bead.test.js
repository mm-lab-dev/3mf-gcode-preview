const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {transformSync}=require('esbuild');
const {parseGcode}=require('../src/gcode');
const compiled=transformSync(fs.readFileSync('src/bead.js','utf8'),{format:'cjs'}).code;
const moduleValue={exports:{}};
new Function('require','module','exports',compiled)(require,moduleValue,moduleValue.exports);
const {createBeadMesh,writeBead,connected,createBeadCaps,writeBeadCap}=moduleValue.exports;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('section boundaries preserve exact width, thickness and top/bottom Z',()=>{
  const d=parseGcode('M83\nG0 Z.2\n;WIDTH:.5\n;HEIGHT:.2\nG1 X10 E1\n;WIDTH:.400644\n;HEIGHT:.003\nG1 X20 E.01\n;WIDTH:.7\n;HEIGHT:.15\nG1 X30 E1');
  assert.equal(connected(d,0,1),false); assert.equal(connected(d,1,2),false);
  const mesh=createBeadMesh(3), color=new (require('three').Color)(0xffffff);
  for(let i=0;i<3;i++) {
    writeBead(mesh,i,i,d,color);
    for(const end of ['Start','End']) {
      const point=mesh.geometry.getAttribute('bead'+end), size=mesh.geometry.getAttribute('bead'+end+'Size');
      near(size.getX(i),d.widths[i]); near(size.getY(i),d.heights[i]);
      near(point.getZ(i)+size.getY(i)/2,.2);
      near(point.getZ(i)-size.getY(i)/2,.2-d.heights[i]);
    }
  }
  const caps=createBeadCaps(1); writeBeadCap(mesh,caps,0,1,true,color);
  near(caps.instanceMatrix.array[14],.2-.003/2);
  caps.geometry.dispose(); caps.material.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
});

test('equal sections join, and sloped extrusion retains vertical height at endpoints',()=>{
  const d=parseGcode('M83\nG0 Z.2\n;WIDTH:.5\n;HEIGHT:.1\nG1 X10 E1\nG1 X20 E1\nG1 X30 Z.3 E1');
  assert.equal(connected(d,0,1),true);
  const mesh=createBeadMesh(1); writeBead(mesh,0,2,d,{r:1,g:1,b:1});
  near(mesh.geometry.getAttribute('beadStart').getZ(0),.15);
  near(mesh.geometry.getAttribute('beadEnd').getZ(0),.25);
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('ironing uses measured path spacing while retaining the G-code section',()=>{
  const text=';ironing_spacing = .35\nM83\nG0 Z.2\n;FEATURE:Ironing\n;WIDTH:.400644\n;HEIGHT:.003\n'+[0,.15,.3,.45].map(y=>`G0 X0 Y${y}\nG1 X10 E.01`).join('\n');
  const d=parseGcode(text);
  near(d.layers[0].ironingSpacing,.15);
  assert.equal(d.layers[0].ironingSpacingSource,'coordinates');
  const mesh=createBeadMesh(1);
  for(let i=0;i<d.segmentCount;i++) if(d.types[i]===13) {
    writeBead(mesh,0,i,d,{r:1,g:1,b:1});
    near(mesh.geometry.getAttribute('beadStartSize').getX(0),.15);
    near(d.widths[i],.400644); near(d.heights[i],.003);
  }
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('ironing lighting is per segment and leaves physical geometry unchanged',()=>{
  const d=parseGcode('M83\nG0 Z.2\n;WIDTH:.15\n;HEIGHT:.003\n;FEATURE:Ironing\nG1 X10 E.01\n;FEATURE:Top surface\nG1 X20 E.01');
  const mesh=createBeadMesh(2);
  for(let i=0;i<2;i++) writeBead(mesh,i,i,d,{r:1,g:1,b:1});
  const shading=mesh.geometry.getAttribute('beadIroning');
  assert.equal(shading.getX(0),1); assert.equal(shading.getX(1),0);
  for(let i=0;i<2;i++) {
    near(mesh.geometry.getAttribute('beadStartSize').getX(i),.15);
    near(mesh.geometry.getAttribute('beadStartSize').getY(i),.003);
    near(mesh.geometry.getAttribute('beadStart').getZ(i),.1985);
  }
  // Playback reuses instance slots; the lighting flag must also be reset.
  writeBead(mesh,0,1,d,{r:1,g:1,b:1});
  assert.equal(shading.getX(0),0);
  mesh.geometry.dispose(); mesh.material.dispose();
});
