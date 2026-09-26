// @スクリプト名 の行全体に背景色を付けて、複数スクリプトの区切りを見やすくする
const vscode = require('vscode');
const common = require('../common');
const { DEFAULT_SECTION_COLOR, toRgba } = require('../colorRules');

const TARGET_RE = /\.(anm2|obj2|cam2|scn2|tra2)$/i;

let decorationType = null;

function settings() {
  const cfg = common.config();
  const color = cfg.get('sectionHighlight.color', DEFAULT_SECTION_COLOR);
  return {
    enable: cfg.get('sectionHighlight.enable', true),
    color: toRgba(color) ? color : DEFAULT_SECTION_COLOR,
    opacity: cfg.get('sectionHighlight.opacity', 0.25),
  };
}

function createType() {
  if (decorationType) decorationType.dispose();
  const s = settings();
  decorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: toRgba(s.color, s.opacity),
    overviewRulerColor: toRgba(s.color),
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });
}

function update(editor) {
  if (!editor || !TARGET_RE.test(editor.document.fileName) || !decorationType) return;
  if (!settings().enable) {
    editor.setDecorations(decorationType, []);
    return;
  }
  const parsed = common.parsedDocument(editor.document);
  editor.setDecorations(decorationType, parsed.sections.map(s => new vscode.Range(s.line, 0, s.line, 0)));
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
      if (e.affectsConfiguration('aviutl2.sectionHighlight')) {
        createType();
        updateVisible();
      }
    })
  );
  updateVisible();
}

module.exports = { register };
