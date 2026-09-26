// 定義データの索引
const { directives, shaderBlocks } = require('./data/directives');
const { objVariables, globalVariables } = require('./data/objVariables');
const { functions } = require('./data/functions');
const { libraries, mathConstants, basicLib } = require('./data/luaLibs');

// 関数名(別名含む) → 関数定義
const functionMap = new Map();
for (const f of [...functions, ...basicLib, ...Object.values(libraries).flat()]) {
  functionMap.set(f.name, f);
  for (const alias of f.aliases || []) functionMap.set(alias, f);
}

const objFunctions = functions.filter(f => f.name.startsWith('obj.'));
const globalFunctions = functions.filter(f => !f.name.startsWith('obj.'));
const objVariableMap = new Map(objVariables.map(o => [o.name, o]));
const mathConstantMap = new Map(mathConstants.map(c => [c.name, c]));

// 別名(mes / rand / rand1)を含めたグローバル関数名の一覧
const globalFunctionNames = [
  ...globalFunctions.map(f => ({ name: f.name, def: f })),
  ...functions.flatMap(f => (f.aliases || []).map(a => ({ name: a, def: f }))),
];

// 関数定義の、指定引数番号の候補値を返す(形式固有 → 関数共通 → 可変長引数の順)
function valuesFor(def, overload, argIndex) {
  if (overload && overload.values && overload.values[argIndex]) return overload.values[argIndex];
  if (def.values && def.values[argIndex]) return def.values[argIndex];
  if (def.rest && argIndex >= def.rest.from) return def.rest.values;
  return [];
}

// 呼び出し時の引数リテラルから、該当する形式(overload)を絞り込む
// 戻り値: { overloads: 表示する形式, active: 推奨する形式の番号 }
function selectOverloads(def, literals) {
  const first = literals[0];
  let overloads = def.overloads;
  const matched = def.overloads.filter(o => o.match && first !== undefined && o.match.includes(first));
  if (matched.length) overloads = matched;
  // 引数リテラルが形式の引数ラベルと一致する数が多いものを優先
  let active = 0;
  let best = -1;
  overloads.forEach((o, i) => {
    let score = 0;
    literals.forEach((lit, a) => {
      if (lit !== undefined && o.params[a] && o.params[a].label === `"${lit}"`) score += 2;
    });
    if (o.params.length >= literals.length) score += 1;
    if (score > best) { best = score; active = i; }
  });
  return { overloads, active };
}

module.exports = {
  directives,
  shaderBlocks,
  objVariables,
  objVariableMap,
  globalVariables,
  functions,
  objFunctions,
  globalFunctionNames,
  functionMap,
  libraries,
  mathConstants,
  mathConstantMap,
  basicLib,
  valuesFor,
  selectOverloads,
};
