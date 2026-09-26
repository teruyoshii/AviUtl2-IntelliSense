// プロバイダ(補完・シグネチャ・ホバー・定義・アウトライン・色)のテスト
// vscode モジュールをモックに差し替えて実行する
// 実行: node test/providers.js
const assert = require('assert');
const Module = require('module');
const path = require('path');

const mockPath = path.join(__dirname, 'vscode-mock.js');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'vscode') return mockPath;
  return originalResolve.call(this, request, ...rest);
};
const vscode = require('vscode');
const context = { subscriptions: [] };
for (const name of ['completion', 'signature', 'navigation', 'symbols', 'colors', 'folding']) {
  require(`../src/providers/${name}`).register(context, []);
}
const P = vscode._providers;

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 3).join('\n     ')}`);
  }
}

// '|' の位置をカーソルとしてドキュメントと位置を作る
function at(textWithCursor, fileName) {
  const offset = textWithCursor.indexOf('|');
  const text = textWithCursor.slice(0, offset) + textWithCursor.slice(offset + 1);
  const doc = vscode._createDocument(text, fileName);
  return { doc, pos: doc.positionAt(offset) };
}
const labelOf = item => (typeof item.label === 'string' ? item.label : item.label.label);
function complete(textWithCursor, triggerCharacter, fileName) {
  const { doc, pos } = at(textWithCursor, fileName);
  return (P.completion.provideCompletionItems(doc, pos, null, { triggerCharacter }) || []);
}
const labels = items => items.map(labelOf);

// ------------------------------
// 補完
// ------------------------------
test('指示子の補完(新しい指示子を含む)', () => {
  const items = complete('--|', '-');
  const l = labels(items);
  for (const n of ['--track@', '--trackgroup@', '--checksection@', '--folder@', '--string@', '--hide@', '--group:', '--separator:', '--filter', '--require:', '--hidemenu', '--[[pixelshader@']) {
    assert.ok(l.includes(n), n);
  }
  const track = items.find(i => labelOf(i) === '--track@');
  assert.ok(track.insertText.value.startsWith('--track@'));
  assert.strictEqual(track.range.start.character, 0);
});

test('tra2専用の指示子は他の種別では出さない', () => {
  assert.ok(!labels(complete('--|', '-', 'a.anm2')).includes('--twopoint'));
  assert.ok(labels(complete('--|', '-', 'a.tra2')).includes('--twopoint'));
  assert.ok(!labels(complete('--|', '-', 'a.tra2')).includes('--filter'));
});

test('obj. の補完(新しい変数・関数を含む)', () => {
  const l = labels(complete('obj.|', '.'));
  for (const n of ['ox', 'frame_s', 'effect_layer', 'originframe', 'getfont', 'multiobject', 'module', 'interpolation']) assert.ok(l.includes(n), n);
});

test('math. の補完', () => {
  const l = labels(complete('local a = math.|', '.'));
  assert.ok(l.includes('sin') && l.includes('pi'));
  assert.ok(!l.includes('ox'));
});

test('obj.load の第1引数の候補(文字列内なら引用符ごと置換)', () => {
  const items = complete('obj.load("|")', '"');
  const fig = items.find(i => labelOf(i) === '"figure"');
  assert.ok(fig, labels(items).join());
  assert.strictEqual(fig.range.start.character, 9);
  assert.strictEqual(fig.range.end.character, 11);
  assert.ok(labels(items).includes('"movie.frame"'));
});

test('obj.setoption の第2引数は第1引数に応じて変わる', () => {
  const blend = labels(complete('obj.setoption("blend", |', ' '));
  assert.ok(blend.includes('"rgba_add"') && blend.includes('"alpha_add2"'));
  const focus = labels(complete('obj.setoption("focus_mode", |', ' '));
  assert.deepStrictEqual(focus, ['"fixed_size"', '"no_resize"']);
  const force = labels(complete('obj.setoption("blend", "add", |', ','));
  assert.deepStrictEqual(force, ['"force"']);
});

test('obj.getoption の新しいオプション', () => {
  const l = labels(complete('obj.getoption(|', '('));
  for (const n of ['"group_info"', '"enable_group"', '"clipping_upper_object"', '"camera_focus"', '"draw_state"']) assert.ok(l.includes(n), n);
});

test('シェーダー名・--data名・トラックバー変数を文書から補完', () => {
  const src = '--track@spd:速度,0,10,1\n--data@buf:8\n--[[pixelshader@myps:\n]]\n';
  assert.ok(labels(complete(src + 'obj.pixelshader(|', '(')).includes('"myps"'));
  assert.ok(labels(complete(src + 'obj.data(|', '(')).includes('"buf"'));
  assert.ok(labels(complete(src + 'obj.getvalue(|', '(')).includes('"track.spd"'));
  assert.ok(labels(complete(src + 'obj.getoption("track_mode", |', ' ')).includes('"spd"'));
});

test('pixelshader のテーブル引数の中でもバッファ名を補完', () => {
  const l = labels(complete('obj.pixelshader("ps", "object", {"object", |', ' '));
  assert.ok(l.includes('"random"') && l.includes('"tempbuffer"'));
});

test('"cache:" はカーソルを引用符の内側に置く', () => {
  const item = complete('obj.copybuffer(|', '(').find(i => labelOf(i) === '"cache:"');
  assert.strictEqual(item.insertText.value, '"cache:$0"');
});

test('グローバルな名前(指示子で定義した変数・独自関数)', () => {
  const items = complete('--track@speed:速度,0,10,1\nlocal a = sp|');
  const l = labels(items);
  assert.ok(l.includes('speed') && l.includes('RGB') && l.includes('rand1') && l.includes('obj') && l.includes('global'));
  const speed = items.find(i => labelOf(i) === 'speed');
  assert.ok(speed.documentation.value.includes('0 〜 10'), speed.documentation.value);
});

test('別の @セクションの変数は補完しない', () => {
  const l = labels(complete('@A\n--track@aaa:A,0,1,0\n@B\n--track@bbb:B,0,1,0\nlocal x = |'));
  assert.ok(l.includes('bbb') && !l.includes('aaa'));
});

test('コメントや数式の途中では補完しない', () => {
  assert.strictEqual(complete('-- obj.|', '.').length, 0);
  assert.strictEqual(complete('obj.draw(1 + |', ' ').length, 0);
});

// ------------------------------
// シグネチャヘルプ
// ------------------------------
function signature(textWithCursor) {
  const { doc, pos } = at(textWithCursor);
  return P.signature.provideSignatureHelp(doc, pos);
}

test('obj.load("text", ...) は text 形式のシグネチャを出す', () => {
  const h = signature('obj.load("text", "abc", |');
  assert.strictEqual(h.signatures.length, 1);
  assert.ok(h.signatures[0].label.includes('align'));
  assert.strictEqual(h.activeParameter, 2);
});

test('obj.setoption("drawtarget","framebuffer") は該当する形式を選ぶ', () => {
  const h = signature('obj.setoption("drawtarget", "framebuffer"|');
  assert.strictEqual(h.signatures.length, 2);
  assert.ok(h.signatures[h.activeSignature].label.includes('"framebuffer"'));
});

test('引数位置の範囲がシグネチャ文字列と一致する', () => {
  const h = signature('obj.draw(0, 0, |');
  const [s, e] = h.signatures[0].parameters[2].label;
  assert.strictEqual(h.signatures[0].label.slice(s, e), 'oz');
});

test('可変長引数は最後の引数を強調', () => {
  const h = signature('obj.effect("ぼかし", "範囲", 10, "光の強さ", 5, "x", |');
  assert.strictEqual(h.activeParameter, h.signatures[0].parameters.length - 1);
});

test('math.max のシグネチャ', () => {
  assert.ok(signature('math.max(1, |').signatures[0].label.startsWith('math.max'));
});

test('指示子のシグネチャヘルプ', () => {
  const h = signature('--track@vx:X速度,-10,|');
  const [s, e] = h.signatures[0].parameters[h.activeParameter].label;
  assert.strictEqual(h.signatures[0].label.slice(s, e), '最大値');
  const g = signature('--trackgroup@x,|');
  const [gs, ge] = g.signatures[0].parameters[g.activeParameter].label;
  assert.strictEqual(g.signatures[0].label.slice(gs, ge), '変数名2');
});

// ------------------------------
// ホバー・定義
// ------------------------------
function hover(textWithCursor) {
  const { doc, pos } = at(textWithCursor);
  const h = P.hover.provideHover(doc, pos);
  return h ? h.contents.value : null;
}

test('obj関数・obj変数・グローバル関数のホバー', () => {
  assert.ok(hover('obj.multi|object(3, f)').includes('obj.multiobject(num,func)'));
  assert.ok(hover('local a = obj.frame|_s').includes('開始フレーム'));
  assert.ok(hover('local c = RG|B(1,2,3)').includes('RGB(r,g,b)'));
  assert.ok(hover('local a = foo.frame|_s') === null);
});

test('指示子のホバー', () => {
  assert.ok(hover('--hi|de@x:chk==0').includes('非表示'));
  assert.ok(hover('--hide|menu').includes('追加メニュー'));
});

test('指示子で定義された変数のホバー(--hide の条件内を含む)', () => {
  const src = '--check@chk:有効,true\n--track@x:X,0,1,0\n--hide@x:ch|k==0';
  assert.ok(hover(src).includes('boolean'));
});

test('文字列リテラルのホバー', () => {
  assert.ok(hover('obj.setoption("blend", "rgba_a|dd")').includes('単純に加算'));
  assert.ok(hover('obj.getinfo("bpm_li|st")').includes('一覧'));
});

test('シェーダー名・変数の定義へジャンプ', () => {
  const src = '--track@speed:速度,0,10,1\n--[[pixelshader@myps:\n]]\n';
  let { doc, pos } = at(src + 'obj.pixelshader("my|ps", "object")');
  let loc = P.definition.provideDefinition(doc, pos);
  assert.strictEqual(loc.range.start.line, 1);
  assert.strictEqual(doc.lineAt(1).text.slice(loc.range.start.character, loc.range.end.character), 'myps');
  ({ doc, pos } = at(src + 'local a = spe|ed * 2'));
  loc = P.definition.provideDefinition(doc, pos);
  assert.strictEqual(loc.range.start.line, 0);
  assert.strictEqual(doc.lineAt(0).text.slice(loc.range.start.character, loc.range.end.character), 'speed');
  ({ doc, pos } = at(src + 'obj.getvalue("track.spe|ed")'));
  assert.strictEqual(P.definition.provideDefinition(doc, pos).range.start.line, 0);
});

// ------------------------------
// アウトライン・色
// ------------------------------
test('アウトライン: セクション > グループ > 項目', () => {
  const doc = vscode._createDocument([
    '@A', '--group:基本,true', '--track@x:X::座標X,0,1,0', '--group', '--color@col:色,0xffffff',
    '--[[pixelshader@ps:', 'x', ']]', '@B', '--track0:速度,0,10,0',
  ].join('\n'));
  const root = P.symbols.provideDocumentSymbols(doc);
  assert.deepStrictEqual(root.map(s => s.name), ['@A', '@B']);
  const a = root[0].children;
  assert.deepStrictEqual(a.map(s => s.name), ['基本', 'col', 'ps']);
  assert.strictEqual(a[0].children[0].name, 'x');
  assert.ok(a[0].children[0].detail.endsWith('座標X'));
  assert.strictEqual(root[1].children[0].name, 'obj.track0');
});

test('色見本', () => {
  const doc = vscode._createDocument('--color@col:色,0xff8800\nlocal a = 0x123456 + 0x12345678');
  const colors = P.colors.provideDocumentColors(doc);
  assert.strictEqual(colors.length, 2);
  assert.strictEqual(Math.round(colors[0].color.red * 255), 255);
  assert.strictEqual(Math.round(colors[0].color.green * 255), 0x88);
  const pres = P.colors.provideColorPresentations(new vscode.Color(1, 0, 0.5, 1), { document: doc, range: colors[0].range });
  assert.strictEqual(pres[0].label, '0xff0080');
  vscode._config.colorDecorator = 'directive';
  assert.strictEqual(P.colors.provideDocumentColors(doc).length, 1);
  delete vscode._config.colorDecorator;
});

test('折りたたみ: セクション・グループ・シェーダー・インデント', () => {
  const doc = vscode._createDocument([
    '@A',                        // 0
    '--group:基本',              // 1
    '--track@x:X,0,1,0',         // 2
    '--group',                   // 3
    '--[[pixelshader@ps:',       // 4
    'float4 ps() {',             // 5
    '}',                         // 6
    ']]',                        // 7
    'if x then',                 // 8
    '    obj.draw()',            // 9
    '    obj.draw()',            // 10
    'end',                       // 11
    '@B',                        // 12
    'obj.draw()',                // 13
  ].join('\n'));
  const ranges = P.folding.provideFoldingRanges(doc).map(r => `${r.start}-${r.end}`);
  for (const r of ['0-11', '12-13', '1-3', '4-7', '8-10']) assert.ok(ranges.includes(r), `${r} が無い: ${ranges}`);
});

test('--track の補助表示', () => {
  const { documentHints } = require('../src/providers/inlayHints');
  const doc = vscode._createDocument([
    '--track@speed:速度,-10, 10,0,0.01',
    '--track0:X,0,100,50',
    '--track@a:A::名前,0,1,0,1,なし,0.5',
    '--check@c:C,0',
  ].join('\n'));
  const hints = documentHints(doc);
  const at = line => hints.filter(h => h.line === line).map(h => `${h.label}${doc.lineAt(line).text.slice(h.character).split(',')[0]}`);
  assert.deepStrictEqual(at(0), ['min:-10', 'max:10', 'default:0', 'step:0.01']);
  assert.deepStrictEqual(at(1), ['min:0', 'max:100', 'default:50']);
  assert.deepStrictEqual(at(2), ['min:0', 'max:1', 'default:0', 'step:1', 'zeroLabel:なし', 'ratio:0.5']);
  assert.deepStrictEqual(at(3), []);
  // 項目毎のオン/オフ
  vscode._config['inlayHints.track.min'] = false;
  vscode._config['inlayHints.track.step'] = false;
  const partial = documentHints(doc).filter(h => h.line === 0).map(h => h.label);
  assert.deepStrictEqual(partial, ['max:', 'default:']);
  delete vscode._config['inlayHints.track.min'];
  delete vscode._config['inlayHints.track.step'];
  vscode._config['inlayHints.trackParameters'] = false;
  assert.strictEqual(documentHints(doc).length, 0);
  delete vscode._config['inlayHints.trackParameters'];
});

if (failed) {
  console.log(`\n${failed}件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
