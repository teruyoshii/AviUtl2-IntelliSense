// 補完候補の提示
const vscode = require('vscode');
const parser = require('../parser');
const registry = require('../registry');
const common = require('../common');

const Kind = vscode.CompletionItemKind;
const PARAMETER_HINTS = { command: 'editor.action.triggerParameterHints', title: '引数ヒントを表示' };
const RETRIGGER = { command: 'editor.action.triggerSuggest', title: '候補を再表示' };

// ------------------------------
// 指示子(--track@ など)
// ------------------------------
function directiveItems(document, position, lineText) {
  const before = lineText.slice(0, position.character);
  if (!/^--(?:\[{0,2}|[A-Za-z_]\w*)$/.test(before)) return null;
  const type = parser.scriptType(document.fileName);
  const wordEnd = position.character + (/^[\w@:]*/.exec(lineText.slice(position.character))[0].length);
  const range = new vscode.Range(position.line, 0, position.line, wordEnd);
  const items = [];
  for (const def of registry.directives) {
    if (type && def.only && !def.only.includes(type)) continue;
    const head = `--${def.name}${def.form === 'at' ? '@' : def.form === 'colon' ? ':' : ''}`;
    const item = new vscode.CompletionItem({ label: head, description: def.kind }, Kind.Keyword);
    item.insertText = new vscode.SnippetString('--' + def.snippet);
    item.filterText = head;
    item.range = range;
    item.documentation = common.directiveMarkdown(def);
    item.sortText = (def.legacy ? '2' : def.only ? '1' : '0') + def.name;
    item.command = PARAMETER_HINTS;
    items.push(item);
  }
  for (const block of registry.shaderBlocks) {
    const head = `--[[${block.name}@`;
    const item = new vscode.CompletionItem({ label: head, description: 'シェーダー定義' }, Kind.Snippet);
    const entry = block.name === 'pixelshader' ? 'psmain' : 'csmain';
    const body = block.name === 'pixelshader'
      ? `float4 \${1:${entry}}(float4 pos : SV_Position, float2 uv : TEXCOORD) : SV_Target {\n\t$0\n\treturn float4(0, 0, 0, 0);\n}`
      : `[numthreads(\${2:1}, \${3:1}, \${4:1})]\nvoid \${1:${entry}}(uint2 id : SV_DispatchThreadID) {\n\t$0\n}`;
    item.insertText = new vscode.SnippetString(`--[[${block.name}@\${1:${entry}}:\n${body}\n]]`);
    item.filterText = head;
    item.range = range;
    item.documentation = common.md('```\n' + block.syntax + '\n```\n\n' + block.doc);
    item.sortText = '3' + block.name;
    items.push(item);
  }
  return items;
}

// ------------------------------
// メンバー(obj. / math. / string. / table.)
// ------------------------------
function functionItem(label, def, kind, lineText, position) {
  const item = new vscode.CompletionItem({ label, description: def.summary }, kind);
  item.documentation = common.functionMarkdown(def);
  // 直後に '(' が既にある場合は括弧を補わない
  if (!/^\s*\(/.test(lineText.slice(position.character))) {
    item.insertText = new vscode.SnippetString(`${label}($0)`);
  }
  item.command = PARAMETER_HINTS;
  return item;
}

function memberItems(document, position, lineText) {
  const before = lineText.slice(0, position.character);
  const m = /(?:^|[^\w.:])(obj|math|string|table)\.(\w*)$/.exec(before);
  if (!m) return null;
  const [, owner] = m;
  const items = [];
  if (owner === 'obj') {
    for (const v of registry.objVariables) {
      const item = new vscode.CompletionItem({ label: v.name, description: v.readonly ? '読み取り専用' : undefined }, v.readonly ? Kind.Constant : Kind.Field);
      item.detail = `obj.${v.name}` + (v.legacy ? ' (旧形式)' : '');
      item.documentation = common.md(v.doc);
      item.sortText = (v.legacy ? '2' : '0') + v.name;
      items.push(item);
    }
    for (const f of registry.objFunctions) {
      const item = functionItem(f.name.slice(4), f, Kind.Method, lineText, position);
      item.sortText = '1' + f.name;
      items.push(item);
    }
  } else {
    for (const f of registry.libraries[owner]) {
      items.push(functionItem(f.name.slice(owner.length + 1), f, Kind.Function, lineText, position));
    }
    if (owner === 'math') {
      for (const c of registry.mathConstants) {
        const item = new vscode.CompletionItem(c.name.slice(5), Kind.Constant);
        item.documentation = common.md(c.doc);
        items.push(item);
      }
    }
  }
  return items;
}

// ------------------------------
// 関数の引数の候補値
// ------------------------------
function argumentItems(document, position, lineText, ctx) {
  const def = registry.functionMap.get(ctx.name);
  if (!def) return null;
  let current = ctx.args[ctx.argIndex] || '';
  // テーブル引数({"object", ...})の中では入力中の要素だけを見る
  if (ctx.inTable) current = current.slice(Math.max(current.lastIndexOf('{'), current.lastIndexOf(',')) + 1);
  // 引数が空・入力途中の文字列・入力途中の単語のときだけ候補を出す
  if (ctx.state !== 'string' && !/^\s*[\w.\-]*$/.test(current)) return null;
  const { overloads, active } = registry.selectOverloads(def, ctx.literals);
  let values = registry.valuesFor(def, overloads[active], ctx.argIndex);
  if (!values.length) {
    for (const o of overloads) {
      values = registry.valuesFor(def, o, ctx.argIndex);
      if (values.length) break;
    }
  }
  const parsed = common.parsedDocument(document);
  values = [...common.documentValues(def, ctx.argIndex, ctx.literals, parsed, position.line), ...values];
  if (!values.length) return null;

  // 置き換え範囲: 文字列の中なら引用符を含む文字列全体、そうでなければ入力中の単語
  let range;
  if (ctx.state === 'string') {
    const startChar = document.positionAt(ctx.stringStart).character;
    const quote = lineText[startChar];
    const after = lineText.slice(position.character);
    const closeAt = after.indexOf(quote);
    const endChar = closeAt >= 0 && !/[,()]/.test(after.slice(0, closeAt)) ? position.character + closeAt + 1 : position.character;
    range = new vscode.Range(position.line, startChar, position.line, endChar);
  } else {
    const word = /[\w.\-]*$/.exec(lineText.slice(0, position.character))[0];
    range = new vscode.Range(position.line, position.character - word.length, position.line, position.character);
  }

  return values.map((value, i) => {
    const isString = value.label.startsWith('"');
    const item = new vscode.CompletionItem({ label: value.label, description: value.detail }, isString ? Kind.EnumMember : Kind.Value);
    // "cache:" / "track." のように後ろに名前を続けるものはカーソルを引用符の内側に置く
    if (/[:.]"$/.test(value.label)) {
      item.insertText = new vscode.SnippetString(value.label.slice(0, -1).replace(/\$/g, '\\$') + '$0"');
      item.command = RETRIGGER;
    }
    item.filterText = ctx.state === 'string' ? value.label : value.label.replace(/^"|"$/g, '');
    item.range = range;
    if (value.doc) item.documentation = common.md(value.doc);
    item.sortText = String(i).padStart(3, '0');
    return item;
  });
}

// ------------------------------
// グローバルな名前(RGB / obj / 指示子で定義した変数 など)
// ------------------------------
function globalItems(document, position, lineText) {
  const before = lineText.slice(0, position.character);
  if (/[.:]\w*$/.test(before)) return null;
  const items = [];
  const parsed = common.parsedDocument(document);

  for (const [name, directive] of common.definedVariables(parsed, position.line)) {
    const item = new vscode.CompletionItem({ label: name, description: directive.def.kind }, Kind.Variable);
    item.documentation = common.definedVariableMarkdown(directive, name);
    item.sortText = '0' + name;
    items.push(item);
  }
  for (const { name, def } of registry.globalFunctionNames) {
    const item = functionItem(name, def, Kind.Function, lineText, position);
    item.sortText = '1' + name;
    items.push(item);
  }
  const obj = new vscode.CompletionItem({ label: 'obj', description: 'オブジェクトの変数・関数' }, Kind.Module);
  obj.insertText = 'obj.';
  obj.command = RETRIGGER;
  obj.sortText = '1obj';
  items.push(obj);
  for (const g of registry.globalVariables) {
    const item = new vscode.CompletionItem({ label: g.name, description: '共用テーブル' }, Kind.Variable);
    item.documentation = common.md(g.doc);
    item.sortText = '1' + g.name;
    items.push(item);
  }
  if (common.config().get('completion.luaStandardLibrary', true)) {
    for (const lib of Object.keys(registry.libraries)) {
      const item = new vscode.CompletionItem({ label: lib, description: 'Lua標準ライブラリ' }, Kind.Module);
      item.insertText = lib + '.';
      item.command = RETRIGGER;
      item.sortText = '2' + lib;
      items.push(item);
    }
    for (const f of registry.basicLib) {
      const item = functionItem(f.name, f, Kind.Function, lineText, position);
      item.sortText = '3' + f.name;
      items.push(item);
    }
  }
  return items;
}

const provider = {
  provideCompletionItems(document, position, token, context) {
    const lineText = document.lineAt(position.line).text;
    const trigger = context.triggerCharacter;

    const directive = directiveItems(document, position, lineText);
    if (directive) return directive;
    if (trigger === '-' || trigger === '[') return null;

    const offset = document.offsetAt(position);
    const text = document.getText();
    const state = parser.getStateAt(text, offset);
    if (state === 'comment') return null;

    if (state === 'code') {
      const member = memberItems(document, position, lineText);
      if (member) return member;
    }

    const ctx = parser.getCallContext(text, offset);
    if (ctx) {
      const args = argumentItems(document, position, lineText, ctx);
      if (args) return args;
    }
    if (state !== 'code' || (trigger && trigger !== '.')) return null;
    return globalItems(document, position, lineText);
  },
};

function register(context, selector) {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, provider, '.', '-', '[', '"', "'", '(', ',', ' ')
  );
}

module.exports = { register };
