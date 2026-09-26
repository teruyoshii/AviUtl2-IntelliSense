// --track の補助表示
// --track@変数名:項目名,最小値,最大値,デフォルト値,... の各値の前に min: max: default: などを表示する
// ※VSCodeのインレイヒント機能は色を拡張機能毎に変えられない(workbench.colorCustomizations で全言語共通)ため、
//   エディタの装飾(デコレーション)で描画し、色を aviutl2.inlayHints.trackColor で指定できるようにしている
const vscode = require('vscode');
const common = require('../common');

const TARGET_RE = /\.(anm2|obj2|cam2|scn2|tra2)$/i;

// 項目名の後ろに並ぶ値の表示名(--track@ と --track0: で共通の並び)
// key は個別のオン/オフ設定 aviutl2.inlayHints.track.<key> の名前
const TRACK_LABELS = [
  { key: 'min', label: 'min:', doc: '最小値' },
  { key: 'max', label: 'max:', doc: '最大値' },
  { key: 'default', label: 'default:', doc: 'デフォルト値' },
  { key: 'step', label: 'step:', doc: '移動単位(1 / 0.1 / 0.01 / 0.001)' },
  { key: 'zeroLabel', label: 'zeroLabel:', doc: 'ゼロ値名称(設定値が0の時に表示する文字列)' },
  { key: 'ratio', label: 'ratio:', doc: '操作倍率(1.0以下)' },
];

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// 1行分の表示位置を返す: [{ character, key, label, doc }]
// 項目名(1番目の値)には表示しない
function trackHintPositions(lineText) {
  const m = /^--(?:track@[^:]*|track[0-3]):/.exec(lineText);
  if (!m) return [];
  const hints = [];
  let pos = m[0].length;
  lineText.slice(pos).split(',').forEach((raw, i) => {
    const info = TRACK_LABELS[i - 1];
    if (info && raw.trim() !== '') {
      hints.push({ character: pos + raw.search(/\S/), key: info.key, label: info.label, doc: info.doc });
    }
    pos += raw.length + 1;
  });
  return hints;
}

// ドキュメント全体の表示内容を返す(設定のオン/オフを反映): [{ line, character, key, label, doc }]
function documentHints(document, cfg = common.config()) {
  if (!cfg.get('inlayHints.trackParameters', true)) return [];
  const enabled = new Set(TRACK_LABELS.filter(t => cfg.get(`inlayHints.track.${t.key}`, true)).map(t => t.key));
  const hints = [];
  for (let line = 0; line < document.lineCount; line++) {
    const text = document.lineAt(line).text;
    if (!text.startsWith('--track')) continue;
    for (const h of trackHintPositions(text)) {
      if (enabled.has(h.key)) hints.push({ line, ...h });
    }
  }
  return hints;
}

// 表示色(未指定ならテーマのインレイヒントの色)
function hintColors(cfg = common.config()) {
  const color = cfg.get('inlayHints.trackColor', '');
  return {
    color: HEX_COLOR_RE.test(color || '') ? color : new vscode.ThemeColor('editorInlayHint.parameterForeground'),
    backgroundColor: new vscode.ThemeColor('editorInlayHint.parameterBackground'),
  };
}

let decorationType = null;

function update(editor) {
  if (!editor || !TARGET_RE.test(editor.document.fileName) || !decorationType) return;
  const colors = hintColors();
  const options = documentHints(editor.document).map(h => ({
    range: new vscode.Range(h.line, h.character, h.line, h.character),
    hoverMessage: h.doc,
    renderOptions: {
      before: {
        contentText: h.label,
        color: colors.color,
        backgroundColor: colors.backgroundColor,
        margin: '0 0.3em 0 0',
        // インレイヒントに合わせて少し小さい文字・角丸で表示する
        textDecoration: 'none; font-size: 90%; border-radius: 3px; padding: 0 2px;',
      },
    },
  }));
  editor.setDecorations(decorationType, options);
}

function register(context) {
  decorationType = vscode.window.createTextEditorDecorationType({});
  let timer = null;
  const updateVisible = () => vscode.window.visibleTextEditors.forEach(update);
  context.subscriptions.push(
    decorationType,
    vscode.window.onDidChangeVisibleTextEditors(updateVisible),
    vscode.workspace.onDidChangeTextDocument(e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        vscode.window.visibleTextEditors.filter(ed => ed.document === e.document).forEach(update);
      }, 150);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aviutl2.inlayHints')) updateVisible();
    })
  );
  updateVisible();
}

module.exports = { register, trackHintPositions, documentHints, TRACK_LABELS };
