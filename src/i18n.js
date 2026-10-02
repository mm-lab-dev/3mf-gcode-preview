const strings={
  ja:{
    plateSelect:'プレート選択',structure:'構成',structureTitle:'3MFの構成',fit:'全体表示',top:'上面',reload:'再読込',loading:'3MFを読み込み中…',
    viewport:'3D経路ビュー',hint:'ドラッグ: 回転 · 右ドラッグ: 移動 · ホイール: 拡大',displayLayers:'表示層',layerRange:'層範囲',layerRangeLabel:'表示層の範囲',upperLayer:'表示層の上限',lowerLayer:'表示層の下限',upperKnob:'上限（右側のノブ）',lowerKnob:'下限（左側のノブ）',upper:'上限',lower:'下限',upperNumber:'上限層番号',lowerNumber:'下限層番号',single:'単層表示',pathMode:'経路表示',filament:'フィラメント',line:'線',color:'色分け',feature:'線種',speed:'速度',tool:'ツール',modelTime:'モデル造形時間',totalTime:'合計時間',pathHeading:'経路',markerHeading:'操作マーカー',play:'経路を再生',pause:'経路を一時停止',pathOrder:'選択範囲の経路順',readOnlyInitial:'読み取り専用 · 元の3MFは変更しません',
    layer:'層',displayLayer:'表示層',displayLayerNumber:'表示層番号',hide:'非表示にする',show:'表示する',visibleSegments:'表示 {0} セグメント | 層 {1}: 押出し {2} · 移動 {3} | {4} | {5} mm/s | T{6} | G-code行 {7} · 読み取り専用',toolLabel:'ツール {0}',plateLabel:'プレート {0}',objectLabel:'オブジェクト {0}',partLabel:'パーツ {0}',toolpathStatus:'{0} · {1} 層 · {2} 経路セグメント',modelEmpty:'3MFに表示可能なモデルがありません。',modelStatus:'3Dモデル表示 · スライス済み経路なし',modelWarning:'この3MFにはG-codeがありません。層ごとの経路レビューには、Bambu Studio等でスライス済みの .gcode.3mf が必要です。',modelDetails:'形状プレビュー · 読み取り専用',loadingFile:'{0} · 読込中…',readError:'読込エラー',displayError:'表示エラー',plateParsing:'プレート解析中…',webglLost:'WebGLコンテキストが失われました。ビューを再度開いてください。',webglStartError:'3D表示を開始できません',webglRequired:'WebGL対応環境が必要です: {0}',
    retract:'リトラクト',unretract:'リトラクト解除',wipe:'ワイプ',outerStart:'外壁経路の開始点',travel:'移動',other:'その他',outerWall:'外壁',innerWall:'内壁',infill:'インフィル',solidInfill:'ソリッドインフィル',topSurface:'上面',support:'サポート',skirtBrim:'スカート／ブリム',bridge:'ブリッジ',
    eventLimit:'操作マーカーは最初の200,000件のみ表示します。',nonXyArc:'XY平面以外の円弧を表示できませんでした（G18/G19）。',invalidArc:'G-codeの移動 {0} 付近の円弧を表示できませんでした。',missingLayerTags:'スライサーの層マーカーがありません。押出し高さから層を推定したため、スパイラル・非平面経路は正しく分類されない場合があります。',
  },
  en:{
    plateSelect:'Select plate',structure:'Structure',structureTitle:'3MF structure',fit:'Fit view',top:'Top view',reload:'Reload',loading:'Loading 3MF…',
    viewport:'3D toolpath view',hint:'Drag: rotate · Right drag: pan · Wheel: zoom',displayLayers:'Displayed layers',layerRange:'Layer range',layerRangeLabel:'Displayed layer range',upperLayer:'Upper displayed layer',lowerLayer:'Lower displayed layer',upperKnob:'Upper (right knob)',lowerKnob:'Lower (left knob)',upper:'Upper',lower:'Lower',upperNumber:'Upper layer number',lowerNumber:'Lower layer number',single:'Single layer',pathMode:'Path display',filament:'Filament',line:'Line',color:'Color by',feature:'Feature',speed:'Speed',tool:'Tool',modelTime:'Model print time',totalTime:'Total time',pathHeading:'Toolpaths',markerHeading:'Action markers',play:'Play toolpaths',pause:'Pause toolpaths',pathOrder:'Path order in selected range',readOnlyInitial:'Read only · The source 3MF is not changed',
    layer:'Layer',displayLayer:'Displayed layer',displayLayerNumber:'Displayed layer number',hide:'Hide',show:'Show',visibleSegments:'Showing {0} segments | Layer {1}: extrusion {2} · travel {3} | {4} | {5} mm/s | T{6} | G-code line {7} · read only',toolLabel:'Tool {0}',plateLabel:'Plate {0}',objectLabel:'Object {0}',partLabel:'Part {0}',toolpathStatus:'{0} · {1} layers · {2} toolpath segments',modelEmpty:'No displayable model found in this 3MF.',modelStatus:'3D model · No sliced toolpaths',modelWarning:'This 3MF has no G-code. Export a sliced .gcode.3mf from Bambu Studio or another slicer to review toolpaths by layer.',modelDetails:'Model preview · Read only',loadingFile:'{0} · Loading…',readError:'Load error',displayError:'Display error',plateParsing:'Parsing plate…',webglLost:'WebGL context lost. Reopen the view.',webglStartError:'Could not start 3D view',webglRequired:'WebGL is required: {0}',
    retract:'Retract',unretract:'Unretract',wipe:'Wipe',outerStart:'Outer wall path start',travel:'Travel',other:'Other',outerWall:'Outer wall',innerWall:'Inner wall',infill:'Infill',solidInfill:'Solid infill',topSurface:'Top surface',support:'Support',skirtBrim:'Skirt / brim',bridge:'Bridge',
    eventLimit:'Event markers limited to the first 200,000 events.',nonXyArc:'Non-XY arc omitted (G18/G19).',invalidArc:'Invalid arc omitted near motion {0}.',missingLayerTags:'No slicer layer markers: layers inferred from extrusion height; spiral and nonplanar paths may be grouped inaccurately.',
  }
};
function localeFor(language) { return /^ja(?:-|$)/i.test(language||'ja')?'ja':'en'; }
function translator(language) {
  const locale=localeFor(language), values=strings[locale];
  return (key,...args)=>{
    const value=values[key];
    if(value===undefined) throw new Error(`Missing translation: ${locale}.${key}`);
    return value.replace(/\{(\d+)\}/g,(_,index)=>String(args[Number(index)]??''));
  };
}
function localizeDiagnostic(message,t,locale='ja') {
  if(locale!=='ja') return message;
  const fixed={
    'Event markers limited to the first 200,000 events.':'eventLimit',
    'Non-XY arc omitted (G18/G19).':'nonXyArc',
    'No slicer layer markers: layers inferred from extrusion height; spiral and nonplanar paths may be grouped inaccurately.':'missingLayerTags',
  };
  if(fixed[message]) return t(fixed[message]);
  const arc=message.match(/^Invalid arc omitted near motion (\d+)\.$/);
  if(arc) return t('invalidArc',arc[1]);
  const errors={
    '3MF exceeds the 128 MiB input limit.':'3MFが128 MiBの入力上限を超えています。',
    'This file is not a ZIP-based 3MF.':'ZIP形式の3MFではありません。',
    'Too many entries in this 3MF.':'3MF内のファイル数が上限を超えています。',
    '3MF expanded size exceeds the safety limit (128 MiB per entry / 256 MiB total).':'3MFの展開サイズが上限を超えています（1ファイル128 MiB、合計256 MiB）。',
    'Arc exceeds preview complexity limit.':'円弧がプレビューの複雑度上限を超えています。',
    'No printable extrusion paths found in this plate.':'このプレートに表示できる押出し経路がありません。',
    'Unknown plate.':'プレートが見つかりません。',
    'Invalid 3MF part path.':'3MFの部品パスが不正です。',
    'Invalid coordinate in 3MF model.':'3MFモデルの座標が不正です。',
    'Invalid 3MF transform.':'3MFの変換行列が不正です。',
    '3MF expanded size exceeds preview limits.':'3MFの展開サイズがプレビュー上限を超えています。',
    'XML entities are not supported.':'XMLエンティティには対応していません。',
    'No 3D model relationship in 3MF.':'3MF内に3Dモデルへの参照がありません。',
    'Unsupported 3MF unit.':'3MFの単位に対応していません。',
    'No 3MF resources.':'3MFのリソースがありません。',
    '3MF component nesting exceeds preview limit.':'3MFの部品階層がプレビュー上限を超えています。',
    'Cyclic 3MF component reference.':'3MFの部品参照が循環しています。',
    'Incomplete 3MF mesh.':'3MFのメッシュが不完全です。',
    '3MF mesh exceeds the 2 million triangle/vertex preview limit.':'3MFのメッシュが200万三角形・頂点の上限を超えています。',
    'Invalid 3MF triangle vertex.':'3MFの三角形の頂点が不正です。',
    'Unsupported 3MF object (no mesh/components).':'メッシュや部品を持たない3MFオブジェクトには対応していません。',
    'No build items in 3MF.':'3MFに造形対象がありません。',
  };
  if(errors[message]) return errors[message];
  const limit=message.match(/^Toolpath exceeds the ([\d,]+) segment preview limit\.$/);
  if(limit) return `経路が${limit[1]}セグメントのプレビュー上限を超えています。`;
  const missingPart=message.match(/^Missing 3MF part: (.+)$/);
  if(missingPart) return `3MFの部品が見つかりません: ${missingPart[1]}`;
  const invalidXml=message.match(/^Invalid XML: (.+)$/);
  if(invalidXml) return `XMLが不正です: ${invalidXml[1]}`;
  const missingObject=message.match(/^Missing object (.+) in (.+)$/);
  if(missingObject) return `オブジェクト ${missingObject[1]} が ${missingObject[2]} に見つかりません。`;
  return message;
}
module.exports={localeFor,translator,localizeDiagnostic};
