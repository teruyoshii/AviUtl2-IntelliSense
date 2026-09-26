// Lua標準ライブラリの定義データ
// AviUtl2のスクリプト制御ではtable,string,mathライブラリのみ利用できる(docs/lua.txt「注意点」)。
// Lua 5.1 / LuaJIT 2.1 の標準関数に基づく。
// 形式は functions.js と同じ(overloads のみ使用)

const fn = (name, label, summary, params = [], returns) => ({
  name, summary, doc: summary,
  overloads: [{ label, params: params.map(([l, d]) => ({ label: l, doc: d || '' })), returns }],
});

const mathLib = [
  fn('math.abs', 'math.abs(x)', '絶対値', [['x']]),
  fn('math.acos', 'math.acos(x)', '逆余弦(ラジアン)', [['x']]),
  fn('math.asin', 'math.asin(x)', '逆正弦(ラジアン)', [['x']]),
  fn('math.atan', 'math.atan(x)', '逆正接(ラジアン)', [['x']]),
  fn('math.atan2', 'math.atan2(y,x)', 'y/xの逆正接(ラジアン、象限を考慮)', [['y'], ['x']]),
  fn('math.ceil', 'math.ceil(x)', 'x以上の最小の整数', [['x']]),
  fn('math.cos', 'math.cos(x)', '余弦(xはラジアン)', [['x', 'ラジアン']]),
  fn('math.cosh', 'math.cosh(x)', '双曲線余弦', [['x']]),
  fn('math.deg', 'math.deg(x)', 'ラジアンを度に変換', [['x', 'ラジアン']]),
  fn('math.exp', 'math.exp(x)', 'eのx乗', [['x']]),
  fn('math.floor', 'math.floor(x)', 'x以下の最大の整数', [['x']]),
  fn('math.fmod', 'math.fmod(x,y)', 'x/yの余り(0方向に丸めた商に対する余り)', [['x'], ['y']]),
  fn('math.frexp', 'math.frexp(x)', 'x = m*2^e となる m,e を返す', [['x']], 'm,e'),
  fn('math.ldexp', 'math.ldexp(m,e)', 'm*2^e', [['m'], ['e']]),
  fn('math.log', 'math.log(x)', '自然対数', [['x']]),
  fn('math.log10', 'math.log10(x)', '常用対数', [['x']]),
  fn('math.max', 'math.max(x,...)', '最大値', [['x'], ['...']]),
  fn('math.min', 'math.min(x,...)', '最小値', [['x'], ['...']]),
  fn('math.modf', 'math.modf(x)', '整数部と小数部に分ける', [['x']], '整数部,小数部'),
  fn('math.pow', 'math.pow(x,y)', 'xのy乗', [['x', '底'], ['y', '指数']]),
  fn('math.rad', 'math.rad(x)', '度をラジアンに変換', [['x', '度']]),
  fn('math.random', 'math.random([m[,n]])', '乱数(引数なし: 0以上1未満 / m: 1〜m / m,n: m〜nの整数)\n\n※フレーム毎に同じ値にしたい場合は obj.rand() を使います', [['m'], ['n']]),
  fn('math.randomseed', 'math.randomseed(x)', '乱数の種を設定', [['x']]),
  fn('math.sin', 'math.sin(x)', '正弦(xはラジアン)', [['x', 'ラジアン']]),
  fn('math.sinh', 'math.sinh(x)', '双曲線正弦', [['x']]),
  fn('math.sqrt', 'math.sqrt(x)', '平方根', [['x']]),
  fn('math.tan', 'math.tan(x)', '正接(xはラジアン)', [['x', 'ラジアン']]),
  fn('math.tanh', 'math.tanh(x)', '双曲線正接', [['x']]),
];

const mathConstants = [
  { name: 'math.pi', doc: '円周率' },
  { name: 'math.huge', doc: '無限大(HUGE_VAL)' },
];

