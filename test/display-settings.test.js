const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeDisplaySettings}=require('../src/display-settings');

test('legend expansion defaults to open and preserves independent collapsed sections',()=>{
  assert.deepEqual(normalizeDisplaySettings().legendExpanded,{markers:true,paths:true});
  assert.deepEqual(normalizeDisplaySettings({legendExpanded:{markers:false,paths:true}}).legendExpanded,{markers:false,paths:true});
  assert.deepEqual(normalizeDisplaySettings({legendExpanded:{markers:true,paths:false}}).legendExpanded,{markers:true,paths:false});
  assert.deepEqual(normalizeDisplaySettings({legendExpanded:{markers:'false',paths:null}}).legendExpanded,{markers:true,paths:true});
});

test('new feature filters persist without accepting Travel as a feature filter',()=>{
  const s=normalizeDisplaySettings({hiddenCategories:{feature:['1','9','10','11','12','13','14','15','16']}});
  assert.deepEqual(s.hiddenCategories.feature,['1','10','11','12','13','14','15']);
});

test('shared display settings omit file-specific layer selection',()=>{
  const settings=normalizeDisplaySettings({
    upper:55,lower:3,single:true,
    color:'speed',renderMode:'line',travel:true,
    eventVisible:{wipe:false,currentPosition:false},
    hiddenCategories:{feature:['1'],speed:['0','2'],tool:['255']}
  });
  assert.equal(settings.color,'speed');
  assert.equal(settings.renderMode,'line');
  assert.equal(settings.travel,true);
  assert.equal(settings.eventVisible.wipe,false);
  assert.equal(settings.eventVisible.currentPosition,false);
  assert.deepEqual(settings.hiddenCategories.speed,['0','2']);
  for(const key of ['upper','lower','single']) assert.equal(Object.hasOwn(settings,key),false);
});

test('invalid stored settings fall back to safe defaults',()=>{
  const settings=normalizeDisplaySettings({
    color:'invalid',renderMode:'invalid',travel:'yes',
    hiddenCategories:{feature:['2','2','100'],speed:['6','1'],tool:['-1','99999','65535']}
  });
  assert.equal(settings.color,'feature');
  assert.equal(settings.renderMode,'bead');
  assert.equal(settings.travel,false);
  assert.deepEqual(settings.hiddenCategories,{feature:['2'],speed:['1'],tool:['65535']});
  assert.deepEqual(settings.eventVisible,{retract:true,unretract:true,wipe:true,outerStart:true,currentPosition:true});
});
