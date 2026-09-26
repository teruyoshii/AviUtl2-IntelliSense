// アウトライン(ドキュメントシンボル)
// @セクション > --group > 設定項目 / シェーダー定義 の階層で表示する
const vscode = require('vscode');
const common = require('../common');

function lineRange(document, line, start = 0, end) {
  const text = document.lineAt(line).text;
  return new vscode.Range(line, start, line, end === undefined ? text.length : end);
}

function extend(symbol, line, document) {
  if (line > symbol.range.end.line) {
    symbol.range = new vscode.Range(symbol.range.start, new vscode.Position(line, document.lineAt(line).text.length));
  }
}

const provider = {
  provideDocumentSymbols(document) {
    const parsed = common.parsedDocument(document);
    const root = [];

    // セクション毎の入れ物(セクションが無ければ直下に並べる)
    const containers = new Map();
    containers.set(-1, { children: root, symbol: null, group: null });
    parsed.sections.forEach((s, i) => {
      const nextLine = i + 1 < parsed.sections.length ? parsed.sections[i + 1].line - 1 : document.lineCount - 1;
      const symbol = new vscode.DocumentSymbol(
        '@' + s.name, 'スクリプト', vscode.SymbolKind.Namespace,
        new vscode.Range(s.line, 0, nextLine, document.lineAt(nextLine).text.length),
        lineRange(document, s.line)
      );
      root.push(symbol);
      containers.set(i, { children: symbol.children, symbol, group: null });
    });

    const entries = [
      ...parsed.directives.map(d => ({ line: d.line, directive: d })),
      ...parsed.shaders.map(s => ({ line: s.line, shader: s })),
    ].sort((a, b) => a.line - b.line);

    for (const entry of entries) {
      const section = entry.directive ? entry.directive.section : entry.shader.section;
      const container = containers.get(section);
      if (entry.shader) {
        const s = entry.shader;
        const symbol = new vscode.DocumentSymbol(
          s.name, s.kind, vscode.SymbolKind.Function,
          new vscode.Range(s.line, 0, s.endLine, document.lineAt(s.endLine).text.length),
          lineRange(document, s.line, s.nameStart, s.nameStart + s.name.length)
        );
        container.children.push(symbol);
        continue;
      }
      const d = entry.directive;
      if (!d.def) continue;
      if (d.name === 'group') {
        const name = (d.argPart || '').split(',')[0].trim();
        if (!name) { container.group = null; continue; }
        const symbol = new vscode.DocumentSymbol(name, 'グループ', vscode.SymbolKind.Package, lineRange(document, d.line), lineRange(document, d.line));
        container.children.push(symbol);
        container.group = symbol;
        continue;
      }
      // --hide は他の項目を参照するだけなので表示しない
      if (d.name === 'hide') continue;
      if (!d.vars.length && !/^track\d$|^check0$/.test(d.name)) continue;
      const label = (d.args[0] || '').replace(/=.*$/, '').replace(/^.*::/, '').trim();
      const name = d.vars.length ? d.vars.map(v => v.name).join(',') : `obj.${d.name}`;
      const kind = d.def.defines || /^track\d$|^check0$/.test(d.name) ? vscode.SymbolKind.Field : vscode.SymbolKind.Property;
      const sel = d.vars.length
        ? lineRange(document, d.line, d.vars[0].start, d.vars[d.vars.length - 1].end)
        : lineRange(document, d.line);
      const symbol = new vscode.DocumentSymbol(name, `${d.def.kind}${label ? ' : ' + label : ''}`, kind, lineRange(document, d.line), sel);
      const parent = container.group ? container.group.children : container.children;
      parent.push(symbol);
      if (container.group) extend(container.group, d.line, document);
    }
    return root;
  },
};

function register(context, selector) {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, provider, { label: 'AviUtl2' })
  );
}

module.exports = { register };
