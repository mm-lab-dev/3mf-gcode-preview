import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadModel } from './model';
import { parseStructure } from './structure';
import { createBeadMesh, createBeadCaps, connected, writeBead, writeBeadCap, uploadBeads } from './bead';
import { translator, localizeDiagnostic } from './i18n';
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const locale=document.documentElement.lang==='ja'?'ja':'en', t=translator(locale), numberLocale=locale==='ja'?'ja-JP':'en-US';
const featureKeys=['other','outerWall','innerWall','infill','solidInfill','topSurface','support','skirtBrim','bridge','travel'];
const featureName=index=>t(featureKeys[index]||'other');
const formatNumber=value=>value.toLocaleString(numberLocale);
const palette = ['#bdc5d2','#ff9e57','#ffe16a','#bb82f4','#579eef','#ef638f','#51d3ae','#b4d45a','#f07550','#75849c'];
const toolPalette = ['#51d3ae','#ff9e57','#579eef','#ef638f','#ffe16a','#bb82f4'];
const paletteColors=palette.map(value=>new THREE.Color(value)), toolColors=toolPalette.map(value=>new THREE.Color(value)), speedColor=new THREE.Color();
const speedBands=[0,50,100,150,200,300];
const eventOptions=[['retract',0,t('retract'),'#e43dc5'],['unretract',1,t('unretract'),'#39c7e9'],['wipe',2,t('wipe'),'#e7d93a'],['outerStart',3,t('outerStart'),'#e9edf2']];
const hiddenCategories={feature:new Set(),speed:new Set(),tool:new Set()};
let data, pathObjects=[], eventObjects=[], model, animation, timer, renderer, controls, fitBox, selectedPlate=0, structurePlates=[];
let travelVisible=false;
let eventVisible={retract:true,unretract:true,wipe:true,outerStart:true};
let visibilityVersion=0;
function requestRender() { if(renderer&&animation===undefined) animation=requestAnimationFrame(render); }
function render() {
  animation=undefined;
  const moving=controls.update();
  renderer.render(scene,camera);
  if(moving) requestRender();
}
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141920');
const camera = new THREE.PerspectiveCamera(40,1,0.01,100000); camera.up.set(0,0,1);
scene.add(new THREE.HemisphereLight(0xffffff,0x667788,1.2));
const light=new THREE.DirectionalLight(0xffffff,2); light.position.set(100,-100,200); scene.add(light);
const bed=new THREE.GridHelper(200,20,0x657487,0x303b48); bed.rotation.x=Math.PI/2; bed.position.z=-0.05; scene.add(bed);
const marker = new THREE.Mesh(new THREE.SphereGeometry(0.7,12,8), new THREE.MeshBasicMaterial({color:0xffffff})); marker.visible=false; scene.add(marker);
const eventMatrix=new THREE.Matrix4();
function stop() { if(timer) clearInterval(timer); timer=undefined; $('play').textContent='▶'; $('play').setAttribute('aria-label',t('play')); }
function disposeObject(object) { scene.remove(object); object.traverse(child=>{ child.geometry?.dispose(); const materials=Array.isArray(child.material)?child.material:[child.material]; materials.forEach(material=>material?.dispose()); }); }
function clear() { stop(); pathObjects.forEach(disposeObject); pathObjects=[]; eventObjects.forEach(disposeObject); eventObjects=[]; if(model) disposeObject(model); model=undefined; data=undefined; fitBox=undefined; marker.visible=false; $('time-summary').hidden=true; ['upper','lower','upper-number','lower-number','step','play','single','color','render-mode'].forEach(id=>$(id).disabled=true); $('layer-label').textContent='—'; $('step-label').textContent='—'; $('event-legend').replaceChildren(); $('path-legend-heading').hidden=true; $('legend').replaceChildren(); document.querySelectorAll('.layer-track').forEach(track=>track.classList.remove('has-range')); requestRender(); }
function warning(messages=[]) { $('warning').hidden=!messages.length; $('warning').textContent=messages.map(message=>localizeDiagnostic(message,t,locale)).join('\n'); }
function routineGcodeWarning(message) {
  return message==='Special tool selection commands are not simulated.'
    || /^G\d+(?:\.\d+)?: unsupported G command omitted\.$/.test(message)
    || /^[GM]\d+(?:\.\d+)?: firmware behavior is not simulated; preview may differ from printer execution\.$/.test(message);
}
function status(text) { $('status').textContent=text; }
function closeStructure() { $('structure-popover').hidden=true; $('structure-toggle').setAttribute('aria-expanded','false'); }
function structureNode(name,children=[]) {
  const item=document.createElement('li');
  if(children.length) {
    const details=document.createElement('details'), summary=document.createElement('summary'), list=document.createElement('ul');
    details.open=true; summary.textContent=name;
    for(const child of children) list.append(structureNode(child.name,child.children));
    details.append(summary,list); item.append(details);
  } else {
    const label=document.createElement('span'); label.className='structure-leaf'; label.textContent=name; item.append(label);
  }
  return item;
}
function updateStructure() {
  const plate=structurePlates[selectedPlate]??structurePlates[0], tree=$('structure-tree'); tree.replaceChildren();
  const available=Boolean(plate?.objects?.length); $('structure-toggle').disabled=!available;
  if(!available) { closeStructure(); return; }
  const list=document.createElement('ul');
  list.append(structureNode(plate.name,plate.objects.map(object=>({name:object.name,children:object.parts.map(part=>({name:part.name}))}))));
  tree.append(list);
}
function resetStructure() { structurePlates=[]; $('structure-tree').replaceChildren(); $('structure-toggle').disabled=true; closeStructure(); }
function decode(value, Constructor=Uint8Array) { const raw=atob(value); const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)); return new Constructor(bytes.buffer); }
function colorFor(index) {
  if(data.types[index]===9) return paletteColors[9];
  if($('color').value==='tool') return toolColors[data.tools[index]%toolColors.length];
  if($('color').value==='speed') return speedColor.setHSL((1-Math.min(data.speeds[index]/300,1))*0.65,0.85,0.6);
  return paletteColors[data.types[index]];
}
function categoryFor(index) {
  if(data.types[index]===9) return 'travel';
  if($('color').value==='tool') return String(data.tools[index]);
  if($('color').value==='speed') { let band=0; while(band+1<speedBands.length&&data.speeds[index]>=speedBands[band+1]) band++; return String(band); }
  return String(data.types[index]);
}
function categoryVisible(key) { return key==='travel' ? travelVisible : !hiddenCategories[$('color').value].has(key); }
function updateLegend() {
  for(const button of document.querySelectorAll('#legend button,#event-legend button')) {
    const visible=button.dataset.event ? eventVisible[button.dataset.event] : categoryVisible(button.dataset.category);
    button.setAttribute('aria-pressed',String(visible));
    button.title=`${t(visible?'hide':'show')}: ${button.dataset.label}`;
    button.querySelector('.legend-state').textContent=visible?'✓':'−';
  }
}
function recolor() {
  if(!data) return;
  // Group geometry by legend item once per color mode, preserving motion order.
  pathObjects.forEach(disposeObject); pathObjects=[];
  const groups=new Map();
  for(let index=0;index<data.segmentCount;index++) { const key=categoryFor(index); if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(index); }
  for(const [category,indices] of groups) {
    const bead=category!=='travel'&&$('render-mode').value==='bead'; let object;
    if(bead) {
      object=createBeadMesh(indices.length);
      const runStarts=[0];
      for(let i=1;i<indices.length;i++) if(indices[i]!==indices[i-1]+1||!connected(data,indices[i-1],indices[i])) runStarts.push(i);
      const caps=createBeadCaps(runStarts.length*2);
      object.add(caps); Object.assign(object.userData,{runStarts,caps});
    } else {
      const positions=new Float32Array(indices.length*6), colors=new Float32Array(indices.length*6);
      indices.forEach((index,j)=>{ positions.set(data.positions.subarray(index*6,index*6+6),j*6); const c=colorFor(index); colors.set([c.r,c.g,c.b,c.r,c.g,c.b],j*6); });
      const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3)); geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      const travel=category==='travel'; object=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:travel,opacity:travel?0.35:1}));
    }
    Object.assign(object.userData,{indices,category,bead}); object.frustumCulled=false; scene.add(object); pathObjects.push(object);
  }
  $('legend').replaceChildren();
  $('path-legend-heading').hidden=false;
  const mode=$('color').value;
  const items=mode==='feature' ? data.features.slice(0,9).map((_,i)=>[String(i),featureName(i),palette[i]]) : mode==='tool' ? [...new Set(data.tools)].sort((a,b)=>a-b).map(tool=>[String(tool),t('toolLabel',tool),toolPalette[tool%toolPalette.length]]) : speedBands.map((min,i)=>[String(i),`${i+1<speedBands.length?`${min}–<${speedBands[i+1]}`:'300+'} mm/s`,new THREE.Color().setHSL((1-Math.min((min+(speedBands[i+1]??min))/2/300,1))*0.65,0.85,0.6).getStyle()]);
  items.unshift(['travel',t('travel'),palette[9]]);
  for(const [key,name,color] of items) {
    const row=document.createElement('button'), swatch=document.createElement('i'), indicator=document.createElement('span');
    row.type='button'; row.dataset.category=key; row.dataset.label=name; row.setAttribute('aria-label',name);
    swatch.style.backgroundColor=color; swatch.setAttribute('aria-hidden','true'); indicator.className='legend-state'; indicator.setAttribute('aria-hidden','true');
    row.append(swatch,document.createTextNode(name),indicator);
    row.addEventListener('click',()=>{ if(key==='travel') travelVisible=!travelVisible; else { const hidden=hiddenCategories[mode]; if(hidden.has(key)) hidden.delete(key); else hidden.add(key); } visibilityVersion++; update(); });
    $('legend').append(row);
  }
  $('event-legend').replaceChildren();
  const heading=document.createElement('strong'); heading.className='legend-heading'; heading.textContent=t('markerHeading'); $('event-legend').append(heading);
  for(const [key,,name,color] of eventOptions) {
    const row=document.createElement('button'), swatch=document.createElement('i'), indicator=document.createElement('span');
    row.type='button'; row.dataset.event=key; row.dataset.label=name; row.setAttribute('aria-label',name);
    swatch.style.backgroundColor=color; swatch.setAttribute('aria-hidden','true'); indicator.className='legend-state'; indicator.setAttribute('aria-hidden','true');
    row.append(swatch,document.createTextNode(name),indicator);
    row.addEventListener('click',()=>{ eventVisible[key]=!eventVisible[key]; update(); });
    $('event-legend').append(row);
  }
  updateLegend();
}
function createEventObjects() {
  const grouped=eventOptions.map(()=>[]);
  for(let i=0;i<data.eventCount;i++) grouped[data.eventKinds[i]]?.push(i);
  for(const [key,kind,,color] of eventOptions) {
    const indices=grouped[kind], geometry=kind===3?new THREE.OctahedronGeometry(0.3):new THREE.SphereGeometry(0.24,10,8);
    const object=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color,depthTest:true,depthWrite:true}),indices.length);
    object.count=0; object.frustumCulled=false; object.userData={kind:key,indices,orders:indices.map(i=>data.eventIndices[i])};
    scene.add(object); eventObjects.push(object);
  }
}
function fit(top=false) {
  if(!fitBox || !controls) return;
  const center=fitBox.getCenter(new THREE.Vector3()), size=fitBox.getSize(new THREE.Vector3());
  const extent=Math.max(size.x,size.y,size.z,10), distance=extent/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.5/Math.min(camera.aspect,1);
  controls.target.copy(center); camera.position.copy(center).add(top ? new THREE.Vector3(0,-0.001,distance) : new THREE.Vector3(distance*0.65,-distance*0.85,distance*0.75));
  camera.near=Math.max(distance/10000,0.001); camera.far=distance*100; camera.updateProjectionMatrix(); controls.update();
  bed.scale.setScalar(Math.max(extent/200,0.1)); bed.position.x=center.x; bed.position.y=center.y; requestRender();
}
function remember() { vscode.setState({ upper:Number($('upper').value), lower:Number($('lower').value), single:$('single').checked, travel:travelVisible, color:$('color').value, renderMode:$('render-mode').value, eventVisible, hiddenCategories:Object.fromEntries(Object.entries(hiddenCategories).map(([mode,hidden])=>[mode,[...hidden]])) }); }
function updateLayerControls(lower, upper) {
  const single=$('single').checked, count=data.layers.length;
  $('lower-control').hidden=$('lower-number-control').hidden=single;
  $('layer-slider').classList.toggle('single',single);
  $('upper-caption').textContent=t(single?'layer':'layerRange');
  $('upper-number-caption').textContent=t(single?'layer':'upper');
  $('upper').title=t(single?'displayLayer':'upperKnob');
  $('upper').setAttribute('aria-label',t(single?'displayLayer':'upperLayer'));
  $('upper-number').setAttribute('aria-label',t(single?'displayLayerNumber':'upperNumber'));
  const start=count>1?(lower-1)/(count-1)*100:0, end=count>1?(upper-1)/(count-1)*100:100;
  document.querySelectorAll('.layer-track').forEach(track=>{
    track.classList.add('has-range');
    // A collapsed range marks only the selected layer, including either endpoint.
    track.style.setProperty('--range-start',start===end?`max(0%, calc(${start}% - 2px))`:`${start}%`);
    track.style.setProperty('--range-end',start===end?`min(100%, calc(${end}% + 2px))`:`${end}%`);
  });
}
function update(changed, resetStep=false) {
  if(!data) return;
  let upper=Number($('upper').value), lower=Number($('lower').value);
  const single=$('single').checked;
  if(!single&&lower>upper) { if(changed==='lower') upper=lower; else lower=upper; }
  $('upper').value=$('upper-number').value=String(upper); $('lower').value=$('lower-number').value=String(lower);
  const displayedLower=single?upper:lower;
  updateLayerControls(displayedLower,upper);
  const low=data.layers[displayedLower-1], high=data.layers[upper-1], count=high.end-low.start;
  $('step').max=String(count); if(resetStep) $('step').value=String(count);
  const step=Math.min(Number($('step').value),count), end=low.start+step;
  $('layer-label').textContent=`${displayedLower} – ${upper} / ${data.layers.length}\nZ ${low.z.toFixed(3)} – ${high.z.toFixed(3)} mm`;
  $('step-label').textContent=`${step} / ${count}`;
  let visibleSegments=0;
  for(const object of pathObjects) {
    const indices=object.userData.indices;
    const begin=lowerBound(indices,low.start), finish=lowerBound(indices,end);
    if(object.userData.bead) {
      if(object.userData.drawStart!==begin||object.userData.drawEnd!==finish||object.userData.drawVisibilityVersion!==visibilityVersion) {
        const previousEnd=object.userData.drawEnd, first=object.userData.drawStart===begin&&previousEnd!==undefined&&finish>=previousEnd?previousEnd-begin:0;
        object.geometry.instanceCount=finish-begin;
        for(let i=first;i<object.geometry.instanceCount;i++) {
          const index=indices[begin+i];
          writeBead(object,i,index,data,colorFor(index));
        }
        if(first<object.geometry.instanceCount) uploadBeads(object,first,object.geometry.instanceCount);
        const caps=object.userData.caps, runStarts=object.userData.runStarts;
        caps.count=0;
        if(begin<finish) {
          const firstRun=Math.max(0,lowerBound(runStarts,begin+1)-1);
          for(let run=firstRun;run<runStarts.length&&runStarts[run]<finish;run++) {
            const start=Math.max(begin,runStarts[run]), stop=Math.min(finish,runStarts[run+1]??indices.length);
            const firstIndex=indices[start], lastIndex=indices[stop-1];
            if(firstIndex<=low.start||!connected(data,firstIndex-1,firstIndex)||!categoryVisible(categoryFor(firstIndex-1)))
              writeBeadCap(object,caps,caps.count++,start-begin,false,colorFor(firstIndex));
            if(lastIndex+1>=end||!connected(data,lastIndex,lastIndex+1)||!categoryVisible(categoryFor(lastIndex+1)))
              writeBeadCap(object,caps,caps.count++,stop-1-begin,true,colorFor(lastIndex));
          }
        }
        if(caps.count) { caps.instanceMatrix.needsUpdate=true; caps.instanceColor.needsUpdate=true; }
        object.userData.drawStart=begin; object.userData.drawEnd=finish;
        object.userData.drawVisibilityVersion=visibilityVersion;
      }
    } else object.geometry.setDrawRange(begin*2,(finish-begin)*2);
    object.visible=categoryVisible(object.userData.category);
    if(object.visible) visibleSegments+=finish-begin;
  }
  for(const object of eventObjects) {
    const {indices,orders,kind}=object.userData;
    const begin=lowerBound(orders,low.start), finish=upperBound(orders,end);
    let drawn=0;
    for(let i=begin;i<finish;i++) {
      const event=indices[i], layer=data.eventLayers[event];
      if(layer<displayedLower-1||layer>upper-1) continue;
      const offset=event*3;
      eventMatrix.makeTranslation(data.eventPositions[offset],data.eventPositions[offset+1],data.eventPositions[offset+2]+(kind==='outerStart'?0:0.22));
      object.setMatrixAt(drawn++,eventMatrix);
    }
    object.count=drawn; if(drawn) object.instanceMatrix.needsUpdate=true;
    object.visible=eventVisible[kind];
  }
  updateLegend();
  marker.scale.setScalar($('render-mode').value==='bead'?0.35:1);
  marker.visible=step>0&&categoryVisible(categoryFor(end-1));
  if(step>0) marker.position.fromArray(data.positions,(end-1)*6+3);
  const index=step>0?end-1:low.start, current=layerForSegment(index);
  $('details').textContent=t('visibleSegments',formatNumber(visibleSegments),current.number,formatNumber(current.extrusion),formatNumber(current.travel),featureName(data.types[index]),(data.speeds[index]??0).toFixed(1),data.tools[index]??0,data.lines[index]??'—');
  remember(); requestRender();
}
function lowerBound(a,value) { let lo=0,hi=a.length; while(lo<hi) { const mid=(lo+hi)>>>1; if(a[mid]<value) lo=mid+1; else hi=mid; } return lo; }
function upperBound(a,value) { let lo=0,hi=a.length; while(lo<hi) { const mid=(lo+hi)>>>1; if(a[mid]<=value) lo=mid+1; else hi=mid; } return lo; }
function layerForSegment(index) { let lo=0,hi=data.layers.length; while(lo<hi) { const mid=(lo+hi)>>>1; if(data.layers[mid].end<=index) lo=mid+1; else hi=mid; } return data.layers[Math.min(lo,data.layers.length-1)]; }
function showToolpath(message) {
  const saved=vscode.getState(); clear(); data=message.data; selectedPlate=message.index; $('plate').value=String(selectedPlate);
  updateStructure();
  for(const [key,Type] of Object.entries({positions:Float32Array,types:Uint8Array,speeds:Float32Array,tools:Uint16Array,lines:Uint32Array,widths:Float32Array,heights:Float32Array,eventPositions:Float32Array,eventKinds:Uint8Array,eventIndices:Uint32Array,eventLayers:Uint32Array})) data[key]=decode(data[key],Type);
  $('time-summary').hidden=false; $('model-time').textContent=data.modelTime||'—'; $('total-time').textContent=data.totalTime||'—';
  fitBox=new THREE.Box3();
  for(let i=0;i<data.segmentCount;i++) if(data.types[i]!==9) { fitBox.expandByPoint(new THREE.Vector3().fromArray(data.positions,i*6)); fitBox.expandByPoint(new THREE.Vector3().fromArray(data.positions,i*6+3)); }
  for(const id of ['upper','lower','upper-number','lower-number']) { $(id).max=String(data.layers.length); $(id).disabled=false; }
  $('upper').value=String(Math.min(saved?.upper??data.layers.length,data.layers.length)); $('lower').value=String(Math.min(saved?.lower??1,data.layers.length));
  $('single').checked=saved?.single??false; travelVisible=saved?.travel??false; $('color').value=saved?.color??'feature'; $('render-mode').value=saved?.renderMode==='line'?'line':'bead';
  eventVisible=Object.fromEntries(eventOptions.map(([key])=>[key,saved?.eventVisible?.[key]!==false]));
  for(const mode of ['feature','speed','tool']) { const keys=saved?.hiddenCategories?.[mode]; hiddenCategories[mode]=new Set(Array.isArray(keys)?keys.filter(key=>typeof key==='string'):[]); }
  ['step','play','single','color','render-mode'].forEach(id=>$(id).disabled=false); warning(data.warnings.filter(message=>!routineGcodeWarning(message))); createEventObjects(); recolor(); update('upper',true); fit();
  status(t('toolpathStatus',$('plate').selectedOptions[0]?.textContent??'',data.layers.length,formatNumber(data.segmentCount)));
}
function showModel(bytes) {
  clear(); const raw=decode(bytes); model=loadModel(raw); scene.add(model);
  fitBox=new THREE.Box3().setFromObject(model);
  if(fitBox.isEmpty()) throw new Error(t('modelEmpty'));
  fit(); status(t('modelStatus')); warning([t('modelWarning')]);
  $('details').textContent=t('modelDetails');
}
window.addEventListener('message',event=>{
  try {
    const message=event.data;
    if(message.type==='loading') { clear(); resetStructure(); warning(); status(t('loading')); $('plate').disabled=true; }
    if(message.type==='archive') { $('plate').replaceChildren(); message.plates.forEach((name,index)=>{ const option=document.createElement('option'); option.value=String(index); option.textContent=name; $('plate').append(option); }); $('plate').disabled=message.plates.length<2; structurePlates=parseStructure(message.structure,message.plates,locale); selectedPlate=0; updateStructure(); status(t('loadingFile',message.filename)); }
    if(message.type==='toolpath') showToolpath(message);
    if(message.type==='model') showModel(message.bytes);
    if(message.type==='error') { clear(); status(t('readError')); warning([message.message]); }
  } catch(error) { clear(); status(t('displayError')); warning([error.message]); }
});
for(const id of ['upper','lower']) $(id).addEventListener('input',()=>{ stop(); update(id,true); });
// The rail itself picks the nearest knob. Native thumbs retain keyboard/drag behavior.
let railDrag;
function railValue(event) {
  const rect=document.querySelector('.layer-track').getBoundingClientRect(), fraction=Math.max(0,Math.min(1,(rect.bottom-event.clientY)/Math.max(rect.height,1)));
  return Math.round(1+fraction*(data.layers.length-1));
}
function moveRail(event) { if(!data||!railDrag) return; $(railDrag).value=String(railValue(event)); stop(); update(railDrag,true); }
$('layer-rail').addEventListener('pointerdown',event=>{
  if(!data||event.button!==0||event.target.tagName==='INPUT') return;
  event.preventDefault(); const value=railValue(event), upper=Number($('upper').value), lower=Number($('lower').value);
  railDrag=$('single').checked?'upper':Math.abs(value-upper)<Math.abs(value-lower)?'upper':Math.abs(value-upper)>Math.abs(value-lower)?'lower':event.clientX>document.querySelector('.layer-track').getBoundingClientRect().left?'upper':'lower';
  $(railDrag).focus(); $('layer-rail').setPointerCapture(event.pointerId); moveRail(event);
});
$('layer-rail').addEventListener('pointermove',moveRail);
for(const type of ['pointerup','pointercancel','lostpointercapture']) $('layer-rail').addEventListener(type,()=>{railDrag=undefined;});
for(const side of ['upper','lower']) $(`${side}-number`).addEventListener('change',()=>{ if(!data) return; const value=Number($(`${side}-number`).value); $(side).value=String(Number.isFinite(value)?Math.max(1,Math.min(data.layers.length,Math.round(value))):1); stop(); update(side,true); });
$('single').addEventListener('change',()=>{ stop(); update($('single').checked?'upper':'lower',true); });
$('color').addEventListener('change',()=>{ recolor(); update(); });
$('render-mode').addEventListener('change',()=>{ stop(); recolor(); update(); });
$('step').addEventListener('input',()=>{ stop(); update(); });
$('fit').addEventListener('click',()=>fit()); $('top').addEventListener('click',()=>fit(true)); $('iso').addEventListener('click',()=>fit());
$('reload').addEventListener('click',()=>vscode.postMessage({type:'reload'}));
$('structure-toggle').addEventListener('click',()=>{ const opening=$('structure-popover').hidden; $('structure-popover').hidden=!opening; $('structure-toggle').setAttribute('aria-expanded',String(opening)); if(opening) $('structure-tree').querySelector('summary')?.focus(); });
document.addEventListener('pointerdown',event=>{ if(!$('structure-popover').hidden&&!$('structure-popover').contains(event.target)&&event.target!==$('structure-toggle')) closeStructure(); });
document.addEventListener('keydown',event=>{ if(event.key==='Escape'&&!$('structure-popover').hidden) { closeStructure(); $('structure-toggle').focus(); } });
$('plate').addEventListener('change',()=>{ selectedPlate=Number($('plate').value); clear(); updateStructure(); warning(); status(t('plateParsing')); vscode.postMessage({type:'plate',index:selectedPlate}); });
$('play').addEventListener('click',()=>{
  if(!data) return;
  if(timer) { stop(); return; }
  if(Number($('step').value)>=Number($('step').max)) { $('step').value='0'; update(); }
  const upper=Number($('upper').value), lower=$('single').checked?upper:Number($('lower').value);
  const start=data.layers[lower-1].start, ticksPerLayer=Math.max(6,Math.ceil(200/(upper-lower+1)));
  $('play').textContent='⏸'; $('play').setAttribute('aria-label',t('pause'));
  timer=setInterval(()=>{
    if(animation!==undefined) return;
    const step=Number($('step').value), layer=layerForSegment(start+step);
    const advance=Math.max(1,Math.ceil((layer.end-layer.start)/ticksPerLayer));
    const next=Math.min(step+advance,layer.end-start,Number($('step').max));
    $('step').value=String(next); update(); if(next>=Number($('step').max)) stop();
  },30);
});
try {
  renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); $('viewport').prepend(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true;
  controls.addEventListener('change',requestRender);
  const observer=new ResizeObserver(()=>{ const width=$('viewport').clientWidth,height=$('viewport').clientHeight; renderer.setSize(width,height); camera.aspect=width/Math.max(height,1); camera.updateProjectionMatrix(); requestRender(); }); observer.observe($('viewport'));
  requestRender();
  renderer.domElement.addEventListener('webglcontextlost',event=>{ event.preventDefault(); stop(); status(t('webglLost')); });
  window.addEventListener('unload',()=>{ stop(); cancelAnimationFrame(animation); observer.disconnect(); controls.dispose(); renderer.dispose(); });
  vscode.postMessage({type:'ready'});
} catch(error) { status(t('webglStartError')); warning([t('webglRequired',error.message)]); }
