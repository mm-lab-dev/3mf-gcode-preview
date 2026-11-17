// Run after npm run build. All browser state and artifacts stay in the repo.
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {getHtml}=require('../src/html');
const {parseGcode}=require('../src/gcode');
function packed(text) {
  const data=parseGcode(text);
  for(const key of ['positions','types','sourceTypes','speeds','tools','lines','widths','displayWidths','heights','dimensionSources','eventPositions','eventKinds','eventIndices','eventLayers']) data[key]=Buffer.from(data[key].buffer).toString('base64');
  return data;
}
async function main() {
  fs.mkdirSync('test-results',{recursive:true});
  const server=http.createServer((req,res)=>{
    if(req.url==='/'||req.url==='/en') {res.setHeader('Content-Type','text/html');res.end(getHtml({scriptUri:'/webview.js',styleUri:'/webview.css',cspSource:"'self'",nonce:'dimensions',language:req.url==='/en'?'en-US':'ja'}));}
    else if(['/webview.js','/webview.css'].includes(req.url)) {res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join('dist',req.url.slice(1))));}
    else {res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launchPersistentContext(path.resolve('test-results/dimensions-profile'),{headless:true,viewport:{width:1400,height:950},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|GL_INVALID|GLSL/.test(m.text()))errors.push(m.text());});
    await page.addInitScript(()=>{let state;window.acquireVsCodeApi=()=>({postMessage(){},getState:()=>state,setState:s=>{state=s;}});});
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('canvas');
    const send=message=>page.evaluate(data=>window.dispatchEvent(new MessageEvent('message',{data})),message);
    const load=async text=>{
      await send({type:'archive',plates:['dimensions.gcode'],structure:{},filename:'dimensions.gcode'});
      await send({type:'toolpath',index:0,data:packed(text)});
    };
    await send({type:'displaySettings',settings:{color:'feature',renderMode:'bead',eventVisible:{currentPosition:false,retract:false,unretract:false,wipe:false,outerStart:false}}});
    const comparison=';ironing_spacing = .15\nM83\n;CHANGE_LAYER\n;Z_HEIGHT:.14\n;LAYER_HEIGHT:.14\n;LINE_WIDTH:.5\nG0 X0 Y0 Z.14\n;FEATURE:Internal solid infill\nG1 X10 E1\nG0 X0 Y2\n;FEATURE:Ironing\n;LAYER_HEIGHT:.003\n;LINE_WIDTH:.400644\nG1 X10 E.01';
    await load(comparison);
    assert.match(await page.locator('#layer-label').innerText(),/経路Z: 0\.140 mm/);
    assert.match(await page.locator('#layer-label').innerText(),/押出し厚: 0\.003 – 0\.140 mm/);
    assert.match(await page.locator('#details').innerText(),/線幅: 0\.401 mm \(スライサー換算\).*押出し厚: 0\.003 mm \(スライサー換算\)/);
    assert.match(await page.locator('#details').innerText(),/描画幅: 0\.150 mm/);
    await page.screenshot({path:'test-results/dimensions-comparison.png'});
    await page.locator('#render-mode').selectOption('line');
    assert.match(await page.locator('#details').innerText(),/押出し厚: 0\.003 mm/);
    await page.locator('#render-mode').selectOption('bead');
    await page.locator('#step').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input'));});
    assert.match(await page.locator('#details').innerText(),/経路未再生/);
    assert.doesNotMatch(await page.locator('#details').innerText(),/線幅:/);
    await load('M83\n;LAYER:0\nG0 Z.14\nG1 X10 E1\n;LAYER:1\nG0 Z.23\nG1 X20 E1');
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab');
    assert.match(await page.locator('#layer-label').innerText(),/層ピッチ: 0\.090 – 0\.140 mm/);
    assert.match(await page.locator('#details').innerText(),/線幅: 0\.450 mm \(既定値\).*押出し厚: 0\.090 mm \(Z差から推定\)/);
    // A small concentric fixture makes the lighting across each thin pass
    // visible at screenshot resolution, including corners and open ends.
    let rings='M83\n;ironing_spacing = .15\n;LAYER:0\nG0 Z.2\n;FEATURE:Ironing\n;WIDTH:.400644\n;HEIGHT:.003\n';
    for(let ring=1;ring<=10;ring++) {
      const radius=ring*.15/Math.cos(Math.PI/6);
      for(let corner=0;corner<=6;corner++) {
        const angle=(corner+.12)*Math.PI/3;
        rings+=`${corner?'G1':'G0'} X${(radius*Math.cos(angle)).toFixed(6)} Y${(radius*Math.sin(angle)).toFixed(6)}${corner?' E.001':''}\n`;
      }
    }
    await load(rings);
    const zoomFixture=async()=>{
      const bounds=await page.locator('canvas').boundingBox();
      await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      await page.mouse.wheel(0,-650); await page.waitForTimeout(400);
    };
    await page.locator('#top').click(); await zoomFixture();
    await page.screenshot({path:'test-results/ironing-lighting-top.png'});
    await page.locator('#iso').click(); await zoomFixture();
    await page.screenshot({path:'test-results/ironing-lighting-iso.png'});
    if(fs.existsSync('sample/20-3.gcode')) {
      await load(fs.readFileSync('sample/20-3.gcode','utf8'));
      await page.locator('#single').check();
      await page.locator('#upper-number').fill('10'); await page.locator('#upper-number').press('Tab');
      const side=await page.locator('#layer-label').innerText(), footer=await page.locator('#details').innerText();
      assert.match(side,/経路Z: 1\.040 mm/); assert.match(side,/層ピッチ: 0\.100 mm/); assert.match(side,/押出し厚: 0\.003 – 0\.100 mm/);
      assert.match(footer,/線幅: 0\.401 mm \(スライサー換算\).*押出し厚: 0\.003 mm \(スライサー換算\)/);
      await page.screenshot({path:'test-results/dimensions-sample10-3d.png'});
      await page.locator('#top').click(); await page.screenshot({path:'test-results/dimensions-sample10-top.png'});
      const viewport=await page.locator('canvas').boundingBox();
      await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);
      await page.mouse.wheel(0,-650);
      await page.screenshot({path:'test-results/ironing-paths-after.png'});
      const legacy=packed(fs.readFileSync('sample/20-3.gcode','utf8'));
      legacy.displayWidths=legacy.widths;
      await send({type:'toolpath',index:0,data:legacy});
      await page.locator('#top').click();
      await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);
      await page.mouse.wheel(0,-650);
      await page.screenshot({path:'test-results/ironing-paths-before.png'});
      fs.writeFileSync('test-results/dimensions-ui.json',JSON.stringify({side,footer,errors},null,2)+'\n');
    }
    await send({type:'error',message:'Binary G-code is not supported. Export a text .gcode file.'});
    assert.equal(await page.locator('#status').innerText(),'読込エラー');
    assert.match(await page.locator('#warning').innerText(),/バイナリG-codeには対応していません/);
    await page.goto(`http://127.0.0.1:${server.address().port}/en`); await page.waitForSelector('canvas');
    await load(comparison);
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    const englishSide=await page.locator('#layer-label').innerText();
    for(const label of ['Path Z: 0.140 mm','Layer pitch: 0.140 mm','Deposited Z bounds:','Width:','Bead height: 0.003 – 0.140 mm','Display width:','Ironing spacing: 0.150 mm']) assert.ok(englishSide.includes(label),label);
    assert.match(await page.locator('#details').innerText(),/Width: 0\.401 mm \(slicer equivalent\).*Bead height: 0\.003 mm \(slicer equivalent\).*Display width: 0\.150 mm/);
    assert.doesNotMatch(englishSide,/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u);
    await page.screenshot({path:'test-results/dimensions-comparison-en.png'});
    await page.locator('#step').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input'));});
    assert.match(await page.locator('#details').innerText(),/No path played/);
    await load('M83\n;LAYER:0\nG0 Z.14\nG1 X10 E1\n;LAYER:1\nG0 Z.23\nG1 X20 E1');
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab');
    assert.match(await page.locator('#details').innerText(),/Width: 0\.450 mm \(default\).*Bead height: 0\.090 mm \(estimated from Z spacing\)/);
    await send({type:'error',message:'Binary G-code is not supported. Export a text .gcode file.'});
    assert.equal(await page.locator('#status').innerText(),'Load error');
    assert.equal(await page.locator('#warning').innerText(),'Binary G-code is not supported. Export a text .gcode file.');
    assert.deepEqual(errors,[]);
    console.log('PASS dimensions UI: selection, playback, origins, thin ironing, adaptive height, bead/line modes and sample layer 10');
  } finally {await browser?.close(); await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