const stringLib = [
  fn('string.byte', 'string.byte(s[,i[,j]])', 's[i]〜s[j]の文字コードを返す', [['s'], ['i', '開始位置(省略時1)'], ['j', '終了位置(省略時i)']]),
  fn('string.char', 'string.char(...)', '文字コードから文字列を作る', [['...']]),
  fn('string.dump', 'string.dump(function)', '関数のバイナリ表現を返す', [['function']]),
  fn('string.find', 'string.find(s,pattern[,init[,plain]])', 'パターンを検索し開始・終了位置(とキャプチャ)を返す', [['s'], ['pattern'], ['init', '検索開始位置'], ['plain', 'trueでパターン機能を無効化']]),
  fn('string.format', 'string.format(formatstring,...)', '書式付き文字列を作る(%d %f %s %x %02d など)', [['formatstring'], ['...']]),
  fn('string.gmatch', 'string.gmatch(s,pattern)', 'パターンに一致する部分を順に返すイテレータ', [['s'], ['pattern']]),
  fn('string.gsub', 'string.gsub(s,pattern,repl[,n])', 'パターンに一致する部分を置換する', [['s'], ['pattern'], ['repl', '置換文字列・テーブル・関数'], ['n', '最大置換数']], '置換後の文字列,置換数'),
  fn('string.len', 'string.len(s)', '文字列の長さ(バイト数)', [['s']]),
  fn('string.lower', 'string.lower(s)', '小文字に変換', [['s']]),
  fn('string.match', 'string.match(s,pattern[,init])', 'パターンに一致した部分(キャプチャ)を返す', [['s'], ['pattern'], ['init', '検索開始位置']]),
  fn('string.rep', 'string.rep(s,n)', 'sをn回繰り返した文字列', [['s'], ['n']]),
  fn('string.reverse', 'string.reverse(s)', '文字列を反転(バイト単位)', [['s']]),
  fn('string.sub', 'string.sub(s,i[,j])', '部分文字列(i〜j、負数は末尾から)', [['s'], ['i'], ['j']]),
  fn('string.upper', 'string.upper(s)', '大文字に変換', [['s']]),
];

const tableLib = [
  fn('table.concat', 'table.concat(table[,sep[,i[,j]]])', '配列要素を連結した文字列', [['table'], ['sep', '区切り文字'], ['i'], ['j']]),
  fn('table.insert', 'table.insert(table,[pos,]value)', '要素を挿入(pos省略時は末尾)', [['table'], ['pos', '挿入位置'], ['value']]),
  fn('table.maxn', 'table.maxn(table)', '最大の正の数値インデックス', [['table']]),
  fn('table.remove', 'table.remove(table[,pos])', '要素を削除して返す(pos省略時は末尾)', [['table'], ['pos']]),
  fn('table.sort', 'table.sort(table[,comp])', '配列をソート', [['table'], ['comp', '比較関数 function(a,b) return a<b end']]),
];

const basicLib = [
  fn('assert', 'assert(v[,message])', 'vが偽ならエラー', [['v'], ['message']]),
  fn('error', 'error(message[,level])', 'エラーを発生させる', [['message'], ['level']]),
  fn('getmetatable', 'getmetatable(object)', 'メタテーブルを取得', [['object']]),
  fn('ipairs', 'ipairs(t)', '配列部分を順に列挙するイテレータ', [['t']]),
  fn('next', 'next(table[,index])', '次のキーと値', [['table'], ['index']]),
  fn('pairs', 'pairs(t)', '全要素を列挙するイテレータ', [['t']]),
  fn('pcall', 'pcall(f,...)', '保護モードで関数を呼ぶ', [['f'], ['...']], '成否,戻り値...'),
  fn('rawequal', 'rawequal(v1,v2)', 'メタメソッドを使わず等価判定', [['v1'], ['v2']]),
  fn('rawget', 'rawget(table,index)', 'メタメソッドを使わず取得', [['table'], ['index']]),
  fn('rawset', 'rawset(table,index,value)', 'メタメソッドを使わず設定', [['table'], ['index'], ['value']]),
  fn('select', 'select(index,...)', 'index番目以降の引数(`"#"` で引数の数)', [['index'], ['...']]),
  fn('setmetatable', 'setmetatable(table,metatable)', 'メタテーブルを設定', [['table'], ['metatable']]),
  fn('tonumber', 'tonumber(e[,base])', '数値に変換', [['e'], ['base', '基数(2〜36)']]),
  fn('tostring', 'tostring(e)', '文字列に変換', [['e']]),
  fn('type', 'type(v)', '型名の文字列("nil" "number" "string" "boolean" "table" "function" "userdata")', [['v']]),
  fn('unpack', 'unpack(list[,i[,j]])', '配列要素を複数の値として返す', [['list'], ['i'], ['j']]),
  fn('xpcall', 'xpcall(f,err)', 'エラーハンドラ付きの保護モード呼び出し', [['f'], ['err']]),
];

module.exports = {
  libraries: { math: mathLib, string: stringLib, table: tableLib },
  mathConstants,
  basicLib,
};
