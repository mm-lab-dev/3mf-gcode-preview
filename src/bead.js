import * as THREE from 'three';

const SIDES=16;
const attributes=[['beadStart',3],['beadEnd',3],['beadStartTangent',3],['beadEndTangent',3],['beadStartSize',2],['beadEndSize',2],['beadMiter',2],['beadColor',3]];
const STRIDE=attributes.reduce((total,[,size])=>total+size,0);
const currentDirection=new THREE.Vector3(), previousDirection=new THREE.Vector3(), nextDirection=new THREE.Vector3(), startDirection=new THREE.Vector3(), endDirection=new THREE.Vector3();
const capRight=new THREE.Vector3(), capUp=new THREE.Vector3(), capDirection=new THREE.Vector3(), capMatrix=new THREE.Matrix4();

export function createBeadMesh(capacity) {
  const positions=[], normals=[], colors=[], indices=[];
  function vertex(x,y,end,nx,ny,nz) {
    positions.push(x,y,end); normals.push(nx,ny,nz); colors.push(1,1,1);
    return positions.length/3-1;
  }
  const start=[], finish=[];
  for(let i=0;i<SIDES;i++) {
    const angle=i*2*Math.PI/SIDES, x=Math.cos(angle), y=Math.sin(angle);
    start.push(vertex(x,y,0,x,y,0)); finish.push(vertex(x,y,1,x,y,0));
  }
  for(let i=0;i<SIDES;i++) {
    const next=(i+1)%SIDES;
    indices.push(start[i],start[next],finish[i],finish[i],start[next],finish[next]);
  }
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const buffer=new THREE.InstancedInterleavedBuffer(new Float32Array(capacity*STRIDE),STRIDE).setUsage(THREE.DynamicDrawUsage);
  let offset=0;
  for(const [name,size] of attributes) { geometry.setAttribute(name,new THREE.InterleavedBufferAttribute(buffer,size,offset)); offset+=size; }
  geometry.instanceCount=0;
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.62,metalness:0,transparent:false,depthWrite:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 beadStart;
attribute vec3 beadEnd;
attribute vec3 beadStartTangent;
attribute vec3 beadEndTangent;
attribute vec2 beadStartSize;
attribute vec2 beadEndSize;
attribute vec2 beadMiter;
attribute vec3 beadColor;
vec3 beadRight(vec3 direction) {
  vec3 right=vec3(-direction.y,direction.x,0.0);
  return dot(right,right)>0.000001 ? normalize(right) : vec3(1.0,0.0,0.0);
}`);
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`vec3 direction=normalize(mix(beadStartTangent,beadEndTangent,position.z));
vec3 right=beadRight(direction);
vec3 up=normalize(cross(direction,right));
vec2 size=mix(beadStartSize,beadEndSize,position.z);
float miter=mix(beadMiter.x,beadMiter.y,position.z);
vec3 objectNormal=normalize(right*normal.x/(size.x*miter)+up*normal.y/size.y);`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=mix(beadStart,beadEnd,position.z)
  +right*(position.x*size.x*miter*0.5)+up*(position.y*size.y*0.5);`);
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvColor.xyz *= beadColor;');
  };
  const mesh=new THREE.Mesh(geometry,material);
  mesh.userData.beadBuffer=buffer;
  mesh.frustumCulled=false;
  return mesh;
}

export function connected(data,first,second) {
  if(first<0||second>=data.segmentCount||data.types[first]===9||data.types[second]===9) return false;
  const a=first*6+3, b=second*6, p=data.positions;
  const dx=p[a]-p[b], dy=p[a+1]-p[b+1], dz=p[a+2]-p[b+2];
  return dx*dx+dy*dy+dz*dz<1e-8;
}

function direction(data,index,target) {
  const p=data.positions, offset=index*6;
  return target.set(p[offset+3]-p[offset],p[offset+4]-p[offset+1],p[offset+5]-p[offset+2]).normalize();
}

function joinedDirection(a,b,target) {
  target.copy(a).add(b);
  return target.lengthSq()>0.04 ? target.normalize() : target.copy(b);
}

