// Measure adjacent passes from their XY coordinates. Comparing overlapping,
// nearly parallel segments excludes end-to-end vertices on a curved contour.
function measureIroningSpacing(layer, positions, types, tools) {
  const cellSize=0.5;
  const cells=new Map();
  const distances=[];
  for(let index=layer.start;index<layer.end;index++) {
    if(types[index]!==13) continue;
    const offset=index*6;
    const x=positions[offset], y=positions[offset+1];
    const dx=positions[offset+3]-x, dy=positions[offset+4]-y;
    const length=Math.hypot(dx,dy);
    if(length<0.4) continue;
    const ux=dx/length, uy=dy/length;
    const cx=Math.floor((x+dx/2)/cellSize), cy=Math.floor((y+dy/2)/cellSize);
    let nearest=Infinity;
    for(let gx=cx-1;gx<=cx+1;gx++) for(let gy=cy-1;gy<=cy+1;gy++) {
      for(const candidate of cells.get(`${gx},${gy}`)??[]) {
        if(candidate.tool!==tools[index]||Math.abs(candidate.z-positions[offset+2])>0.001) continue;
        if(Math.abs(ux*candidate.ux+uy*candidate.uy)<0.998) continue;
        const start=(candidate.x-x)*ux+(candidate.y-y)*uy;
        const end=start+candidate.length*(candidate.ux*ux+candidate.uy*uy);
        const overlap=Math.min(length,Math.max(start,end))-Math.max(0,Math.min(start,end));
        if(overlap<Math.min(length,candidate.length)/2) continue;
        const distance=Math.abs((candidate.x-x)*uy-(candidate.y-y)*ux);
        if(distance>0.005&&distance<cellSize) nearest=Math.min(nearest,distance);
      }
    }
    if(Number.isFinite(nearest)) distances.push(nearest);
    const key=`${cx},${cy}`;
    if(!cells.has(key)) cells.set(key,[]);
    cells.get(key).push({x,y,ux,uy,length,z:positions[offset+2],tool:tools[index]});
  }
  if(distances.length<3) return null;
  distances.sort((a,b)=>a-b);
  return distances[Math.floor(distances.length/2)];
}
module.exports={measureIroningSpacing};
