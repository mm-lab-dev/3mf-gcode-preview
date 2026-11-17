const { parentPort } = require('node:worker_threads');
const { inspectArchive, MAX_FILE } = require('./archive');
const { parseGcode } = require('./gcode');
let archive;
parentPort.on('message', message => {
  try {
    if (message.type === 'init') {
      archive = undefined;
      const bytes = new Uint8Array(message.bytes);
      if (bytes.length > MAX_FILE) throw new Error('File exceeds the 128 MiB input limit.');
      if (/\.gcode$/i.test(message.filename || '')) {
        if (bytes.includes(0)) throw new Error('Binary G-code is not supported. Export a text .gcode file.');
        archive = { plates: [{ name: message.filename, gcode: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }], structure: {} };
      } else archive = inspectArchive(bytes);
      parentPort.postMessage({ type: 'archive', plates: archive.plates.map(p => p.name), structure: archive.structure });
    } else if (message.type === 'plate') {
      const plate = archive?.plates[message.index];
      if (!plate) throw new Error('Unknown plate.');
      const data = parseGcode(plate.gcode);
      parentPort.postMessage({ type: 'toolpath', id: message.id, index: message.index, data }, ['positions','types','sourceTypes','speeds','tools','lines','widths','displayWidths','heights','dimensionSources','eventPositions','eventKinds','eventIndices','eventLayers'].map(k => data[k].buffer));
    }
  } catch (error) { parentPort.postMessage({ type: 'error', id: message.id, message: error.message }); }
});