function miterFactor(a,b) {
  // The join's cross section lies on the angle bisector. Extend it to meet
  // both straight sides at their original half-width, with a bounded bevel at reversals.
  return Math.min(2,1/Math.sqrt(Math.max(0.25,(1+a.dot(b))/2)));
}

export function writeBead(mesh,instance,index,data,color) {
  const geometry=mesh.geometry, p=data.positions, offset=index*6;
  const previous=connected(data,index-1,index), next=connected(data,index,index+1);
  const current=direction(data,index,currentDirection);
  if(previous) joinedDirection(direction(data,index-1,previousDirection),current,startDirection);
  else startDirection.copy(current);
  if(next) joinedDirection(current,direction(data,index+1,nextDirection),endDirection);
  else endDirection.copy(current);
  const startMiter=previous?miterFactor(previousDirection,current):1;
  const endMiter=next?miterFactor(current,nextDirection):1;
  const startWidth=previous?((data.widths[index-1]||0.45)+(data.widths[index]||0.45))/2:data.widths[index]||0.45;
  const endWidth=next?((data.widths[index]||0.45)+(data.widths[index+1]||0.45))/2:data.widths[index]||0.45;
  const startHeight=previous?((data.heights[index-1]||0.2)+(data.heights[index]||0.2))/2:data.heights[index]||0.2;
  const endHeight=next?((data.heights[index]||0.2)+(data.heights[index+1]||0.2))/2:data.heights[index]||0.2;
  geometry.getAttribute('beadStart').setXYZ(instance,p[offset],p[offset+1],p[offset+2]-startHeight/2);
  geometry.getAttribute('beadEnd').setXYZ(instance,p[offset+3],p[offset+4],p[offset+5]-endHeight/2);
  geometry.getAttribute('beadStartTangent').setXYZ(instance,startDirection.x,startDirection.y,startDirection.z);
  geometry.getAttribute('beadEndTangent').setXYZ(instance,endDirection.x,endDirection.y,endDirection.z);
  geometry.getAttribute('beadStartSize').setXY(instance,startWidth,startHeight);
  geometry.getAttribute('beadEndSize').setXY(instance,endWidth,endHeight);
  geometry.getAttribute('beadMiter').setXY(instance,startMiter,endMiter);
  geometry.getAttribute('beadColor').setXYZ(instance,color.r,color.g,color.b);
}

export function uploadBeads(mesh,first,count) {
  const buffer=mesh.userData.beadBuffer;
  buffer.clearUpdateRanges(); buffer.addUpdateRange(first*STRIDE,(count-first)*STRIDE);
  buffer.needsUpdate=true;
}

export function createBeadCaps(capacity) {
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.62,metalness:0,transparent:false,depthWrite:true,side:THREE.DoubleSide});
  const caps=new THREE.InstancedMesh(new THREE.CircleGeometry(0.5,SIDES),material,capacity);
  caps.count=0; caps.frustumCulled=false;
  return caps;
}

export function writeBeadCap(beads,caps,instance,beadInstance,end,color) {
  const geometry=beads.geometry, endpoint=end?'beadEnd':'beadStart', tangent=end?'beadEndTangent':'beadStartTangent', size=end?'beadEndSize':'beadStartSize';
  const point=geometry.getAttribute(endpoint), axis=geometry.getAttribute(tangent), dimensions=geometry.getAttribute(size), miter=geometry.getAttribute('beadMiter');
  capDirection.set(axis.getX(beadInstance),axis.getY(beadInstance),axis.getZ(beadInstance));
  capRight.set(-capDirection.y,capDirection.x,0);
  if(capRight.lengthSq()<1e-6) capRight.set(1,0,0); else capRight.normalize();
  capUp.crossVectors(capDirection,capRight).normalize();
  capMatrix.makeBasis(capRight.multiplyScalar(dimensions.getX(beadInstance)*(end?miter.getY(beadInstance):miter.getX(beadInstance))),capUp.multiplyScalar(dimensions.getY(beadInstance)),capDirection);
  capMatrix.setPosition(point.getX(beadInstance),point.getY(beadInstance),point.getZ(beadInstance));
  caps.setMatrixAt(instance,capMatrix); caps.setColorAt(instance,color);
}
