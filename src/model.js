import * as THREE from 'three';
import { unzipSync, strFromU8 } from 'fflate';
// Core meshes/components plus Production Extension cross-file object references.
// Materials are intentionally neutral; no external textures or URLs are loaded.
const units={micron:0.001,millimeter:1,centimeter:10,inch:25.4,foot:304.8,meter:1000};
function children(node,name) { return [...node.children].filter(n=>n.localName===name); }
function first(node,name) { return children(node,name)[0]; }
function normalize(target,base='') {
  const segments=(target.startsWith('/')?target:base.slice(0,base.lastIndexOf('/')+1)+target).replaceAll('\\','/').split('/'), out=[];
  for(const segment of segments) { if(!segment||segment==='.') continue; if(segment==='..') { if(!out.length) throw Error('Invalid 3MF part path.'); out.pop(); } else out.push(segment); }
  return out.join('/');
}
function referencePath(node,base) { const attr=[...node.attributes].find(a=>a.localName==='path'); return attr?normalize(attr.value,base):base; }
function number(value) { const n=Number(value); if(value===null||!Number.isFinite(n)) throw Error('Invalid coordinate in 3MF model.'); return n; }
function applyTransform(object,value) {
  if(!value) return;
  const t=value.trim().split(/\s+/).map(number); if(t.length!==12) throw Error('Invalid 3MF transform.');
  object.applyMatrix4(new THREE.Matrix4().set(t[0],t[3],t[6],t[9],t[1],t[4],t[7],t[10],t[2],t[5],t[8],t[11],0,0,0,1));
}
export function loadModel(bytes) {
  let expanded=0;
  const files=unzipSync(bytes,{filter:entry=>{ expanded+=entry.originalSize; if(entry.originalSize>128*1024*1024||expanded>256*1024*1024) throw Error('3MF expanded size exceeds preview limits.'); return /\.(model|rels)$/i.test(entry.name); }});
  function xml(filename) {
    if(!files[filename]) throw Error(`Missing 3MF part: ${filename}`);
    const source=strFromU8(files[filename]); if(/<!DOCTYPE|<!ENTITY/i.test(source)) throw Error('XML entities are not supported.');
    const document=new DOMParser().parseFromString(source,'application/xml'); if(document.getElementsByTagName('parsererror').length) throw Error(`Invalid XML: ${filename}`); return document.documentElement;
  }
  const rels=xml('_rels/.rels'), rootRel=children(rels,'Relationship').find(r=>/\/3dmodel$/.test(r.getAttribute('Type')??''));
  if(!rootRel) throw Error('No 3D model relationship in 3MF.');
  const rootPath=normalize(rootRel.getAttribute('Target')??''), models=new Map(), cache=new Map(), active=new Set(); let triangles=0;
  function part(filename) {
    if(models.has(filename)) return models.get(filename);
    const root=xml(filename), scale=units[root.getAttribute('unit')||'millimeter']; if(!scale) throw Error('Unsupported 3MF unit.');
    const resources=first(root,'resources'); if(!resources) throw Error('No 3MF resources.');
    const value={root,scale,objects:new Map(children(resources,'object').map(n=>[n.getAttribute('id'),n]))}; models.set(filename,value); return value;
  }
  function build(filename,id,depth=0) {
    if(depth>100) throw Error('3MF component nesting exceeds preview limit.');
    const key=`${filename}:${id}`; if(active.has(key)) throw Error('Cyclic 3MF component reference.'); if(cache.has(key)) return cache.get(key).clone();
    const model=part(filename), node=model.objects.get(id); if(!node) throw Error(`Missing object ${id} in ${filename}`);
    active.add(key); const group=new THREE.Group(); group.name=node.getAttribute('name')||`Object ${id}`;
    const mesh=first(node,'mesh'), components=first(node,'components');
    if(mesh) {
      const vertices=first(mesh,'vertices'), faces=first(mesh,'triangles'); if(!vertices||!faces) throw Error('Incomplete 3MF mesh.');
      const vs=children(vertices,'vertex'), ts=children(faces,'triangle'); triangles+=ts.length; if(triangles>2000000||vs.length>2000000) throw Error('3MF mesh exceeds the 2 million triangle/vertex preview limit.');
      const positions=new Float32Array(vs.length*3), indices=new Uint32Array(ts.length*3);
      vs.forEach((v,i)=>['x','y','z'].forEach((axis,j)=>positions[i*3+j]=number(v.getAttribute(axis))));
      ts.forEach((t,i)=>['v1','v2','v3'].forEach((axis,j)=>{ const index=number(t.getAttribute(axis)); if(!Number.isInteger(index)||index<0||index>=vs.length) throw Error('Invalid 3MF triangle vertex.'); indices[i*3+j]=index; }));
      const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3)); geometry.setIndex(new THREE.BufferAttribute(indices,1)); geometry.computeVertexNormals();
      group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x51d3ae,roughness:0.7,flatShading:true,side:THREE.DoubleSide})));
    } else if(components) {
      for(const component of children(components,'component')) { const target=referencePath(component,filename), object=build(target,component.getAttribute('objectid'),depth+1); object.scale.multiplyScalar(part(target).scale/model.scale); applyTransform(object,component.getAttribute('transform')); group.add(object); }
    } else throw Error('Unsupported 3MF object (no mesh/components).');
    active.delete(key); cache.set(key,group); return group.clone();
  }
  const root=part(rootPath), buildNode=first(root.root,'build'); if(!buildNode) throw Error('No build items in 3MF.');
  const result=new THREE.Group();
  for(const item of children(buildNode,'item')) { if(item.getAttribute('printable')==='0') continue; const target=referencePath(item,rootPath), object=build(target,item.getAttribute('objectid')); object.scale.multiplyScalar(part(target).scale/root.scale); applyTransform(object,item.getAttribute('transform')); result.add(object); }
  result.scale.setScalar(root.scale); return result;
}
