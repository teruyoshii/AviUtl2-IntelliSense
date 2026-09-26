// ソースコード解析(VSCodeに依存しない部分)
// - 関数呼び出しの文脈(どの関数の何番目の引数か)の判定
// - スクリプトヘッダ指示子(--track@ など)・@セクション・シェーダー定義の解析

const { directives } = require('./data/directives');

// ------------------------------
// 字句走査
// ------------------------------

// Luaの長括弧 [[ / [=[ の開始を判定し、レベル(=の数)を返す。該当しなければ -1
function longBracketLevel(text, i) {
  if (text[i] !== '[') return -1;
  let j = i + 1;
  while (text[j] === '=') j++;
  return text[j] === '[' ? j - i - 1 : -1;
}

// 文字列・コメントを読み飛ばしつつ、括弧の対応を追跡して offset 位置の状態を返す
// 戻り値: { state: 'code'|'string'|'comment', stack: [{ ch, pos, argIndex, argStarts }], stringStart }
function scan(text, offset) {
  const stack = [];
  let i = 0;
  const end = Math.min(offset, text.length);
  while (i < end) {
    const c = text[i];
    // コメント
    if (c === '-' && text[i + 1] === '-') {
      const level = longBracketLevel(text, i + 2);
      if (level >= 0) {
        const close = ']' + '='.repeat(level) + ']';
        const closeAt = text.indexOf(close, i + 4 + level);
        if (closeAt < 0 || closeAt + close.length > end) return { state: 'comment', stack };
        i = closeAt + close.length;
      } else {
        const nl = text.indexOf('\n', i);
        if (nl < 0 || nl >= end) return { state: 'comment', stack };
        i = nl + 1;
      }
      continue;
    }
    // 文字列
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') {
        if (text[j] === '\\') j++;
        j++;
      }
      if (j >= end) return { state: 'string', stack, stringStart: i };
      i = j + 1;
      continue;
    }
    const level = longBracketLevel(text, i);
    if (level >= 0) {
      const close = ']' + '='.repeat(level) + ']';
      const closeAt = text.indexOf(close, i + 2 + level);
      if (closeAt < 0 || closeAt + close.length > end) return { state: 'string', stack, stringStart: i };
      i = closeAt + close.length;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') {
      stack.push({ ch: c, pos: i, argIndex: 0, argStarts: [i + 1] });
    } else if (c === ')' || c === '}' || c === ']') {
      const open = { ')': '(', '}': '{', ']': '[' }[c];
      // 対応の取れない閉じ括弧は、対応する開き括弧まで巻き戻す
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].ch === open) { stack.length = k; break; }
      }
    } else if (c === ',') {
      const top = stack[stack.length - 1];
      if (top) { top.argIndex++; top.argStarts.push(i + 1); }
    }
    i++;
  }
  return { state: 'code', stack };
}

