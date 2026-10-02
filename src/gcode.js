// A display interpreter, never a slicer or printer controller. Coordinates are mm.
const FEATURES = ['Other', 'Outer wall', 'Inner wall', 'Infill', 'Solid infill', 'Top surface', 'Support', 'Skirt / brim', 'Bridge', 'Travel'];
const EVENT = { Retract: 0, Unretract: 1, Wipe: 2, OuterWallStart: 3 };
function featureId(name) {
  if (/outer|external perimeter|wall-outer/i.test(name)) return 1;
  if (/inner|perimeter|wall-inner/i.test(name)) return 2;
  if (/top/i.test(name)) return 5;
  if (/bridge/i.test(name)) return 8;
  if (/solid|bottom|skin/i.test(name)) return 4;
  if (/infill|fill/i.test(name)) return 3;
  if (/support/i.test(name)) return 6;
  if (/skirt|brim/i.test(name)) return 7;
  return 0;
}
function arcPoints(start, end, params, clockwise) {
  let cx, cy;
  if ('I' in params || 'J' in params) { cx = start[0] + (params.I || 0); cy = start[1] + (params.J || 0); }
  else if ('R' in params) {
    const dx = end[0] - start[0], dy = end[1] - start[1], chord = Math.hypot(dx, dy), r = Math.abs(params.R);
    if (chord < 1e-9 || chord > 2 * r + 1e-6) return null;
    const sign = (clockwise ? -1 : 1) * (params.R < 0 ? -1 : 1), h = Math.sqrt(Math.max(0, r*r - chord*chord/4));
    cx = (start[0]+end[0])/2 - sign * dy/chord*h; cy = (start[1]+end[1])/2 + sign * dx/chord*h;
  } else return null;
  const radius = Math.hypot(start[0]-cx, start[1]-cy);
  if (radius < 1e-9 || Math.abs(Math.hypot(end[0]-cx,end[1]-cy)-radius) > Math.max(0.05, radius * 0.001)) return null;
  const a = Math.atan2(start[1]-cy,start[0]-cx), b = Math.atan2(end[1]-cy,end[0]-cx);
  let sweep = b-a;
  if (clockwise) { if (sweep >= -1e-9) sweep -= 2*Math.PI; }
  else if (sweep <= 1e-9) sweep += 2*Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI/36)), Math.ceil(Math.abs(sweep)*radius/1));
  if (steps > 20000) throw new Error('Arc exceeds preview complexity limit.');
  const points = [start];
  for (let i=1; i<steps; i++) { const angle=a+sweep*i/steps; points.push([cx+radius*Math.cos(angle),cy+radius*Math.sin(angle),start[2]+(end[2]-start[2])*i/steps]); }
  points.push(end); return points;
}
function parseGcode(text, { maxSegments = 2000000 } = {}) {
  const warnings = new Set(), layers = [], positions = [], types = [], speeds = [], tools = [], lines = [], widths = [], heights = [];
  const eventPositions=[], eventKinds=[], eventIndices=[], eventLayers=[];
  let pos=[0,0,0], offset=[0,0,0], e=0, debt=0, absolute=true, eAbsolute=true, unit=1, speed=0, tool=0, feature=0, layer=null, tagged=false, pending=false, height=null, plane=17, arcAbsolute=false, beadWidth=0.45, beadHeight=null, nominalHeight=0.2;
  let wiping=false, modelTime=null, totalTime=null;
  const extruders=new Map();
  const markerPatterns=[/^CHANGE_LAYER\b/i,/^LAYER_CHANGE\b/i,/^LAYER\s*:\s*-?\d+/i,/^layer num\/total_layer_count/i];
  // Use one marker family; Bambu files may emit both CHANGE_LAYER and layer count comments.
  const layerMarker=markerPatterns.find(pattern=>new RegExp(`^\\s*;\\s*${pattern.source.slice(1)}`,'im').test(text));
  const hasTags=Boolean(layerMarker);
  function newLayer(z) { const previous=layers.at(-1); if(previous&&z-previous.z>0.02&&z-previous.z<1.2) nominalHeight=z-previous.z; layer={ number:layers.length+1, z, start:types.length, end:types.length, extrusion:0, travel:0 }; layers.push(layer); }
  function recordEvent(kind,at,index=types.length) {
    if(!layer) return;
    if(eventKinds.length>=200000) { warnings.add('Event markers limited to the first 200,000 events.'); return; }
    eventPositions.push(...at); eventKinds.push(kind); eventIndices.push(index); eventLayers.push(layer.number-1);
  }
  function append(a,b,extruding,lineNo) {
    if (Math.hypot(...b.map((v,i)=>v-a[i])) < 1e-8) return;
    if (types.length >= maxSegments) throw new Error(`Toolpath exceeds the ${maxSegments.toLocaleString('en')} segment preview limit.`);
    if(extruding&&feature===1) {
      const last=positions.length, previousOuter=types.at(-1)===1;
      const joined=previousOuter&&Math.abs(positions[last-3]-a[0])<1e-4&&Math.abs(positions[last-2]-a[1])<1e-4&&Math.abs(positions[last-1]-a[2])<1e-4;
      if(!joined) recordEvent(EVENT.OuterWallStart,a,types.length+1);
    }
    positions.push(...a,...b); types.push(extruding?feature:9); speeds.push(speed/60); tools.push(tool); lines.push(lineNo); widths.push(extruding?beadWidth:0); heights.push(extruding?(beadHeight??nominalHeight):0);
    layer.end=types.length; layer[extruding?'extrusion':'travel']++;
  }
  let lineNo=0;
  // Iterate without allocating an array of every line in a large plate.
  for (const match of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!match[0]) continue;
    lineNo++; const raw=match[0].trimEnd(), semicolon=raw.indexOf(';'), comment=semicolon>=0?raw.slice(semicolon+1).trim():'';
    const timeMatch=comment.match(/^model printing time\s*:\s*([^;]+);\s*total estimated time\s*:\s*(.+)$/i);
    if(timeMatch) { modelTime=timeMatch[1].trim().slice(0,40); totalTime=timeMatch[2].trim().slice(0,40); }
    else if(!totalTime) { const fallback=comment.match(/^estimated printing time \(normal mode\)\s*=\s*(.+)$/i); if(fallback) totalTime=fallback[1].trim().slice(0,40); }
    if(/^WIPE_START\b/i.test(comment)) wiping=true;
    if(/^WIPE_END\b/i.test(comment)) wiping=false;
    if (layerMarker?.test(comment)) {
      if (!tagged) {
        // Startup paths are omitted from this preview. Their retraction balance
        // can depend on printer-specific purge commands that we do not simulate.
        debt=0;
        for (const state of extruders.values()) state.debt=0;
      }
      tagged=true; pending=true; height=null;
    }
    const hm=comment.match(/^(?:Z_HEIGHT|Z)\s*:\s*(-?[\d.]+)/i); if (hm) height=Number(hm[1]);
    const fm=comment.match(/^(?:FEATURE|TYPE)\s*:\s*(.*)/i); if (fm) feature=featureId(fm[1]);
    const wm=comment.match(/^(?:WIDTH|LINE_WIDTH)\s*:\s*([\d.]+)/i); if(wm) { const value=Number(wm[1]); if(Number.isFinite(value)&&value>=0.02&&value<=3) beadWidth=value; }
    const bhm=comment.match(/^HEIGHT\s*:\s*([\d.]+)/i); if(bhm) { const value=Number(bhm[1]); if(Number.isFinite(value)&&value>=0.02&&value<=1.2) beadHeight=value; }
    const code=(semicolon>=0?raw.slice(0,semicolon):raw).replace(/\([^)]*\)/g,'').replace(/^\s*N\d+\s*/i,'').trim().toUpperCase();
    const cm=code.match(/^([GMT])\s*(\d+(?:\.\d+)?)/); if (!cm) continue;
    const command=cm[1]+Number(cm[2]); const p={};
    for (const m of code.slice(cm[0].length).matchAll(/([A-Z])\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/g)) p[m[1]]=Number(m[2]);
    if (command==='G90') { absolute=true; continue; } if (command==='G91') { absolute=false; continue; }
    if (command==='M82') { eAbsolute=true; continue; } if (command==='M83') { eAbsolute=false; continue; }
    if (command==='G20') { unit=25.4; continue; } if (command==='G21') { unit=1; continue; }
    if (command==='G90.1') { arcAbsolute=true; continue; } if (command==='G91.1') { arcAbsolute=false; continue; }
    if (['G17','G18','G19'].includes(command)) { plane=Number(cm[2]); continue; }
    if (command==='G92') { ['X','Y','Z'].forEach((axis,i)=>{ if (axis in p) offset[i]=pos[i]-p[axis]*unit; }); if ('E' in p) e=p.E*unit; continue; }
    if (cm[1]==='T') { if (Number(cm[2]) < 256) { extruders.set(tool,{e,debt}); tool=Number(cm[2]); ({e,debt}=extruders.get(tool)??{e:0,debt:0}); } else warnings.add('Special tool selection commands are not simulated.'); continue; }
    if(command==='G10'||command==='G11') { recordEvent(command==='G10'?EVENT.Retract:EVENT.Unretract,pos); continue; }
    if (['G28','G29','G53','G54','G55','G56','G57','G58','G59','G10','G11','M622','M623','M221','M200','M600'].includes(command)) warnings.add(`${command}: firmware behavior is not simulated; preview may differ from printer execution.`);
    if (!['G0','G1','G2','G3'].includes(command)) { if(cm[1]==='G' && !['G4','G28','G29','G53','G54','G55','G56','G57','G58','G59','G10','G11'].includes(command)) warnings.add(`${command}: unsupported G command omitted.`); continue; }
    if ('F' in p) speed=p.F*unit;
    const next=pos.map((v,i)=>{ const axis='XYZ'[i]; return axis in p ? (absolute ? p[axis]*unit+offset[i] : v+p[axis]*unit):v; });
    const nextE='E' in p ? (eAbsolute?p.E*unit:e+p.E*unit):e, delta=nextE-e, debtBefore=debt, extruding=delta-debt>1e-7;
    debt=Math.max(0,debt-delta);
    const start=pos; pos=next; e=nextE;
    // Exclude startup purge when layer tags exist, and terminal machine moves.
    if (hasTags && !tagged) continue;
    if (pending) { newLayer(height??next[2]); pending=false; }
    if (!layer) { if (!extruding) continue; newLayer(height??next[2]); }
    else if (!hasTags && extruding && Math.abs(next[2]-layer.z)>0.001) newLayer(next[2]);
    if(delta< -1e-7&&!wiping) recordEvent(EVENT.Retract,start);
    else if(delta>1e-7&&debtBefore>1e-7) recordEvent(EVENT.Unretract,start);
    if (extruding && layer.extrusion===0 && height===null) layer.z=next[2];
    let points=[start,next];
    if (command==='G2'||command==='G3') {
      if (plane!==17) { warnings.add('Non-XY arc omitted (G18/G19).'); continue; }
      const ap={}; for (const axis of ['I','J','R']) if (axis in p) ap[axis]=p[axis]*unit;
      if (arcAbsolute) { if ('I' in ap) ap.I-=start[0]; if ('J' in ap) ap.J-=start[1]; }
      points=arcPoints(start,next,ap,command==='G2');
      if (!points) { warnings.add(`Invalid arc omitted near motion ${lineNo}.`); continue; }
    }
    for (let i=1;i<points.length;i++) {
      const before=types.length; append(points[i-1],points[i],extruding,lineNo);
      if(wiping&&types.length>before) recordEvent(EVENT.Wipe,points[i]);
    }
  }
  if (!hasTags) warnings.add('No slicer layer markers: layers inferred from extrusion height; spiral and nonplanar paths may be grouped inaccurately.');
  if (!types.length || !layers.some(l=>l.extrusion)) throw new Error('No printable extrusion paths found in this plate.');
  return { layers, positions:Float32Array.from(positions), types:Uint8Array.from(types), speeds:Float32Array.from(speeds), tools:Uint16Array.from(tools), lines:Uint32Array.from(lines), widths:Float32Array.from(widths), heights:Float32Array.from(heights), eventPositions:Float32Array.from(eventPositions), eventKinds:Uint8Array.from(eventKinds), eventIndices:Uint32Array.from(eventIndices), eventLayers:Uint32Array.from(eventLayers), eventCount:eventKinds.length, modelTime, totalTime, features:FEATURES, warnings:[...warnings], segmentCount:types.length };
}
module.exports = { parseGcode, arcPoints, FEATURES, EVENT };
