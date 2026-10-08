const MAX_ROWS = 10000;

function parseParameters(source, t) {
  const rows = [];
  const add = (file, target, key, value) => {
    if (key && rows.length < MAX_ROWS) rows.push({ file, target, key, value: String(value ?? '') });
  };

  if (source?.projectSettings) {
    try {
      const project = JSON.parse(source.projectSettings);
      const visit = (value, key) => {
        if (rows.length >= MAX_ROWS) return;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          for (const [name, child] of Object.entries(value)) visit(child, key ? `${key}.${name}` : name);
        } else add('projectSettings', {kind:'project'}, key || 'value', typeof value === 'string' ? value : JSON.stringify(value));
      };
      visit(project, '');
    } catch { /* A malformed optional settings file must not hide the preview. */ }
  }

  function xml(value, file) {
    if (!value || /<!DOCTYPE|<!ENTITY/i.test(value)) return;
    const document = new DOMParser().parseFromString(value, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) return;
    const ancestor = (node, name) => { for(let parent=node.parentElement; parent; parent=parent.parentElement) if(parent.localName===name) return parent; return null; };
    const meta = (node, key) => [...node.children].find(child=>child.localName==='metadata'&&child.getAttribute('key')===key)?.getAttribute('value');
    const plateId = plate => plate?.getAttribute('index') ?? (plate && (meta(plate,'plater_id') ?? meta(plate,'index')));
    const targetFor = node => {
      const plate=ancestor(node,'plate'), object=ancestor(node,'object'), part=ancestor(node,'part'), instance=ancestor(node,'model_instance');
      const objectId=object?.getAttribute('id') ?? (instance && meta(instance,'object_id'));
      if(part) return {kind:'part',objectId,partId:part.getAttribute('id')};
      if(objectId) return {kind:'object',objectId,plateId:instance?plateId(plate):null};
      if(plate) return {kind:'plate',plateId:plateId(plate)};
      return {kind:'project'};
    };
    for (const node of document.getElementsByTagName('*')) {
      if (rows.length >= MAX_ROWS) break;
      if (['metadata', 'header_item'].includes(node.localName)) {
        const instance=ancestor(node,'model_instance');
        const key=node.getAttribute('key') ?? node.getAttribute('name');
        if(!key) continue;
        add(file, targetFor(node), instance?`${t('modelInstanceLabel')} / ${key}`:key, node.getAttribute('value') ?? node.textContent?.trim());
      } else if (file === 'sliceInfo' && ['filament', 'nozzle'].includes(node.localName)) {
        const label=`${t(node.localName === 'filament' ? 'filamentLabel' : 'nozzleLabel')}${node.getAttribute('id') ? ` ${node.getAttribute('id')}` : ''}`;
        for (const attribute of node.attributes) if (attribute.name !== 'id') add(file, targetFor(node), `${label} / ${attribute.name}`, attribute.value);
      }
    }
  }
  xml(source?.settings, 'settings');
  xml(source?.sliceInfo, 'sliceInfo');
  xml(source?.model, 'model');
  return rows;
}

export { parseParameters };
