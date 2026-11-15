const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PNG}=require('pngjs');
const {getHtml}=require('../src/html');
const {parseGcode}=require('../src/gcode');
const {createHash}=require('node:crypto');

async function main() {
  const input=path.resolve('sample/16.gcode');
  if(!fs.existsSync(input)) { console.log('SKIP marker sample: sample/16.gcode is unavailable'); return; }
  const bytes=fs.readFileSync(input), data=parseGcode(bytes.toString('utf8'));
  // Isolate first-layer events without changing any toolpath or the input file.
  const keep=Array.from(data.eventLayers.keys()).filter(i=>data.eventLayers[i]===0);
  for(const [key,stride] of [['eventPositions',3],['eventKinds',1],['eventIndices',1],['eventLayers',1]]) {
    const original=data[key]; data[key]=new original.constructor(keep.flatMap(i=>Array.from(original.slice(i*stride,(i+1)*stride))));
  }
  data.eventCount=keep.length;
  for(const key of ['positions','types','sourceTypes','speeds','tools','lines','widths','heights','eventPositions','eventKinds','eventIndices','eventLayers']) data[key]=Buffer.from(data[key].buffer).toString('base64');
  const server=http.createServer((req,res)=>{
    if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end(getHtml({scriptUri:'/webview.js',styleUri:'/webview.css',cspSource:"'self'",nonce:'test',language:'ja'}));}
    else if(['/webview.js','/webview.css'].includes(req.url)) {res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(req.url==='/webview.js'&&process.env.WEBVIEW_JS_PATH?process.env.WEBVIEW_JS_PATH:path.join(__dirname,'../dist',req.url)));}
    else {res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    fs.mkdirSync('test-results',{recursive:true});
    browser=await chromium.launchPersistentContext(path.resolve('test-results/marker-sample-profile'),{headless:true,viewport:{width:1200,height:850},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|GL_INVALID|GLSL/.test(m.text()))errors.push(m.text());});
    await page.addInitScript(()=>{let state;window.acquireVsCodeApi=()=>({postMessage(){},getState:()=>state,setState:s=>{state=s;}});});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector('canvas');
    const send=message=>page.evaluate(m=>window.dispatchEvent(new MessageEvent('message',{data:m})),message);
    const settings=on=>({color:'feature',renderMode:'bead',eventVisible:{retract:on,unretract:on,wipe:on,outerStart:on,currentPosition:false}});
    await send({type:'displaySettings',settings:settings(true)});
    await send({type:'toolpath',index:0,data});
    await page.locator('#upper-number').fill('2');await page.locator('#upper-number').press('Tab');
    const measurements=[];
    for(const view of ['top','iso','top-zoom','iso-zoom']) {
      await page.locator('#'+view.split('-')[0]).click();
      if(view.endsWith('-zoom')) {await page.locator('canvas').hover();await page.mouse.wheel(0,-1800);}
      const shown=await page.locator('canvas').screenshot();
      fs.writeFileSync(`test-results/sample16-layer2-${view}.png`,shown);
      await send({type:'displaySettings',settings:settings(false)});
      const hidden=PNG.sync.read(await page.locator('canvas').screenshot());
      await page.locator('#single').check();
      const upperImage=await page.locator('canvas').screenshot();
      fs.writeFileSync(`test-results/sample16-layer2-${view}-reference.png`,upperImage);
      const upper=PNG.sync.read(upperImage),actual=PNG.sync.read(shown);
      const blue=(x,y)=>{const p=(y*upper.width+x)*4,r=upper.data[p],g=upper.data[p+1],b=upper.data[p+2];return b>100&&b>r*1.3&&b>g*1.05;};
      let leaks=0;
      for(let y=2;y<upper.height-2;y++) for(let x=2;x<upper.width-2;x++) {
        // Exclude bead edges and real gaps, where lower layers may be visible.
        if(!blue(x,y)||!blue(x-1,y)||!blue(x+1,y)||!blue(x,y-1)||!blue(x,y+1)) continue;
        const p=(y*upper.width+x)*4,r=actual.data[p],g=actual.data[p+1],b=actual.data[p+2];
        if(Math.max(Math.abs(r-hidden.data[p]),Math.abs(g-hidden.data[p+1]),Math.abs(b-hidden.data[p+2]))<40) continue;
        if((r>130&&g>r*.88&&b<110)||(b>130&&g>130&&r<110&&g>b*.78)||(r>130&&b>130&&g<110)||(r>210&&g>210&&b>210&&Math.max(r,g,b)-Math.min(r,g,b)<15)) leaks++;
      }
      measurements.push({view,leaks});
      await page.locator('#single').uncheck();
      await send({type:'displaySettings',settings:settings(true)});
    }
    await page.locator('#single').check();
    await page.locator('#upper-number').fill('1');await page.locator('#upper-number').press('Tab');
    await page.locator('#iso').click();
    const exposed=PNG.sync.read(await page.locator('canvas').screenshot());
    await send({type:'displaySettings',settings:settings(false)});
    const absent=PNG.sync.read(await page.locator('canvas').screenshot());
    let visible=0;
    for(let p=0;p<exposed.data.length;p+=4) if(Math.max(...[0,1,2].map(c=>Math.abs(exposed.data[p+c]-absent.data[p+c])))>80) visible++;
    assert.ok(visible>100,'exposed first-layer markers remain visible from the side');
    assert.deepEqual(errors,[]);
    assert.equal(createHash('sha256').update(fs.readFileSync(input)).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
    console.log(JSON.stringify(measurements));
    fs.writeFileSync('test-results/sample16-markers.json',JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex'),measurements},null,2)+'\n');
    for(const result of measurements) assert.ok(result.leaks<3,`${result.view}: first-layer markers leak over second-layer solid paths (${result.leaks} pixels)`);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