// 文字列リテラルなら中身を返す。そうでなければ undefined
function literalValue(argText) {
  const m = /^\s*(["'])((?:\\.|(?!\1).)*)\1\s*$/.exec(argText);
  if (m) return m[2];
  const n = /^\s*(-?\d+(?:\.\d+)?|true|false|nil)\s*$/.exec(argText);
  return n ? n[1] : undefined;
}

// offset 位置が含まれる関数呼び出しの情報を返す
// 戻り値: { name, argIndex, args: [引数テキスト], literals: [文字列リテラルの中身], inTable, state, stringStart, openPos }
function getCallContext(text, offset) {
  const result = scan(text, offset);
  if (result.state === 'comment') return null;
  const { stack } = result;
  let inTable = false;
  for (let k = stack.length - 1; k >= 0; k--) {
    const frame = stack[k];
    if (frame.ch === '{') { inTable = true; continue; }
    if (frame.ch === '[') return null;
    // '(' の直前の関数名(obj.load / math.max / obj:method / RGB など)
    const before = text.slice(Math.max(0, frame.pos - 200), frame.pos);
    const m = /([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*$/.exec(before);
    if (!m) return null;
    const name = m[1].replace(/\s+/g, '');
    // 'function foo(' の定義部分は呼び出しではない
    if (/\bfunction\s+$/.test(before.slice(0, m.index)) || /^function$/.test(name)) return null;
    const args = [];
    for (let a = 0; a < frame.argStarts.length; a++) {
      const from = frame.argStarts[a];
      const to = a + 1 < frame.argStarts.length ? frame.argStarts[a + 1] - 1 : offset;
      args.push(text.slice(from, to));
    }
    return {
      name,
      argIndex: frame.argIndex,
      args,
      literals: args.map(literalValue),
      inTable,
      state: result.state,
      stringStart: result.stringStart,
      openPos: frame.pos,
    };
  }
  return null;
}

// offset 位置がコード・文字列・コメントのどれかを返す
function getStateAt(text, offset) {
  return scan(text, offset).state;
}

// ------------------------------
// 指示子の解析
// ------------------------------

// 指示子の行: --name / --name:引数 / --name@変数:引数
const DIRECTIVE_RE = /^--([A-Za-z_]\w*)(?:@([^:\r\n]*))?(?::([^\r\n]*))?\s*$/;
const SECTION_RE = /^@(.+?)\s*$/;
const SHADER_RE = /^--\[(=*)\[(pixelshader|computeshader)@([^:\r\n]+):/;

// name と '@' の有無から指示子の定義を探す
function findDirectiveDef(name, hasAt) {
  const form = hasAt ? 'at' : null;
  return directives.find(d => d.name === name && (hasAt ? d.form === form : d.form !== 'at'))
    || directives.find(d => d.name === name);
}

// ドキュメント全体を解析する
// 戻り値: { sections, directives, shaders }
//   sections  : [{ name, line }]  '@名前' の行(無ければ空)
//   directives: [{ line, name, def, hasAt, varPart, argPart, vars: [{ name, start, end }], args: [..], section }]
//   shaders   : [{ kind, name, line, endLine, nameStart, section }]
function parseDocument(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  const found = [];
  const shaders = [];
  let section = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sec = SECTION_RE.exec(line);
    if (sec) {
      sections.push({ name: sec[1], line: i });
      section = sections.length - 1;
      continue;
    }
    const sh = SHADER_RE.exec(line);
    if (sh) {
      const close = ']' + sh[1] + ']';
      let endLine = i;
      const firstRest = line.slice(sh[0].length);
      if (!firstRest.includes(close)) {
        for (endLine = i + 1; endLine < lines.length; endLine++) {
          if (lines[endLine].includes(close)) break;
        }
        if (endLine >= lines.length) endLine = lines.length - 1;
      }
      shaders.push({
        kind: sh[2], name: sh[3].trim(), line: i, endLine,
        nameStart: sh[0].length - 1 - sh[3].length, section,
      });
      i = endLine;
      continue;
    }
    // 通常のブロックコメント(--[[ ... ]])の中は読み飛ばす
    const block = /^--\[(=*)\[/.exec(line);
    if (block) {
      const close = ']' + block[1] + ']';
      if (!line.slice(block[0].length).includes(close)) {
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(close)) j++;
        i = j;
      }
      continue;
    }
    const m = DIRECTIVE_RE.exec(line);
    if (!m) continue;
    const [, name, varPart, argPart] = m;
    const hasAt = varPart !== undefined;
    const def = findDirectiveDef(name, hasAt);
    const vars = [];
    if (hasAt) {
      let pos = 2 + name.length + 1;
      for (const raw of varPart.split(',')) {
        const trimmed = raw.trim();
        if (trimmed) {
          const start = pos + raw.indexOf(trimmed);
          vars.push({ name: trimmed, start, end: start + trimmed.length });
        }
        pos += raw.length + 1;
      }
    }
    found.push({
      line: i, name, def, hasAt, varPart, argPart,
      vars,
      args: argPart !== undefined ? argPart.split(',') : [],
      section,
    });
  }
  return { sections, directives: found, shaders };
}

// 指定行が属するセクション番号を返す(セクションが無ければ -1)
function sectionAt(parsed, line) {
  let sec = -1;
  parsed.sections.forEach((s, i) => { if (s.line <= line) sec = i; });
  return sec;
}

// グループの範囲に含めない指示子(設定画面の項目ではないもの)
const NON_ITEM_DIRECTIVES = new Set(['label', 'information', 'script', 'require', 'filter', 'hidemenu']);

// --group による設定グループの範囲を返す
// 戻り値: [{ name, open, line, endLine, terminatorLine, items: [指示子], section }]
//   open           : デフォルト表示状態('true' / 'false' / undefined)
//   endLine        : グループの最終行(終端の '--group' があればその行)
//   terminatorLine : 終端の '--group' の行(無ければ null)
// グループは次の '--group'(新しいグループまたは終端)の直前まで、無ければセクション内の最後の設定項目まで続く
function parseGroups(parsed) {
  const groups = [];
  let current = null;
  const close = () => {
    if (!current) return;
    const last = current.items.length ? current.items[current.items.length - 1].line : current.line;
    current.endLine = current.terminatorLine !== null ? current.terminatorLine : last;
    groups.push(current);
    current = null;
  };
  for (const d of parsed.directives) {
    if (current && d.section !== current.section) close();
    if (d.name === 'group' && !d.hasAt) {
      const [name, open] = (d.argPart || '').split(',').map(s => s.trim());
      if (current && !name) {
        current.terminatorLine = d.line;
        close();
        continue;
      }
      close();
      if (name) current = { name, open, line: d.line, endLine: d.line, terminatorLine: null, items: [], section: d.section };
      continue;
    }
    if (current && d.def && !NON_ITEM_DIRECTIVES.has(d.name)) current.items.push(d);
  }
  close();
  return groups;
}

// 指示子の行でカーソルが何番目の引数にあるかを返す(シグネチャヘルプ用)
function directiveParamIndex(lineText, character) {
  const m = /^--([A-Za-z_]\w*)(@)?/.exec(lineText);
  if (!m) return null;
  const hasAt = !!m[2];
  const def = findDirectiveDef(m[1], hasAt);
  if (!def) return null;
  const before = lineText.slice(0, character);
  if (before.length <= m[1].length + 2) return { def, index: -1 };
  const colon = lineText.indexOf(':', m[0].length);
  if (hasAt) {
    const varCount = def.varCount || 1;
    if (colon < 0 || character <= colon) {
      const commas = (before.slice(m[0].length).match(/,/g) || []).length;
      return { def, index: Math.min(commas, varCount - 1) };
    }
    const commas = (before.slice(colon + 1).match(/,/g) || []).length;
    return { def, index: Math.min(varCount + commas, def.params.length - 1) };
  }
  if (colon < 0 || character <= colon) return { def, index: -1 };
  const commas = (before.slice(colon + 1).match(/,/g) || []).length;
  return { def, index: Math.min(commas, def.params.length - 1) };
}

// ファイル名から拡張子(anm2 / obj2 / cam2 / scn2 / tra2)を返す
function scriptType(fileName) {
  const m = /\.(anm2|obj2|cam2|scn2|tra2)$/i.exec(fileName || '');
  return m ? m[1].toLowerCase() : null;
}

// 編集距離(タイプミス検出用)
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

module.exports = {
  getCallContext,
  getStateAt,
  literalValue,
  parseDocument,
  parseGroups,
  sectionAt,
  directiveParamIndex,
  findDirectiveDef,
  scriptType,
  editDistance,
};
