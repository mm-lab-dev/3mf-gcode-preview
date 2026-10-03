const vscode=require('vscode');
const assert=require('node:assert/strict');
const {slicedArchive,modelArchive}=require('./fixtures');
async function run() {
  const data=new Map([['/sliced.3mf',slicedArchive()],['/model.3mf',modelArchive()]]), changes=new vscode.EventEmitter(); let reads=0,writes=0;
  const provider={ onDidChangeFile:changes.event, watch:()=>new vscode.Disposable(()=>{}), stat:uri=>({type:vscode.FileType.File,ctime:0,mtime:0,size:data.get(uri.path).length}), readFile:uri=>{reads++;return data.get(uri.path);}, readDirectory:()=>[], createDirectory:()=>{writes++;throw Error('read only');}, writeFile:()=>{writes++;throw Error('read only');}, delete:()=>{writes++;throw Error('read only');}, rename:()=>{writes++;throw Error('read only');} };
  const registration=vscode.workspace.registerFileSystemProvider('layer-viewer-test',provider,{isReadonly:true});
  try {
    const extension=vscode.extensions.getExtension('mm-lab.3mf-gcode-preview'); assert.ok(extension); await extension.activate();
    assert.ok((await vscode.commands.getCommands()).includes('3mfGcodePreview.open'));
    for(const name of ['sliced','model']) {
      await vscode.commands.executeCommand('3mfGcodePreview.open',vscode.Uri.parse(`layer-viewer-test:/${name}.3mf`));
      await new Promise(resolve=>setTimeout(resolve,2000));
      assert.ok(vscode.window.tabGroups.all.flatMap(g=>g.tabs).some(tab=>tab.input instanceof vscode.TabInputCustom && tab.input.viewType==='3mfGcodePreview.editor'));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
    assert.ok(reads>=2,`expected webview handshake to read both files; actual ${reads}`); assert.equal(writes,0);
    console.log('PASS extension host: activation, command, custom editor, webview handshake, virtual filesystem reads, no input writes.');
  } finally { registration.dispose();changes.dispose(); }
}
module.exports={run};
