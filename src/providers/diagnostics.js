// 診断(問題パネルへの警告表示)
const vscode = require('vscode');
const { lint } = require('../lint');
const common = require('../common');

const TARGET_RE = /\.(anm2|obj2|cam2|scn2|tra2)$/i;

function register(context) {
  const collection = vscode.languages.createDiagnosticCollection('aviutl2');
  const timers = new Map();

  const update = document => {
    if (!TARGET_RE.test(document.fileName) || !common.config().get('diagnostics.enable', true)) {
      collection.delete(document.uri);
      return;
    }
    const diagnostics = lint(document.getText(), document.fileName).map(p => {
      const d = new vscode.Diagnostic(new vscode.Range(p.line, p.start, p.line, p.end), p.message, p.severity);
      d.source = 'AviUtl2';
      return d;
    });
    collection.set(document.uri, diagnostics);
  };

  // 入力中は少し待ってから検査する
  const schedule = document => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); update(document); }, 300));
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument(e => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument(document => {
      collection.delete(document.uri);
      common.forgetDocument(document);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aviutl2')) vscode.workspace.textDocuments.forEach(update);
    })
  );
  vscode.workspace.textDocuments.forEach(update);
}

module.exports = { register };
