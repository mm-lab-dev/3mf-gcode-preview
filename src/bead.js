import * as THREE from 'three';
import { withPathDepth } from './path-depth';

const SIDES=8;
const attributes=[['beadStart',3],['beadEnd',3],['beadStartTangent',3],['beadEndTangent',3],['beadStartSize',2],['beadEndSize',2],['beadMiter',2],['beadColor',3],['beadIroning',1]];
const STRIDE=attributes.reduce((total,[,size])=>total+size,0);
const currentDirection=new THREE.Vector3(), nextDirection=new THREE.Vector3(), startDirection=new THREE.Vector3(), endDirection=new THREE.Vector3();
const capRight=new THREE.Vector3(), capUp=new THREE.Vector3(), capDirection=new THREE.Vector3(), capMatrix=new THREE.Matrix4();
const neighborCache=new WeakMap();
const geometryCache=new WeakMap();
// Parsed coordinates/sections are immutable for the lifetime of one plate.
// Cache compact orientation data, rather than duplicating all bead attributes.
function beadGeometry(data) {
  let cached=geometryCache.get(data);
  if(cached) return cached;
  beadNeighbor(data,0,true);
  const {previous,next}=neighborCache.get(data), n=data.segmentCount;
  const directions=new Float32Array(n*3), tangents=new Float32Array(n*3), miters=new Float32Array(n);
  for(let i=0;i<n;i++) {
    direction(data,i,currentDirection);
    currentDirection.toArray(directions,i*3);
  }
  for(let i=0;i<n;i++) {
    const j=next[i];
    if(j<0) continue;
    currentDirection.fromArray(directions,i*3); nextDirection.fromArray(directions,j*3);
    joinedDirection(currentDirection,nextDirection,endDirection).toArray(tangents,i*3);
    miters[i]=miterFactor(currentDirection,nextDirection);
  }
  cached={previous,next,directions,tangents,miters};
  geometryCache.set(data,cached);
  return cached;
}

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
attribute float beadIroning;
vec3 beadRight(vec3 direction) {
  vec3 right=vec3(-direction.y,direction.x,0.0);
  return dot(right,right)>0.000001 ? normalize(right) : vec3(1.0,0.0,0.0);
}`);
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`vec3 direction=normalize(mix(beadStartTangent,beadEndTangent,position.z));
vec3 right=beadRight(direction);
vec3 up=vec3(0.0,0.0,1.0);
vec2 size=mix(beadStartSize,beadEndSize,position.z);
float miter=mix(beadMiter.x,beadMiter.y,position.z);
// Ironing is extremely thin. Use a round lighting profile to make each pass
// readable without increasing its physical thickness or changing its depth.
vec2 lightingSize=mix(size,vec2(size.x),beadIroning);
vec3 objectNormal=normalize(right*normal.x/(lightingSize.x*miter)+up*normal.y/lightingSize.y);`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=mix(beadStart,beadEnd,position.z)
  +right*(position.x*size.x*miter*0.5)+up*(position.y*size.y*0.5);`);
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvColor.xyz *= beadColor;');
  };
  const mesh=new THREE.Mesh(geometry,material);
  mesh.userData.beadBuffer=buffer;
  mesh.frustumCulled=false;
  return withPathDepth(mesh);
}

function pathConnected(data,first,second) {
  if(first<0||second<0||first>=data.segmentCount||second>=data.segmentCount||data.types[first]===9||data.types[second]===9||data.tools[first]!==data.tools[second]) return false;
  const a=first*6+3, b=second*6, p=data.positions;
  const dx=p[a]-p[b], dy=p[a+1]-p[b+1], dz=p[a+2]-p[b+2];
  return dx*dx+dy*dy+dz*dz<1e-8;
}

