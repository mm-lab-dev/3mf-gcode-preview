const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const THREE=require('three');
function load(entry) {
  const code=buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false,external:['three']}).outputFiles[0].text;
  const value={exports:{}};
  new Function('require','module','exports',code)(require,value,value.exports);
  return value.exports;
}
const {createMarkerOcclusion}=load('src/marker-occlusion.js');
const {createBeadMesh,createBeadCaps}=load('src/bead.js');

test('deformed toolpaths share their vertex hooks with distinct depth-only programs',()=>{
  const meshes=[createBeadMesh(1),createBeadCaps(1)];
  const expected=['beadStart','#include <begin_vertex>'], keys=new Set();
  for(let i=0;i<meshes.length;i++) {
    const mesh=meshes[i], depth=mesh.customDepthMaterial;
    assert.ok(depth.isMeshDepthMaterial);
    assert.equal(depth.colorWrite,false); assert.equal(depth.depthWrite,true);
    assert.equal(depth.side,mesh.material.side);
    const shader={vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader,uniforms:{}};
    depth.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes(expected[i]),'depth shader retains the exact path deformation attributes');
    assert.ok(!shader.fragmentShader.includes('lights_pars_begin'),'depth shader does not use the visible lighting pipeline');
    keys.add(depth.customProgramCacheKey());
    let disposed=0; depth.addEventListener('dispose',()=>disposed++);
    mesh.material.dispose(); assert.equal(disposed,1,'depth material follows its visible material lifetime');
    mesh.geometry.dispose();
  }
  assert.equal(keys.size,2,'caps and beads cannot share the wrong depth program');
});

test('occlusion pass restores visible materials, exclusions and render target even after failure',()=>{
  for(const fail of [false,true]) {
    const occlusion=createMarkerOcclusion(), scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera();
    const bead=createBeadMesh(1), line=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial());
    const marker=new THREE.Mesh(), hidden=new THREE.Mesh(), excluded=new THREE.Group(), child=new THREE.Mesh();
    hidden.visible=false; excluded.add(child); scene.add(bead,line,marker,hidden,excluded);
    const originalBead=bead.material, originalLine=line.material, originalChild=child.material, previous={name:'previous render target'};
    let active=previous, fallback;
    const renderer={
      getDrawingBufferSize:v=>v.set(4,4),getRenderTarget:()=>active,setRenderTarget:target=>{active=target;},
      render(s,c) {
        assert.equal(s,scene); assert.equal(c,camera); assert.notEqual(active,previous);
        assert.equal(bead.material,bead.customDepthMaterial);
        assert.equal(line.material.colorWrite,false); assert.ok(line.material.isMeshDepthMaterial);
        fallback=line.material;
        assert.equal(marker.visible,false); assert.equal(excluded.visible,false);
        assert.equal(child.material,originalChild,'excluded descendants do not acquire depth materials');
        assert.equal(hidden.visible,false);
        if(fail) throw new Error('render failure');
      }
    };
    if(fail) assert.throws(()=>occlusion.renderPaths(renderer,scene,camera,[marker,excluded]),/render failure/);
    else occlusion.renderPaths(renderer,scene,camera,[marker,excluded]);
    assert.equal(active,previous); assert.equal(bead.material,originalBead); assert.equal(line.material,originalLine);
    assert.equal(marker.visible,true); assert.equal(excluded.visible,true); assert.equal(hidden.visible,false);
    let disposed=0;fallback.addEventListener('dispose',()=>disposed++);occlusion.dispose();assert.equal(disposed,1);
    scene.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  }
});
