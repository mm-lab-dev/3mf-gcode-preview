const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {parseGcode}=require('../src/gcode');
const compiled=buildSync({entryPoints:['src/bead.js'],bundle:true,platform:'node',format:'cjs',write:false,external:['three']}).outputFiles[0].text;
const moduleValue={exports:{}};
new Function('require','module','exports',compiled)(require,moduleValue,moduleValue.exports);
const {createBeadMesh,writeBead,connected,beadNeighbor,createBeadCaps,writeBeadCap}=moduleValue.exports;
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

test('section changes at bends share a bisector without averaging dimensions',()=>{
  const d=parseGcode('M83\nG0 Z.2\n;WIDTH:.5\n;HEIGHT:.2\nG1 X1 E1\n;WIDTH:.7\n;HEIGHT:.003\nG1 X1.5 Y.8660254 E1');
  const mesh=createBeadMesh(2);
  for(let i=0;i<2;i++) writeBead(mesh,i,i,d,{r:1,g:1,b:1});
  const g=mesh.geometry, a=g.getAttribute('beadEndTangent'), b=g.getAttribute('beadStartTangent');
  near(a.getX(0),b.getX(1)); near(a.getY(0),b.getY(1));
  near(a.getY(0),.5); near(g.getAttribute('beadMiter').getY(0),2/Math.sqrt(3));
  near(g.getAttribute('beadMiter').getY(0),g.getAttribute('beadMiter').getX(1));
  for(let i=0;i<2;i++) for(const end of ['Start','End']) {
    const size=g.getAttribute('bead'+end+'Size'), point=g.getAttribute('bead'+end);
    near(size.getX(i),d.widths[i]); near(size.getY(i),d.heights[i]);
    near(point.getZ(i)+size.getY(i)/2,.2);
  }
  assert.equal(connected(d,0,1),false,'dimension steps retain their sealing caps');
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('closed extrusion loops join their seam and keep touching loops separate',()=>{
  const d=parseGcode('M83\nG0 Z.2\nG1 X1 E1\nG1 Y1 E1\nG1 X0 Y0 E1\nG1 X-1 E1\nG1 Y-1 E1\nG1 X0 Y0 E1');
  assert.equal(beadNeighbor(d,0,false),2); assert.equal(beadNeighbor(d,2,true),0);
  assert.equal(beadNeighbor(d,3,false),5); assert.equal(beadNeighbor(d,5,true),3);
  const mesh=createBeadMesh(2);
  writeBead(mesh,0,0,d,{r:1,g:1,b:1}); writeBead(mesh,1,2,d,{r:1,g:1,b:1});
  for(const axis of ['getX','getY','getZ'])
    near(mesh.geometry.getAttribute('beadStartTangent')[axis](0),mesh.geometry.getAttribute('beadEndTangent')[axis](1));
  near(mesh.geometry.getAttribute('beadMiter').getX(0),mesh.geometry.getAttribute('beadMiter').getY(1));
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('neighbor lookup respects travel, tool changes, open paths and layers',()=>{
  const d=parseGcode('M83\nG0 Z.2\nG1 X1 E1\nG0 Y1\nG1 X0 E1\nT1\nG1 X-1 E1');
  assert.equal(beadNeighbor(d,0,false),-1); assert.equal(beadNeighbor(d,0,true),-1);
  assert.equal(beadNeighbor(d,2,false),-1); assert.equal(beadNeighbor(d,2,true),-1);
  const layers=parseGcode('M83\nG0 Z.2\nG1 X1 E1\nG1 Y1 E1');
  layers.layers=[{start:0,end:1},{start:1,end:2}];
  assert.equal(beadNeighbor(layers,0,true),-1); assert.equal(beadNeighbor(layers,1,false),-1);
});

test('fixed eight-sided sections retain one topology through instance rewrites',()=>{
  const d=parseGcode('M83\nG0 Z.2\n;WIDTH:.8\n;HEIGHT:.2\nG1 X5 E1\nG1 Y5 E1');
  const mesh=createBeadMesh(2), g=mesh.geometry, index=g.index;
  assert.equal(g.attributes.position.count,16); assert.equal(index.count/3,16);
  for(let pass=0;pass<3;pass++) for(let i=0;i<2;i++) {
    writeBead(mesh,i,i,d,{r:pass/2,g:1,b:0});
    assert.equal(mesh.geometry,g); assert.equal(g.index,index);
    near(g.getAttribute('beadStartSize').getX(i),d.widths[i]);
  }
  const caps=createBeadCaps(1);
  assert.equal(caps.geometry.index.count/3,8);
  for(const object of [mesh,caps]) {object.geometry.dispose();object.material.dispose();}
});

test('eight-sided end caps match miter rings at bends without changing section size',()=>{
  const THREE=require('three'), color=new THREE.Color(0xffffff);
  for(const degrees of [-150,-90,-30,30,90,150]) {
    const angle=degrees*Math.PI/180;
    const d=parseGcode(`M83\nG0 Z.2\n;WIDTH:.8\n;HEIGHT:.2\nG1 X5 E1\nG1 X${(5+5*Math.cos(angle)).toFixed(6)} Y${(5*Math.sin(angle)).toFixed(6)} E1`);
    const mesh=createBeadMesh(2), caps=createBeadCaps(1);
    for(let i=0;i<2;i++) writeBead(mesh,i,i,d,color);
    writeBeadCap(mesh,caps,0,0,true,color);
    const matrix=new THREE.Matrix4(); caps.getMatrixAt(0,matrix);
    const g=mesh.geometry, axis=g.getAttribute('beadEndTangent'), center=g.getAttribute('beadEnd'), miter=g.getAttribute('beadMiter').getY(0);
    const right=new THREE.Vector3(-axis.getY(0),axis.getX(0),0).normalize(), p=g.getAttribute('position');
    for(let i=0;i<8;i++) {
      const cap=new THREE.Vector3().fromBufferAttribute(caps.geometry.attributes.position,i+1).applyMatrix4(matrix);
      const ring=new THREE.Vector3(center.getX(0),center.getY(0),center.getZ(0)).addScaledVector(right,p.getX(i*2+1)*.8*miter/2);
      ring.z+=p.getY(i*2+1)*.2/2;
      near(cap.x,ring.x); near(cap.y,ring.y); near(cap.z,ring.z);
    }
    mesh.geometry.dispose();mesh.material.dispose();caps.geometry.dispose();caps.material.dispose();
  }
});

test('miter orientation cache is reused across color rewrites and isolated by plate',()=>{
  const d=parseGcode('M83\nG0 Z.2\nG1 X5 E1\nG1 Y5 E1'), mesh=createBeadMesh(2);
  writeBead(mesh,0,0,d,{r:1,g:1,b:1});
  const sqrt=Math.sqrt;let calls=0;Math.sqrt=(...args)=>{calls++;return sqrt(...args);};
  try {
    for(let pass=0;pass<3;pass++) for(let i=0;i<2;i++) writeBead(mesh,i,i,d,{r:pass/2,g:1,b:0});
    assert.equal(calls,0,'cached endpoint frames need no repeated normalization');
  } finally {Math.sqrt=sqrt;}
  const original=mesh.geometry.getAttribute('beadEndTangent').getY(0);
  const other=parseGcode('M83\nG0 Z.2\nG1 X5 E1\nG1 Y-5 E1');
  writeBead(mesh,0,0,other,{r:1,g:1,b:1});
  assert.ok(original>0&&mesh.geometry.getAttribute('beadEndTangent').getY(0)<0);
  mesh.geometry.dispose();mesh.material.dispose();
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
