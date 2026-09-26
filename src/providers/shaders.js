// --[[pixelshader@名前: ... ]] / --[[computeshader@名前: ... ]] のシェーダー定義の範囲に背景色を付ける
const vscode = require('vscode');
const common = require('../common');
const { DEFAULT_SHADER_COLOR, toRgba } = require('../colorRules');

const TARGET_RE = /\.(anm2|obj2|cam2|scn2|tra2)$/i;

let decorationType = null;

function settings() {
  const cfg = common.config();
  const color = cfg.get('shaderHighlight.color', DEFAULT_SHADER_COLOR);
  return {
    enable: cfg.get('shaderHighlight.enable', true),
    color: toRgba(color) ? color : DEFAULT_SHADER_COLOR,
    opacity: cfg.get('shaderHighlight.opacity', 0.08),
  };
}

function createType() {
  if (decorationType) decorationType.dispose();
  const s = settings();
  decorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: toRgba(s.color, s.opacity),
  });
}

// 背景色を付ける範囲(開始行〜終了行)
function shaderRanges(parsed) {
  return parsed.shaders.map(sh => ({ start: sh.line, end: sh.endLine }));
}

function update(editor) {
  if (!editor || !TARGET_RE.test(editor.document.fileName) || !decorationType) return;
  if (!settings().enable) {
    editor.setDecorations(decorationType, []);
    return;
  }
  const parsed = common.parsedDocument(editor.document);
  editor.setDecorations(decorationType, shaderRanges(parsed).map(r => new vscode.Range(r.start, 0, r.end, 0)));
}

function register(context) {
  createType();
  let timer = null;
  const updateVisible = () => vscode.window.visibleTextEditors.forEach(update);
  context.subscriptions.push(
    { dispose: () => decorationType && decorationType.dispose() },
    vscode.window.onDidChangeVisibleTextEditors(updateVisible),
    vscode.workspace.onDidChangeTextDocument(e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        vscode.window.visibleTextEditors.filter(ed => ed.document === e.document).forEach(update);
      }, 200);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aviutl2.shaderHighlight')) {
        createType();
        updateVisible();
      }
    })
  );
  updateVisible();
}

module.exports = { register, shaderRanges };
