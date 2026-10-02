const {runTests}=require('@vscode/test-electron');
const path=require('node:path');
// A parent Electron-based terminal may export this; GUI tests require normal Electron.
delete process.env.ELECTRON_RUN_AS_NODE;
runTests({extensionDevelopmentPath:path.resolve(__dirname,'..'),extensionTestsPath:path.resolve(__dirname,'host-suite.js'),launchArgs:['--disable-extensions','--skip-welcome','--skip-release-notes','--disable-workspace-trust'],extensionTestsEnv:{ELECTRON_ENABLE_LOGGING:'0'}}).catch(error=>{console.error(error);process.exitCode=1;});
