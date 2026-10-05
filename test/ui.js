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
    if(kind==='wipe'&&r>130&&g>r*.78&&b<110) count++;
  }
  return count;
}
function orangeComponents(buffer) {
  const png=PNG.sync.read(buffer), mask=new Uint8Array(png.width*png.height), sizes=[];
  for(let i=0;i<mask.length;i++) { const p=i*4; if(png.data[p]>100&&png.data[p]>png.data[p+1]*1.25&&png.data[p+1]>png.data[p+2]*1.15) mask[i]=1; }
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
function packed(text) { const data=parseGcode(text); for(const key of ['positions','types','speeds','tools','lines','widths','heights','eventPositions','eventKinds','eventIndices','eventLayers']) data[key]=Buffer.from(data[key].buffer).toString('base64'); return data; }
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
    await send({type:'archive',plates:['Metadata/plate_1.gcode','Metadata/plate_2.gcode'],structure:{settings:modelSettings},filename:'in-memory.gcode.3mf'});
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
    assert.equal(await page.locator('#event-legend .legend-heading').innerText(),'操作マーカー');
    assert.equal(await page.locator('#path-legend-heading').innerText(),'経路');
    const eventHeadingBounds=await page.locator('#event-legend .legend-heading').boundingBox();
    const pathHeadingBounds=await page.locator('#path-legend-heading').boundingBox();
    const pathListBounds=await page.locator('#legend').boundingBox();
    assert.ok(eventHeadingBounds.y<pathHeadingBounds.y&&pathHeadingBounds.y<pathListBounds.y,'marker and path headings must separate their lists');
    const viewportWidth=(await page.locator('#viewport').boundingBox()).width;
    const viewportBox=await page.locator('#viewport').boundingBox(), fullRailBox=await page.locator('.layer-track').boundingBox(), panelBox=await page.locator('#layers').boundingBox();
    assert.ok(fullRailBox.x>viewportBox.x+viewportBox.width&&fullRailBox.x<panelBox.x,'full-height layer rail sits between the preview and settings panel');
    assert.ok(fullRailBox.height>viewportBox.height-80,`layer rail should span the preview height: ${fullRailBox.height} vs ${viewportBox.height}`);
    const structureButton=page.getByRole('button',{name:'構成',exact:true});
    await structureButton.click();
    assert.equal(await structureButton.getAttribute('aria-expanded'),'true');
    assert.match(await page.locator('#structure-tree').innerText(),/プレート 1[\s\S]*spool_case_body[\s\S]*body_bottom[\s\S]*body_text/);
    assert.equal((await page.locator('#viewport').boundingBox()).width,viewportWidth,'structure popup must not narrow the viewport');
    assert.equal(await page.locator('#structure-tree summary').first().evaluate(el=>document.activeElement===el),true,'popup opens with keyboard focus in its tree');
    await page.keyboard.press('Enter'); assert.equal(await page.locator('#structure-tree details').first().evaluate(el=>el.open),false,'Enter collapses a tree branch');
    await page.keyboard.press('Enter'); assert.equal(await page.locator('#structure-tree details').first().evaluate(el=>el.open),true,'Enter expands a tree branch');
    await page.keyboard.press('Escape'); assert.equal(await structureButton.getAttribute('aria-expanded'),'false');
    assert.equal(await structureButton.evaluate(el=>document.activeElement===el),true,'Escape returns focus to the structure button');
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
    await page.locator('#color').selectOption('speed'); assert.match(await page.locator('#legend').innerText(),/300/); assertSameRail(await page.locator('.layer-track').boundingBox()); assert.equal(await travelButton.getAttribute('aria-pressed'),'true');
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
    await structureButton.click(); assert.match(await page.locator('#structure-tree').innerText(),/プレート 2/); await page.locator('#fit').click(); assert.equal(await structureButton.getAttribute('aria-expanded'),'false','outside click closes structure popup');
    await send({type:'toolpath',index:1,data:packed(sliced)}); assert.equal(await page.locator('#plate').inputValue(),'1');
    assert.equal(await legendButton('外壁').getAttribute('aria-pressed'),'false'); assert.equal(await travelButton.getAttribute('aria-pressed'),'false'); assert.equal(await visibleCount(),1,'legend filters survive a plate reload');
    await legendButton('外壁').click();
    await page.locator('#reload').click(); assert.ok(await page.evaluate(()=>window.sent.some(m=>m.type==='reload')));
    const plainModel=modelArchive(), modelXml=Buffer.from(unzipSync(plainModel)['3D/3dmodel.model']).toString('utf8');
    await send({type:'loading'}); await send({type:'archive',plates:[],structure:{model:modelXml},filename:'model.3mf'});
    await send({type:'model',bytes:Buffer.from(modelArchive()).toString('base64')});
    assert.equal(await page.locator('#path-legend-heading').isHidden(),true,'path heading is hidden when no toolpath exists');
    await structureButton.click(); assert.match(await page.locator('#structure-tree').innerText(),/プレート 1[\s\S]*オブジェクト 1/); await page.keyboard.press('Escape');
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
    await page.locator('#single').check();
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab');
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')<3,'lower-layer events must be hidden in single-layer view');
    await page.locator('#upper-number').fill('1'); await page.locator('#upper-number').press('Tab');
    assert.ok(markerPixels(await page.locator('canvas').screenshot(),'retract')>5,'returning to the lower layer restores its events');
    await page.waitForTimeout(500);
    const idleDraws=await page.evaluate(()=>window.__webglDraws);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>window.__webglDraws),idleDraws,'an idle preview must not keep submitting WebGL draws');
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
    assert.equal(await english.locator('#event-legend .legend-heading').innerText(),'Action markers');
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
    await english.setViewportSize({width:500,height:650});
    assert.equal(await english.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'English labels must fit the narrow view');
    await english.screenshot({path:'test-results/narrow-en.png'});
    await english.evaluate(message=>window.dispatchEvent(new MessageEvent('message',{data:message})),{type:'toolpath',index:0,data:packed(`${routineGcode}\nG2 X8 Y0 E0.2`)});
    assert.match(await english.locator('#warning').innerText(),/Invalid arc omitted/,'English diagnostics remain readable');
    assert.deepEqual(englishErrors,[]);
    assert.deepEqual(errors,[]); console.log('PASS UI: WebGL rendering, layer range, single layer, path steps/playback, colors, travel, plates, reload, mesh-only, error and narrow layout.');
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
