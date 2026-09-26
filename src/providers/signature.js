// シグネチャヘルプ(引数の説明)
const vscode = require('vscode');
const parser = require('../parser');
const registry = require('../registry');
const common = require('../common');

function toSignature(label, params, doc) {
  const sig = new vscode.SignatureInformation(label, doc ? common.md(doc) : undefined);
  const offsets = common.paramOffsets(label, params);
  sig.parameters = params.map((p, i) => new vscode.ParameterInformation(offsets[i], p.doc ? common.md(p.doc) : undefined));
  return sig;
}

// 指示子の行(--track@変数名:項目名,... など)
function directiveSignature(lineText, character) {
  const info = parser.directiveParamIndex(lineText, character);
  if (!info || info.index < 0 || !info.def.params.length) return null;
  const { def } = info;
  const help = new vscode.SignatureHelp();
  // syntax の '--name@' 以降を引数リストとして扱えるよう、'(' の代わりに先頭位置から探す
  const label = def.syntax;
  const sig = new vscode.SignatureInformation(label, common.md(def.doc));
  let pos = label.indexOf(def.form === 'at' ? '@' : ':') + 1;
  sig.parameters = def.params.map(p => {
    const i = label.indexOf(p.label, pos);
    const range = i < 0 ? [0, 0] : [i, i + p.label.length];
    if (i >= 0) pos = i + p.label.length;
    return new vscode.ParameterInformation(range, p.doc ? common.md(p.doc) : undefined);
  });
  help.signatures = [sig];
  help.activeSignature = 0;
  help.activeParameter = info.index;
  return help;
}

const provider = {
  provideSignatureHelp(document, position) {
    const lineText = document.lineAt(position.line).text;
    if (/^--[A-Za-z_]/.test(lineText)) {
      return directiveSignature(lineText, position.character);
    }
    const ctx = parser.getCallContext(document.getText(), document.offsetAt(position));
    if (!ctx) return null;
    const def = registry.functionMap.get(ctx.name);
    if (!def) return null;
    const { overloads, active } = registry.selectOverloads(def, ctx.literals);
    const help = new vscode.SignatureHelp();
    help.signatures = overloads.map(o => {
      const doc = [o.doc || def.doc, o.returns ? `**戻り値**: ${o.returns}` : ''].filter(Boolean).join('\n\n');
      const sig = toSignature(o.label, o.params, doc);
      // 可変長引数('...')を超えた位置では最後の引数を強調する
      sig.activeParameter = o.params.length ? Math.min(ctx.argIndex, o.params.length - 1) : 0;
      return sig;
    });
    help.activeSignature = active;
    help.activeParameter = help.signatures[active].activeParameter;
    return help;
  },
};

function register(context, selector) {
  context.subscriptions.push(
    vscode.languages.registerSignatureHelpProvider(selector, provider, {
      triggerCharacters: ['(', ',', '@', ':'],
      retriggerCharacters: [',', '"', "'"],
    })
  );
}

module.exports = { register };
