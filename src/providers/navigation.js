// ホバー表示と定義へのジャンプ
const vscode = require('vscode');
const parser = require('../parser');
const registry = require('../registry');
const common = require('../common');

const WORD_RE = /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/;

// カーソル位置の文字列リテラルと、それを含む関数呼び出しを返す
function stringLiteralAt(document, position) {
  const lineText = document.lineAt(position.line).text;
  // カーソル位置の直後まで含めて解析し、文字列の中にいるかを判定する
  const offset = document.offsetAt(position);
  const ctx = parser.getCallContext(document.getText(), offset);
  if (!ctx || ctx.state !== 'string') return null;
  const startChar = document.positionAt(ctx.stringStart).character;
  const quote = lineText[startChar];
  const closeAt = lineText.indexOf(quote, startChar + 1);
  if (closeAt < 0) return null;
  const value = lineText.slice(startChar + 1, closeAt);
  const range = new vscode.Range(position.line, startChar, position.line, closeAt + 1);
  return { ctx, value, range };
}

// 文字列リテラルが指す定義(シェーダー / --data / トラックバー)の位置
function literalTarget(document, literal) {
  const def = registry.functionMap.get(literal.ctx.name);
  if (!def || literal.ctx.argIndex > 1) return null;
  const parsed = common.parsedDocument(document);
  const line = literal.range.start.line;
  if (def.shaderName && literal.ctx.argIndex === 0) {
    const shader = common.shadersIn(parsed, line, def.shaderName).find(s => s.name === literal.value);
    if (shader) return { line: shader.line, start: shader.nameStart, end: shader.nameStart + shader.name.length, shader };
  }
  let varName = null;
  let kind = null;
  if (def.name === 'obj.data' && literal.ctx.argIndex === 0) { varName = literal.value; kind = 'data'; }
  if (def.name === 'obj.getvalue' && literal.ctx.argIndex === 0 && literal.value.startsWith('track.')) { varName = literal.value.slice(6); kind = 'track'; }
  if (def.name === 'obj.getoption' && literal.ctx.argIndex === 1 && literal.ctx.literals[0] === 'track_mode') { varName = literal.value; kind = 'track'; }
  if (varName) {
    for (const d of common.directivesIn(parsed, line, kind)) {
      const v = d.vars.find(x => x.name === varName);
      if (v) return { line: d.line, start: v.start, end: v.end, directive: d };
    }
  }
  return null;
}

// 単語(obj.draw / math.max / 変数名 など)の説明
function wordHover(document, position, word, range, inDirective) {
  const lineText = document.lineAt(position.line).text;
  // 指示子の行(--hide@pos:chk==0 など)では ':' の直後の変数名も対象にする
  const preceded = !inDirective && /[.:]\s*$/.test(lineText.slice(0, range.start.character));
  if (!preceded) {
    if (word.startsWith('obj.')) {
      const name = word.split('.')[1];
      const v = registry.objVariableMap.get(name);
      if (v) return common.md('```lua\nobj.' + name + '\n```\n\n' + (v.readonly ? '*読み取り専用*\n\n' : '') + v.doc);
      const f = registry.functionMap.get('obj.' + name);
      if (f) return common.functionMarkdown(f);
    }
    const f = registry.functionMap.get(word);
    if (f) return common.functionMarkdown(f);
    const c = registry.mathConstantMap.get(word);
    if (c) return common.md('```lua\n' + word + '\n```\n\n' + c.doc);
    if (word === 'obj') return common.md('```lua\nobj\n```\n\n対象オブジェクトの情報(変数・関数)を持つテーブル');
    const g = registry.globalVariables.find(x => x.name === word.split('.')[0]);
    if (g) return common.md(g.doc);
  }
  if (!word.includes('.') && !preceded) {
    const parsed = common.parsedDocument(document);
    const directive = common.definedVariables(parsed, position.line).get(word);
    if (directive) return common.definedVariableMarkdown(directive, word);
  }
  return null;
}

const hoverProvider = {
  provideHover(document, position) {
    const lineText = document.lineAt(position.line).text;

    // 指示子の名前部分
    const dm = /^--([A-Za-z_]\w*)(@)?/.exec(lineText);
    if (dm && position.character <= 2 + dm[1].length) {
      const def = parser.findDirectiveDef(dm[1], !!dm[2]);
      if (def) return new vscode.Hover(common.directiveMarkdown(def), new vscode.Range(position.line, 0, position.line, 2 + dm[1].length));
    }
    // シェーダー定義の開始行
    const sm = /^--\[=*\[(pixelshader|computeshader)@/.exec(lineText);
    if (sm && position.character <= sm[0].length) {
      const block = registry.shaderBlocks.find(b => b.name === sm[1]);
      return new vscode.Hover(common.md('```\n' + block.syntax + '\n```\n\n' + block.doc));
    }

    // 文字列リテラル(関数の引数)
    const literal = stringLiteralAt(document, position);
    if (literal) {
      const target = literalTarget(document, literal);
      if (target && target.shader) {
        return new vscode.Hover(common.md(`**${target.shader.name}** — ${target.shader.kind}の定義(${target.shader.line + 1}行目)`), literal.range);
      }
      if (target && target.directive) {
        return new vscode.Hover(common.definedVariableMarkdown(target.directive, target.directive.vars[0].name), literal.range);
      }
      const def = registry.functionMap.get(literal.ctx.name);
      if (!def) return null;
      const { overloads } = registry.selectOverloads(def, literal.ctx.literals);
      const label = `"${literal.value}"`;
      for (const o of [...overloads, ...def.overloads]) {
        const found = registry.valuesFor(def, o, literal.ctx.argIndex).find(x => x.label === label);
        if (found) return new vscode.Hover(common.valueMarkdown(found), literal.range);
      }
      return null;
    }

    const range = document.getWordRangeAtPosition(position, WORD_RE);
    if (!range) return null;
    const state = parser.getStateAt(document.getText(), document.offsetAt(range.start));
    if (state !== 'code' && !dm) return null;
    const content = wordHover(document, position, document.getText(range), range, state !== 'code');
    return content ? new vscode.Hover(content, range) : null;
  },
};

const definitionProvider = {
  provideDefinition(document, position) {
    const literal = stringLiteralAt(document, position);
    if (literal) {
      const target = literalTarget(document, literal);
      if (!target) return null;
      return new vscode.Location(document.uri, new vscode.Range(target.line, target.start, target.line, target.end));
    }
    const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
    if (!range) return null;
    const lineText = document.lineAt(position.line).text;
    if (/[.:]\s*$/.test(lineText.slice(0, range.start.character)) && !/^--[A-Za-z_]\w*@/.test(lineText)) return null;
    const word = document.getText(range);
    const parsed = common.parsedDocument(document);
    const directive = common.definedVariables(parsed, position.line).get(word);
    if (!directive) return null;
    const v = directive.vars.find(x => x.name === word);
    return new vscode.Location(document.uri, new vscode.Range(directive.line, v.start, directive.line, v.end));
  },
};

function register(context, selector) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, hoverProvider),
    vscode.languages.registerDefinitionProvider(selector, definitionProvider)
  );
}

module.exports = { register };
