import * as THREE from 'three';

// The bead materials use vertex-only hooks to deform their shared templates.
// Reuse those hooks in the depth pass so width, height and end caps
// cannot drift from the visible surface. Unused normal calculations are
// eliminated by the depth shader, which has no lighting or color output writes.
export function withPathDepth(mesh) {
  const source=mesh.material;
  const depth=new THREE.MeshDepthMaterial({side:source.side,colorWrite:false,blending:THREE.NoBlending});
  depth.onBeforeCompile=(shader,renderer)=>{
    // MeshDepthMaterial normally puts the normal hook inside a displacement-map
    // conditional. Our position frame needs that hook even without a map.
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','')
      .replace('#include <begin_vertex>','#include <beginnormal_vertex>\n#include <begin_vertex>');
    source.onBeforeCompile(shader,renderer);
  };
  depth.customProgramCacheKey=()=>`path-depth:${source.customProgramCacheKey()}`;
  source.addEventListener('dispose',()=>depth.dispose());
  mesh.customDepthMaterial=depth;
  return mesh;
}
