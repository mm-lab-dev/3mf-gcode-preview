// Selected-layer dimensions describe the complete selection, independent of
// playback and feature visibility. Current-path dimensions use segment arrays.
function selectionDimensions(layers,first,last) {
  const result={z:null,bounds:null,width:null,displayWidth:null,ironingSpacing:null,height:null,pitch:null,estimatedWidth:false,estimatedHeight:false};
  const extend=(key,min,max=min)=>{
    if(min===null||min===undefined||!Number.isFinite(min)) return;
    if(!result[key]) result[key]=[min,max];
    else { result[key][0]=Math.min(result[key][0],min); result[key][1]=Math.max(result[key][1],max); }
  };
  for(let i=first;i<=last;i++) {
    const layer=layers[i];
    if(layer.pathZRange) extend('z',...layer.pathZRange); else extend('z',layer.z);
    extend('pitch',layer.pitch);
    extend('bounds',layer.bottomZ,layer.topZ);
    if(layer.widthRange) extend('width',...layer.widthRange);
    if(layer.displayWidthRange) extend('displayWidth',...layer.displayWidthRange);
    extend('ironingSpacing',layer.ironingSpacing);
    if(layer.heightRange) extend('height',...layer.heightRange);
    result.estimatedWidth||=layer.estimatedWidth; result.estimatedHeight||=layer.estimatedHeight;
  }
  return result;
}
module.exports={selectionDimensions};
