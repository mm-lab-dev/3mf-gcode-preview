const { chromium }=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {getHtml}=require('../src/html');
const {parseGcode}=require('../src/gcode');
const {sliced,modelArchive,modelSettings}=require('./fixtures');
const {createHash}=require('node:crypto');
const {PNG}=require('pngjs');
const {zipSync,unzipSync,strToU8}=require('fflate');
function greenPixels(buffer) { const png=PNG.sync.read(buffer); let count=0; for(let i=0;i<png.data.length;i+=4) if(png.data[i+1]>70&&png.data[i+1]>png.data[i]*1.3&&png.data[i+1]>png.data[i+2]*1.1) count++; return count; }
function orangePixels(buffer) { const png=PNG.sync.read(buffer); let count=0; for(let i=0;i<png.data.length;i+=4) if(png.data[i]>100&&png.data[i]>png.data[i+1]*1.25&&png.data[i+1]>png.data[i+2]*1.15) count++; return count; }
function markerPixels(buffer,kind) {
  const png=PNG.sync.read(buffer); let count=0;
  for(let i=0;i<png.data.length;i+=4) {
    const r=png.data[i],g=png.data[i+1],b=png.data[i+2];
    if(kind==='retract'&&r>130&&b>130&&g<110) count++;
    if(kind==='unretract'&&b>130&&g>130&&r<110) count++;
    if(kind==='wipe'&&r>130&&g>r*.88&&b<110) count++;
    if(kind==='white'&&r>210&&g>210&&b>210&&Math.max(r,g,b)-Math.min(r,g,b)<15) count++;
  }
  return count;
}
const orangeComponents=buffer=>colorComponents(buffer);
function colorComponents(buffer,kind='orange') {
  const png=PNG.sync.read(buffer), mask=new Uint8Array(png.width*png.height), sizes=[];
  for(let i=0;i<mask.length;i++) { const p=i*4,r=png.data[p],g=png.data[p+1],b=png.data[p+2]; if(kind==='wipe'?r>180&&g>150&&g>r*.88&&b<110:r>100&&r>g*1.25&&g>b*1.15) mask[i]=1; }
  for(let i=0;i<mask.length;i++) {
    if(!mask[i]) continue;
    let size=0; const stack=[i]; mask[i]=0;
    while(stack.length) {
      const point=stack.pop(), x=point%png.width, y=Math.floor(point/png.width); size++;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx, ny=y+dy;
        if(nx<0||nx>=png.width||ny<0||ny>=png.height) continue;
        const next=ny*png.width+nx;
        if(mask[next]) { mask[next]=0; stack.push(next); }
      }
    }
    if(size>20) sizes.push(size);
  }
  return sizes.sort((a,b)=>b-a);
}
function trackIsGreen(buffer,fractionFromTop) { const png=PNG.sync.read(buffer), offset=(Math.floor(png.height*fractionFromTop)*png.width+Math.floor(png.width/2))*4; return png.data[offset+1]>png.data[offset]*1.3&&png.data[offset+1]>png.data[offset+2]*1.1; }
function packed(text) { const data=parseGcode(text); for(const key of ['positions','types','sourceTypes','speeds','tools','lines','widths','displayWidths','heights','dimensionSources','eventPositions','eventKinds','eventIndices','eventLayers']) data[key]=Buffer.from(data[key].buffer).toString('base64'); return data; }
async function main() {
  const server=http.createServer((req,res)=>{
    if(req.url==='/'||req.url==='/en') { res.setHeader('Content-Type','text/html'); res.end(getHtml({scriptUri:'/webview.js',styleUri:'/webview.css',cspSource:"'self'",nonce:'test-nonce',language:req.url==='/en'?'en-US':'ja-JP'})); }
    else if(['/webview.js','/webview.css'].includes(req.url)) {
      res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');
      const file=req.url==='/webview.js'&&process.env.WEBVIEW_JS_PATH ? process.env.WEBVIEW_JS_PATH : path.join(__dirname,'../dist',req.url.slice(1));
      res.end(fs.readFileSync(file));
    }
    else { res.statusCode=404; res.end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    fs.mkdirSync('test-results',{recursive:true});
    browser=await chromium.launchPersistentContext(path.resolve('test-results/ui-profile'),{headless:true,viewport:{width:1200,height:850},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{ if(message.type()==='error'&&/THREE.WebGLProgram|GL_INVALID|GLSL/.test(message.text())) errors.push(message.text()); });
    await page.addInitScript(()=>{
      let state; window.sent=[]; window.__webglDraws=0;
      window.acquireVsCodeApi=()=>({postMessage:message=>window.sent.push(message),getState:()=>state,setState:value=>{state=value;}});
      for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]) for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
        const original=proto[name]; if(!original) continue;
        proto[name]=function(...args) { window.__webglDraws++; return original.apply(this,args); };
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.title(),'3MF G-code Preview');
    await page.waitForFunction(()=>window.sent.some(m=>m.type==='ready'));
    const send=message=>page.evaluate(message=>window.dispatchEvent(new MessageEvent('message',{data:message})),message);
    await send({type:'archive',plates:['Metadata/plate_1.gcode','Metadata/plate_2.gcode'],structure:{settings:modelSettings.replace('<metadata key="object_id" value="5"/>','<metadata key="object_id" value="5"/><metadata key="instance_id" value="A"/>'),projectSettings:JSON.stringify({layer_height:'0.2',filament_temperature:['220','225']}),sliceInfo:'<config><plate><metadata key="index" value="1"/><metadata key="nozzle_diameters" value="0.4"/></plate></config>'},filename:'in-memory.gcode.3mf'});
    await send({type:'toolpath',index:0,data:packed(sliced)});
    const routineGcode='M83\nT1000\nG389\nG28\nM622 J1\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\nG0 X0 Y0 Z0.2\nG1 X5 E0.2\nM623';
    assert.ok(parseGcode(routineGcode).warnings.length>0,'parser retains unsupported-command diagnostics');
    await send({type:'toolpath',index:0,data:packed(routineGcode)});
    assert.equal(await page.locator('#warning').isHidden(),true,'routine unsupported-command notices stay out of the preview');
    await send({type:'toolpath',index:0,data:packed(`${routineGcode}\nG2 X8 Y0 E0.2`)});
    assert.match(await page.locator('#warning').innerText(),/円弧を表示できませんでした/,'omitted printable geometry remains visible as a warning');
    assert.doesNotMatch(await page.locator('#warning').innerText(),/unsupported G command|firmware behavior|Special tool selection/);
    await send({type:'toolpath',index:0,data:packed(sliced)});
    await page.locator('#upper-number').fill('3'); await page.locator('#upper-number').press('Tab');
    assert.equal(await page.locator('#event-legend-heading').innerText(),'操作マーカー');
    assert.equal(await page.locator('#path-legend-heading').innerText(),'経路');
    const eventHeadingBounds=await page.locator('#event-legend-heading').boundingBox();
    const pathHeadingBounds=await page.locator('#path-legend-heading').boundingBox();
    const pathListBounds=await page.locator('#legend').boundingBox();
    assert.ok(eventHeadingBounds.y<pathHeadingBounds.y&&pathHeadingBounds.y<pathListBounds.y,'marker and path headings must separate their lists');
    const beforeCollapse=await page.locator('canvas').screenshot();
    const markerStates=await page.locator('#event-legend button').evaluateAll(rows=>rows.map(row=>row.getAttribute('aria-pressed')));
    await page.locator('#event-legend-heading').click();
    assert.equal(await page.locator('#event-section').evaluate(el=>el.open),false);
    assert.equal(await page.locator('#event-legend button').first().isVisible(),false);
    assert.equal(await page.locator('#legend button').first().isVisible(),true,'lists collapse independently');
    await page.locator('#path-legend-heading').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#legend button').first().isVisible(),false);
    assert.deepEqual(await page.locator('canvas').screenshot(),beforeCollapse,'collapsing lists preserves the rendered paths and markers');
    await page.waitForFunction(()=>window.sent.filter(m=>m.type==='displaySettingsChanged').at(-1)?.settings.legendExpanded.paths===false);
    const collapsedSettings=await page.evaluate(()=>window.sent.filter(m=>m.type==='displaySettingsChanged').at(-1).settings);
    assert.deepEqual(collapsedSettings.legendExpanded,{markers:false,paths:false});
    await send({type:'toolpath',index:0,data:packed(sliced)});
    assert.equal(await page.locator('#event-section').evaluate(el=>el.open),false,'plate reload preserves collapsed sections');
    await page.locator('#color').selectOption('speed');
    assert.equal(await page.locator('#path-section').evaluate(el=>el.open),false,'changing color mode preserves collapsed sections');
    await send({type:'displaySettings',settings:{...collapsedSettings,legendExpanded:{markers:true,paths:false}}});
    assert.equal(await page.locator('#event-legend button').first().isVisible(),true,'saved settings restore each section independently');
    assert.deepEqual(await page.locator('#event-legend button').evaluateAll(rows=>rows.map(row=>row.getAttribute('aria-pressed'))),markerStates,'expanding preserves marker visibility');
    await page.locator('#path-legend-heading').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#legend button').first().isVisible(),true);
    await page.locator('#color').selectOption('feature');
    await page.screenshot({path:'test-results/expandable-legends.png'});
    const viewportWidth=(await page.locator('#viewport').boundingBox()).width;
    const viewportBox=await page.locator('#viewport').boundingBox(), fullRailBox=await page.locator('.layer-track').boundingBox(), panelBox=await page.locator('#layers').boundingBox();
    assert.ok(fullRailBox.x>viewportBox.x+viewportBox.width&&fullRailBox.x<panelBox.x,'full-height layer rail sits between the preview and settings panel');
    assert.ok(fullRailBox.height>viewportBox.height-80,`layer rail should span the preview height: ${fullRailBox.height} vs ${viewportBox.height}`);
    const structureButton=page.getByRole('button',{name:'構成',exact:true});
    await structureButton.click();
    assert.equal(await structureButton.getAttribute('aria-expanded'),'true');
    assert.match(await page.locator('#structure-tree').innerText(),/プロジェクト[\s\S]*プレート 1[\s\S]*spool_case_body[\s\S]*body_bottom[\s\S]*body_text/);
    assert.equal((await page.locator('#viewport').boundingBox()).width,viewportWidth,'structure popup must not narrow the viewport');
    assert.equal(await page.locator('.structure-select[aria-current=true]').innerText(),'プロジェクト');
    assert.match(await page.locator('#parameters-rows').innerText(),/プロジェクト設定[\s\S]*layer_height[\s\S]*0\.2/);
    const rootExpand=page.locator('.structure-expand').first();
    await rootExpand.click(); assert.equal(await rootExpand.getAttribute('aria-expanded'),'false');
    await rootExpand.click(); assert.equal(await rootExpand.getAttribute('aria-expanded'),'true');
    await page.locator('.structure-select[data-key="plate:0"]').click();
    assert.match(await page.locator('#parameters-rows').innerText(),/スライス情報[\s\S]*nozzle_diameters[\s\S]*0\.4/);
    assert.doesNotMatch(await page.locator('#parameters-rows').innerText(),/layer_height/,'plate table excludes project settings');
    await page.locator('.structure-select[data-key="object:0:0"]').click();
    assert.match(await page.locator('#parameters-rows').innerText(),/spool_case_body/);
    assert.match(await page.locator('#parameters-rows').innerText(),/instance_id[\s\S]*A/);
    await page.locator('.structure-select[data-key="object:1:0"]').click();
    assert.doesNotMatch(await page.locator('#parameters-rows').innerText(),/instance_id/,'instance values remain with their plate');
    await page.locator('.structure-select[data-key="part:0:0:0"]').click();
    assert.match(await page.locator('#parameters-rows').innerText(),/body_bottom/);
    assert.doesNotMatch(await page.locator('#parameters-rows').innerText(),/body_text/,'part table excludes sibling part');
    await page.locator('.structure-select[data-key="part:1:0:0"]').click();
    assert.match(await page.locator('#parameters-rows').innerText(),/body_bottom/,'shared object settings are available from another plate');
    await page.locator('.structure-select[data-key="part:0:0:0"]').click();
    await page.screenshot({path:'test-results/parameters.png'});
    await page.locator('.structure-select[data-key="project"]').click();
    await page.locator('#parameters-filter').fill('225');
    assert.match(await page.locator('#parameters-rows').innerText(),/filament_temperature/,'value search includes array values');
    assert.doesNotMatch(await page.locator('#parameters-rows').innerText(),/layer_height/);
    await page.locator('.structure-select[data-key="plate:0"]').click();
    assert.equal(await page.locator('#parameters-filter').inputValue(),'225','tree selection preserves the keyword');
    assert.match(await page.locator('#parameters-empty').innerText(),/一致するパラメータ/);
    await page.locator('.structure-select[data-key="project"]').click();
    assert.equal(await page.locator('#parameters-filter').inputValue(),'225');
    assert.match(await page.locator('#parameters-rows').innerText(),/filament_temperature/);
    await page.locator('#parameters-filter').fill('not-a-parameter');
    assert.equal(await page.locator('#parameters-rows tr').count(),0);
    assert.match(await page.locator('#parameters-empty').innerText(),/一致するパラメータ/);
    await page.keyboard.press('Escape'); assert.equal(await structureButton.getAttribute('aria-expanded'),'false');
    assert.equal(await structureButton.evaluate(el=>document.activeElement===el),true);
    assert.match(await page.locator('#status').innerText(),/3 層/);
    assert.equal(await page.locator('#model-time').innerText(),'—');
    assert.equal(await page.locator('#total-time').innerText(),'—');
    assert.equal(await page.locator('#upper').inputValue(),'3');
    assert.equal(await page.locator('#render-mode').inputValue(),'bead');
    await page.waitForTimeout(250);
    fs.mkdirSync('test-results',{recursive:true});
    await page.screenshot({path:'test-results/layers.png'});
    const beadImage=await page.locator('canvas').screenshot(), beadOrange=orangePixels(beadImage);
    await page.locator('#top').click(); await page.screenshot({path:'test-results/bead-top.png'}); await page.locator('#iso').click();
    await page.locator('#render-mode').selectOption('line'); assert.equal(await page.evaluate(()=>window.sent.filter(m=>m.type==='displaySettingsChanged').at(-1)?.settings.renderMode),'line');
    const lineImage=await page.locator('canvas').screenshot(), lineOrange=orangePixels(lineImage);
    assert.ok(beadOrange>lineOrange*1.5,`opaque bead preview must draw a visibly thicker path: ${beadOrange} vs ${lineOrange} orange pixels`);
    await page.screenshot({path:'test-results/line-mode.png'});
    await send({type:'toolpath',index:0,data:packed(sliced)}); assert.equal(await page.locator('#render-mode').inputValue(),'line','line mode survives preview reload');
    await page.locator('#render-mode').selectOption('bead');
    const overlappingParts='M83\nT1\nG1 E-3\nG130 O0 E20\n; CHANGE_LAYER\n; Z_HEIGHT: .2\nG1 E-.3\nG1 E.3\n; FEATURE: Bottom surface\nG0 X0 Y0 Z.2\nG1 X5 E.2\nT0\nG0 X0 Y2\nG1 X5 E.2';
    await send({type:'toolpath',index:0,data:packed(overlappingParts)});
    await page.locator('#color').selectOption('tool'); await page.locator('#top').click();
    const partsImage=await page.locator('canvas').screenshot();
    assert.ok(orangePixels(partsImage)>20,'first printed part must be visible after startup purge');
    assert.ok(greenPixels(partsImage)>20,'second printed part must remain visible');
    await page.locator('#color').selectOption('feature');
    await send({type:'toolpath',index:0,data:packed(sliced)});
    await page.locator('#upper-number').fill('3'); await page.locator('#upper-number').press('Tab');
    const slicedData=parseGcode(sliced), stepInput=page.locator('#step');
    assert.equal(Number(await stepInput.getAttribute('max')),slicedData.segmentCount,'range progress covers every selected layer');
    await stepInput.evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input'));});
    assert.match(await page.locator('#details').innerText(),/^表示 0 セグメント \| 層 1:/);
    assert.equal(orangePixels(await page.locator('canvas').screenshot()),0,'all selected layers disappear at playback start');
    await stepInput.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input'));},slicedData.layers[0].end);
    assert.match(await page.locator('#details').innerText(),/\| 層 1:/);
    assert.ok(orangePixels(await page.locator('canvas').screenshot())>20,'the first layer is visible before crossing the boundary');
    await stepInput.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input'));},slicedData.layers[0].end+1);
    assert.match(await page.locator('#details').innerText(),/^表示 5 セグメント \| 層 2:/);
    assert.ok(orangePixels(await page.locator('canvas').screenshot())>20,'completed lower layers remain visible as printing accumulates');
    await stepInput.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input'));},slicedData.layers[1].end);
    assert.match(await page.locator('#details').innerText(),/\| 層 2:/);
    await stepInput.evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input'));});
    assert.match(await page.locator('#details').innerText(),/\| 層 3:/);
    await stepInput.evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input'));});
    await page.locator('#play').click(); await page.waitForTimeout(90); await page.getByRole('button',{name:'経路を一時停止'}).click();
    const pausedStep=Number(await stepInput.inputValue()); assert.ok(pausedStep>0&&pausedStep<slicedData.segmentCount,'range playback pauses between layers');
    await page.waitForTimeout(90); assert.equal(Number(await stepInput.inputValue()),pausedStep,'paused progress stays fixed');
    await page.locator('#play').click(); await page.waitForTimeout(700); assert.equal(Number(await stepInput.inputValue()),slicedData.segmentCount,'range playback reaches the final layer');
    async function dragKnob(side,from,to) {
      const box=await page.locator('.layer-track').boundingBox(), x=box.x+box.width/2+(side==='upper'?16:-16);
      const y=layer=>box.y+box.height*(1-(layer-1)/2);
      await page.mouse.move(x,y(from)); await page.mouse.down(); await page.mouse.move(x,y(to),{steps:8}); await page.mouse.up();
    }
    await dragKnob('upper',3,2); assert.equal(await page.locator('#upper').inputValue(),'2'); assert.equal(await page.locator('#lower').inputValue(),'1');
    assert.match(await page.locator('#details').innerText(),/^表示 9 セグメント/,'changing the layer range restores the full selected-range view');
    await dragKnob('lower',1,2); assert.equal(await page.locator('#lower').inputValue(),'2');
    // Even when both values coincide, each knob must remain individually draggable.
    await dragKnob('upper',2,3); assert.equal(await page.locator('#upper').inputValue(),'3'); assert.equal(await page.locator('#lower').inputValue(),'2');
    assert.equal(Number(await stepInput.getAttribute('max')),slicedData.layers[2].end-slicedData.layers[1].start,'selected subrange excludes earlier layers');
    await stepInput.evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input'));}); assert.match(await page.locator('#details').innerText(),/^表示 0 セグメント \| 層 2:/);
    await stepInput.evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input'));});
    await dragKnob('lower',2,1); assert.equal(await page.locator('#lower').inputValue(),'1');
    await page.locator('#lower').focus(); await page.keyboard.press('ArrowUp'); assert.equal(await page.locator('#lower').inputValue(),'2'); assert.equal(await page.locator('#upper').inputValue(),'3'); await page.keyboard.press('ArrowDown');
    const railBox=await page.locator('.layer-track').boundingBox(); await page.mouse.click(railBox.x+railBox.width/2,railBox.y+railBox.height*.1); assert.equal(await page.locator('#upper').inputValue(),'3');
    const before=await page.locator('canvas').screenshot();
    await page.locator('#upper').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input'));});
    assert.match(await page.locator('#layer-label').innerText(),/1 – 2/);
    assert.equal(await page.locator('.layer-track').count(),1,'both knobs must share one rail');
    const track=await page.locator('.layer-track').screenshot(); assert.equal(trackIsGreen(track,.25),false,'layers above selected upper bound must be gray'); assert.equal(trackIsGreen(track,.75),true,'selected layer interval must be green');
    await page.screenshot({path:'test-results/layer-range.png'});
    const after=await page.locator('canvas').screenshot();
    assert.notEqual(createHash('sha256').update(before).digest('hex'),createHash('sha256').update(after).digest('hex'),'layer selection must change the rendered image');
    await page.locator('#lower').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input'));});
    assert.equal(await page.locator('#upper').inputValue(),'3');
    await page.locator('#lower').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input'));});
    const rangeRail=await page.locator('.layer-track').boundingBox();
    function assertSameRail(actual) { assert.ok(Math.abs(actual.height-rangeRail.height)<1,`layer rail height changed: ${rangeRail.height} → ${actual.height}`); assert.ok(Math.abs(actual.y-rangeRail.y)<1,`layer rail position changed: ${rangeRail.y} → ${actual.y}`); }
    await page.locator('#single').check(); assert.equal(await page.locator('#lower').inputValue(),'2'); assert.match(await page.locator('#layer-label').innerText(),/3 – 3/);
    assertSameRail(await page.locator('.layer-track').boundingBox());
    assert.equal(await page.locator('#lower-control').isVisible(),false); assert.equal(await page.locator('#lower-number-control').isVisible(),false); assert.equal(await page.locator('.vertical input:visible').count(),1);
    const singleTrack=await page.locator('.layer-track').screenshot(); assert.equal(trackIsGreen(singleTrack,.25),false); assert.equal(trackIsGreen(singleTrack,.75),false);
    await page.locator('#upper-number').fill('1'); await page.locator('#upper-number').press('Tab'); assert.equal(await page.locator('#lower').inputValue(),'2'); assert.match(await page.locator('#layer-label').innerText(),/1 – 1/);
    assertSameRail(await page.locator('.layer-track').boundingBox());
    await page.locator('#upper').focus(); await page.keyboard.press('ArrowUp'); assert.equal(await page.locator('#upper').inputValue(),'2'); assert.equal(await page.locator('#lower').inputValue(),'2'); await page.keyboard.press('ArrowDown'); assert.equal(await page.locator('#upper').inputValue(),'1');
    assert.equal(await page.evaluate(()=>window.acquireVsCodeApi().getState().lower),2,'saved range lower bound survives single-layer changes');
    await send({type:'toolpath',index:0,data:packed(sliced)}); assert.equal(await page.locator('#lower').inputValue(),'2'); assert.equal(await page.locator('#upper').inputValue(),'1');
    await page.locator('#single').uncheck(); assert.equal(await page.locator('.vertical input:visible').count(),2); assert.equal(await page.locator('#lower-number-control').isVisible(),true); assert.equal(await page.locator('#lower').inputValue(),'2'); assert.equal(await page.locator('#upper').inputValue(),'2'); assertSameRail(await page.locator('.layer-track').boundingBox());
    await page.locator('#single').check(); await page.locator('#single').uncheck(); assert.equal(await page.locator('#lower').inputValue(),'2','repeated toggles must retain the lower bound');
    await page.locator('#lower-number').fill('1'); await page.locator('#lower-number').press('Tab'); await page.locator('#upper-number').fill('1'); await page.locator('#upper-number').press('Tab'); await page.locator('#single').check();
    await page.locator('#step').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input'));}); assert.match(await page.locator('#step-label').innerText(),/^2 \/ /);
    const travelButton=page.getByRole('button',{name:'移動',exact:true});
    assert.equal(await page.locator('#travel').count(),0,'Travel has one control in the legend');
    const travelBounds=await travelButton.boundingBox(), legendBounds=await page.locator('#legend').boundingBox(); assert.ok(travelBounds.y>=legendBounds.y&&travelBounds.y+travelBounds.height<=legendBounds.y+legendBounds.height,`Travel toggle stays visible at the top of the legend: ${JSON.stringify({travelBounds,legendBounds})}`);
    await travelButton.click(); assert.equal(await travelButton.getAttribute('aria-pressed'),'true'); assert.equal(await page.evaluate(()=>window.sent.filter(m=>m.type==='displaySettingsChanged').at(-1)?.settings.travel),true);
    await page.locator('#color').selectOption('speed'); assert.match(await page.locator('#legend').innerText(),/100–<150/); assertSameRail(await page.locator('.layer-track').boundingBox()); assert.equal(await travelButton.getAttribute('aria-pressed'),'true');
    await page.locator('#color').selectOption('tool'); assert.match(await page.locator('#legend').innerText(),/ツール 0/); assertSameRail(await page.locator('.layer-track').boundingBox());
    await page.locator('#top').click(); await page.locator('#iso').click(); await page.locator('#fit').click();
    await page.locator('#play').click(); await page.waitForTimeout(400); assert.equal(await page.locator('#step').inputValue(),await page.locator('#step').getAttribute('max'));
    const legendButton=name=>page.getByRole('button',{name,exact:true});
    async function visibleCount() { const text=await page.locator('#details').innerText(); return Number(text.match(/^表示 ([\d,]+)/)[1].replaceAll(',','')); }
    await page.locator('#color').selectOption('feature'); assert.equal(await visibleCount(),7);
    const outer=legendButton('外壁'); await outer.click(); assert.equal(await outer.getAttribute('aria-pressed'),'false'); assert.equal(await visibleCount(),3);
    await legendButton('インフィル').click(); assert.equal(await visibleCount(),2);
    await legendButton('移動').click(); assert.equal(await travelButton.getAttribute('aria-pressed'),'false'); assert.equal(await page.evaluate(()=>window.sent.filter(m=>m.type==='displaySettingsChanged').at(-1)?.settings.travel),false); assert.equal(await visibleCount(),0);
    await outer.focus(); await page.keyboard.press('Enter'); assert.equal(await outer.getAttribute('aria-pressed'),'true'); assert.equal(await visibleCount(),4);
    await legendButton('インフィル').click(); assert.equal(await visibleCount(),5);
    await page.locator('#color').selectOption('speed');
    await legendButton('0–<50 mm/s').click(); assert.equal(await visibleCount(),1);
    await legendButton('100–<150 mm/s').click(); assert.equal(await visibleCount(),0);
    await page.locator('#color').selectOption('feature'); assert.equal(await visibleCount(),5,'color modes must keep separate visibility filters');
    await page.locator('#color').selectOption('speed'); assert.equal(await visibleCount(),0,'speed filter survives a color mode change');
    await legendButton('0–<50 mm/s').click(); await legendButton('100–<150 mm/s').click(); assert.equal(await visibleCount(),5);
    await page.locator('#color').selectOption('tool');
    assert.ok(greenPixels(await page.locator('canvas').screenshot())>0);
    await legendButton('ツール 0').click(); assert.equal(await visibleCount(),0); assert.equal(greenPixels(await page.locator('canvas').screenshot()),0,'hidden tool must disappear from the actual WebGL image');
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab'); assert.equal(await visibleCount(),0,'layer selection must preserve the hidden tool');
    await page.locator('#step').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input'));}); assert.equal(await visibleCount(),0,'path progress must preserve the hidden tool');
    await legendButton('ツール 0').click(); assert.equal(await visibleCount(),1,'restoring a tool must respect current path progress and travel visibility');
    await page.locator('#upper-number').fill('1'); await page.locator('#upper-number').press('Tab');
    await page.locator('#color').selectOption('feature'); await legendButton('外壁').click(); assert.equal(await visibleCount(),1);
    await page.screenshot({path:'test-results/legend-filter.png'});
    await page.locator('#plate').selectOption('1'); assert.ok(await page.evaluate(()=>window.sent.some(m=>m.type==='plate'&&m.index===1)));
    await structureButton.click(); assert.equal(await page.locator('.structure-select[aria-current=true]').innerText(),'プレート 2'); await page.locator('#fit').click(); assert.equal(await structureButton.getAttribute('aria-expanded'),'false','outside click closes structure popup');
    await send({type:'toolpath',index:1,data:packed(sliced)}); assert.equal(await page.locator('#plate').inputValue(),'1');
    assert.equal(await legendButton('外壁').getAttribute('aria-pressed'),'false'); assert.equal(await travelButton.getAttribute('aria-pressed'),'false'); assert.equal(await visibleCount(),1,'legend filters survive a plate reload');
    await legendButton('外壁').click();
    await page.locator('#reload').click(); assert.ok(await page.evaluate(()=>window.sent.some(m=>m.type==='reload')));
    const plainModel=modelArchive(), modelXml=Buffer.from(unzipSync(plainModel)['3D/3dmodel.model']).toString('utf8');
    await send({type:'loading'}); await send({type:'archive',plates:[],structure:{model:modelXml},filename:'model.3mf'});
    await send({type:'model',bytes:Buffer.from(modelArchive()).toString('base64')});
    assert.equal(await page.locator('#path-legend-heading').isHidden(),true,'path heading is hidden when no toolpath exists');
    await structureButton.click(); assert.match(await page.locator('#structure-tree').innerText(),/プロジェクト[\s\S]*プレート 1[\s\S]*オブジェクト 1/); assert.equal(await page.locator('#parameters-filter').inputValue(),'','new 3MF clears the previous keyword'); assert.match(await page.locator('#parameters-empty').innerText(),/表示できるパラメータはありません/); await page.keyboard.press('Escape');
    assert.match(await page.locator('#status').innerText(),/3Dモデル表示/); assert.match(await page.locator('#warning').innerText(),/G-codeがありません/); assert.equal(await page.locator('#upper').isDisabled(),true);
    assert.ok(greenPixels(await page.locator('canvas').screenshot())>5000,'mesh must render a lit, colored surface');
    await page.screenshot({path:'test-results/model.png'});
    const parts=unzipSync(modelArchive());
    parts['3D/Objects/object_1.model']=parts['3D/3dmodel.model'];
    parts['3D/3dmodel.model']=strToU8('<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" unit="millimeter"><resources><object id="2" type="model"><components><component objectid="1" p:path="/3D/Objects/object_1.model" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></components></object></resources><build><item objectid="2"/></build></model>');
    await send({type:'model',bytes:Buffer.from(zipSync(parts)).toString('base64')});
    assert.match(await page.locator('#status').innerText(),/3Dモデル表示/); assert.ok(greenPixels(await page.locator('canvas').screenshot())>5000,'cross-file Bambu-style component must render');
    parts['3D/Objects/object_1.model']=strToU8('<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1"><components><component objectid="1"/></components></object></resources><build><item objectid="1"/></build></model>');
    await send({type:'model',bytes:Buffer.from(zipSync(parts)).toString('base64')}); assert.match(await page.locator('#warning').innerText(),/循環/);
    await send({type:'error',message:'Invalid ZIP test'}); assert.equal(await page.locator('#status').innerText(),'読込エラー'); assert.match(await page.locator('#warning').innerText(),/Invalid ZIP/);
    const arc='M83\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\n; WIDTH: 0.8\n; HEIGHT: 0.2\n; FEATURE: Outer wall\nG0 X3 Y0 Z0.2\nG3 X-3 Y0 I-3 J0 E1 F1200';
    assert.ok(parseGcode(arc).segmentCount>10,'arc must generate multiple joined segments');
    await send({type:'toolpath',index:0,data:packed(arc)});
    await page.locator('#render-mode').selectOption('bead'); await page.locator('#top').click();
    const arcImage=await page.locator('canvas').screenshot();
    fs.writeFileSync('test-results/arc-joints.png',arcImage);
    const components=orangeComponents(arcImage);
    assert.equal(components.length,1,`rounded arc should form one connected visible extrusion: ${components}`);
    await page.locator('#step').evaluate(el=>{el.value=String(Math.floor(Number(el.max)/2));el.dispatchEvent(new Event('input'));});
    assert.equal(orangeComponents(await page.locator('canvas').screenshot()).length,1,'partial arc should keep its end capped');
    const parallelCurves='M83\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\n; WIDTH: 0.75\n; HEIGHT: 0.2\n; FEATURE: Outer wall\n'
      +[5,5.85,6.7].map(radius=>`G0 X${radius} Y0 Z0.2\nG3 X0 Y${radius} I-${radius} J0 E1 F1200`).join('\n');
    await send({type:'toolpath',index:0,data:packed(parallelCurves)});
    await page.locator('#top').click();
    const curvesImage=await page.locator('canvas').screenshot();
    fs.writeFileSync('test-results/swept-curves.png',curvesImage);
    assert.equal(orangeComponents(curvesImage).length,3,'three neighboring bends should remain distinct continuous tubes');
    await page.locator('#iso').click(); await page.screenshot({path:'test-results/swept-curves-iso.png'});
    const corner='M83\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\n; WIDTH: 0.8\n; HEIGHT: 0.2\n; FEATURE: Outer wall\nG0 X0 Y0 Z0.2\nG1 X5 E1 F1200\nG1 Y5 E1';
    await send({type:'toolpath',index:0,data:packed(corner)}); await page.locator('#top').click();
    const cornerImage=await page.locator('canvas').screenshot();
    fs.writeFileSync('test-results/constant-width-corner.png',cornerImage);
    assert.equal(orangeComponents(cornerImage).length,1,'a right-angle miter must remain one extrusion');
    const cornerPng=PNG.sync.read(cornerImage), orange=(x,y)=>{
      const p=(y*cornerPng.width+x)*4, pixels=cornerPng.data;
      return pixels[p]>100&&pixels[p]>pixels[p+1]*1.25&&pixels[p+1]>pixels[p+2]*1.15;
    };
    const bounds={minX:cornerPng.width,minY:cornerPng.height,maxX:0,maxY:0};
    for(let y=0;y<cornerPng.height;y++) for(let x=0;x<cornerPng.width;x++) if(orange(x,y)) {
      bounds.minX=Math.min(bounds.minX,x); bounds.maxX=Math.max(bounds.maxX,x);
      bounds.minY=Math.min(bounds.minY,y); bounds.maxY=Math.max(bounds.maxY,y);
    }
    const horizontalX=Math.round(bounds.minX+(bounds.maxX-bounds.minX)*0.4), verticalY=Math.round(bounds.minY+(bounds.maxY-bounds.minY)*0.4);
    let horizontalWidth=0, verticalWidth=0;
    for(let y=0;y<cornerPng.height;y++) if(orange(horizontalX,y)) horizontalWidth++;
    for(let x=0;x<cornerPng.width;x++) if(orange(x,verticalY)) verticalWidth++;
    assert.ok(Math.abs(horizontalWidth-verticalWidth)<=3,`both legs must keep the same width: ${horizontalWidth} vs ${verticalWidth} px`);
    const varyingWidth='M83\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\n; HEIGHT: 0.2\n; FEATURE: Outer wall\n; WIDTH: 0.4\nG0 X0 Y0 Z0.2\nG1 X5 E1\n; WIDTH: 0.8\nG0 X0 Y2\nG1 X5 E1';
    await send({type:'toolpath',index:0,data:packed(varyingWidth)}); await page.locator('#top').click();
    const widthComponents=orangeComponents(await page.locator('canvas').screenshot());
    assert.equal(widthComponents.length,2,'different slicer widths should produce separate continuous paths');
    assert.ok(widthComponents[0]>widthComponents[1]*1.6,`the wider slicer path should remain wider: ${widthComponents}`);
    const annotated='; HEADER_BLOCK_START\n; model printing time: 2h 6m; total estimated time: 2h 13m\n; HEADER_BLOCK_END\nM83\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\nG0 X0 Y0 Z0.2\n; FEATURE: Outer wall\nG1 X5 E0.2\nG1 E-0.4\n; WIPE_START\nG1 X4.5 E0\n; WIPE_END\nG0 X6\nG1 E0.4\nG1 X10 E0.2';
    await send({type:'toolpath',index:0,data:packed(annotated)}); await page.locator('#top').click();
    assert.equal(await page.locator('#model-time').innerText(),'2h 6m');
    assert.equal(await page.locator('#total-time').innerText(),'2h 13m');
    await page.screenshot({path:'test-results/event-overview.png'});
    const eventsImage=await page.locator('canvas').screenshot();
    fs.writeFileSync('test-results/event-markers.png',eventsImage);
    for(const [kind,label] of [['retract','リトラクト'],['unretract','リトラクト解除'],['wipe','ワイプ']]) {
      assert.ok(markerPixels(eventsImage,kind)>5,`${label} marker must be visible`);
      const button=page.getByRole('button',{name:label,exact:true}); await button.click();
      assert.equal(await button.getAttribute('aria-pressed'),'false');
      assert.ok(markerPixels(await page.locator('canvas').screenshot(),kind)<3,`${label} marker must disappear`);
      await button.click();
    }
    const outerStartButton=page.getByRole('button',{name:'外壁経路の開始点',exact:true});
    await outerStartButton.click(); assert.equal(await outerStartButton.getAttribute('aria-pressed'),'false');
    assert.notEqual(createHash('sha256').update(eventsImage).digest('hex'),createHash('sha256').update(await page.locator('canvas').screenshot()).digest('hex'),'outer-wall start toggle must change the WebGL image');
    await outerStartButton.click();
    // All rendered markers, including the formerly unlisted white cursor,
    // must be controlled by the legend in both rendering modes.
    for(const mode of ['line','bead']) {
      await page.locator('#render-mode').selectOption(mode);
      for(const button of await page.locator('#event-legend button').all()) {
        if(await button.getAttribute('aria-pressed')==='true') await button.click();
      }
      const hiddenImage=await page.locator('canvas').screenshot();
      for(const kind of ['retract','unretract','wipe','white']) assert.ok(markerPixels(hiddenImage,kind)<3,`${mode}: all markers OFF must remove ${kind}`);
      await page.getByRole('button',{name:'経路の現在位置',exact:true}).click();
      assert.ok(markerPixels(await page.locator('canvas').screenshot(),'white')>5,`${mode}: current position can be restored independently`);
      for(const button of await page.locator('#event-legend button').all()) {
        if(await button.getAttribute('aria-pressed')==='false') await button.click();
      }
    }
    await page.locator('#step').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input'));});
    const startImage=await page.locator('canvas').screenshot();
    for(const kind of ['retract','unretract','wipe']) assert.ok(markerPixels(startImage,kind)<3,'future events must stay hidden at path start');
    await page.locator('#step').evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input'));});
    await page.getByRole('button',{name:'ワイプ',exact:true}).click();
    await send({type:'toolpath',index:0,data:packed(annotated)});
    assert.equal(await page.getByRole('button',{name:'ワイプ',exact:true}).getAttribute('aria-pressed'),'false','event visibility survives reload');
    await page.getByRole('button',{name:'ワイプ',exact:true}).click();
    const twoLayers=annotated+'\n; CHANGE_LAYER\n; Z_HEIGHT: 0.4\nG0 X0 Y2 Z0.4\n; FEATURE: Outer wall\nG1 X10 E0.2';
    await send({type:'toolpath',index:0,data:packed(twoLayers)});
    await page.locator('#single').uncheck();
    await page.locator('#lower-number').fill('1'); await page.locator('#lower-number').press('Tab');
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab');
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')>5,'cumulative view must retain markers from lower layers');
    await page.locator('#iso').click();
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')>5,'lower-layer markers remain visible from an angled side view');
    await page.screenshot({path:'test-results/multi-layer-markers-side.png'});
    await page.locator('#top').click();
    const firstLayerEnd=parseGcode(twoLayers).layers[0].end;
    await page.locator('#step').evaluate((el,end)=>{el.value=String(end);el.dispatchEvent(new Event('input'));},firstLayerEnd);
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')>5,'playback in the lower layer restores its markers');
    await page.locator('#step').evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input'));});
    await page.locator('#single').check();
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab');
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')<3,'lower-layer events must be hidden in single-layer view');
    await page.locator('#upper-number').fill('1'); await page.locator('#upper-number').press('Tab');
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')>5,'returning to the lower layer restores its events');
    const coveredMarker='M83\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\n; HEIGHT: 0.2\n; WIDTH: 0.4\n; FEATURE: Outer wall\nG0 X0 Y0 Z0.2\nG1 X5 E1\nG10\n; CHANGE_LAYER\n; Z_HEIGHT: 0.4\n; WIDTH: 1\n; FEATURE: Inner wall\nG0 X0 Y0 Z0.4\nG1 X10 E1';
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'bead'}});
    await send({type:'toolpath',index:0,data:packed(coveredMarker)});
    await page.locator('#single').uncheck();
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab');
    await page.locator('#top').click();
    fs.writeFileSync('test-results/covered-marker-top.png',await page.locator('canvas').screenshot());
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')<3,'upper path must mask the lower marker even when the sphere protrudes above its surface');
    await page.getByRole('button',{name:'内壁',exact:true}).click();
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')>5,'removing the overlapping path reveals the full-size marker');
    await page.locator('#iso').click();
    const roundMarker=await page.locator('canvas').screenshot();
    assert.ok(markerPixels(roundMarker,'retract')>5,'exposed marker remains visible from the side');
    const roundPng=PNG.sync.read(roundMarker), markerBounds={minX:Infinity,minY:Infinity,maxX:0,maxY:0};
    for(let y=0;y<roundPng.height;y++) for(let x=0;x<roundPng.width;x++) {
      const offset=(y*roundPng.width+x)*4, pixels=roundPng.data;
      if(pixels[offset]>130&&pixels[offset+2]>130&&pixels[offset+1]<110) {
        markerBounds.minX=Math.min(markerBounds.minX,x); markerBounds.maxX=Math.max(markerBounds.maxX,x);
        markerBounds.minY=Math.min(markerBounds.minY,y); markerBounds.maxY=Math.max(markerBounds.maxY,y);
      }
    }
    assert.ok(markerBounds.maxY-markerBounds.minY>(markerBounds.maxX-markerBounds.minX)*.8,'an exposed marker must stay round instead of being flattened to its layer thickness');
    fs.writeFileSync('test-results/round-marker-side.png',roundMarker);
    await page.getByRole('button',{name:'内壁',exact:true}).click();
    await page.locator('#top').click();
    const partialCover=coveredMarker.replace('; WIDTH: 1','; WIDTH: 0.4').replace('G0 X0 Y0 Z0.4','G0 X0 Y0.2 Z0.4');
    await send({type:'toolpath',index:0,data:packed(partialCover)});
    const partialImage=await page.locator('canvas').screenshot();
    const partialPixels=markerPixels(partialImage,'retract');
    await page.getByRole('button',{name:'内壁',exact:true}).click();
    const exposedPixels=markerPixels(await page.locator('canvas').screenshot(),'retract');
    assert.ok(partialPixels>5&&partialPixels<exposedPixels*.85,`only the overlapping portion is masked: ${partialPixels} of ${exposedPixels} marker pixels`);
    fs.writeFileSync('test-results/partial-marker-contact.png',partialImage);
    await page.getByRole('button',{name:'内壁',exact:true}).click();
    await page.waitForTimeout(500);
    const idleDraws=await page.evaluate(()=>window.__webglDraws);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>window.__webglDraws),idleDraws,'an idle preview must not keep submitting WebGL draws');
    const straightWipe='M83\n; CHANGE_LAYER\n; Z_HEIGHT: 0.2\n; FEATURE: Outer wall\nG0 X0 Y0 Z0.2\nG1 X10 E1\n; WIPE_START\nG1 X8 E0\nG1 X6 E0\nG1 X4 E0\n; WIPE_END';
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'bead',eventVisible:{retract:false,unretract:false,outerStart:false,currentPosition:false}}});
    await send({type:'toolpath',index:0,data:packed(straightWipe)}); await page.locator('#top').click();
    const thinWipe=await page.locator('canvas').screenshot(), thinPng=PNG.sync.read(thinWipe);
    assert.equal(colorComponents(thinWipe,'wipe').length,1,'consecutive wipe moves form one continuous stroke');
    let minY=thinPng.height,maxY=0;
    for(let y=0;y<thinPng.height;y++) for(let x=0;x<thinPng.width;x++) {const p=(y*thinPng.width+x)*4,r=thinPng.data[p],g=thinPng.data[p+1],b=thinPng.data[p+2];if(r>180&&g>150&&g>r*.88&&b<110){minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
    assert.ok(maxY-minY<8,'wipe stroke stays thin rather than forming a row of spheres');
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'bead'}});
    if(process.env.BENCHMARK_SEGMENTS) {
      const segments=Number(process.env.BENCHMARK_SEGMENTS), commands=['M83','; CHANGE_LAYER','; Z_HEIGHT: 0.2','; WIDTH: 0.45','; HEIGHT: 0.2','; FEATURE: Outer wall','G0 X0 Y0 Z0.2'];
      for(let i=1;i<=segments;i++) {
        const row=Math.floor(i/200), column=i%200, x=(row%2?199-column:column)*0.5;
        commands.push(`G1 X${x} Y${row*0.5} E0.01 F1200`);
      }
      const packedSegments=packed(commands.join('\n')), start=Date.now();
      await send({type:'toolpath',index:0,data:packedSegments});
      const loadMs=Date.now()-start;
      const frameMs=await page.evaluate(()=>new Promise(resolve=>{
        const samples=[]; let previous;
        function frame(now) { if(previous!==undefined) samples.push(now-previous); previous=now; if(samples.length===20) resolve(samples.sort((a,b)=>a-b)[10]); else requestAnimationFrame(frame); }
        requestAnimationFrame(frame);
      }));
      console.log(`BENCHMARK ${segments} segments: load ${loadMs} ms, median frame ${frameMs.toFixed(1)} ms`);
    }
    await send({type:'toolpath',index:0,data:packed(sliced)}); await page.setViewportSize({width:500,height:650}); await page.screenshot({path:'test-results/narrow.png'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    const savedRange=await page.evaluate(()=>window.acquireVsCodeApi().getState());
    const savedSettings=await page.evaluate(()=>window.sent.filter(m=>m.type==='displaySettingsChanged').at(-1)?.settings);
    assert.deepEqual(Object.keys(savedRange).sort(),['lower','single','upper'],'only the open tab retains layer selection');
    assert.ok(savedSettings&&!('upper' in savedSettings)&&!('lower' in savedSettings)&&!('single' in savedSettings),'global settings exclude layer selection');
    const english=await browser.newPage(), englishErrors=[];
    english.on('pageerror',error=>englishErrors.push(error.message));
    await english.addInitScript(()=>{
      let state; window.sent=[];
      window.acquireVsCodeApi=()=>({postMessage:message=>window.sent.push(message),getState:()=>state,setState:value=>{state=value;}});
    });
    await english.goto(`http://127.0.0.1:${server.address().port}/en`);
    assert.equal(await english.locator('html').getAttribute('lang'),'en');
    assert.equal(await english.getByRole('button',{name:'Structure'}).count(),1);
    assert.equal(await english.locator('#path-legend-heading').innerText(),'Toolpaths');
    await english.evaluate(message=>window.dispatchEvent(new MessageEvent('message',{data:message})),{type:'displaySettings',settings:savedSettings});
    await english.evaluate(message=>window.dispatchEvent(new MessageEvent('message',{data:message})),{type:'archive',plates:['Metadata/plate_1.gcode'],structure:{settings:modelSettings},filename:'sample.gcode.3mf'});
    await english.evaluate(message=>window.dispatchEvent(new MessageEvent('message',{data:message})),{type:'toolpath',index:0,data:packed(sliced)});
    assert.match(await english.locator('#status').innerText(),/3 layers · 17 toolpath segments/);
    assert.equal(await english.getByRole('button',{name:'Outer wall',exact:true}).count(),1);
    assert.equal(await english.locator('#event-legend-heading').innerText(),'Action markers');
    assert.equal(await english.locator('#upper').inputValue(),'3','a new file starts with its full layer range');
    assert.equal(await english.locator('#lower').inputValue(),'1');
    assert.equal(await english.locator('#single').isChecked(),false);
    assert.equal(await english.locator('#color').inputValue(),savedSettings.color);
    assert.equal(await english.locator('#render-mode').inputValue(),savedSettings.renderMode);
    assert.equal(await english.getByRole('button',{name:'Travel',exact:true}).getAttribute('aria-pressed'),String(savedSettings.travel));
    const nextColor=savedSettings.color==='speed'?'feature':'speed';
    await english.locator('#color').selectOption(nextColor);
    const changedSettings=await english.evaluate(()=>window.sent.filter(m=>m.type==='displaySettingsChanged').at(-1)?.settings);
    await send({type:'displaySettings',settings:changedSettings});
    assert.equal(await page.locator('#color').inputValue(),nextColor,'another open preview receives shared display settings');
    await english.getByRole('button',{name:'Structure'}).click();
    assert.match(await english.locator('#structure-tree').innerText(),/Plate 1[\s\S]*spool_case_body/);
    await english.locator('#parameters-filter').fill('body');
    await english.locator('.structure-select[data-key="part:0:0:0"]').click();
    await english.locator('.structure-select[data-key="part:0:0:1"]').click();
    assert.equal(await english.locator('#parameters-filter').inputValue(),'body');
    assert.match(await english.locator('#parameters-rows').innerText(),/body_text/);
    await english.screenshot({path:'test-results/parameter-filter.png'});
    await english.setViewportSize({width:500,height:650});
    assert.equal(await english.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'parameter table must fit the narrow view');
    await english.screenshot({path:'test-results/narrow-structure.png'});
    await english.keyboard.press('Escape');
    await english.screenshot({path:'test-results/narrow-en.png'});
    await english.evaluate(message=>window.dispatchEvent(new MessageEvent('message',{data:message})),{type:'toolpath',index:0,data:packed(`${routineGcode}\nG2 X8 Y0 E0.2`)});
    assert.match(await english.locator('#warning').innerText(),/Invalid arc omitted/,'English diagnostics remain readable');
    const speedKeys=()=>page.locator('#legend button').evaluateAll(rows=>rows.map(row=>row.dataset.category));
    const sparseSpeeds='M83\n;LAYER:0\nG1 X10 Z.2 E1 F3000\n;LAYER:1\nG0 X0 Y2 Z.4 F12000\nG1 X10 E1 F18000';
    await send({type:'displaySettings',settings:{color:'speed',renderMode:'line',travel:false}});
    await send({type:'toolpath',index:0,data:packed(sparseSpeeds)});
    assert.deepEqual(await speedKeys(),['travel','1','5'],'only extrusion speed bands appear; travel speed is separate');
    await page.locator('#upper').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input'));});
    assert.deepEqual(await speedKeys(),['travel','1','5'],'speed legend remains stable across layer selection');
    await legendButton('300+ mm/s').click();
    await page.locator('#color').selectOption('feature');
    await page.locator('#color').selectOption('speed');
    assert.equal(await legendButton('300+ mm/s').getAttribute('aria-pressed'),'false');
    await send({type:'toolpath',index:0,data:packed('M83\nG1 X10 Z.2 E1 F6000')});
    assert.deepEqual(await speedKeys(),['2'],'absent travel and speed bands disappear for a new plate');
    await send({type:'toolpath',index:0,data:packed(sparseSpeeds)});
    assert.equal(await legendButton('300+ mm/s').getAttribute('aria-pressed'),'false','speed preferences survive a plate without that band');
    const boundaries='M83\n'+[0,50,100,150,200,300].map((speed,i)=>`G1 X${i+1} Z.2 E1 F${speed*60}`).join('\n');
    await send({type:'toolpath',index:0,data:packed(boundaries)});
    assert.deepEqual(await speedKeys(),['0','1','2','3','4','5'],'speed-band lower boundaries map to their own band');
    const eventKeys=()=>page.locator('#event-legend button').evaluateAll(rows=>rows.map(row=>row.dataset.event));
    const partialEvents='M83\n;LAYER:0\n;TYPE:Infill\nG1 X10 Z.2 E1\n;LAYER:1\nG1 X20 Z.4 E1\nG10\nG11';
    const noEvents='M83\n;TYPE:Infill\nG1 X10 Z.2 E1';
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'line'}});
    await send({type:'toolpath',index:0,data:packed(partialEvents)});
    assert.deepEqual(await eventKeys(),['retract','unretract','currentPosition']);
    await page.locator('#upper').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input'));});
    assert.deepEqual(await eventKeys(),['retract','unretract','currentPosition'],'marker list covers the whole plate, including other layers');
    await page.getByRole('button',{name:'リトラクト',exact:true}).click();
    await page.locator('#color').selectOption('speed');
    assert.deepEqual(await eventKeys(),['retract','unretract','currentPosition']);
    assert.equal(await page.getByRole('button',{name:'リトラクト',exact:true}).getAttribute('aria-pressed'),'false');
    await send({type:'toolpath',index:0,data:packed(noEvents)});
    assert.deepEqual(await eventKeys(),['currentPosition']);
    assert.equal(await page.locator('#event-legend-heading').count(),1,'current path position remains controllable without G-code events');
    await send({type:'toolpath',index:0,data:packed(partialEvents)});
    assert.equal(await page.getByRole('button',{name:'リトラクト',exact:true}).getAttribute('aria-pressed'),'false','marker preferences survive plates without that kind');
    const sparseFeatures='M83\n;LAYER:0\n;TYPE:Outer wall\nG1 X10 Z.2 E1\n;LAYER:1\n;TYPE:Custom\nG0 X0 Y2 Z.4\n;TYPE:Ironing\nG1 X10 E.01';
    const legendKeys=()=>page.locator('#legend button').evaluateAll(rows=>rows.map(row=>row.dataset.category));
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'line',travel:false}});
    await send({type:'toolpath',index:0,data:packed(sparseFeatures)});
    assert.deepEqual(await legendKeys(),['travel','1','13'],'only categories with actual paths appear; comment-only Custom is absent');
    await page.locator('#upper').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input'));});
    assert.deepEqual(await legendKeys(),['travel','1','13'],'layer selection keeps whole-plate legend');
    await legendButton('アイロン').click();
    assert.equal(await legendButton('アイロン').getAttribute('aria-pressed'),'false');
    await page.locator('#color').selectOption('speed');
    await page.locator('#color').selectOption('feature');
    assert.deepEqual(await legendKeys(),['travel','1','13'],'hidden paths retain a restore button');
    await send({type:'toolpath',index:0,data:packed('M83\n;TYPE:Prime tower\nG1 X10 Z.2 E1')});
    assert.deepEqual(await legendKeys(),['14'],'absent categories and absent travel disappear for a new plate');
    await send({type:'toolpath',index:0,data:packed('M83\n;TYPE:Brand new feature\nG1 X10 Z.2 E1')});
    assert.deepEqual(await legendKeys(),['0'],'actual unknown extrusion remains under Other');
    await send({type:'toolpath',index:0,data:packed(sparseFeatures)});
    assert.equal(await legendButton('アイロン').getAttribute('aria-pressed'),'false','category preferences survive absence in another plate');
    const classified='M83\n;LAYER:0\n;TYPE:Support\nG1 X10 Z.2 E1\nG0 Y2\n;TYPE:SUPPORT-INTERFACE\nG1 X0 E1\nG0 Y4\n;TYPE:Overhang perimeter\nG1 X10 E1\nG0 Y6\n;TYPE:Floating vertical shell\nG1 X0 E1';
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'line',travel:false}});
    await send({type:'toolpath',index:0,data:packed(classified)});
    assert.equal(await visibleCount(),4);
    assert.match(await legendButton('サポート接触面').getAttribute('title'),/SUPPORT-INTERFACE \(1\)/);
    assert.match(await legendButton('オーバーハング壁').getAttribute('title'),/Overhang perimeter/);
    assert.match(await page.locator('#details').innerText(),/元の線種: Floating vertical shell/);
    await legendButton('サポート接触面').click(); assert.equal(await visibleCount(),3);
    await legendButton('オーバーハング壁').click(); assert.equal(await visibleCount(),2);
    assert.match(await legendButton('フローティング・バーティカル・シェル').getAttribute('title'),/Floating vertical shell/);
    assert.match(await page.locator('#details').innerText(),/フローティング・バーティカル・シェル/);
    await legendButton('フローティング・バーティカル・シェル').click(); assert.equal(await visibleCount(),1);
    await send({type:'toolpath',index:0,data:packed(classified)});
    assert.equal(await visibleCount(),1,'new feature filters survive reload');
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'line',travel:false}});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:'test-results/feature-categories.png'});
    await english.evaluate(data=>window.dispatchEvent(new MessageEvent('message',{data})),{type:'toolpath',index:0,data:packed(classified)});
    await english.locator('#color').selectOption('feature');
    assert.equal(await english.getByRole('button',{name:'Overhang wall',exact:true}).count(),1);
    assert.equal(await english.getByRole('button',{name:'Floating vertical shell',exact:true}).count(),1);
    assert.match(await english.getByRole('button',{name:'Support interface',exact:true}).getAttribute('title'),/Source feature/);
    const finishing='M83\n;LAYER:0\n;TYPE:Ironing\nG1 X10 Z.2 E.01\nG0 Y2\n;TYPE:Prime tower\nG1 X0 E1\nG0 Y4\n;TYPE:Gap infill\nG1 X10 E.1';
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'line',travel:false}});
    await send({type:'toolpath',index:0,data:packed(finishing)});
    assert.equal(await visibleCount(),3);
    for(const [label,raw,count] of [['アイロン','Ironing',2],['プライムタワー','Prime tower',1],['ギャップ充填','Gap infill',0]]) {
      assert.match(await legendButton(label).getAttribute('title'),new RegExp(raw));
      await legendButton(label).click(); assert.equal(await visibleCount(),count);
    }
    await send({type:'toolpath',index:0,data:packed(finishing)});
    assert.equal(await visibleCount(),0,'finishing feature filters survive reload');
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'bead',travel:false}});
    assert.equal(await visibleCount(),3);
    await page.screenshot({path:'test-results/finishing-categories.png'});
    await english.evaluate(data=>window.dispatchEvent(new MessageEvent('message',{data})),{type:'toolpath',index:0,data:packed(finishing)});
    for(const label of ['Ironing','Prime tower','Gap infill']) assert.equal(await english.getByRole('button',{name:label,exact:true}).count(),1);
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'line',travel:false}});
    // Local samples are ignored by Git; exercise all available sliced samples.
    const sampleDir=path.resolve(__dirname,'../sample');
    const sampleNames=fs.existsSync(sampleDir)?fs.readdirSync(sampleDir).filter(name=>/^sample.*\.gcode(?:\.3mf)?$/i.test(name)).sort():[];
    for(const filename of sampleNames) {
      const source=path.resolve(__dirname,'../sample',filename);
      if(!fs.existsSync(source)) continue;
      const bytes=fs.readFileSync(source);
      const archive=filename.endsWith('.3mf')?require('../src/archive').inspectArchive(bytes):{plates:[{name:filename,gcode:bytes.toString('utf8')}],structure:{}};
      await send({type:'loading'});
      await send({type:'archive',filename,plates:archive.plates.map(p=>p.name),structure:archive.structure});
      const data=packed(archive.plates[0].gcode);
      await send({type:'toolpath',index:0,data});
      assert.match(await page.locator('#status').innerText(),new RegExp(`${data.layers.length} 層`));
      const expectedEvents=new Set(Buffer.from(data.eventKinds,'base64'));
      assert.deepEqual(await eventKeys(),['retract','unretract','wipe','outerStart'].filter((_,kind)=>expectedEvents.has(kind)).concat('currentPosition'),`${filename}: marker legend matches whole-plate events`);
      if(filename==='sample_bambu_studio2.gcode.3mf') {
        const parsed=parseGcode(archive.plates[0].gcode);
        assert.equal(Array.from(parsed.eventKinds.keys()).filter(i=>parsed.eventKinds[i]===2&&parsed.eventLayers[i]===301).length,12);
        const wipeSettings={color:'feature',renderMode:'bead',eventVisible:{retract:false,unretract:false,wipe:true,outerStart:false,currentPosition:false}};
        await send({type:'displaySettings',settings:wipeSettings});
        await page.locator('#single').check();
        await page.locator('#upper-number').fill('302'); await page.locator('#upper-number').press('Tab');
        await page.locator('#top').click();
        const settleView=()=>page.evaluate(()=>new Promise(resolve=>{
          let previous=window.__webglDraws,stable=0;
          function tick(){const current=window.__webglDraws;stable=current===previous?stable+1:0;previous=current;if(stable>=4)resolve();else requestAnimationFrame(tick);}
          requestAnimationFrame(tick);
        }));
        await settleView();
        // Fit includes the entire tall plate and prime tower. Pan to the
        // isolated ring before zooming so the actual 0.1 mm stroke is testable.
        for(let attempt=0;attempt<2;attempt++) {
          const png=PNG.sync.read(await page.locator('canvas').screenshot()), bounds={minX:png.width,minY:png.height,maxX:0,maxY:0};
          for(let y=0;y<png.height;y++) for(let x=0;x<png.width;x++) {const p=(y*png.width+x)*4,r=png.data[p],g=png.data[p+1],b=png.data[p+2];if(r>100&&r>g*1.25&&g>b*1.15){bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);}}
          const box=await page.locator('canvas').boundingBox(), x=box.x+box.width/2,y=box.y+box.height/2;
          await page.mouse.move(x,y);await page.mouse.down({button:'right'});
          await page.mouse.move(x+png.width/2-(bounds.minX+bounds.maxX)/2,y+png.height/2-(bounds.minY+bounds.maxY)/2,{steps:5});
          await page.mouse.up({button:'right'});await settleView();
        }
        await page.locator('canvas').hover();await page.mouse.wheel(0,-3200);await settleView();
        await page.screenshot({path:'test-results/wipe-layer302.png'});
        const onlyWipes={...wipeSettings,hiddenCategories:{feature:Array.from({length:16},(_,i)=>String(i)).filter(key=>key!=='9')}};
        await send({type:'displaySettings',settings:onlyWipes});
        assert.equal(colorComponents(await page.locator('canvas').screenshot(),'wipe').length,2,'302nd layer has two continuous wipe strokes from twelve moves');
        await page.getByRole('button',{name:'ワイプ',exact:true}).click();
        assert.equal(markerPixels(await page.locator('canvas').screenshot(),'wipe'),0,'wipe toggle hides cylinders and round joints together');
        await page.getByRole('button',{name:'ワイプ',exact:true}).click();
        await page.locator('#step').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input'));});
        assert.equal(markerPixels(await page.locator('canvas').screenshot(),'wipe'),0,'wipe strokes wait for playback to reach them');
        await page.locator('#step').evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input'));});
        await page.locator('#render-mode').selectOption('line');
        assert.equal(colorComponents(await page.locator('canvas').screenshot(),'wipe').length,2,'wipe strokes also appear in line mode');
        await send({type:'displaySettings',settings:{color:'feature',renderMode:'line'}});
      }
      for(const mode of ['feature','speed','tool']) {
        await page.locator('#color').selectOption(mode);
        if(mode==='feature') {
          const expected=[...new Set(parseGcode(archive.plates[0].gcode).types)].sort((a,b)=>a-b);
          const keys=expected.filter(id=>id!==9).map(String);
          if(expected.includes(9)) keys.unshift('travel');
          assert.deepEqual(await legendKeys(),keys,`${filename}: legend matches actual whole-plate categories`);
        }
        if(mode==='speed') {
          const parsed=parseGcode(archive.plates[0].gcode),bands=new Set();let hasTravel=false;
          for(let i=0;i<parsed.segmentCount;i++) {
            if(parsed.types[i]===9) {hasTravel=true;continue;}
            const speed=parsed.speeds[i];
            bands.add(speed<50?0:speed<100?1:speed<150?2:speed<200?3:speed<300?4:5);
          }
          const keys=[...bands].sort((a,b)=>a-b).map(String);
          if(hasTravel) keys.unshift('travel');
          assert.deepEqual(await speedKeys(),keys,`${filename}: speed legend matches whole-plate extrusion speeds`);
        }
        assert.ok(await page.locator('#legend button').count()>0,`${filename}: ${mode} legend`);
        assert.equal(await page.locator('#play').isEnabled(),true);
      }
      console.log(`PASS local sample: ${filename}, ${data.layers.length} layers, ${data.segmentCount} segments`);
    }
    assert.deepEqual(englishErrors,[]);
    assert.deepEqual(errors,[]); console.log('PASS UI: WebGL rendering, layer range, single layer, path steps/playback, colors, travel, plates, reload, mesh-only, error and narrow layout.');
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
