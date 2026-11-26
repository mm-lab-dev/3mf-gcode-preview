const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildSync}=require('esbuild'),THREE=require('three');
const code=buildSync({entryPoints:['src/surface-pan.js'],bundle:true,platform:'node',format:'cjs',write:false,external:['three']}).outputFiles[0].text;
const value={exports:{}};new Function('require','module','exports',code)(require,value,value.exports);
const {createSurfacePicker}=value.exports;

test('surface depth picking restores scene, projection and render state, including on failure',()=>{
  for(const fail of [false,true]) {
    const picker=createSurfacePicker(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.01,100);
    camera.position.z=2;camera.updateMatrixWorld();
    const material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material),excluded=new THREE.Mesh();
    scene.add(mesh,excluded);scene.background=new THREE.Color('#141920');
    const background=scene.background,projection=camera.projectionMatrix.clone(),target={name:'previous'},originalClear=new THREE.Color('#123456');
    let active=target,clear=originalClear.clone(),alpha=.3,depth,disposed=0;
    const renderer={
      domElement:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})},
      getDrawingBufferSize:v=>v.set(1600,1200),getRenderTarget:()=>active,setRenderTarget:v=>active=v,
      getClearAlpha:()=>alpha,getClearColor:v=>v.copy(clear),setClearColor:(v,a)=>{clear.set(v);alpha=a;},clear(){},
      render(s,c){
        assert.equal(s,scene);assert.equal(c,camera);assert.equal(excluded.visible,false);
        assert.notEqual(active,target);assert.equal(mesh.material.depthPacking,THREE.RGBADepthPacking);
        assert.deepEqual([camera.view.width,camera.view.height],[1,1]);
        depth=mesh.material;depth.addEventListener('dispose',()=>disposed++);
        if(fail) throw Error('pick failed');
      },
      readRenderTargetPixels(t,x,y,w,h,pixel){pixel.set([128,0,0,0]);}
    };
    if(fail) assert.throws(()=>picker.pick(renderer,scene,camera,400,300,[excluded]),/pick failed/);
    else assert.ok(picker.pick(renderer,scene,camera,400,300,[excluded]).isVector3);
    assert.equal(active,target);assert.equal(mesh.material,material);assert.equal(excluded.visible,true);
    assert.equal(scene.background,background);assert.equal(clear.getHex(),originalClear.getHex());assert.equal(alpha,.3);
    assert.ok(camera.projectionMatrix.equals(projection));assert.equal(camera.view,null);
    material.dispose();assert.equal(disposed,1,'cached pick materials follow source disposal');
    picker.dispose();assert.equal(disposed,1);mesh.geometry.dispose();
  }
});
