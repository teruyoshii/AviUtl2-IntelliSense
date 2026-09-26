// 指示子などの静的チェック(VSCodeに依存しない部分)
// 戻り値の severity は vscode.DiagnosticSeverity と同じ値(0=エラー / 1=警告 / 2=情報)
const parser = require('./parser');
const { directives } = require('./data/directives');

const ERROR = 0;
const WARNING = 1;

const KNOWN_NAMES = [...new Set(directives.map(d => d.name))];
const TYPE_NAMES = { anm2: 'アニメーション効果(.anm2)', obj2: 'カスタムオブジェクト(.obj2)', cam2: 'カメラ効果(.cam2)', scn2: 'シーンチェンジ(.scn2)', tra2: 'トラックバー移動(.tra2)' };

function lint(text, fileName) {
  const type = parser.scriptType(fileName);
  const parsed = parser.parseDocument(text);
  const lines = text.split(/\r?\n/);
  const problems = [];
  const add = (line, start, end, severity, message) => problems.push({ line, start, end: end === undefined ? lines[line].length : end, severity, message });

  // セクション毎に定義済み変数・項目名を管理する
  const seenVars = new Map(); // `${section}:${name}` → 行
  const seenLabels = new Map();

  for (const d of parsed.directives) {
    const nameEnd = 2 + d.name.length;
    if (!d.def) {
      // 既知の指示子に近い名前ならタイプミスとして警告
      if (d.name.length >= 4) {
        const near = KNOWN_NAMES.filter(n => parser.editDistance(n.toLowerCase(), d.name.toLowerCase()) <= (n.length >= 8 ? 2 : 1));
        if (near.length) add(d.line, 0, nameEnd, WARNING, `不明な指示子 --${d.name} です。--${near[0]} の誤りではありませんか?`);
      }
      continue;
    }
    const def = d.def;
    if (d.hasAt && def.form !== 'at') {
      add(d.line, 0, nameEnd + 1, WARNING, `--${d.name} は '@' を付けずに ${def.syntax} の形式で指定します。`);
      continue;
    }
    if (!d.hasAt && def.form === 'at') {
      add(d.line, 0, nameEnd, WARNING, `--${d.name} は ${def.syntax} の形式で指定します。`);
      continue;
    }
    if (type && def.only && !def.only.includes(type)) {
      add(d.line, 0, nameEnd, WARNING, `--${d.name} は${def.only.map(t => TYPE_NAMES[t]).join('・')}専用の指示子です。`);
    }
    if (def.form === 'at') {
      if (!d.vars.length) {
        add(d.line, 0, lines[d.line].length, ERROR, `--${d.name}@ の後に${def.params[0].label}を指定してください。`);
        continue;
      }
      for (const v of d.vars) {
        if (!/^[A-Za-z_]\w*$/.test(v.name) && d.name !== 'data') {
          add(d.line, v.start, v.end, WARNING, `${v.name} はLuaの変数名として使えない名前です。`);
        }
      }
      if (d.argPart === undefined && d.name !== 'hide') {
        add(d.line, 0, lines[d.line].length, ERROR, `':' の後に${def.params[(def.varCount || 1)].label}を指定してください。(${def.syntax})`);
        continue;
      }
    }
    // トラックバーは 項目名,最小値,最大値,デフォルト値 が必須
    if ((d.name === 'track' && d.hasAt) || /^track\d$/.test(d.name)) {
      if (d.args.length < 4 || d.args.slice(0, 4).some(a => a.trim() === '')) {
        add(d.line, 0, lines[d.line].length, ERROR, `トラックバーには 項目名,最小値,最大値,デフォルト値 が必要です。(${def.syntax})`);
      } else {
        const [, min, max, dflt] = d.args.map(a => Number(a.trim()));
        if ([min, max, dflt].some(Number.isNaN)) {
          add(d.line, 0, lines[d.line].length, ERROR, 'トラックバーの最小値,最大値,デフォルト値は数値で指定してください。');
        } else if (min > max || dflt < min || dflt > max) {
          add(d.line, 0, lines[d.line].length, WARNING, `デフォルト値 ${dflt} が範囲 ${min}〜${max} の外にあるか、最小値が最大値より大きくなっています。`);
        }
      }
    }
    // 変数名の重複
    if (def.defines) {
      for (const v of d.vars) {
        const key = `${d.section}:${v.name}`;
        if (seenVars.has(key)) add(d.line, v.start, v.end, WARNING, `変数 ${v.name} は${seenVars.get(key) + 1}行目で既に定義されています。`);
        else seenVars.set(key, d.line);
      }
    }
    // 項目名の重複(設定値が保存される項目は項目名がスクリプト毎にユニークである必要がある)
    if (def.defines && d.args.length) {
      const label = d.args[0].replace(/=.*$/, '').trim();
      const key = `${d.section}:${label}`;
      if (label && seenLabels.has(key)) {
        add(d.line, 0, lines[d.line].length, WARNING, `項目名「${label}」は${seenLabels.get(key) + 1}行目と重複しています。項目名はスクリプト毎にユニークにする必要があります。`);
      } else if (label) seenLabels.set(key, d.line);
    }
  }

  // 他の項目を参照する指示子(--trackgroup / --hide)の検査
  for (const d of parsed.directives) {
    if (!d.def || d.def.form !== 'at') continue;
    const before = parsed.directives.filter(x => x.section === d.section && x.line < d.line);
    const all = parsed.directives.filter(x => x.section === d.section);
    if (d.name === 'trackgroup') {
      if (d.vars.length < 2 || d.vars.length > 3) {
        add(d.line, 0, lines[d.line].length, WARNING, '--trackgroup にはトラックバーの変数名を2〜3個指定します。');
      }
      for (const v of d.vars) {
        if (!before.some(x => x.name === 'track' && x.hasAt && x.vars.some(y => y.name === v.name))) {
          add(d.line, v.start, v.end, WARNING, `${v.name} はこの行より前に --track@ で定義されていません。`);
        }
      }
    }
    if (d.name === 'hide') {
      const items = all.filter(x => x.def && x.def.defines);
      for (const v of d.vars) {
        if (!items.some(x => x.vars.some(y => y.name === v.name))) {
          add(d.line, v.start, v.end, WARNING, `${v.name} は設定項目として定義されていません。`);
        }
      }
      const cond = (d.argPart || '').trim();
      if (cond) {
        const m = /^([A-Za-z_]\w*)\s*(==|~=|>|<)\s*-?\d+(?:\.\d+)?$/.exec(cond);
        const condStart = lines[d.line].indexOf(':') + 1;
        if (!m) {
          add(d.line, condStart, undefined, WARNING, '非表示条件は「変数名 比較演算子(== ~= > <) 数値」の形式で指定します。');
        } else if (m[1] !== 'filter' && !items.some(x => x.vars.some(y => y.name === m[1]))) {
          add(d.line, condStart, condStart + m[1].length, WARNING, `${m[1]} は設定項目として定義されていません。`);
        }
      }
    }
  }

  // シェーダー・汎用データ領域の参照
  const CALL_RE = /\bobj\.(pixelshader|computeshader|data)\s*\(\s*(["'])([^"'\r\n]*)\2/g;
  // 各行の開始位置(CRLFでもずれないよう本文の '\n' の位置から求める)
  const lineStarts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
  for (const m of text.matchAll(CALL_RE)) {
    if (parser.getStateAt(text, m.index) !== 'code') continue;
    const line = lineStarts.findIndex((s, i) => i + 1 >= lineStarts.length || lineStarts[i + 1] > m.index);
    const section = parser.sectionAt(parsed, line);
    const name = m[3];
    const start = m.index - lineStarts[line] + m[0].length - name.length - 1;
    if (m[1] === 'data') {
      if (!parsed.directives.some(d => d.section === section && d.name === 'data' && d.vars.some(v => v.name === name))) {
        add(line, start, start + name.length, WARNING, `汎用データ領域 ${name} は --data@ で定義されていません。`);
      }
    } else if (!name.includes('@') && !parsed.shaders.some(s => s.section === section && s.kind === m[1] && s.name === name)) {
      add(line, start, start + name.length, WARNING, `${m[1]} ${name} はこのスクリプト内で定義されていません。(他のスクリプトの定義は "登録名@スクリプト名" で指定します)`);
    }
  }

  return problems;
}

module.exports = { lint };
