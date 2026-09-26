// 折りたたみ範囲
// 設定グループ(--group)・@セクション・シェーダー定義を折りたためるようにする
// ※折りたたみの提供元が登録されるとVSCode標準のインデントによる折りたたみが使われなくなるため、
//   インデントによる範囲も合わせて返す
const vscode = require('vscode');
const parser = require('../parser');
const common = require('../common');

// インデントによる折りたたみ範囲(VSCode標準の動作を簡易に再現)
function indentRanges(document) {
  const ranges = [];
  const indents = [];
  for (let i = 0; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    indents.push(/^\s*$/.test(text) ? -1 : text.replace(/\t/g, '    ').search(/\S/));
  }
  const stack = [];
  for (let i = 0; i <= indents.length; i++) {
    const indent = i < indents.length ? indents[i] : 0;
    if (indent < 0) continue;
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      const top = stack.pop();
      // 次の非空行の直前まで(末尾の空行は含めない)
      let end = i - 1;
      while (end > top.line && indents[end] < 0) end--;
      if (end > top.line) ranges.push(new vscode.FoldingRange(top.line, end));
    }
    if (i < indents.length) stack.push({ line: i, indent });
  }
  return ranges;
}

const provider = {
  provideFoldingRanges(document) {
    const parsed = common.parsedDocument(document);
    const ranges = [];
    parsed.sections.forEach((s, i) => {
      const end = i + 1 < parsed.sections.length ? parsed.sections[i + 1].line - 1 : document.lineCount - 1;
      if (end > s.line) ranges.push(new vscode.FoldingRange(s.line, end, vscode.FoldingRangeKind.Region));
    });
    for (const g of parser.parseGroups(parsed)) {
      if (g.endLine > g.line) ranges.push(new vscode.FoldingRange(g.line, g.endLine, vscode.FoldingRangeKind.Region));
    }
    for (const sh of parsed.shaders) {
      if (sh.endLine > sh.line) ranges.push(new vscode.FoldingRange(sh.line, sh.endLine, vscode.FoldingRangeKind.Region));
    }
    return [...ranges, ...indentRanges(document)];
  },
};

function register(context, selector) {
  context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, provider));
}

module.exports = { register };
