const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {localeFor,translator,localizeDiagnostic}=require('../src/i18n');

test('Japanese and English translations have matching keys and placeholders',()=>{
  const sandbox={module:{exports:{}}};
  vm.runInNewContext(fs.readFileSync('src/i18n.js','utf8')+'\nmodule.exports=strings;',sandbox);
  const {ja,en}=sandbox.module.exports;
  assert.deepEqual(Object.keys(ja).sort(),Object.keys(en).sort());
  for(const key of Object.keys(ja)) {
    const placeholders=value=>Array.from(value.match(/\{\d+\}/g)||[]).sort();
    assert.deepEqual(placeholders(ja[key]),placeholders(en[key]),key);
    assert.ok(ja[key].trim()&&en[key].trim(),key);
  }
});

test('VS Code Japanese locales use Japanese; other languages fall back to English',()=>{
  for(const locale of ['ja','ja-JP','JA-jp']) assert.equal(localeFor(locale),'ja');
  for(const locale of ['en','en-US','de','zh-CN']) assert.equal(localeFor(locale),'en');
});

test('standalone G-code and feature-limit errors are localized without hiding unknown diagnostics',()=>{
  const cases=[
    ['File exceeds the 128 MiB input limit.','ファイルが128 MiBの入力上限を超えています。'],
    ['Binary G-code is not supported. Export a text .gcode file.','バイナリG-codeには対応していません。テキスト形式の .gcode ファイルを書き出してください。'],
    ['Too many distinct G-code feature names.','G-codeの線種名の種類数が上限を超えています。'],
    ['Unexpected decoder error: example.gcode','Unexpected decoder error: example.gcode']
  ];
  for(const [original,japanese] of cases) {
    assert.equal(localizeDiagnostic(original,translator('ja'),'ja'),japanese);
    assert.equal(localizeDiagnostic(original,translator('en'),'en'),original);
  }
});
