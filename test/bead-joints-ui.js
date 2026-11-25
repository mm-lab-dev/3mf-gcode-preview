const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PNG}=require('pngjs');
const {getHtml}=require('../src/html');
const {parseGcode}=require('../src/gcode');

function packed(text) {
  const data=parseGcode(text);
  for(const [key,value] of Object.entries(data)) if(ArrayBuffer.isView(value)) data[key]=Buffer.from(value.buffer).toString('base64');
  return data;
}
function pixels(buffer) {
  const png=PNG.sync.read(buffer), bounds={minX:png.width,minY:png.height,maxX:0,maxY:0}, orange=[];
  for(let y=0;y<png.height;y++) for(let x=0;x<png.width;x++) {
    const p=(y*png.width+x)*4, d=png.data;
    if(d[p]>100&&d[p]>d[p+1]*1.25&&d[p+1]>d[p+2]*1.15) {
      bounds.minX=Math.min(bounds.minX,x); bounds.maxX=Math.max(bounds.maxX,x);
      bounds.minY=Math.min(bounds.minY,y); bounds.maxY=Math.max(bounds.maxY,y); orange.push(y*png.width+x);
    }
  }
  const mask=new Set(orange);
  return {png,bounds,count:orange.length,has:(x,y)=>mask.has(Math.round(y)*png.width+Math.round(x))};
}
async function main() {
  const artifacts=path.resolve(process.env.BEAD_JOINTS_ARTIFACTS??'test-results/view006/joints');
  const relative=path.relative(path.resolve('test-results'),artifacts);
  if(relative.startsWith('..')||path.isAbsolute(relative)) throw new Error('UI artifacts must stay under test-results.');
  fs.mkdirSync(artifacts,{recursive:true});
  const server=http.createServer((req,res)=>{
    if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end(getHtml({scriptUri:'/webview.js',styleUri:'/webview.css',cspSource:"'self'",nonce:'bead-joints',language:'ja'}));}
    else if(['/webview.js','/webview.css'].includes(req.url)) {
      res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');
      res.end(fs.readFileSync(req.url==='/webview.js'&&process.env.WEBVIEW_JS_PATH?process.env.WEBVIEW_JS_PATH:path.join('dist',req.url.slice(1))));
    } else {res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launchPersistentContext(path.resolve('test-results/bead-joints-profile'),{headless:true,viewport:{width:1200,height:850},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|GL_INVALID|GLSL/.test(m.text())) errors.push(m.text());});
    await page.addInitScript(()=>{let state;window.acquireVsCodeApi=()=>({postMessage(){},getState:()=>state,setState:s=>{state=s;}});});
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('canvas');
    const send=message=>page.evaluate(data=>window.dispatchEvent(new MessageEvent('message',{data})),message);
    const load=async text=>{
      await send({type:'displaySettings',settings:{color:'feature',renderMode:'bead',eventVisible:{currentPosition:false,retract:false,unretract:false,wipe:false,outerStart:false}}});
      await send({type:'toolpath',index:0,data:packed(text)});
    };
    const header='M83\n; CHANGE_LAYER\n; Z_HEIGHT: .2\n; WIDTH: .8\n; HEIGHT: .2\n; FEATURE: Outer wall\nG0 X0 Y0 Z.2\n';
    for(const turn of [1,-1]) {
      await load(header+`G1 X5 E1\nG1 Y${turn*5} E1`); await page.locator('#top').click();
      const image=await page.locator('canvas').screenshot();
      fs.writeFileSync(path.join(artifacts,`miter-corner-${turn}.png`),image);
      const {png,bounds,has}=pixels(image), scale=(bounds.maxX-bounds.minX)/5.4;
      const screen=(x,y)=>[bounds.minX+x*scale,bounds.minY+((turn>0?5:.4)-y)*scale];
      for(const angle of [0,15,30,45,60,75,90]) {
        const a=angle*Math.PI/180, p=screen(5+.32*Math.cos(a),-turn*.32*Math.sin(a));
        assert.ok(has(...p),`turn ${turn}: miter surface at ${angle} degrees must be filled`);
      }
      assert.equal(has(...screen(5.35,-turn*.35)),true,'the outer corner must retain the mitered boundary');
      // Both joined sections must have continuous lighting.
      const red=angle=>{const a=angle*Math.PI/180,p=screen(5+.25*Math.cos(a),-turn*.25*Math.sin(a));return png.data[(Math.round(p[1])*png.width+Math.round(p[0]))*4];};
      assert.ok(Math.abs(red(35)-red(55))<30,'miter sides must have continuous lighting');
      await page.locator('#iso').click(); await page.screenshot({path:path.join(artifacts,`miter-corner-${turn}-iso.png`)});
      await page.locator('#step').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input'));});
      await page.screenshot({path:path.join(artifacts,`miter-corner-${turn}-partial.png`)});
      await page.locator('#step').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input'));});
      assert.equal(pixels(await page.locator('canvas').screenshot()).count,0,'empty playback must hide all miter surfaces');
      await page.locator('#step').evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input'));});
      const legend=page.locator('#legend button[data-category="1"]');
      await legend.click(); assert.equal(pixels(await page.locator('canvas').screenshot()).count,0,'hidden category must hide its miter surfaces');
      await legend.click(); assert.ok(pixels(await page.locator('canvas').screenshot()).count>1000,'restored category must restore its miter surfaces');
    }
    const ring='M83\n; CHANGE_LAYER\n; Z_HEIGHT: .2\n; FEATURE: Outer wall\nG0 X2 Y0 Z.2\n'+Array.from({length:12},(_,i)=>{
      const a=(i+1)*Math.PI/6;
      return `; WIDTH: ${i%2?.9:.7}\n; HEIGHT: ${i%2?.003:.2}\nG1 X${(2*Math.cos(a)).toFixed(6)} Y${(2*Math.sin(a)).toFixed(6)} E.01`;
    }).join('\n');
    await load(ring); await page.locator('#top').click(); await page.screenshot({path:path.join(artifacts,'miter-variable-ring.png')});
    await page.mouse.move(470,430); await page.mouse.wheel(0,-1600);
    await page.screenshot({path:path.join(artifacts,'miter-variable-ring-zoom.png')});
    await page.locator('#iso').click(); await page.screenshot({path:path.join(artifacts,'miter-variable-ring-iso.png')});
    // A closed mitered seam must cap correctly when the last category is hidden.
    await load(header+'G1 X5 E1\nG1 Y5 E1\n; FEATURE: Inner wall\nG1 X0 Y0 E1');
    await page.locator('#legend button[data-category="2"]').click();
    await page.screenshot({path:path.join(artifacts,'miter-filtered-seam.png')});
    await page.locator('#legend button[data-category="2"]').click();
    await page.locator('#color').selectOption('speed'); await page.locator('#color').selectOption('tool'); await page.locator('#color').selectOption('feature');
    const mixedLayer=(z,y)=>`; CHANGE_LAYER\n; Z_HEIGHT: ${z}\n; WIDTH: .8\n; HEIGHT: .2\n; FEATURE: Outer wall\n`+[10,45,90].map((degrees,i)=>{
      const angle=degrees*Math.PI/180, x=i*7;
      return `G0 X${x} Y${y} Z${z}\nG1 X${x+2} E.01\nG1 X${(x+2+2*Math.cos(angle)).toFixed(6)} Y${(y+2*Math.sin(angle)).toFixed(6)} E.01`;
    }).join('\n');
    await load('M83\n'+mixedLayer(.2,0)+mixedLayer(.4,8));
    await page.locator('#upper-number').fill('2'); await page.locator('#upper-number').press('Tab');
    await page.locator('#top').click();
    const cumulative=pixels(await page.locator('canvas').screenshot()).count;
    await page.locator('#single').check();
    const single=pixels(await page.locator('canvas').screenshot()).count;
    assert.ok(single>100&&single<cumulative*.7,'all joined paths must follow the single-layer range');
    for(const step of [0,2,5,8,9,5,9]) {
      await page.locator('#step').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input'));},step);
      const count=pixels(await page.locator('canvas').screenshot()).count;
      assert.equal(count===0,step===0,'each joined path follows forward and backward playback');
    }
    await page.screenshot({path:path.join(artifacts,'miter-layer.png')});
    const sample='sample/20-3.gcode';
    if(fs.existsSync(sample)) {
      await load(fs.readFileSync(sample,'utf8'));
      await page.locator('#upper-number').fill('10'); await page.locator('#upper-number').press('Tab');
      await page.locator('#single').check(); await page.locator('#top').click();
      await page.screenshot({path:path.join(artifacts,'sample20-3-layer10-top.png')});
      await page.locator('#iso').click(); await page.screenshot({path:path.join(artifacts,'sample20-3-layer10-iso.png')});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS bead joints UI: mitered silhouette, both turns, lighting, width/height changes, closed seams, playback and filters');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
