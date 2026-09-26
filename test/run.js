// VSCodeに依存しない部分(解析・診断・定義データ)のテスト
// 実行: node test/run.js
const assert = require('assert');
const parser = require('../src/parser');
const { lint } = require('../src/lint');
const { functions } = require('../src/data/functions');
const { directives } = require('../src/data/directives');

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.message}`);
  }
}

// カーソル位置を '|' で示したテキストから呼び出し文脈を取得する
function ctxAt(textWithCursor) {
  const offset = textWithCursor.indexOf('|');
  const text = textWithCursor.slice(0, offset) + textWithCursor.slice(offset + 1);
  return parser.getCallContext(text, offset);
}

// ------------------------------
// 定義データ
// ------------------------------
test('関数の引数ラベルがシグネチャ文字列に順に含まれる', () => {
  for (const f of functions) {
    for (const o of f.overloads) {
      let pos = o.label.indexOf('(');
      for (const p of o.params) {
        const i = o.label.indexOf(p.label, pos);
        assert.ok(i >= 0, `${o.label} に ${p.label} が無い`);
        pos = i + p.label.length;
      }
    }
  }
});

test('指示子の引数ラベルが構文文字列に順に含まれる', () => {
  for (const d of directives) {
    let pos = d.syntax.indexOf(d.form === 'at' ? '@' : ':') + 1;
    for (const p of d.params) {
      const i = d.syntax.indexOf(p.label, pos);
      assert.ok(i >= 0, `${d.syntax} に ${p.label} が無い`);
      pos = i + p.label.length;
    }
  }
});

test('lua.txt(2026/9/19版)の新しいAPIが定義されている', () => {
  const names = functions.map(f => f.name);
  for (const n of ['obj.getfont', 'obj.multiobject', 'obj.module', 'obj.data', 'print']) assert.ok(names.includes(n), n);
  const dn = directives.map(d => d.name);
  for (const n of ['trackgroup', 'checksection', 'folder', 'string', 'hide', 'group', 'separator', 'filter', 'require', 'hidemenu']) assert.ok(dn.includes(n), n);
  const getoption = functions.find(f => f.name === 'obj.getoption').values[0].map(v => v.label);
  for (const n of ['"group_info"', '"enable_group"', '"clipping_upper_object"', '"camera_focus"']) assert.ok(getoption.includes(n), n);
});

// ------------------------------
// 呼び出し文脈
// ------------------------------
test('obj.load の第1引数(文字列内)', () => {
  const c = ctxAt('obj.load("fig|")');
  assert.strictEqual(c.name, 'obj.load');
  assert.strictEqual(c.argIndex, 0);
  assert.strictEqual(c.state, 'string');
});

test('obj.setoption の第2引数と第1引数のリテラル', () => {
  const c = ctxAt('obj.setoption("blend", |)');
  assert.strictEqual(c.name, 'obj.setoption');
  assert.strictEqual(c.argIndex, 1);
  assert.strictEqual(c.literals[0], 'blend');
});

test('入れ子の呼び出しとテーブル内のカンマを数えない', () => {
  const c = ctxAt('obj.draw(math.max(1,2), {1,2,3}, |');
  assert.strictEqual(c.name, 'obj.draw');
  assert.strictEqual(c.argIndex, 2);
  const inner = ctxAt('obj.draw(math.max(1,|');
  assert.strictEqual(inner.name, 'math.max');
  assert.strictEqual(inner.argIndex, 1);
});

test('テーブル引数の中は inTable になる', () => {
  const c = ctxAt('obj.pixelshader("ps","object",{"object",|})');
  assert.strictEqual(c.name, 'obj.pixelshader');
  assert.strictEqual(c.argIndex, 2);
  assert.strictEqual(c.inTable, true);
});

test('複数行にまたがる呼び出し', () => {
  const c = ctxAt('obj.effect("ぼかし",\n  "範囲", 10,\n  |');
  assert.strictEqual(c.name, 'obj.effect');
  assert.strictEqual(c.argIndex, 3);
});

test('コメント・文字列中の括弧は無視する', () => {
  assert.strictEqual(ctxAt('-- obj.load(|'), null);
  const c = ctxAt('print("(", |');
  assert.strictEqual(c.name, 'print');
  assert.strictEqual(c.argIndex, 1);
  const d = ctxAt('--[[pixelshader@ps:\nfloat4 ps(float4 pos : SV_Position) {\n]]\nobj.load(|');
  assert.strictEqual(d.name, 'obj.load');
});

test('function 定義の引数リストは呼び出しとみなさない', () => {
  assert.strictEqual(ctxAt('local function foo(a, |'), null);
});

// ------------------------------
// 指示子の解析
// ------------------------------
const SAMPLE = [
  '@スクリプトA',
  '--information:テスト v1.0.0 by teruyoshi',
  '--track@x:X,-100,100,0',
  '--track@y:Y,-100,100,0',
  '--trackgroup@x,y:Group',
  '--group:詳細,false',
  '--check@chk:有効,true',
  '--hide@y:chk==0',
  '--data@buf:16',
  '--[[pixelshader@ps:',
  'float4 ps(float4 pos : SV_Position) : SV_Target { return 1; }',
  ']]',
  'obj.pixelshader("ps","object")',
  '@スクリプトB',
  '--track@x:X,0,10,5',
].join('\n');

test('セクション・指示子・シェーダーを解析する', () => {
  const p = parser.parseDocument(SAMPLE);
  assert.deepStrictEqual(p.sections.map(s => s.name), ['スクリプトA', 'スクリプトB']);
  assert.strictEqual(p.shaders.length, 1);
  assert.strictEqual(p.shaders[0].name, 'ps');
  assert.strictEqual(p.shaders[0].endLine, 11);
  assert.strictEqual(SAMPLE.split('\n')[9].slice(p.shaders[0].nameStart, p.shaders[0].nameStart + 2), 'ps');
  const tg = p.directives.find(d => d.name === 'trackgroup');
  assert.deepStrictEqual(tg.vars.map(v => v.name), ['x', 'y']);
  assert.strictEqual(SAMPLE.split('\n')[4].slice(tg.vars[1].start, tg.vars[1].end), 'y');
  assert.strictEqual(p.directives.filter(d => d.name === 'track' && d.section === 1).length, 1);
});

test('指示子の引数位置', () => {
  const line = '--track@vx:X速度,-10,10,0';
  assert.strictEqual(parser.directiveParamIndex(line, 9).index, 0);
  assert.strictEqual(parser.directiveParamIndex(line, 12).index, 1);
  assert.strictEqual(parser.directiveParamIndex(line, line.length).index, 4);
  const tg = '--trackgroup@x,y,z:G';
  assert.strictEqual(parser.directiveParamIndex(tg, 16).index, 1);
  assert.strictEqual(parser.directiveParamIndex(tg, tg.length).index, 3);
  assert.strictEqual(parser.directiveParamIndex('--label:加工', 10).index, 0);
});

// ------------------------------
// 診断
// ------------------------------
test('正しいスクリプトでは警告が出ない', () => {
  assert.deepStrictEqual(lint(SAMPLE, 'test.anm2'), []);
});

test('各種の誤りを検出する', () => {
  const text = [
    '--infomation:タイプミス',
    '--track@a:A,0,10',
    '--track@b:B,0,10,20',
    '--trackgroup@a,zz:G',
    '--hide@nothing:chk=1',
    '--twopoint',
    '--label@x:ラベル',
    '--check@a:A,0',
    'obj.pixelshader("undefined","object")',
    'obj.pixelshader("ps@他のスクリプト","object")',
    'obj.data("nodata")',
    '-- obj.pixelshader("コメント内","object")',
  ].join('\n');
  const problems = lint(text, 'test.anm2');
  const has = (line, word) => assert.ok(problems.some(p => p.line === line && p.message.includes(word)), `${line + 1}行目: ${word}\n${JSON.stringify(problems, null, 1)}`);
  has(0, '--information の誤り');
  has(1, 'デフォルト値 が必要');
  has(2, '範囲');
  has(3, 'zz');
  has(4, 'nothing');
  has(4, '非表示条件');
  has(5, 'トラックバー移動(.tra2)専用');
  has(6, "'@' を付けずに");
  has(7, '変数 a は');
  has(8, 'undefined');
  has(10, 'nodata');
  assert.ok(!problems.some(p => p.line === 9 || p.line === 11), '他スクリプト参照・コメント内は対象外');
});

test('CRLF改行でも行番号がずれない', () => {
  const crlf = SAMPLE.replace(/\n/g, '\r\n') + '\r\nobj.pixelshader("none","object")';
  const problems = lint(crlf, 'test.anm2');
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].line, 15);
  assert.strictEqual(crlf.split('\r\n')[15].slice(problems[0].start, problems[0].end), 'none');
});

test('--TODO: のような普通のコメントは警告しない', () => {
  assert.deepStrictEqual(lint('--TODO:あとで直す\n--memo:メモ\n-- 説明', 'a.anm2'), []);
});

// ------------------------------
// 設定グループの範囲
// ------------------------------
test('グループの範囲(終端あり・次のグループで終了・終端なし)', () => {
  const text = [
    '--information:x',          // 0
    '--group:基本,true',        // 1
    '--track@a:A,0,1,0',        // 2
    '',                         // 3
    '--check@b:B,0',            // 4
    '--group:詳細,false',       // 5
    '--color@c:C,0xffffff',     // 6
    '--group',                  // 7
    '--track@d:D,0,1,0',        // 8
    '--group:最後',             // 9
    '--value@e:E,0',            // 10
    'obj.draw()',               // 11
  ].join('\n');
  const groups = parser.parseGroups(parser.parseDocument(text));
  assert.deepStrictEqual(groups.map(g => [g.name, g.line, g.endLine, g.terminatorLine, g.items.length, g.open]), [
    ['基本', 1, 4, null, 2, 'true'],
    ['詳細', 5, 7, 7, 1, 'false'],
    ['最後', 9, 10, null, 1, undefined],
  ]);
});

test('グループはセクションをまたがない', () => {
  const groups = parser.parseGroups(parser.parseDocument('@A\n--group:G\n--track@a:A,0,1,0\n@B\n--track@b:B,0,1,0'));
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].endLine, 2);
});

// ------------------------------
// 色設定
// ------------------------------
const colorRules = require('../src/colorRules');

test('色設定から textMateRules を作る', () => {
  const rules = colorRules.buildRules({ directive: '#FF8800', obj: 'red', section: '#abc' }, { directive: 'bold italic', function: 'underline foo' });
  assert.deepStrictEqual(rules.map(r => [r.name, r.settings]), [
    ['AviUtl2: 指示子', { foreground: '#FF8800', fontStyle: 'bold italic' }],
    ['AviUtl2: @セクション名', { foreground: '#abc' }],
    ['AviUtl2: obj関数・独自関数', { fontStyle: 'underline' }],
  ]);
});

test('既存の tokenColorCustomizations を壊さずに差し替える', () => {
  const existing = {
    comments: '#888888',
    textMateRules: [
      { scope: 'aul2.settings.lua', settings: { foreground: '#FF8800' } },
      { name: 'AviUtl2: 古い設定', scope: 'x', settings: { foreground: '#000000' } },
    ],
  };
  const rules = colorRules.buildRules({ obj: '#112233' });
  const next = colorRules.mergeCustomizations(existing, rules);
  assert.strictEqual(next.comments, '#888888');
  assert.deepStrictEqual(next.textMateRules.map(r => r.name || r.scope), ['aul2.settings.lua', 'AviUtl2: obj']);
  assert.strictEqual(colorRules.mergeCustomizations(next, rules), null, '変更が無ければ null');
  const cleared = colorRules.mergeCustomizations({ textMateRules: [{ name: 'AviUtl2: obj', scope: 'x', settings: {} }] }, []);
  assert.deepStrictEqual(cleared, {});
  assert.strictEqual(colorRules.mergeCustomizations(undefined, []), null);
});

test('色の変換', () => {
  assert.strictEqual(colorRules.toRgba('#FF8800', 0.5), 'rgba(255, 136, 0, 0.5)');
  assert.strictEqual(colorRules.toRgba('#f80'), 'rgba(255, 136, 0, 1)');
  assert.strictEqual(colorRules.toRgba('#FF880080', 1), 'rgba(255, 136, 0, 0.502)');
  assert.strictEqual(colorRules.toRgba('red'), null);
});

test('色設定の要素が package.json と文法に揃っている', () => {
  const pkg = require('../package.json');
  const grammar = JSON.stringify(require('../syntaxes/aviutl2.injection.tmLanguage.json'));
  const props = pkg.contributes.configuration.properties;
  for (const el of colorRules.TOKEN_ELEMENTS) {
    assert.ok(props['aviutl2.tokenColors'].properties[el.key], `tokenColors.${el.key}`);
    assert.ok(props['aviutl2.tokenFontStyles'].properties[el.key], `tokenFontStyles.${el.key}`);
    for (const scope of el.scopes) assert.ok(grammar.includes(scope), `文法に ${scope} が無い`);
  }
});

test('色設定のルールが、文法でトークンに付けたすべてのスコープ名に当たる', () => {
  // 1つのトークンに付けたスコープ名('a b')のどれかが要素に含まれるなら、全部含まれている必要がある
  // (内側のスコープ名に当たる他のルール(旧フォーク版の設定・テーマ)に負けないようにするため)
  const grammar = require('../syntaxes/aviutl2.injection.tmLanguage.json');
  const names = [];
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if ((k === 'name' || k === 'contentName') && typeof v === 'string') names.push(v);
        else walk(v);
      }
    }
  };
  walk(grammar);
  for (const name of names) {
    const parts = name.split(/\s+/);
    for (const el of colorRules.TOKEN_ELEMENTS) {
      if (parts.some(p => el.scopes.includes(p))) {
        const inner = parts[parts.length - 1];
        assert.ok(el.scopes.includes(inner), `${el.key} に ${inner} が無い(${name})`);
      }
    }
  }
});

test('色設定の見本に色が付く部分([ ])がある', () => {
  for (const el of colorRules.TOKEN_ELEMENTS) {
    assert.ok(/\[[^\]]+\]/.test(el.sample), el.key);
  }
  assert.strictEqual(colorRules.plainSample('[global].xxx'), 'global.xxx');
});

test('既定の色と利用者の指定を合成する(空文字はテーマの色)', () => {
  const pkg = require('../package.json');
  const info = {
    defaultValue: pkg.contributes.configuration.properties['aviutl2.tokenColors'].default,
    globalValue: { directive: '', obj: '#010203', directiveVariable: '#040506' },
  };
  const merged = colorRules.effectiveObject(info);
  assert.strictEqual(merged.section, '#FF0000', '指定の無い要素は既定の色');
  assert.strictEqual(merged.obj, '#010203', '利用者の指定が優先');
  const rules = colorRules.buildRules(merged, {});
  const names = rules.map(r => r.name);
  assert.ok(!names.includes('AviUtl2: 指示子'), '空文字の要素はルールを作らない(テーマの色)');
  assert.ok(names.includes('AviUtl2: 指示子の変数名'));
  assert.deepStrictEqual(pkg.contributes.configuration.properties['aviutl2.tokenColors'].default, colorRules.DEFAULT_TOKEN_COLORS);
  for (const key of Object.keys(colorRules.DEFAULT_TOKEN_COLORS)) {
    assert.ok(colorRules.TOKEN_ELEMENTS.some(e => e.key === key), key);
  }
});

test('@スクリプト名の背景色の設定が package.json に定義されている', () => {
  const props = require('../package.json').contributes.configuration.properties;
  assert.strictEqual(props['aviutl2.sectionHighlight.color'].default, colorRules.DEFAULT_SECTION_COLOR);
  assert.strictEqual(props['aviutl2.sectionHighlight.enable'].type, 'boolean');
  assert.strictEqual(props['aviutl2.sectionHighlight.opacity'].maximum, 1);
});

test('シェーダー定義の背景色の設定が package.json に定義されている', () => {
  const props = require('../package.json').contributes.configuration.properties;
  assert.strictEqual(props['aviutl2.shaderHighlight.color'].default, colorRules.DEFAULT_SHADER_COLOR);
  assert.strictEqual(props['aviutl2.shaderHighlight.enable'].type, 'boolean');
  assert.strictEqual(props['aviutl2.shaderHighlight.opacity'].maximum, 1);
});

if (failed) {
  console.log(`\n${failed}件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
