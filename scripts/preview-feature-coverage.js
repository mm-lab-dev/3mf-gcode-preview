// Render the exported MODEL-001 3MF using this extension's actual model loader.
// Run after npm run build. Browser temporary files must remain in the repository.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {getHtml}=require('../src/html');
const root=path.resolve(__dirname,'..');
const temp=path.join(root,'test-results','tmp');
fs.mkdirSync(temp,{recursive:true});
process.env.TEMP=temp; process.env.TMP=temp; process.env.TMPDIR=temp;
async function main() {
  const server=http.createServer((req,res)=>{
    if(req.url==='/') {
      res.setHeader('Content-Type','text/html');
      res.end(getHtml({scriptUri:'/webview.js',styleUri:'/webview.css',cspSource:"'self'",nonce:'coverage-review',language:'en'}));
    } else if(['/webview.js','/webview.css'].includes(req.url)) {
      res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');
      res.end(fs.readFileSync(path.join(root,'dist',req.url.slice(1))));
    } else { res.statusCode=404; res.end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.messages=[];
      window.acquireVsCodeApi=()=>({postMessage:m=>window.messages.push(m),getState:()=>undefined,setState:()=>{}});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.messages.some(m=>m.type==='ready'));
    const bytes=fs.readFileSync(path.join(root,'sample/feature_coverage.3mf')).toString('base64');
    await page.evaluate(bytes=>{
      for(const data of [{type:'archive',filename:'feature_coverage.3mf',plates:[],structure:{}},{type:'model',bytes}]) window.dispatchEvent(new MessageEvent('message',{data}));
    },bytes);
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('3D model'));
    await page.waitForTimeout(500);
    await page.locator('#viewport').screenshot({path:path.join(root,'sample/feature_coverage_preview.png')});
    await page.locator('#top').click();
    await page.waitForTimeout(500);
    await page.locator('#viewport').screenshot({path:path.join(root,'sample/feature_coverage_top.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: exported 3MF loaded in the extension; isometric and top images saved.');
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
