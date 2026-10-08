const { unzipSync, strFromU8 } = require('fflate');
const MAX_FILE = 128 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
function inspectArchive(bytes) {
  if (bytes.length > MAX_FILE) throw new Error('3MF exceeds the 128 MiB input limit.');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('This file is not a ZIP-based 3MF.');
  let total = 0, entries = 0;
  const files = unzipSync(bytes, { filter(entry) {
    if (++entries > 10000) throw new Error('Too many entries in this 3MF.');
    total += entry.originalSize;
    if (entry.originalSize > MAX_FILE || total > MAX_TOTAL) throw new Error('3MF expanded size exceeds the safety limit (128 MiB per entry / 256 MiB total).');
    return /\.gcode$/i.test(entry.name) || /^(?:Metadata\/(?:model_settings|project_settings|slice_info)\.config|3D\/3dmodel\.model)$/i.test(entry.name);
  } });
  const names=Object.keys(files);
  const plates = names.filter(name=>/\.gcode$/i.test(name)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(name => ({ name, gcode: strFromU8(files[name]) }));
  const source=pattern=>{ const name=names.find(value=>pattern.test(value)); return name?strFromU8(files[name]):null; };
  const structure={
    settings:source(/^Metadata\/model_settings\.config$/i),
    projectSettings:source(/^Metadata\/project_settings\.config$/i),
    sliceInfo:source(/^Metadata\/slice_info\.config$/i),
    model:source(/^3D\/3dmodel\.model$/i)
  };
  return { plates, structure };
}
module.exports = { inspectArchive, MAX_FILE };
