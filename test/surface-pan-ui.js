const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {buildSync}=require('esbuild'),{chromium}=require('playwright');
const {getHtml}=require('../src/html'),{parseGcode}=require('../src/gcode');
const {modelArchive}=require('./fixtures');
const instrumentation=`
const originalPick=surfacePicker.pick.bind(surfacePicker);
surfacePicker.pick=(...args)=>{window.pickCalls++;const p=originalPick(...args);window.picked=p?.toArray();return p;};
window.pickCalls=0;
window.panTest={setup(percent,x=0,y=0){
  surfacePan.cancel();controls._panOffset.set(0,0,0);controls._sphericalDelta.set(0,0,0);
  const d=42*100/percent;controls.target.set(x,y,20);camera.position.set(x,y-0.000001,20+d);
  zoomReferenceDistance=42;zoomReferenceFar=4200;controls.minDistance=0;controls.maxDistance=Infinity;
  controls.update();syncZoom();requestRender();
},project(p){camera.updateMatrixWorld();const v=new THREE.Vector3(...p).project(camera),r=renderer.domElement.getBoundingClientRect();return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},target(){return controls.target.toArray();},enabled(){return controls.enabled;}};
`;
const script=buildSync({stdin:{contents:fs.readFileSync('src/webview.js','utf8')+instrumentation,resolveDir:path.resolve('src')},bundle:true,write:false,format:'iife'}).outputFiles[0].text;
const data=parseGcode('M83\n; CHANGE_LAYER\n; Z_HEIGHT: .2\n; WIDTH: 20\n; HEIGHT: .2\n; FEATURE: Outer wall\nG0 X-50 Y0 Z.2\nG1 X50 E100');
for(const[k,v]of Object.entries(data))if(ArrayBuffer.isView(v))data[k]=Buffer.from(v.buffer).toString('base64');
(async()=>{
  fs.mkdirSync('test-results/surface-pan',{recursive:true});
  const server=http.createServer((req,res)=>{
    if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(script);}
    else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync('dist/webview.css'));}
    else res.end(getHtml({scriptUri:'/app.js',styleUri:'/app.css',cspSource:"'self'",nonce:'surface-pan',language:'en'}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try {
    browser=await chromium.launchPersistentContext(path.resolve('test-results/surface-pan/profile'),{headless:true,viewport:{width:1200,height:850},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage(),errors=[],results=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>window.acquireVsCodeApi=()=>({postMessage(){},getState(){},setState(){}}));
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.panTest);
    const send=message=>page.evaluate(data=>window.dispatchEvent(new MessageEvent('message',{data})),message);
    await send({type:'toolpath',index:0,data});
    await send({type:'displaySettings',settings:{eventVisible:{currentPosition:false,retract:false,unretract:false,wipe:false,outerStart:false}}});
    for(const zoom of [100,4000,100000]) {
      await page.evaluate(z=>window.panTest.setup(z),zoom);await page.locator('canvas').screenshot();
      const box=await page.locator('canvas').boundingBox(),start={x:box.x+box.width/2,y:box.y+box.height/2};
      const calls=await page.evaluate(()=>window.pickCalls);
      await page.mouse.move(start.x,start.y);await page.mouse.down({button:'right'});
      const picked=await page.evaluate(()=>window.picked);
      assert.ok(picked,'grab must hit the shader-deformed bead, not its shared template');
      assert.ok(Math.abs(picked[2]-.2)<.05,`picked bead top has wrong depth: ${picked}`);
      const surfacePoint=[picked[0],picked[1],.2];
      for(let i=1;i<=5;i++) {
        const x=start.x+i*8,y=start.y+i*4;await page.mouse.move(x,y);
        const projected=await page.evaluate(p=>window.panTest.project(p),surfacePoint);
        const error=Math.hypot(projected[0]-x,projected[1]-y);
        assert.ok(error<.3,`${zoom}% step ${i} lags by ${error}px while held`);
        results.push({zoom,step:i,errorPixels:error});
      }
      assert.equal(await page.evaluate(()=>window.pickCalls),calls+1,'depth is read only once per grab');
      const before=await page.evaluate(p=>window.panTest.project(p),picked);
      await page.mouse.up({button:'right'});
      await page.evaluate(()=>new Promise(r=>{let n=0;function tick(){if(++n===12)r();else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
      const after=await page.evaluate(p=>window.panTest.project(p),picked);
      assert.ok(Math.hypot(after[0]-before[0],after[1]-before[1])<.01,'pan must not coast after release');
      assert.equal(await page.evaluate(()=>window.panTest.enabled()),true);
      assert.equal(await page.locator('#zoom').inputValue(),String(zoom),'panning preserves zoom');
      await page.screenshot({path:`test-results/surface-pan/pan-${zoom}.png`});
    }
    // Grabbing empty space uses the target plane and cancellation restores orbit controls.
    await page.locator('#legend button').first().click();
    await page.mouse.move(400,350);await page.mouse.down({button:'right'});
    assert.equal(await page.evaluate(()=>window.picked),undefined);
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(()=>window.panTest.enabled()),true);
    await page.mouse.up({button:'right'});
    await send({type:'model',bytes:Buffer.from(modelArchive()).toString('base64')});
    await page.evaluate(()=>window.panTest.setup(100000,5,5));await page.locator('canvas').screenshot();
    const modelBox=await page.locator('canvas').boundingBox();
    const modelStart={x:modelBox.x+modelBox.width/2,y:modelBox.y+modelBox.height/2};
    await page.mouse.move(modelStart.x,modelStart.y);await page.mouse.down({button:'right'});
    const modelPoint=await page.evaluate(()=>window.picked);
    assert.ok(modelPoint&&Math.abs(modelPoint[2]-10)<.05,'model-only grab must hit the visible triangular face');
    await page.mouse.move(modelStart.x+30,modelStart.y+15);
    const modelScreen=await page.evaluate(p=>window.panTest.project(p),modelPoint);
    assert.ok(Math.hypot(modelScreen[0]-modelStart.x-30,modelScreen[1]-modelStart.y-15)<.3,'model-only face follows the held cursor');
    await page.mouse.up({button:'right'});
    assert.deepEqual(errors,[]);
    fs.writeFileSync('test-results/surface-pan/results.json',JSON.stringify(results,null,2));
    console.log('PASS surface pan UI: per-move cursor tracking at 100/4000/100000%, rendered bead depth, single readback, no inertia, zoom retention, empty space and cancellation');
  } finally {await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
