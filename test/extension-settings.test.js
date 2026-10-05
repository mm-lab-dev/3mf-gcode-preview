const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');

test('extension stores one shared display preference and sends it to new previews',async()=>{
  let provider,stored,updates=0;
  const vscode={
    env:{language:'en'},
    Uri:{joinPath:(root,name)=>({root,name})},
    window:{registerCustomEditorProvider:(_,value)=>{provider=value;return {dispose(){}};}},
    commands:{registerCommand:()=>({dispose(){}})},
    workspace:{fs:{stat:async()=>{throw Error('No file needed for settings test');}}}
  };
  const originalLoad=Module._load;
  Module._load=function(id,...args){return id==='vscode'?vscode:originalLoad.call(this,id,...args);};
  let activate;
  try { ({activate}=require('../src/extension')); }
  finally { Module._load=originalLoad; }
  const context={
    extensionUri:{},extensionPath:'.',subscriptions:[],
    globalState:{get:()=>stored,update:async(_,value)=>{updates++;stored=value;}}
  };
  const makePanel=()=>{
    const posted=[]; let receive,dispose;
    return {
      posted,
      webview:{cspSource:"'self'",asWebviewUri:uri=>String(uri.name),postMessage:message=>posted.push(message),onDidReceiveMessage:listener=>{receive=listener;return {dispose(){}};}},
      onDidDispose:listener=>{dispose=listener;},
      receive:message=>receive(message),
      dispose:()=>dispose()
    };
  };
  activate(context);
  const first=makePanel(),second=makePanel();
  await provider.resolveCustomEditor({uri:{path:'/first.3mf'}},first);
  await provider.resolveCustomEditor({uri:{path:'/second.3mf'}},second);
  first.receive({type:'displaySettingsChanged',settings:{color:'speed',renderMode:'line',travel:true,upper:55,lower:3,single:true}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(updates,1);
  assert.equal(stored.color,'speed');
  for(const key of ['upper','lower','single']) assert.equal(Object.hasOwn(stored,key),false);
  assert.equal(second.posted.at(-1).type,'displaySettings');
  assert.equal(second.posted.at(-1).settings.renderMode,'line');
  first.dispose(); second.dispose();

  activate(context);
  const reopened=makePanel();
  await provider.resolveCustomEditor({uri:{path:'/third.3mf'}},reopened);
  reopened.receive({type:'ready'});
  assert.equal(reopened.posted[0].type,'displaySettings');
  assert.equal(reopened.posted[0].settings.color,'speed');
  reopened.dispose();
});
