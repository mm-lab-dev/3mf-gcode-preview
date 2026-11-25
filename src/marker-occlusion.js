import * as THREE from 'three';

// Only use toolpaths as occluders. A marker keeps its round silhouette where
// there is empty space, even when its radius exceeds the layer thickness.
export function createMarkerOcclusion() {
  const target=new THREE.WebGLRenderTarget(1,1,{depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType)});
  const fallbackDepth=new Map();
  function depthMaterial(object) {
    if(object.customDepthMaterial) return object.customDepthMaterial;
    const side=object.material.side;
    if(!fallbackDepth.has(side)) fallbackDepth.set(side,new THREE.MeshDepthMaterial({side,colorWrite:false,blending:THREE.NoBlending}));
    return fallbackDepth.get(side);
  }
  const uniforms={
    markerPathDepth:{value:target.depthTexture},
    markerViewport:{value:new THREE.Vector2()},
    markerProjectionInverse:{value:new THREE.Matrix4()},
    markerCameraWorld:{value:new THREE.Matrix4()}
  };
  return {
    material(color) {
      const material=new THREE.MeshBasicMaterial({color,depthTest:true,depthWrite:true});
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec2 markerLayerBounds;
varying vec2 markerBounds;
varying float markerAnchorDistance;`);
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vec4 markerAnchor=vec4(0.0,0.0,0.0,1.0);
#ifdef USE_INSTANCING
markerAnchor=instanceMatrix*markerAnchor;
#endif
markerBounds=markerLayerBounds;
markerAnchorDistance=-(modelViewMatrix*markerAnchor).z;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D markerPathDepth;
uniform vec2 markerViewport;
uniform mat4 markerProjectionInverse;
uniform mat4 markerCameraWorld;
varying vec2 markerBounds;
varying float markerAnchorDistance;
bool markerPathOccludes(vec2 uv) {
  float pathDepth=texture2D(markerPathDepth,uv).r;
  if(pathDepth>=1.0) return false;
  vec4 pathView=markerProjectionInverse*vec4(uv*2.0-1.0,pathDepth*2.0-1.0,1.0);
  pathView/=pathView.w;
  float pathZ=(markerCameraWorld*pathView).z;
  bool otherLayer=pathZ<markerBounds.x-0.001||pathZ>markerBounds.y+0.001;
  // Compare against the marker's layer along this pixel's viewing ray.
  // A constant center depth misses the far half of a sphere in angled views.
  float eyeZ=markerCameraWorld[3].z;
  bool crossesLayer=(pathZ>markerBounds.y+0.001&&eyeZ>pathZ)
    ||(pathZ<markerBounds.x-0.001&&eyeZ<pathZ);
  return otherLayer&&(crossesLayer||-pathView.z<markerAnchorDistance+0.001);
}`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
vec2 markerUv=gl_FragCoord.xy/markerViewport;
vec2 texel=1.0/markerViewport;
// Match antialiased toolpath edges to the depth pass. A one-pixel contact
// margin prevents pinholes between touching beads without flattening markers.
if(markerPathOccludes(markerUv)
  ||markerPathOccludes(markerUv+vec2(texel.x,0.0))
  ||markerPathOccludes(markerUv-vec2(texel.x,0.0))
  ||markerPathOccludes(markerUv+vec2(0.0,texel.y))
  ||markerPathOccludes(markerUv-vec2(0.0,texel.y))) discard;`);
      };
      return material;
    },
    renderPaths(renderer,scene,camera,excluded) {
      renderer.getDrawingBufferSize(uniforms.markerViewport.value);
      const {x,y}=uniforms.markerViewport.value;
      if(target.width!==x||target.height!==y) target.setSize(x,y);
      const visibility=excluded.map(object=>object.visible);
      const previousTarget=renderer.getRenderTarget();
      const materials=[];
      try {
        excluded.forEach(object=>{object.visible=false;});
        scene.traverseVisible(object=>{
          if(!(object.isMesh||object.isLine)||!object.material||Array.isArray(object.material)||!object.material.visible) return;
          materials.push([object,object.material]);
          object.material=depthMaterial(object);
        });
        renderer.setRenderTarget(target);
        renderer.render(scene,camera);
      } finally {
        for(const [object,material] of materials) object.material=material;
        excluded.forEach((object,index)=>{object.visible=visibility[index];});
        renderer.setRenderTarget(previousTarget);
      }
      uniforms.markerProjectionInverse.value.copy(camera.projectionMatrixInverse);
      uniforms.markerCameraWorld.value.copy(camera.matrixWorld);
    },
    dispose() { target.dispose(); for(const material of fallbackDepth.values()) material.dispose(); fallbackDepth.clear(); }
  };
}
