// OrbitControls uses a fixed world-space tolerance for change events. At high
// zoom that can stop damping while several visible pixels of pan remain.
export function trackCameraMotion(controls) {
  const camera=controls.object, update=controls.update.bind(controls);
  const position=camera.position.clone(), rotation=camera.quaternion.clone();
  const target=controls.target.clone(), change={type:'change'};
  controls.update=(...args)=>{
    const changed=update(...args);
    const distance=Math.max(camera.position.distanceTo(controls.target),Number.EPSILON);
    const pixelsPerRadian=controls.domElement.clientHeight*camera.zoom/(2*Math.tan(camera.fov*Math.PI/360));
    const translation=Math.max(position.distanceTo(camera.position),target.distanceTo(controls.target));
    const pixels=pixelsPerRadian*(translation/distance+rotation.angleTo(camera.quaternion));
    const moving=changed||pixels>0.01;
    if(moving) {
      position.copy(camera.position); rotation.copy(camera.quaternion); target.copy(controls.target);
      // Also cover updates made by pointer handlers outside the render loop.
      if(!changed) controls.dispatchEvent(change);
    }
    return moving;
  };
}
