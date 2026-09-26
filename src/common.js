// プロバイダ共通の処理
const vscode = require('vscode');
const parser = require('./parser');

// ------------------------------
// ドキュメント解析結果のキャッシュ
// ------------------------------
const cache = new Map();

function parsedDocument(document) {
  const key = document.uri.toString();
  const hit = cache.get(key);
  if (hit && hit.version === document.version) return hit.parsed;
  const parsed = parser.parseDocument(document.getText());
  cache.set(key, { version: document.version, parsed });
  return parsed;
}

function forgetDocument(document) {
  cache.delete(document.uri.toString());
}

// 指定行のセクション内で、指示子により定義された変数 → 指示子 の対応表
function definedVariables(parsed, line) {
  const section = parser.sectionAt(parsed, line);
  const map = new Map();
  for (const d of parsed.directives) {
    if (d.section !== section || !d.def || !d.def.defines) continue;
    for (const v of d.vars) if (!map.has(v.name)) map.set(v.name, d);
  }
  return map;
}

// 指定行のセクション内のシェーダー定義
function shadersIn(parsed, line, kind) {
  const section = parser.sectionAt(parsed, line);
  return parsed.shaders.filter(s => s.section === section && (!kind || s.kind === kind));
}

// 指定行のセクション内の指示子(名前で絞り込み)
function directivesIn(parsed, line, name) {
  const section = parser.sectionAt(parsed, line);
  return parsed.directives.filter(d => d.section === section && (!name || d.name === name));
}

// ドキュメント内の定義から作る引数の候補値
// (シェーダー登録名 / --data の登録名 / トラックバー変数名 など)
function documentValues(def, argIndex, literals, parsed, line) {
  const str = (value, detail) => ({ label: `"${value}"`, detail });
  const vars = kind => directivesIn(parsed, line, kind).flatMap(d => d.vars.map(v => ({ name: v.name, line: d.line })));
  if (def.shaderName && argIndex === 0) {
    return shadersIn(parsed, line, def.shaderName).map(s => str(s.name, `${s.kind}の定義(${s.line + 1}行目)`));
  }
  if (def.name === 'obj.data' && argIndex === 0) {
    return vars('data').map(v => str(v.name, `--data@の定義(${v.line + 1}行目)`));
  }
  if (def.name === 'obj.getvalue' && argIndex === 0) {
    return vars('track').map(v => str(`track.${v.name}`, `トラックバー ${v.name} の値`));
  }
  if (def.name === 'obj.getoption' && argIndex === 1 && literals[0] === 'track_mode') {
    return vars('track').map(v => str(v.name, `トラックバー(${v.line + 1}行目)`));
  }
  if (def.name === 'obj.setanchor' && argIndex === 0) {
    return [
      ...vars('value').map(v => str(v.name, `--value@の配列(${v.line + 1}行目)`)),
      ...directivesIn(parsed, line, 'trackgroup').map(d => str(d.vars.map(v => v.name).join(','), `トラックバーグループ(${d.line + 1}行目)`)),
    ];
  }
  return [];
}

// ------------------------------
// 説明文(Markdown)の生成
// ------------------------------
function md(text) {
  const m = new vscode.MarkdownString(text);
  m.supportHtml = false;
  return m;
}

function functionMarkdown(def, overload) {
  const parts = [];
  const overloads = overload ? [overload] : def.overloads;
  parts.push('```lua\n' + overloads.map(o => o.label).join('\n') + '\n```');
  if (overload && overload.doc) parts.push(overload.doc);
  else if (def.doc) parts.push(def.doc);
  const returns = overload ? overload.returns : (def.overloads.length === 1 ? def.overloads[0].returns : undefined);
  if (returns) parts.push(`**戻り値**: ${returns}`);
  return md(parts.join('\n\n'));
}

function directiveMarkdown(def) {
  const parts = ['```\n' + def.syntax + '\n```'];
  if (def.legacy) parts.push('*旧スクリプト形式(互換対応)*');
  if (def.only) parts.push(`*対象: ${def.only.map(e => '.' + e).join(' / ')}*`);
  parts.push(def.doc);
  return md(parts.join('\n\n'));
}

// 指示子で定義された変数の説明
function definedVariableMarkdown(directive, varName) {
  const def = directive.def;
  const args = directive.args.map(a => a.trim());
  const parts = [`**${varName}** — ${def.kind}(\`--${def.name}@\` で定義、${directive.line + 1}行目)`];
  const label = args[0] !== undefined ? args[0].replace(/=.*$/, '') : '';
  if (label) parts.push(`項目名: ${label.replace(/^.*::/, '')}`);
  if (def.name === 'track' && args.length >= 4) {
    parts.push(`範囲: ${args[1]} 〜 ${args[2]} / 初期値: ${args[3]}` + (args[4] ? ` / 移動単位: ${args[4]}` : ''));
  } else if (def.name === 'select') {
    const choices = args.slice(1).filter(Boolean).join(' / ');
    if (choices) parts.push(`選択肢: ${choices}`);
    const dflt = (args[0] || '').split('=')[1];
    if (dflt !== undefined) parts.push(`初期値: ${dflt}`);
  } else if (args.length >= 2) {
    parts.push(`初期値: \`${args.slice(1).join(',')}\``);
  }
  if (def.name === 'check') {
    const dflt = (args[1] || '').trim();
    parts.push(dflt === 'true' || dflt === 'false' ? '型: boolean' : '型: number(0/1)');
  }
  return md(parts.join('\n\n'));
}

// 文字列リテラル中の候補値の説明
function valueMarkdown(value) {
  return md([`\`${value.label}\``, value.detail, value.doc].filter(Boolean).join('\n\n'));
}

// ------------------------------
// その他
// ------------------------------

// シグネチャ文字列中の各引数ラベルの位置を [開始,終了] で返す
function paramOffsets(label, params) {
  let pos = label.indexOf('(') + 1;
  return params.map(p => {
    const i = label.indexOf(p.label, pos);
    if (i < 0) return [0, 0];
    pos = i + p.label.length;
    return [i, pos];
  });
}

function config() {
  return vscode.workspace.getConfiguration('aviutl2');
}

module.exports = {
  parsedDocument,
  forgetDocument,
  definedVariables,
  shadersIn,
  directivesIn,
  documentValues,
  md,
  functionMarkdown,
  directiveMarkdown,
  definedVariableMarkdown,
  valueMarkdown,
  paramOffsets,
  config,
};
