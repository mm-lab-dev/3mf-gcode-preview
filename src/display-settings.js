const colors=new Set(['feature','speed','tool']);
const events=['retract','unretract','wipe','outerStart'];
const validCategory={
  feature:key=>/^[0-8]$/.test(key),
  speed:key=>/^[0-5]$/.test(key),
  tool:key=>/^\d{1,5}$/.test(key)&&Number(key)<=65535
};

function normalizeDisplaySettings(value) {
  const input=value&&typeof value==='object'?value:{};
  const hiddenCategories={};
  for(const mode of colors) {
    const keys=input.hiddenCategories?.[mode];
    hiddenCategories[mode]=Array.isArray(keys)
      ? [...new Set(keys.filter(key=>typeof key==='string'&&validCategory[mode](key)))].slice(0,256)
      : [];
  }
  return {
    color:colors.has(input.color)?input.color:'feature',
    renderMode:input.renderMode==='line'?'line':'bead',
    travel:input.travel===true,
    eventVisible:Object.fromEntries(events.map(key=>[key,input.eventVisible?.[key]!==false])),
    hiddenCategories
  };
}

module.exports={normalizeDisplaySettings};
