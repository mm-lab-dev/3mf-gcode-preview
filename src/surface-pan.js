import * as THREE from 'three';

// Pick rendered depth, since CPU raycasts miss shader-deformed bead instances.
// Only the initial grab needs a one-pixel offscreen render and readback.
export function createSurfacePicker() {
  const target=new THREE.WebGLRenderTarget(1,1), pixel=new Uint8Array(4);
  const materials=new Map(), size=new THREE.Vector2(), clearColor=new THREE.Color();
  function depthMaterial(object,visible) {
    const source=object.customDepthMaterial??visible;
    if(!materials.has(source)) {
      const depth=new THREE.MeshDepthMaterial({side:source.side,depthPacking:THREE.RGBADepthPacking,blending:THREE.NoBlending});
      depth.onBeforeCompile=source.onBeforeCompile;
      depth.customProgramCacheKey=()=>`surface-pick:${source.customProgramCacheKey()}`;
      const dispose=()=>{depth.dispose();materials.delete(source);};
      source.addEventListener('dispose',dispose);materials.set(source,{depth,dispose});
    }
    return materials.get(source).depth;
  }
  return {
    pick(renderer,scene,camera,clientX,clientY,excluded=[]) {
      const rect=renderer.domElement.getBoundingClientRect();
      const x=(clientX-rect.left)/rect.width,y=(clientY-rect.top)/rect.height;
      if(x<0||x>=1||y<0||y>=1) return null;
      renderer.getDrawingBufferSize(size);
      const previousTarget=renderer.getRenderTarget(), view=camera.view?{...camera.view}:null, aspect=camera.aspect;
      const background=scene.background, clearAlpha=renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      const visibility=excluded.map(object=>object.visible), swapped=[];
      try {
        excluded.forEach(object=>object.visible=false);
        scene.traverseVisible(object=>{
          if(!(object.isMesh||object.isLine)||!object.material) return;
          swapped.push([object,object.material]);
          object.material=Array.isArray(object.material)?object.material.map(material=>depthMaterial(object,material)):depthMaterial(object,object.material);
        });
        scene.background=null;renderer.setClearColor(0xffffff,1);
        camera.setViewOffset(size.x,size.y,Math.floor(x*size.x),Math.floor(y*size.y),1,1);
        renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
        renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
      } finally {
        for(const [object,material] of swapped) object.material=material;
        excluded.forEach((object,i)=>object.visible=visibility[i]);
        scene.background=background;renderer.setClearColor(clearColor,clearAlpha);
        camera.view=view;camera.aspect=aspect;camera.updateProjectionMatrix();renderer.setRenderTarget(previousTarget);
      }
      if(pixel.every(value=>value===255)) return null;
      const depth=pixel[0]/256+pixel[1]/65536+pixel[2]/16777216+pixel[3]/4278190080;
      return new THREE.Vector3(x*2-1,1-y*2,depth*2-1).unproject(camera);
    },
    dispose() {
      target.dispose();
      for(const [source,{depth,dispose}] of materials) {source.removeEventListener('dispose',dispose);depth.dispose();}
      materials.clear();
    }
  };
}

export function installSurfacePan(controls,pickPoint,requestRender) {
  const canvas=controls.domElement,camera=controls.object;
  const raycaster=new THREE.Raycaster(),plane=new THREE.Plane();
  const pointer=new THREE.Vector2(),anchor=new THREE.Vector3(),point=new THREE.Vector3(),delta=new THREE.Vector3();
  let drag;
  function ray(event) {
    const rect=canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
    camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);return raycaster.ray;
  }
  function down(event) {
    const modified=event.ctrlKey||event.metaKey||event.shiftKey;
    const pan=event.button===2&&!modified||event.button===0&&modified;
    if(!pan||!controls.enabled||!controls.enablePan||drag) return;
    event.preventDefault();event.stopImmediatePropagation();
    // OrbitControls has no public API to discard existing rotation/pan inertia.
    controls._panOffset.set(0,0,0);controls._sphericalDelta.set(0,0,0);
    const picked=pickPoint(event.clientX,event.clientY)??controls.target;
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(delta),picked);
    if(!ray(event).intersectPlane(plane,anchor)) return;
    drag={id:event.pointerId,enabled:controls.enabled};controls.enabled=false;
    canvas.setPointerCapture(event.pointerId);controls.dispatchEvent({type:'start'});
  }
  function move(event) {
    if(!drag||event.pointerId!==drag.id) return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!ray(event).intersectPlane(plane,point)) return;
    delta.subVectors(anchor,point);camera.position.add(delta);controls.target.add(delta);
    controls.update();requestRender();
  }
  function end(event) {
    if(!drag||event&&event.pointerId!==drag.id) return;
    if(event) {event.preventDefault();event.stopImmediatePropagation();}
    const previous=drag;drag=undefined;controls.enabled=previous.enabled;
    if(canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
    controls.dispatchEvent({type:'end'});
  }
  const listeners=[['pointerdown',down],['pointermove',move],['pointerup',end],['pointercancel',end],['lostpointercapture',end]];
  for(const [type,listener] of listeners) canvas.addEventListener(type,listener,{capture:true});
  const blur=()=>end();window.addEventListener('blur',blur);
  return {cancel:()=>end(),dispose(){end();for(const [type,listener] of listeners)canvas.removeEventListener(type,listener,true);window.removeEventListener('blur',blur);}};
}
