const { parentPort } = require('node:worker_threads');
const { inspectArchive } = require('./archive');
const { parseGcode } = require('./gcode');
let archive;
parentPort.on('message', message => {
  try {
    if (message.type === 'init') {
      archive = inspectArchive(new Uint8Array(message.bytes));
      parentPort.postMessage({ type: 'archive', plates: archive.plates.map(p => p.name), structure: archive.structure });
    } else if (message.type === 'plate') {
      const plate = archive?.plates[message.index];
      if (!plate) throw new Error('Unknown plate.');
      const data = parseGcode(plate.gcode);
      parentPort.postMessage({ type: 'toolpath', id: message.id, index: message.index, data }, ['positions','types','speeds','tools','lines','widths','heights','eventPositions','eventKinds','eventIndices','eventLayers'].map(k => data[k].buffer));
    }
  } catch (error) { parentPort.postMessage({ type: 'error', id: message.id, message: error.message }); }
});