// Only close a loop within a consecutive extrusion run in one layer. Never
// search other paths for coincident points: those may be unrelated contours.
export function beadNeighbor(data,index,end) {
  let neighbors=neighborCache.get(data);
  if(!neighbors) {
    const previous=new Int32Array(data.segmentCount).fill(-1), next=new Int32Array(data.segmentCount).fill(-1);
    for(const layer of data.layers??[{start:0,end:data.segmentCount}]) {
      let start=layer.start;
      for(let i=layer.start;i<layer.end;i++) {
        if(i>layer.start&&next[i-1]<0&&pathConnected(data,i-1,i)) {
          previous[i]=i-1; next[i-1]=i;
        } else start=i;
        if(i-start>=2&&pathConnected(data,i,start)) {
          next[i]=start; previous[start]=i;
        }
      }
    }
    neighbors={previous,next}; neighborCache.set(data,neighbors);
  }
  return (end?neighbors.next:neighbors.previous)[index]??-1;
}

export function connected(data,first,second) {
  if(!pathConnected(data,first,second)) return false;
  // A size or tool change is a section boundary. Averaging across it changes
  // the slicer's dimensions and can turn a thin ironing pass into a thick bead.
  const widths=data.displayWidths??data.widths;
  if(data.tools[first]!==data.tools[second]||Math.abs(widths[first]-widths[second])>1e-6||Math.abs(data.heights[first]-data.heights[second])>1e-6) return false;
  return true;
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
  const cached=beadGeometry(data), previousIndex=cached.previous[index], nextIndex=cached.next[index];
  const previous=previousIndex>=0, next=nextIndex>=0;
  startDirection.fromArray(previous?cached.tangents:cached.directions,(previous?previousIndex:index)*3);
  endDirection.fromArray(next?cached.tangents:cached.directions,index*3);
  const startMiter=previous?cached.miters[previousIndex]:1;
  const endMiter=next?cached.miters[index]:1;
  const widths=data.displayWidths??data.widths;
  const startWidth=widths[index]||0.45;
  const endWidth=startWidth;
  // Different sections share the same bisector plane, with caps sealing the
  // step between their rings. Keep each section's exact width and height.
  const startHeight=data.heights[index]||0.2;
  const endHeight=startHeight;
  geometry.getAttribute('beadStart').setXYZ(instance,p[offset],p[offset+1],p[offset+2]-startHeight/2);
  geometry.getAttribute('beadEnd').setXYZ(instance,p[offset+3],p[offset+4],p[offset+5]-endHeight/2);
  geometry.getAttribute('beadStartTangent').setXYZ(instance,startDirection.x,startDirection.y,startDirection.z);
  geometry.getAttribute('beadEndTangent').setXYZ(instance,endDirection.x,endDirection.y,endDirection.z);
  geometry.getAttribute('beadStartSize').setXY(instance,startWidth,startHeight);
  geometry.getAttribute('beadEndSize').setXY(instance,endWidth,endHeight);
  geometry.getAttribute('beadMiter').setXY(instance,startMiter,endMiter);
  geometry.getAttribute('beadColor').setXYZ(instance,color.r,color.g,color.b);
  geometry.getAttribute('beadIroning').setX(instance,data.types[index]===13?1:0);
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
  return withPathDepth(caps);
}

export function writeBeadCap(beads,caps,instance,beadInstance,end,color) {
  const geometry=beads.geometry, endpoint=end?'beadEnd':'beadStart', tangent=end?'beadEndTangent':'beadStartTangent', size=end?'beadEndSize':'beadStartSize';
  const point=geometry.getAttribute(endpoint), axis=geometry.getAttribute(tangent), dimensions=geometry.getAttribute(size), miter=geometry.getAttribute('beadMiter');
  capDirection.set(axis.getX(beadInstance),axis.getY(beadInstance),axis.getZ(beadInstance));
  capRight.set(-capDirection.y,capDirection.x,0);
  if(capRight.lengthSq()<1e-6) capRight.set(1,0,0); else capRight.normalize();
  capUp.set(0,0,1);
  capMatrix.makeBasis(capRight.multiplyScalar(dimensions.getX(beadInstance)*(end?miter.getY(beadInstance):miter.getX(beadInstance))),capUp.multiplyScalar(dimensions.getY(beadInstance)),capDirection);
  capMatrix.setPosition(point.getX(beadInstance),point.getY(beadInstance),point.getZ(beadInstance));
  caps.setMatrixAt(instance,capMatrix); caps.setColorAt(instance,color);
}
