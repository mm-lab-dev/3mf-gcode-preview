// Capture README review images from the local, ignored Bambu Studio sample.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { getHtml } = require('../src/html');
const { inspectArchive } = require('../src/archive');
const { parseGcode } = require('../src/gcode');

const root = path.resolve(__dirname, '..');
const sample = path.join(root, 'sample', 'sample.gcode.3mf');
const output = path.join(root, 'test-results');
const packedKeys = ['positions','types','speeds','tools','lines','widths','heights','eventPositions','eventKinds','eventIndices','eventLayers'];

async function main() {
  if (!fs.existsSync(sample)) throw new Error(`Missing local screenshot sample: ${sample}`);
  fs.mkdirSync(output, { recursive: true });
  const archive = inspectArchive(fs.readFileSync(sample));
  const data = parseGcode(archive.plates[0].gcode);
  for (const key of packedKeys) data[key] = Buffer.from(data[key].buffer).toString('base64');
  const server = http.createServer((request, response) => {
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(getHtml({ scriptUri: '/webview.js', styleUri: '/webview.css', cspSource: "'self'", nonce: 'readme-capture', language: 'en-US' }));
    } else if (request.url === '/webview.js' || request.url === '/webview.css') {
      response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/css');
      response.end(fs.readFileSync(path.join(root, 'dist', request.url.slice(1))));
    } else response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launchPersistentContext(path.join(output, 'readme-profile'), {
      headless: true, viewport: { width: 1200, height: 850 },
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      let state;
      window.acquireVsCodeApi = () => ({ postMessage() {}, getState: () => state, setState: value => { state = value; } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const send = message => page.evaluate(value => window.dispatchEvent(new MessageEvent('message', { data: value })), message);
    await send({ type: 'archive', plates: archive.plates.map(plate => plate.name), structure: archive.structure, filename: path.basename(sample) });
    await send({ type: 'toolpath', index: 0, data });
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('200 layers'));
    await page.waitForTimeout(400);
    const shot = async name => page.screenshot({ path: path.join(output, `readme-${name}.png`) });
    await shot('overview');

    await page.locator('#upper-number').fill('55');
    await page.locator('#upper-number').press('Tab');
    await page.locator('#top').click();
    await page.waitForTimeout(200);
    await shot('layer-range');

    await page.locator('#single').check();
    await page.locator('#render-mode').selectOption('line');
    await page.locator('#color').selectOption('speed');
    await page.waitForTimeout(200);
    await shot('single-layer');

    await page.locator('#single').uncheck();
    await page.locator('#upper-number').fill('200');
    await page.locator('#upper-number').press('Tab');
    await page.locator('#color').selectOption('feature');
    await page.locator('#render-mode').selectOption('bead');
    await page.locator('#iso').click();
    await page.locator('#structure-toggle').click();
    await page.waitForTimeout(200);
    await shot('structure');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Captured README screenshots in test-results.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
