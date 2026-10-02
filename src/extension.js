const vscode = require('vscode');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Worker } = require('node:worker_threads');
const { getHtml } = require('./html');
const { MAX_FILE } = require('./archive');
function activate(context) {
  const provider = {
    async openCustomDocument(uri) { return { uri, dispose() {} }; },
    async resolveCustomEditor(document, panel) {
      const root = vscode.Uri.joinPath(context.extensionUri, 'dist');
      panel.webview.options = { enableScripts: true, localResourceRoots: [root] };
      panel.webview.html = getHtml({ scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(root, 'webview.js')), styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(root, 'webview.css')), cspSource: panel.webview.cspSource, nonce: randomBytes(18).toString('hex'), language:vscode.env.language });
      let worker, bytes, disposed = false, selectionId = 0, generation = 0;
      const post = message => { if (!disposed) panel.webview.postMessage(message); };
      async function load() {
        const current = ++generation; selectionId++;
        if (worker) { void worker.terminate(); worker = undefined; }
        try {
          post({ type: 'loading' });
          const stat = await vscode.workspace.fs.stat(document.uri);
          if (stat.size > MAX_FILE) throw new Error('3MF exceeds the 128 MiB input limit.');
          const read = await vscode.workspace.fs.readFile(document.uri);
          if (disposed || current !== generation) return;
          bytes = read;
          worker = new Worker(path.join(context.extensionPath, 'dist', 'worker.js'));
          const currentWorker = worker;
          worker.on('message', message => {
            if (disposed || current !== generation) return;
            if (message.type === 'archive') {
              post({ type: 'archive', plates: message.plates, structure: message.structure, filename: path.basename(document.uri.path) });
              if (message.plates.length) currentWorker.postMessage({ type: 'plate', index: 0, id: ++selectionId });
              else post({ type: 'model', bytes: Buffer.from(bytes).toString('base64') });
            } else if (message.type === 'toolpath' && message.id === selectionId) {
              // VS Code messages are JSON: explicitly encode packed arrays.
              for (const key of ['positions','types','speeds','tools','lines','widths','heights','eventPositions','eventKinds','eventIndices','eventLayers']) {
                const value = message.data[key]; message.data[key] = Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
              }
              post(message);
            } else if (message.type === 'error' && (message.id === undefined || message.id === selectionId)) post(message);
          });
          worker.on('error', error => { if (current === generation) post({ type: 'error', message: error.message }); });
          worker.postMessage({ type: 'init', bytes: read });
        } catch (error) { if (current === generation) post({ type: 'error', message: error.message }); }
      }
      const receiver = panel.webview.onDidReceiveMessage(message => {
        if (message?.type === 'ready' || message?.type === 'reload') void load();
        else if (message?.type === 'plate' && Number.isInteger(message.index) && message.index >= 0 && worker) {
          worker.postMessage({ type: 'plate', index: message.index, id: ++selectionId });
        }
      });
      panel.onDidDispose(() => { disposed = true; generation++; receiver.dispose(); if (worker) void worker.terminate(); });
    }
  };
  context.subscriptions.push(vscode.window.registerCustomEditorProvider('layerViewer.3mf', provider, { supportsMultipleEditorsPerDocument: true }));
  context.subscriptions.push(vscode.commands.registerCommand('layerViewer.open', async uri => {
    if (!uri) { const selected = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { '3MF': ['3mf'] } }); uri = selected?.[0]; }
    if (uri) await vscode.commands.executeCommand('vscode.openWith', uri, 'layerViewer.3mf');
  }));
}
module.exports = { activate };
