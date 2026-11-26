const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const THREE=require('three');
const code=buildSync({stdin:{contents:"export {trackCameraMotion} from './src/camera-motion'; export {OrbitControls} from 'three/addons/controls/OrbitControls.js';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,external:['three']}).outputFiles[0].text;
const value={exports:{}};
new Function('require','module','exports',code)(require,value,value.exports);
const {OrbitControls,trackCameraMotion}=value.exports;

function pan(zoom,tracked,vertical=false,origin=0) {
  const camera=new THREE.PerspectiveCamera(40,1,0.001,10000);
  camera.position.set(origin,origin,origin+42*100/zoom);
  const controls=new OrbitControls(camera,null);
  controls.target.set(origin,origin,origin); controls.update();
  controls.domElement={clientHeight:768,clientWidth:768}; controls.enableDamping=true;
  if(tracked) trackCameraMotion(controls);
  const point=controls.target.clone();
  const project=()=>{camera.updateMatrixWorld();return point.clone().project(camera).multiplyScalar(384);};
  const before=project();let scheduled=false,frames=0;
  controls.addEventListener('change',()=>scheduled=true);
  function frame() {scheduled=false;if(controls.update())scheduled=true;frames++;}
  for(let i=0;i<60;i++) {
    controls._pan(vertical?0:1,vertical?1:0); controls.update();
    if(scheduled) frame();
  }
  while(scheduled&&frames<400) frame();
  assert.ok(frames<400,'damping must finish without leaving a continuous render loop');
  assert.equal(scheduled,false,'the view stops scheduling frames once motion is subpixel');
  return project().distanceTo(before);
}

test('screen-space motion tracking completes fine pans at normal and high zoom',()=>{
  assert.ok(pan(4000,false)<55,'reproduce the fixed world-tolerance regression');
  for(const zoom of [100,1000,4000,16000]) for(const vertical of [false,true]) {
    const pixels=pan(zoom,true,vertical);
    assert.ok(Math.abs(pixels-60)<0.4,`${zoom}% ${vertical?'vertical':'horizontal'} pan moved ${pixels}px instead of 60px`);
  }
});

test('high-zoom panning also settles when the model is far from the origin',()=>{
  assert.ok(Math.abs(pan(4000,true,false,10000)-60)<0.4);
});

test('an unchanged view does not schedule rendering',()=>{
  const camera=new THREE.PerspectiveCamera(40,1,0.001,10000);
  camera.position.z=1;
  const controls=new OrbitControls(camera,null);
  controls.domElement={clientHeight:768}; controls.enableDamping=true;
  trackCameraMotion(controls);
  let events=0;controls.addEventListener('change',()=>events++);
  for(let i=0;i<10;i++) assert.equal(controls.update(),false);
  assert.equal(events,0);
});
