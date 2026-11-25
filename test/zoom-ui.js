const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PNG}=require('pngjs');
const {getHtml}=require('../src/html');
const {parseGcode}=require('../src/gcode');
const {sliced,modelArchive}=require('./fixtures');

function packed(text) {
  const data=parseGcode(text);
  for(const [key,value] of Object.entries(data)) if(ArrayBuffer.isView(value)) data[key]=Buffer.from(value.buffer).toString('base64');
  return data;
}
function orangePixels(buffer) {
  const png=PNG.sync.read(buffer); let count=0;
  for(let p=0;p<png.data.length;p+=4) {
    const d=png.data;
    if(d[p]>100&&d[p]>d[p+1]*1.25&&d[p+1]>d[p+2]*1.15) count++;
  }
  return count;
}
async function main() {
  fs.mkdirSync('test-results/zoom',{recursive:true});
  const server=http.createServer((req,res)=>{
    if(req.url==='/'||req.url==='/en') {
      res.setHeader('Content-Type','text/html');
      res.end(getHtml({scriptUri:'/webview.js',styleUri:'/webview.css',cspSource:"'self'",nonce:'zoom',language:req.url==='/en'?'en':'ja'}));
    } else if(['/webview.js','/webview.css'].includes(req.url)) {
      res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');
      res.end(fs.readFileSync(path.join('dist',req.url.slice(1))));
    } else {res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launchPersistentContext(path.resolve('test-results/zoom-profile'),{headless:true,viewport:{width:1200,height:850},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|GL_INVALID|GLSL/.test(m.text())) errors.push(m.text());});
    await page.addInitScript(()=>{
      let state;window.sent=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.sent.push(m),getState:()=>state,setState:s=>{state=s;}});
      window.__draws=0;window.__triangles=0;window.__frameTriangles=[];
      for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]) for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
        const original=proto[name];if(!original)continue;
        proto[name]=function(...a){window.__draws++;if(a[0]===this.TRIANGLES){const count=name.startsWith('drawElements')?a[1]:a[2],instances=name==='drawElementsInstanced'?a[4]:name==='drawArraysInstanced'?a[3]:1;window.__triangles+=count*instances/3;}return original.apply(this,a);};
      }
      const raf=requestAnimationFrame;
      window.requestAnimationFrame=callback=>raf.call(window,time=>{const draws=window.__draws,before=window.__triangles;callback(time);if(window.__draws!==draws)window.__frameTriangles.push(window.__triangles-before);});
    });
    const send=m=>page.evaluate(data=>window.dispatchEvent(new MessageEvent('message',{data})),m);
    const settle=()=>page.evaluate(()=>new Promise(resolve=>{
      let previous=window.__draws,stable=0;
      function tick(){const current=window.__draws;stable=current===previous?stable+1:0;previous=current;if(stable>=4)resolve();else requestAnimationFrame(tick);}
      requestAnimationFrame(tick);
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector('canvas');
    const zoom=page.getByRole('spinbutton',{name:'拡大率（%）',exact:true});
    const value=()=>zoom.evaluate(el=>el.valueAsNumber);
    for(const id of ['zoom','zoom-in','zoom-out']) assert.equal(await page.locator('#'+id).isDisabled(),true);
    await send({type:'displaySettings',settings:{renderMode:'bead',color:'feature',eventVisible:{currentPosition:false,retract:false,unretract:false,wipe:false,outerStart:false}}});
    const load=()=>send({type:'toolpath',index:0,data:packed(sliced.replace('Top surface','Outer wall'))});
    await load(); assert.equal(await zoom.isEnabled(),true); assert.equal(await value(),100);
    await page.locator('#top').click(); assert.equal(await value(),100);
    const wheelAt100=async (ctrlKey,keyDelivered,deltaY=-100,deltaMode=0)=>{
      await zoom.fill('100'); await zoom.press('Enter');
      if(keyDelivered) await page.keyboard.down('Control');
      try {
        return await page.locator('canvas').evaluate((canvas,options)=>{
          canvas.dispatchEvent(new WheelEvent('wheel',{...options,clientX:450,clientY:400,bubbles:true,cancelable:true}));
          return Number(document.getElementById('zoom').value);
        },{ctrlKey,deltaY,deltaMode});
      } finally {if(keyDelivered) await page.keyboard.up('Control');}
    };
    // Host focus: ctrlKey reaches the wheel event, but no keydown reaches the webview.
    const hostFocused=await wheelAt100(true,false), ordinary=await wheelAt100(false,false), accelerated=await wheelAt100(false,false,-1000);
    await page.mouse.move(450,400); await page.mouse.down(); await page.mouse.move(490,425,{steps:6}); await page.mouse.up();
    // View focus after rotation: the webview receives the real Control keydown too.
    const viewFocused=await wheelAt100(true,true);
    assert.equal(viewFocused,hostFocused,'Ctrl+wheel sensitivity must be independent of Control keydown delivery');
    assert.equal(viewFocused,accelerated,'Ctrl+wheel applies the 10x acceleration exactly once');
    assert.ok(viewFocused>ordinary*1.4,'Ctrl+wheel is faster than ordinary wheel zoom');
    for(const mode of [1,2]) assert.equal(await wheelAt100(true,true,-2,mode),await wheelAt100(false,false,-20,mode),'line/page wheel units retain exactly one acceleration');
    await page.locator('#top').click();
    assert.equal(await zoom.getAttribute('step'),'1');
    await zoom.fill('150.6'); await zoom.press('Enter'); assert.equal(await value(),151,'fractional input rounds to a whole percentage');
    await page.locator('#top').click();
    const initial=orangePixels(await page.locator('canvas').screenshot());
    await zoom.fill('150'); await zoom.press('Enter'); assert.equal(await value(),150);
    assert.ok(orangePixels(await page.locator('canvas').screenshot())>initial*1.5,'numeric zoom must enlarge the rendered paths');
    await zoom.fill('200'); await zoom.press('Tab'); assert.equal(await value(),200);
    await page.getByRole('button',{name:'拡大',exact:true}).click(); assert.equal(await value(),250);
    await page.getByRole('button',{name:'縮小',exact:true}).click(); assert.equal(await value(),200);
    await page.mouse.move(450,400); await page.mouse.wheel(0,-300);
    await page.waitForFunction(()=>Number(document.getElementById('zoom').value)>200);
    const wheelZoom=await value();
    assert.equal(Number.isInteger(wheelZoom),true,'wheel zoom displays a whole percentage');
    await settle();
    const fullTriangles=await page.evaluate(()=>window.__frameTriangles.at(-1));
    const idleDraws=await page.evaluate(()=>window.__draws);
    await page.mouse.move(450,400);await page.mouse.down();await page.mouse.up();await settle();
    assert.equal(await page.evaluate(()=>window.__draws),idleDraws,'a click without camera movement must not schedule expensive renders');
    await page.evaluate(()=>window.__frameTriangles=[]);
    await page.mouse.move(450,400); await page.mouse.down(); await page.mouse.move(490,425,{steps:6}); await page.mouse.up();
    await settle();
    let motionFrames=await page.evaluate(()=>window.__frameTriangles);
    assert.ok(motionFrames.length>0&&motionFrames.every(count=>count===fullTriangles),'rotation retains the same fixed geometry on every frame');
    assert.equal(motionFrames.at(-1),fullTriangles,'rotation inertia retains fixed geometry');
    assert.ok(Math.abs(await value()-wheelZoom)<.2,'rotation must retain zoom');
    await page.evaluate(()=>window.__frameTriangles=[]);
    await page.mouse.down({button:'right'}); await page.mouse.move(470,410,{steps:4}); await page.mouse.up({button:'right'});
    await settle();motionFrames=await page.evaluate(()=>window.__frameTriangles);
    assert.ok(motionFrames.length>0&&motionFrames.every(count=>count===fullTriangles),'panning retains the same fixed geometry on every frame');
    assert.equal(motionFrames.at(-1),fullTriangles,'panning inertia retains fixed geometry');
    assert.ok(Math.abs(await value()-wheelZoom)<.2,'panning must retain zoom');
    await page.mouse.down();
    for(const [id,mode,expected] of [['color','speed',fullTriangles],['render-mode','line',0],['render-mode','bead',fullTriangles]]) {
      await page.locator('#'+id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change'));},mode);
      await page.locator('canvas').screenshot();
      assert.equal(await page.evaluate(()=>window.__frameTriangles.at(-1)),expected,'recreated path groups retain the same fixed detail');
    }
    await page.mouse.up();await settle();
    assert.equal(await page.evaluate(()=>window.__frameTriangles.at(-1)),fullTriangles);
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab');
    await page.locator('#color').selectOption('speed'); await page.locator('#render-mode').selectOption('line');
    assert.ok(Math.abs(await value()-wheelZoom)<.2,'layer and display changes must retain zoom');
    await zoom.fill('999'); await zoom.press('Escape'); assert.ok(Math.abs(await value()-wheelZoom)<.2,'Escape cancels an edit');
    for(const invalid of ['','0','-20']) {await zoom.fill(invalid);await zoom.press('Enter');assert.ok(Math.abs(await value()-wheelZoom)<.2,'invalid input restores the current zoom');}
    await zoom.fill('.5'); await zoom.press('Enter'); assert.equal(await value(),1); assert.equal(await page.locator('#zoom-out').isDisabled(),true);
    await zoom.fill('1000000'); await zoom.press('Enter'); assert.equal(await value(),100000); assert.equal(await page.locator('#zoom-in').isDisabled(),true);
    for(const id of ['fit','top','iso']) {await page.locator('#'+id).click();assert.equal(await value(),100,'view presets reset zoom to 100%');}
    await page.locator('#render-mode').selectOption('bead'); await page.locator('#color').selectOption('feature');
    await zoom.fill('125'); await zoom.press('Enter');
    await page.screenshot({path:'test-results/zoom/zoom-ja.png'});
    await page.setViewportSize({width:500,height:650});
    assert.equal(await value(),125);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'zoom toolbar must fit narrow windows');
    await page.screenshot({path:'test-results/zoom/zoom-narrow.png'});
    await send({type:'loading'}); assert.equal(await zoom.isDisabled(),true);
    await load(); assert.equal(await value(),100); assert.equal(await zoom.isEnabled(),true);
    await send({type:'model',bytes:Buffer.from(modelArchive()).toString('base64')});
    assert.equal(await value(),100); assert.equal(await zoom.isEnabled(),true,'model-only preview supports zoom');
    await zoom.fill('175'); await zoom.press('Enter'); assert.equal(await value(),175);
    await send({type:'error',message:'Zoom test error'}); assert.equal(await zoom.isDisabled(),true);
    await page.setViewportSize({width:1200,height:850});
    await page.goto(`http://127.0.0.1:${server.address().port}/en`); await page.waitForSelector('canvas');
    await load();
    const englishZoom=page.getByRole('spinbutton',{name:'Zoom (%)',exact:true});
    await englishZoom.fill('125'); await englishZoom.press('Enter');
    assert.equal(await englishZoom.inputValue(),'125'); assert.equal(await page.getByRole('button',{name:'Zoom in',exact:true}).isEnabled(),true);
    await page.screenshot({path:'test-results/zoom/zoom-en.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS zoom UI: fit percentage, numeric input, buttons, wheel, rotation/pan, layer changes, limits, reset, loading/model/error, Japanese/English and narrow layout');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
