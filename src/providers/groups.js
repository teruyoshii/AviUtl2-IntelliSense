// --group による設定グループの範囲をエディタ上に表示する
// グループ毎に色を変えて、左端の線・薄い背景・開始/終了の注記・概要ルーラーの印を付ける
const vscode = require('vscode');
const parser = require('../parser');
const common = require('../common');
const { DEFAULT_GROUP_COLORS, toRgba } = require('../colorRules');

const TARGET_RE = /\.(anm2|obj2|cam2|scn2|tra2)$/i;

let lineTypes = [];   // グループ毎(色毎)の行の装飾
let labelType = null; // 開始・終了の注記(色は注記毎に指定)

function settings() {
  const cfg = common.config();
  const colors = cfg.get('groupHighlight.colors', DEFAULT_GROUP_COLORS);
  return {
    enable: cfg.get('groupHighlight.enable', true),
    colors: Array.isArray(colors) && colors.some(c => toRgba(c)) ? colors.filter(c => toRgba(c)) : DEFAULT_GROUP_COLORS,
    opacity: cfg.get('groupHighlight.backgroundOpacity', 0.08),
    showLabels: cfg.get('groupHighlight.showLabels', false),
  };
}

function disposeTypes() {
  lineTypes.forEach(t => t.dispose());
  lineTypes = [];
  if (labelType) labelType.dispose();
  labelType = null;
}

function createTypes() {
  disposeTypes();
  const s = settings();
  lineTypes = s.colors.map(color => vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: toRgba(color, s.opacity),
    borderColor: toRgba(color),
    borderStyle: 'solid',
    borderWidth: '0 0 0 3px',
    overviewRulerColor: toRgba(color, 0.8),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  }));
  labelType = vscode.window.createTextEditorDecorationType({});
}

// グループの注記
function label(line, lineLength, text, color) {
  return {
    range: new vscode.Range(line, lineLength, line, lineLength),
    renderOptions: { after: { contentText: text, color: toRgba(color, 0.9), fontStyle: 'italic', margin: '0 0 0 2em' } },
  };
}

function update(editor) {
  if (!editor || !TARGET_RE.test(editor.document.fileName)) return;
  const s = settings();
  if (!s.enable) {
    lineTypes.forEach(t => editor.setDecorations(t, []));
    if (labelType) editor.setDecorations(labelType, []);
    return;
  }
  const doc = editor.document;
  const groups = parser.parseGroups(common.parsedDocument(doc));
  const perType = lineTypes.map(() => []);
  const labels = [];
  // 色はセクション毎に先頭から順に割り当てる
  let index = 0;
  let section = null;
  for (const g of groups) {
    if (g.section !== section) { section = g.section; index = 0; }
    const color = s.colors[index % s.colors.length];
    perType[index % lineTypes.length].push(new vscode.Range(g.line, 0, g.endLine, 0));
    if (s.showLabels) {
      const state = g.open === 'false' ? '・初期状態: 折りたたみ' : '';
      // 項目数は設定画面に表示される項目(変数を持つもの)のみ数える
      const count = g.items.filter(d => d.def.defines || /^track\d$|^check0$/.test(d.name)).length;
      labels.push(label(g.line, doc.lineAt(g.line).text.length, `▼ グループ「${g.name}」 ${count}項目${state}`, color));
      labels.push(label(g.endLine, doc.lineAt(g.endLine).text.length, `▲ 「${g.name}」ここまで`, color));
    }
    index++;
  }
  lineTypes.forEach((t, i) => editor.setDecorations(t, perType[i]));
  editor.setDecorations(labelType, labels);
}

function register(context) {
  createTypes();
  let timer = null;
  const updateVisible = () => vscode.window.visibleTextEditors.forEach(update);
  context.subscriptions.push(
    { dispose: disposeTypes },
    vscode.window.onDidChangeVisibleTextEditors(updateVisible),
    vscode.workspace.onDidChangeTextDocument(e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        vscode.window.visibleTextEditors.filter(ed => ed.document === e.document).forEach(update);
      }, 200);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aviutl2.groupHighlight')) {
        createTypes();
        updateVisible();
      }
    })
  );
  updateVisible();
}

module.exports = { register };
