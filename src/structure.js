import { translator } from './i18n';
function children(node,name) { return [...node.children].filter(child=>child.localName===name); }
function first(node,name) { return children(node,name)[0]; }
function metadata(node,key) { return children(node,'metadata').find(item=>item.getAttribute('key')===key)?.getAttribute('value')??null; }
function documentRoot(source) {
  if(!source||/<!DOCTYPE|<!ENTITY/i.test(source)) return null;
  const document=new DOMParser().parseFromString(source,'application/xml');
  return document.getElementsByTagName('parsererror').length?null:document.documentElement;
}
function bambuStructure(root,t) {
  if(!root) return [];
  const objects=new Map(children(root,'object').map(object=>{
    const id=object.getAttribute('id');
    return [id,{name:metadata(object,'name')||t('objectLabel',id),parts:children(object,'part').map(part=>({name:metadata(part,'name')||t('partLabel',part.getAttribute('id'))}))}];
  }));
  return children(root,'plate').map((plate,index)=>({
    name:metadata(plate,'plater_name')||t('plateLabel',metadata(plate,'plater_id')||index+1),
    filename:metadata(plate,'gcode_file'),
    objects:children(plate,'model_instance').map(instance=>objects.get(metadata(instance,'object_id'))).filter(Boolean)
  }));
}
function modelStructure(root,t) {
  if(!root) return [];
  const resources=first(root,'resources'), build=first(root,'build'); if(!resources||!build) return [];
  const objects=new Map(children(resources,'object').map(node=>[node.getAttribute('id'),node]));
  return children(build,'item').filter(item=>item.getAttribute('printable')!=='0').map(item=>{
    const id=item.getAttribute('objectid'), object=objects.get(id), components=object&&first(object,'components');
    return {name:object?.getAttribute('name')||t('objectLabel',id),parts:components?children(components,'component').map(component=>{
      const childId=component.getAttribute('objectid');
      return {name:objects.get(childId)?.getAttribute('name')||t('partLabel',childId)};
    }):[]};
  });
}
export function parseStructure(source,plateNames=[],language='ja') {
  const t=translator(language), configured=bambuStructure(documentRoot(source?.settings),t);
  if(configured.length) {
    if(!plateNames.length) return configured;
    return plateNames.map((name,index)=>configured.find(plate=>plate.filename?.toLowerCase()===name.toLowerCase())||configured[index]||{name:t('plateLabel',index+1),objects:[]});
  }
  const objects=modelStructure(documentRoot(source?.model),t);
  if(!objects.length) return [];
  if(!plateNames.length) return [{name:t('plateLabel',1),objects}];
  return plateNames.map((_,index)=>({name:t('plateLabel',index+1),objects:plateNames.length===1?objects:[]}));
}
