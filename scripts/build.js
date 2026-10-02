const esbuild = require('esbuild');
async function build() {
  await esbuild.build({ entryPoints: ['src/extension.js', 'src/worker.js'], bundle: true, platform: 'node', target: 'node20', outdir: 'dist', external: ['vscode'], legalComments: 'eof' });
  await esbuild.build({ entryPoints: ['src/webview.js'], bundle: true, platform: 'browser', target: 'es2022', outfile: 'dist/webview.js', legalComments: 'eof' });
  require('node:fs').copyFileSync('src/webview.css', 'dist/webview.css');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
