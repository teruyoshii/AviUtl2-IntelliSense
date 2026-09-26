// obj関数・グローバル関数の定義データ
// 出典: docs/lua.txt「関数」(2026/9/19版)
//
// 関数定義の形式
//   name      : 関数名('obj.load' / 'RGB' など)
//   summary   : 1行説明(補完一覧の右側に表示)
//   doc       : 詳細説明(Markdown)
//   overloads : 呼び出し形式の配列
//     label   : シグネチャ表示文字列
//     params  : [{ label, doc }]  label は label 文字列中に含まれる文字列であること
//     match   : 第1引数がこの文字列リテラルのときに限定して表示する(obj.load("movie",...) など)
//     values  : { 引数番号: 候補値配列 } この形式専用の入力候補
//     doc / returns : この形式の説明・戻り値
//   values    : { 引数番号: 候補値配列 } 全形式共通の入力候補
//   rest      : { from: 引数番号, values: 候補値配列 } 可変長引数の入力候補
//   aliases   : 'obj.' を省略して呼べる別名

// 候補値を作るヘルパ
const s = (value, detail, doc) => ({ label: `"${value}"`, detail, doc });
const v = (value, detail, doc) => ({ label: String(value), detail, doc });

// ------------------------------
// 共通で使う候補値
// ------------------------------
const SECTION_VALUES = [
  v(0, '開始点'),
  v(1, '最初の中間点'),
  v(2, '2個目の中間点'),
  v(-1, '終了点'),
];

const BOOL_VALUES = [v('true'), v('false')];

const BUF_OBJECT = s('object', 'オブジェクト');
const BUF_TEMP = s('tempbuffer', '仮想バッファ');
const BUF_FRAME = s('framebuffer', 'フレームバッファ');
const BUF_CACHE = s('cache:', 'キャッシュバッファ', '`"cache:xxxx"`(xxxxは任意の名前)\n\n名前は全オブジェクト共通で、1フレームの描画毎に破棄されます。');
const BUF_RANDOM = s('random', '乱数バッファ', '0.0〜1.0の乱数値の256x256の領域\n\n※DXGI_FORMAT_R32_FLOAT(r値のみ)');
const BUF_IMAGE = s('image:', '画像ファイル', '`"image:xxxx"`(xxxxはスクリプトフォルダからの相対パスの画像ファイル名)');

const PIXEL_FORMAT_VALUES = [s('rgba', 'RGBA32bit(デフォルト)'), s('bgra', 'BGRA32bit')];

const SAMPLER_VALUES = [
  s('clip', '領域外は透明色'),
  s('clamp', '領域外は境界(一番外側)の色'),
  s('loop', '領域外は領域をループ'),
  s('mirror', '領域外は領域を反転しながらループ'),
  s('dot', '拡大縮小補間をしない(領域外は透明色)'),
];

const BLEND_VALUES = [
  s('none', '通常'),
  s('add', '加算'),
  s('sub', '減算'),
  s('mul', '乗算'),
  s('screen', 'スクリーン'),
  s('overlay', 'オーバーレイ'),
  s('light', '比較(明)'),
  s('dark', '比較(暗)'),
  s('brightness', '輝度'),
  s('chroma', '色差'),
  s('shadow', '陰影'),
  s('light_dark', '明暗'),
  s('diff', '差分'),
  s('alpha_add', '色は加重平均・アルファ値は加算', '仮想バッファ専用'),
  s('alpha_max', '色は加重平均・アルファ値は大きい方', '仮想バッファ専用'),
  s('alpha_sub', '色はそのまま・アルファ値を減算', '仮想バッファ専用'),
  s('alpha_add2', '色は重ね合わせ・アルファ値は加算', '仮想バッファ専用'),
  s('rgba_add', 'RGBA値を単純に加算', '仮想バッファ専用\n\n※Direct3DのBlendStateのみの処理なので軽いです'),
];

const SHADER_BLEND_VALUES = [
  s('copy', '出力をそのままコピー(デフォルト)'),
  s('mask', 'α値のみを乗算(RGB値は利用しない)'),
  s('draw', '出力をアルファブレンド'),
  s('add', '出力を加算合成'),
];

const FIGURE_VALUES = ['円', '四角形', '三角形', '五角形', '六角形', '星形', '背景'].map(n => s(n, '図形'));

const TEXT_ALIGN_DOC = '文字揃え種別\n\n' +
  '横書: 0=左寄[上] / 1=中央[上] / 2=右寄[上] / 3=左寄[中] / 4=中央[中] / 5=右寄[中] / 6=左寄[下] / 7=中央[下] / 8=右寄[下]\n\n' +
  '縦書: 9=上段[右] / 10=中段[右] / 11=下段[右] / 12=上段[中] / 13=中段[中] / 14=下段[中] / 15=上段[左] / 16=中段[左] / 17=下段[左]\n\n' +
  '※指定すると中心座標が設定されます';
const TEXT_ALIGN_VALUES = [
  v(0, '横書 左寄[上]'), v(1, '横書 中央[上]'), v(2, '横書 右寄[上]'),
  v(3, '横書 左寄[中]'), v(4, '横書 中央[中]'), v(5, '横書 右寄[中]'),
  v(6, '横書 左寄[下]'), v(7, '横書 中央[下]'), v(8, '横書 右寄[下]'),
  v(9, '縦書 上段[右]'), v(10, '縦書 中段[右]'), v(11, '縦書 下段[右]'),
  v(12, '縦書 上段[中]'), v(13, '縦書 中段[中]'), v(14, '縦書 下段[中]'),
  v(15, '縦書 上段[左]'), v(16, '縦書 中段[左]'), v(17, '縦書 下段[左]'),
];

const SEED_DOC = '乱数の種(省略時はオブジェクト毎に異なる乱数)\n\nプラス値: 種が同じでもオブジェクト毎に異なる乱数\n\nマイナス値: 種が同じなら全オブジェクトで同じ乱数';
const FRAME_DOC = 'フレーム番号(省略時は現在のフレーム)';

// obj.setoption / obj.getoption の形式を作るヘルパ
// rest の label を '[xxx]' とすると省略可能引数として '[,xxx]' の形で表示する
const optionOverload = (func, name, rest, doc, extra = {}) => {
  const restText = rest.map(r => r.label.startsWith('[') ? `[,${r.label.slice(1)}` : `,${r.label}`).join('');
  return {
    label: `${func}("${name}"${restText})`,
    params: [{ label: `"${name}"`, doc: '' }, ...rest.map(r => ({ label: r.label.replace(/[[\]]/g, ''), doc: r.doc }))],
    match: [name],
    doc,
    ...extra,
  };
};

const functions = [
  // ------------------------------
  // obj関数
  // ------------------------------
  {
    name: 'obj.mes', aliases: ['mes'],
    summary: 'テキストオブジェクト内にテキストを追加',
    doc: 'テキストオブジェクトの中で指定のテキストを追加します。テキストオブジェクトのテキスト内のみ使用できます。\n\n※`obj.` を省略して `mes()` のみでも使用できます。',
    overloads: [{
      label: 'obj.mes(text)',
      params: [{ label: 'text', doc: '表示するテキスト' }],
    }],
  },
  {
    name: 'obj.effect',
    summary: 'フィルタ効果を実行',
    doc: '指定のフィルタ効果を実行します。メディアオブジェクトのみ使用できます。\n\n引数なしで呼ぶとスクリプト以降のフィルタ効果を実行します。\n\n' +
      '※トラックバー、チェックボックス以外の設定のparam,valueはエイリアスファイル等で出力された時の名前や値になります。\n\n例: `obj.effect("色調補正","明るさ",150,"色相",180)`',
    overloads: [{
      label: 'obj.effect([name,param1,value1,param2,value2,...])',
      params: [
        { label: 'name', doc: 'エフェクトの名前' },
        { label: 'param1', doc: 'エフェクトのパラメータの名前' },
        { label: 'value1', doc: 'エフェクトのパラメータの値' },
        { label: 'param2', doc: 'エフェクトのパラメータの名前' },
        { label: 'value2', doc: 'エフェクトのパラメータの値' },
        { label: '...', doc: 'param,value の組を必要な分だけ指定できます' },
      ],
    }],
  },
  {
    name: 'obj.draw',
    summary: '現在のオブジェクトを描画',
    doc: '現在のオブジェクトを描画します。obj.draw()を使うとオブジェクトを複数回描画できます。\n\n' +
      '※obj.draw()を使用した場合スクリプト以降のフィルタ効果は実行されません(引数なしのobj.effect()で事前に実行できます)。\n\n例: `obj.draw(2,10,0)`',
    overloads: [{
      label: 'obj.draw([ox,oy,oz,zoom,alpha,rx,ry,rz])',
      params: [
        { label: 'ox', doc: '相対座標X' },
        { label: 'oy', doc: '相対座標Y' },
        { label: 'oz', doc: '相対座標Z' },
        { label: 'zoom', doc: '拡大率(1.0=等倍)' },
        { label: 'alpha', doc: '不透明度(0.0=透明/1.0=不透明)' },
        { label: 'rx', doc: 'X軸回転角度(360.0で一回転)' },
        { label: 'ry', doc: 'Y軸回転角度(360.0で一回転)' },
        { label: 'rz', doc: 'Z軸回転角度(360.0で一回転)' },
      ],
    }],
  },
  {
    name: 'obj.drawpoly',
    summary: '任意の四角形・三角形で描画',
    doc: '現在のオブジェクトの任意部分を任意の四角形で描画します。\n\n' +
      '※内角が全て180度以下の平面以外は正しく描画されません。\n\n※頂点0から3が時計回りになる面が表面になります。\n\n' +
      '※obj.drawpoly()を使用した場合スクリプト以降のフィルタ効果は実行されません。',
    overloads: [
      {
        label: 'obj.drawpoly(x0,y0,z0,x1,y1,z1,x2,y2,z2,x3,y3,z3[,u0,v0,u1,v1,u2,v2,u3,v3,alpha])',
        params: [
          ...[0, 1, 2, 3].flatMap(i => ['x', 'y', 'z'].map(a => ({ label: `${a}${i}`, doc: `四角形の頂点${i}の座標${a.toUpperCase()}` }))),
          ...[0, 1, 2, 3].flatMap(i => ['u', 'v'].map(a => ({ label: `${a}${i}`, doc: `頂点${i}に対応するオブジェクトの画像の座標` }))),
          { label: 'alpha', doc: '不透明度(0.0=透明/1.0=不透明)' },
        ],
      },
      {
        label: 'obj.drawpoly({table}[,alpha])',
        doc: '複数分の四角形の引数をテーブルで指定します(複数回呼ぶより高速)。形式の混在は不可。\n\n' +
          '- `{x0,y0,z0,...,x3,y3,z3,u0,v0,...,u3,v3}`\n' +
          '- `{座標12個,uv8個,vx0,vy0,vz0,...,vx3,vy3,vz3}` (法線付き)\n' +
          '- `{座標12個,r0,g0,b0,a0,...,r3,g3,b3,a3}` (頂点色)\n' +
          '- `{座標12個,色16個,法線12個}`\n\n' +
          '※r,g,b,aは描画色(0.0〜1.0の乗算済みα)。色の指定時はオブジェクトの画像は利用されません',
        params: [
          { label: '{table}', doc: '四角形毎の引数テーブルの配列' },
          { label: 'alpha', doc: '不透明度(0.0=透明/1.0=不透明)' },
        ],
      },
      {
        label: 'obj.drawpoly({table}[,vertex_num,alpha])',
        doc: '頂点リストのテーブルで四角形、三角形を描画します。形式の混在は不可。\n\n' +
          '- `{x,y,z,u,v}` 頂点座標 + テクスチャ座標\n' +
          '- `{x,y,z,u,v,vx,vy,vz}` + 法線ベクトル\n' +
          '- `{x,y,z,r,g,b,a}` 頂点座標 + 頂点の色\n' +
          '- `{x,y,z,r,g,b,a,vx,vy,vz}` + 法線ベクトル\n\n' +
          '※u,vはオブジェクトの正規化座標(0.0〜1.0)\n\n※テーブルは面の頂点数で割り切れる数になります',
        params: [
          { label: '{table}', doc: '頂点テーブルの配列' },
          { label: 'vertex_num', doc: '面の頂点数(4<デフォルト>=四角形 / 3=三角形)' },
          { label: 'alpha', doc: '不透明度(0.0=透明/1.0=不透明)' },
        ],
        values: { 1: [v(4, '四角形(デフォルト)'), v(3, '三角形')] },
      },
    ],
  },
  {
    name: 'obj.load',
    summary: '画像・テキスト・図形などを読み込み',
    doc: '現在のオブジェクトの画像を読み込みます。typeを省略した場合は自動的に判別します。\n\n※読み込まれていた画像は破棄されます。',
    values: {
      0: [
        s('movie', '動画ファイル(時間指定)'),
        s('movie.frame', '動画ファイル(フレーム番号指定)'),
        s('movie.info', '動画ファイルの情報のみ取得'),
        s('image', '画像ファイル'),
        s('text', 'テキスト', '※テキストオブジェクトには使用できません'),
        s('text.layout', 'テキストの画像サイズのみ取得', '`"textlayout"` も利用できます'),
        s('figure', '図形・SVGファイル'),
        s('framebuffer', 'フレームバッファ'),
        s('tempbuffer', '仮想バッファ'),
        s('layer', '指定レイヤー上のオブジェクト'),
        s('before', '直前オブジェクト', 'カスタムオブジェクトで他のオブジェクトを読み込む前の時のみ使えます'),
      ],
    },
    overloads: [
      {
        label: 'obj.load("movie",file[,time])', match: ['movie'],
        doc: '動画ファイルから指定時間の画像を読み込みます。', returns: '動画の総時間(秒) ※読み込み失敗時は0',
        params: [{ label: '"movie"', doc: '' }, { label: 'file', doc: '動画ファイル名' }, { label: 'time', doc: '取得する時間(秒)(省略時はオブジェクトの現時間)' }],
      },
      {
        label: 'obj.load("movie.frame",file[,frame])', match: ['movie.frame'],
        doc: '動画ファイルからフレーム番号を指定して画像を読み込みます。', returns: '動画の総フレーム数',
        params: [{ label: '"movie.frame"', doc: '' }, { label: 'file', doc: '動画ファイル名' }, { label: 'frame', doc: '取得するフレーム番号' }],
      },
      {
        label: 'obj.load("movie.info",file)', match: ['movie.info'],
        doc: '動画ファイルの情報を取得します(現在のオブジェクト情報は更新しません)。', returns: 'フレーム数,フレームレート(rate),フレームレート(scale) ※失敗時は全て0',
        params: [{ label: '"movie.info"', doc: '' }, { label: 'file', doc: '動画ファイル名' }],
      },
      {
        label: 'obj.load("image",file)', match: ['image'],
        doc: '画像ファイルを読み込みます。', returns: 'true=成功 / false=読み込み失敗',
        params: [{ label: '"image"', doc: '' }, { label: 'file', doc: '画像ファイル名' }],
      },
      {
        label: 'obj.load("text",text[,speed,time,align])', match: ['text'],
        doc: 'テキストを読み込みます。色とサイズ、フォントの制御文字が使用できます。\n\n※テキストオブジェクトには使用できません。', returns: 'true=成功 / false=読み込み失敗',
        params: [
          { label: '"text"', doc: '' },
          { label: 'text', doc: '読み込むテキスト' },
          { label: 'speed', doc: 'timeパラメータの1秒間で表示する文字数' },
          { label: 'time', doc: 'speedパラメータに対する経過時間' },
          { label: 'align', doc: TEXT_ALIGN_DOC },
        ],
        values: { 4: TEXT_ALIGN_VALUES },
      },
      {
        label: 'obj.load("text.layout",text[,speed,time,align])', match: ['text.layout', 'textlayout'],
        doc: 'obj.load("text")で読み込むテキストの画像サイズを取得します(オブジェクト情報は更新しません)。', returns: '横,縦のピクセル数(文字揃え種別指定時は中心座標も返却)',
        params: [
          { label: '"text.layout"', doc: '`"textlayout"` も可' },
          { label: 'text', doc: '読み込むテキスト' },
          { label: 'speed', doc: 'timeパラメータの1秒間で表示する文字数' },
          { label: 'time', doc: 'speedパラメータに対する経過時間' },
          { label: 'align', doc: TEXT_ALIGN_DOC },
        ],
        values: { 4: TEXT_ALIGN_VALUES },
      },
      {
        label: 'obj.load("figure",name[,color,size,line,round,aspect])', match: ['figure'],
        doc: '図形を読み込みます。', returns: 'true=成功 / false=読み込み失敗',
        params: [
          { label: '"figure"', doc: '' },
          { label: 'name', doc: '図形名、SVGファイル名' },
          { label: 'color', doc: '色(0x000000〜0xffffff)' },
          { label: 'size', doc: '図形のサイズ' },
          { label: 'line', doc: '図形のライン幅' },
          { label: 'round', doc: '角を丸くするか(true=する / false<デフォルト>=しない)' },
          { label: 'aspect', doc: 'アスペクト比(-1.0〜1.0/プラス=横縮小/マイナス=縦縮小)' },
        ],
        values: { 1: FIGURE_VALUES, 5: BOOL_VALUES },
      },
      {
        label: 'obj.load("framebuffer"[,x,y,w,h][,alpha])', match: ['framebuffer'],
        doc: 'フレームバッファから読み込みます。', returns: 'true=成功 / false=読み込み失敗',
        params: [
          { label: '"framebuffer"', doc: '' },
          { label: 'x', doc: '取得する範囲(省略時は全体)' },
          { label: 'y', doc: '取得する範囲(省略時は全体)' },
          { label: 'w', doc: '取得する範囲(省略時は全体)' },
          { label: 'h', doc: '取得する範囲(省略時は全体)' },
          { label: 'alpha', doc: 'アルファチャンネルを維持(true=する / false<デフォルト>=しない)' },
        ],
      },
      {
        label: 'obj.load("tempbuffer"[,x,y,w,h])', match: ['tempbuffer'],
        doc: '仮想バッファから読み込みます。\n\n※仮想バッファはobj.copybuffer(),obj.setoption()で作成できます。', returns: 'true=成功 / false=読み込み失敗',
        params: [
          { label: '"tempbuffer"', doc: '' },
          { label: 'x', doc: '取得する範囲(省略時は全体)' },
          { label: 'y', doc: '取得する範囲(省略時は全体)' },
          { label: 'w', doc: '取得する範囲(省略時は全体)' },
          { label: 'h', doc: '取得する範囲(省略時は全体)' },
        ],
      },
      {
        label: 'obj.load("layer",no[,effect])', match: ['layer'],
        doc: '指定のレイヤー上のオブジェクトを読み込みます。\n\n※個別オブジェクト等のエフェクト側で描画処理が入る場合は上手く動作しません。', returns: 'true=成功 / false=読み込み失敗',
        params: [
          { label: '"layer"', doc: '' },
          { label: 'no', doc: 'レイヤー番号(1〜)' },
          { label: 'effect', doc: '追加エフェクトの実行(true=する / false<デフォルト>=しない)' },
        ],
        values: { 2: BOOL_VALUES },
      },
      {
        label: 'obj.load("before")', match: ['before'],
        doc: '直前オブジェクトを読み込みます。カスタムオブジェクトで他のオブジェクトを読み込む前の時のみ使えます。', returns: 'true=成功 / false=読み込み失敗',
        params: [{ label: '"before"', doc: '' }],
      },
      {
        label: 'obj.load(...)',
        doc: '種別を省略した場合は自動的に判別します。',
        params: [{ label: '...', doc: 'ファイル名など' }],
      },
    ],
  },
  {
    name: 'obj.setfont',
    summary: 'obj.load("text")で使うフォントを指定',
    doc: 'obj.load()のテキストで使うフォントを指定します。\n\n※スクリプトの呼び出し毎に指定する必要があります。',
    overloads: [{
      label: 'obj.setfont(name,size[,type,col1,col2,bold,italic,charspacing,linespacing])',
      params: [
        { label: 'name', doc: 'フォント名' },
        { label: 'size', doc: 'フォントサイズ' },
        { label: 'type', doc: '文字の装飾(0〜6)\n\n0=標準文字 / 1=影付き文字 / 2=影付き文字(薄) / 3=縁取り文字 / 4=縁取り文字(細) / 5=縁取り文字(太) / 6=縁取り文字(角)' },
        { label: 'col1', doc: '文字の色(0x000000〜0xffffff)' },
        { label: 'col2', doc: '影・縁の色(0x000000〜0xffffff)' },
        { label: 'bold', doc: '太文字か(true / false<デフォルト>)' },
        { label: 'italic', doc: '斜体か(true / false<デフォルト>)' },
        { label: 'charspacing', doc: '文字間隔' },
        { label: 'linespacing', doc: '行間隔' },
      ],
    }],
    values: {
      2: [v(0, '標準文字'), v(1, '影付き文字'), v(2, '影付き文字(薄)'), v(3, '縁取り文字'), v(4, '縁取り文字(細)'), v(5, '縁取り文字(太)'), v(6, '縁取り文字(角)')],
      5: BOOL_VALUES,
      6: BOOL_VALUES,
    },
  },
  {
    name: 'obj.getfont',
    summary: '現在のフォント設定を取得',
    doc: 'obj.load()のテキストで使うフォント設定を取得します。\n\n※フォント名の初期値は空(デフォルト指定)になります\n\n例: `name,size,type = obj.getfont()`',
    overloads: [{
      label: 'obj.getfont()', params: [],
      returns: '各種フォント設定(obj.setfont()の引数と同じ並び)',
    }],
  },
  {
    name: 'obj.rand', aliases: ['rand'],
    summary: 'フレーム固定の乱数(整数範囲)',
    doc: '乱数を発生させます。通常の乱数と異なり同一時間のフレームで常に同じ値が出ます。\n\n※`obj.` を省略して `rand()` のみでも使用できます。\n\n例: `obj.rand(10,20)`',
    overloads: [{
      label: 'obj.rand(st_num,ed_num[,seed,frame])',
      params: [
        { label: 'st_num', doc: '乱数の最小値' },
        { label: 'ed_num', doc: '乱数の最大値' },
        { label: 'seed', doc: SEED_DOC },
        { label: 'frame', doc: FRAME_DOC },
      ],
    }],
  },
  {
    name: 'obj.rand1', aliases: ['rand1'],
    summary: 'フレーム固定の乱数(0.0以上1.0未満)',
    doc: '0.0以上1.0未満の乱数を発生させます。同一時間のフレームで常に同じ値が出ます。\n\n※`obj.` を省略して `rand1()` のみでも使用できます。',
    overloads: [{
      label: 'obj.rand1([seed,frame])',
      params: [
        { label: 'seed', doc: SEED_DOC },
        { label: 'frame', doc: FRAME_DOC },
      ],
    }],
  },
  {
    name: 'obj.setoption',
    summary: 'オブジェクトの各種オプションを設定',
    doc: '現在のオブジェクトの各種オプションを設定します。\n\n※スクリプトの呼び出し毎に指定する必要があります。',
    values: {
      0: [
        s('culling', '裏面を表示しない'),
        s('billboard', 'カメラの方向を向く'),
        s('blend', '合成モード'),
        s('drawtarget', '描画先の変更'),
        s('draw_state', 'フレームバッファへの描画済みステータス'),
        s('focus_mode', 'フォーカス枠モード'),
        s('camera_param', 'カメラのパラメータ', '※カメラ効果のみ使用可\n\n※カメラがエディットモードの時は反映されません'),
        s('camera_focus', 'カメラの焦点のパラメータ', '※カメラ効果のみ使用可'),
        s('sampler', 'draw/drawpolyのサンプラー'),
      ],
    },
    overloads: [
      optionOverload('obj.setoption', 'culling', [{ label: 'value', doc: '0=表示 / 1=非表示' }], '裏面を表示しないかを設定します。',
        { values: { 1: [v(0, '表示'), v(1, '非表示')] } }),
      optionOverload('obj.setoption', 'billboard', [{ label: 'value', doc: '0=向かない / 1=横方向のみ / 2=縦横方向のみ / 3=向く' }], 'カメラの方向を向くかを設定します。',
        { values: { 1: [v(0, '向かない'), v(1, '横方向のみ'), v(2, '縦横方向のみ'), v(3, '向く')] } }),
      optionOverload('obj.setoption', 'blend', [
        { label: 'value', doc: '合成モード名(旧スクリプトファイル形式の数値指定も可)\n\n※合成モードを利用すると描画処理が重くなります' },
        { label: '[option]', doc: '`"force"`=強制指定モード\n\n※フレームバッファへの描画の合成モードは元々の合成モードが通常の場合のみ反映されます。元々が通常以外の場合で反映させるには"force"を指定します。' },
      ], '合成モードを設定します。', { values: { 1: BLEND_VALUES, 2: [s('force', '強制指定モード')] } }),
      {
        label: 'obj.setoption("drawtarget","tempbuffer"[,w,h])', match: ['drawtarget'],
        doc: '描画先を仮想バッファに変更します。obj.draw(),obj.drawpoly()の描画が仮想バッファに対して行われ、座標等の設定は反映せず引数の座標そのままで描画されます。\n\nサイズを指定すると仮想バッファを透明色で初期化します。仮想バッファは全てのオブジェクトで共用です。',
        params: [{ label: '"drawtarget"', doc: '' }, { label: '"tempbuffer"', doc: '' }, { label: 'w', doc: '仮想バッファのサイズ(省略時は初期化しません)' }, { label: 'h', doc: '仮想バッファのサイズ(省略時は初期化しません)' }],
        values: { 1: [BUF_TEMP, BUF_FRAME] },
      },
      {
        label: 'obj.setoption("drawtarget","framebuffer")', match: ['drawtarget'],
        doc: 'obj.draw(),obj.drawpoly()の描画先をフレームバッファにします。',
        params: [{ label: '"drawtarget"', doc: '' }, { label: '"framebuffer"', doc: '' }],
        values: { 1: [BUF_TEMP, BUF_FRAME] },
      },
      optionOverload('obj.setoption', 'draw_state', [{ label: 'flag', doc: 'true=描画済み / false=未描画' }], 'スクリプト内でフレームバッファに描画されたかのステータスを変更します。',
        { values: { 1: [v('true', '描画済み'), v('false', '未描画')] } }),
      optionOverload('obj.setoption', 'focus_mode', [{ label: 'value', doc: '"fixed_size"=大きさ固定の枠 / "no_resize"=リサイズ無しの枠' }], 'オブジェクトのフォーカス枠モードを設定します。',
        { values: { 1: [s('fixed_size', '大きさ固定の枠にする'), s('no_resize', 'リサイズ無しの枠にする')] } }),
      optionOverload('obj.setoption', 'camera_param', [{ label: 'cam', doc: 'カメラのパラメータ(テーブル)\n\ncam.x/y/z: カメラの座標\n\ncam.tx/ty/tz: 目標座標\n\ncam.rz: 傾き\n\ncam.ux/uy/uz: 上方向単位ベクトル\n\ncam.d: スクリーンまでの距離' }],
        'カメラの各種パラメータを設定します。\n\n※カメラ効果のみ使用可。カメラがエディットモードの時は反映されません。\n\n例: `cam = obj.getoption("camera_param")`'),
      optionOverload('obj.setoption', 'camera_focus', [{ label: 'focus', doc: 'カメラの焦点パラメータ(テーブル)\n\nfocus.x/y/z: 焦点座標\n\nfocus.bokeh: 深度ぼけの強さ' }],
        'カメラの焦点の各種パラメータを設定します。\n\n※カメラ効果のみ使用可\n\n例: `focus = obj.getoption("camera_focus")`'),
      optionOverload('obj.setoption', 'sampler', [{ label: '[value]', doc: '省略時はデフォルト設定(draw=clip / drawpoly=clamp)' }],
        'obj.draw(),obj.drawpoly()描画時のサンプラーを変更します。\n\n※obj.drawpoly()でuv座標を引数で指定した場合はuv座標が領域範囲でクリップされます(互換対応)',
        { values: { 1: SAMPLER_VALUES } }),
    ],
  },
  {
    name: 'obj.getoption',
    summary: 'オブジェクトの各種オプションを取得',
    doc: '現在のオブジェクトの各種オプションを取得します。',
    values: {
      0: [
        s('track_mode', 'トラックバーの移動モード'),
        s('section_num', '区間の数(中間点の数+1)'),
        s('script_name', 'スクリプト名'),
        s('gui', 'GUIの表示状態'),
        s('group_info', 'グループ制御のレイヤー番号'),
        s('camera_mode', 'カメラ制御状態'),
        s('camera_param', 'カメラのパラメータ'),
        s('camera_focus', 'カメラの焦点のパラメータ'),
        s('multi_object', '個別オブジェクトが有効か'),
        s('blend', '合成モード'),
        s('culling', '裏面を表示しないか'),
        s('billboard', 'カメラの方向を向くか'),
        s('drawtarget', '描画先'),
        s('draw_state', '描画済みステータス'),
        s('enable_group', 'グループ制御対象が有効か'),
        s('enable_camera', 'カメラ制御対象が有効か'),
        s('clipping_object', 'クリッピングオブジェクトが有効か'),
        s('clipping_upper_object', '上のオブジェクトでクリッピングが有効か'),
      ],
    },
    overloads: [
      optionOverload('obj.getoption', 'track_mode', [{ label: 'value', doc: 'トラックバーの変数名(`--track@変数名:`)または番号(`--track0:`)' }],
        'トラックバーの移動モードを取得します。\n\n例: `obj.getoption("track_mode","vx")`', { returns: '移動無し=0 / それ以外は移動モードの名称' }),
      optionOverload('obj.getoption', 'section_num', [], 'オブジェクトの区間の数を取得します。', { returns: '区間の数(中間点の数+1)' }),
      optionOverload('obj.getoption', 'script_name', [
        { label: '[value]', doc: 'フィルタ効果の上下の相対位置(0は自分/マイナスは上/プラスは下)' },
        { label: '[skip]', doc: '無効になっているフィルタ効果をスキップするか(true=する / false<デフォルト>=しない)' },
      ], 'スクリプト名を取得します。\n\n例: `if obj.getoption("script_name") == obj.getoption("script_name",-1) then`', { returns: 'スクリプト名(対象がスクリプト以外なら空のテキスト)', values: { 2: BOOL_VALUES } }),
      optionOverload('obj.getoption', 'gui', [], 'GUIの表示状態を調べます。※動画の出力中は非表示状態になります。', { returns: 'true=表示 / false=非表示' }),
      optionOverload('obj.getoption', 'group_info', [{ label: '[index]', doc: '上位の影響しているグループ制御のインデックス(0は直前のグループ制御)' }],
        'グループ制御情報を取得します。', { returns: '0=グループ制御対象外 / 1以上=グループ制御のレイヤー番号' }),
      optionOverload('obj.getoption', 'camera_mode', [], 'カメラ制御状態を取得します。', { returns: '0=カメラ制御対象外 / 1=カメラ制御対象 / 2=カメラ制御対象(編集用視点)' }),
      optionOverload('obj.getoption', 'camera_param', [], 'カメラのパラメータを取得します(内容はobj.setoption("camera_param")と同じ)。', { returns: 'カメラのパラメータ(テーブル)' }),
      optionOverload('obj.getoption', 'camera_focus', [], 'カメラの焦点のパラメータを取得します(内容はobj.setoption("camera_focus")と同じ)。', { returns: 'カメラの焦点パラメータ(テーブル)' }),
      optionOverload('obj.getoption', 'multi_object', [], '個別オブジェクトが有効かを調べます。', { returns: 'true=有効 / false=無効' }),
      optionOverload('obj.getoption', 'blend', [], '合成モードを取得します(obj.setoption("blend")のvalueと同じ)。\n\n※出力項目(標準描画等)の合成モードは最後に反映されます。', { returns: '合成モード' }),
      optionOverload('obj.getoption', 'culling', [], '裏面を表示しないかを取得します。', { returns: '0=表示 / 1=非表示' }),
      optionOverload('obj.getoption', 'billboard', [], 'カメラの方向を向くかを取得します。', { returns: '0=向かない / 1=横方向のみ / 2=縦横方向のみ / 3=向く' }),
      optionOverload('obj.getoption', 'drawtarget', [], '描画先の情報を取得します。', { returns: '"tempbuffer"=仮想バッファ / "framebuffer"=フレームバッファ' }),
      optionOverload('obj.getoption', 'draw_state', [], 'スクリプト内でフレームバッファに描画されたかのステータスを取得します。', { returns: 'true=描画済み / false=未描画' }),
      optionOverload('obj.getoption', 'enable_group', [], 'グループ制御対象を有効にしているかを取得します。', { returns: 'true=有効 / false=無効' }),
      optionOverload('obj.getoption', 'enable_camera', [], 'カメラ制御対象を有効にしているかを取得します。', { returns: 'true=有効 / false=無効' }),
      optionOverload('obj.getoption', 'clipping_object', [], 'クリッピングオブジェクトを有効にしているかを取得します。', { returns: 'true=有効 / false=無効' }),
      optionOverload('obj.getoption', 'clipping_upper_object', [], '上のオブジェクトでクリッピングを有効にしているかを取得します。', { returns: 'true=有効 / false=無効' }),
    ],
  },
  {
    name: 'obj.getvalue',
    summary: '設定値(座標・エフェクト項目など)を取得',
    doc: '現在のオブジェクト(または指定レイヤーのオブジェクト)の設定値を取得します。',
    overloads: [
      {
        label: 'obj.getvalue(target[,time,section])',
        doc: '現在のオブジェクトの設定値を取得します。\n\n※基準xxxxはオブジェクトの出力項目(標準描画等)の設定値になります',
        params: [
          { label: 'target', doc: '設定種別\n\n0〜3=トラックバー0〜3 / "track.xxx"=変数名xxxのトラックバー / "x" "y" "z" "pos" / "rx" "ry" "rz" "angle" / "cx" "cy" "cz" "center" / "sx" "sy" "sz" "scale" / "zoom" "aspect" "alpha" / "time" / "frame_s" "frame_e" / "layer7.x"(別レイヤー) / "scenechange"' },
          { label: 'time', doc: 'どの時点の値を取得するかの時間(秒)(省略時は現時間)' },
          { label: 'section', doc: '時間の基準となる区間の番号(省略時は開始点)\n\n0=開始点 / 1=最初の中間点 / 2=2個目の中間点 / -1=終了点' },
        ],
        values: {
          0: [
            v(0, 'トラックバー0の値'), v(1, 'トラックバー1の値'), v(2, 'トラックバー2の値'), v(3, 'トラックバー3の値'),
            s('track.', '変数名付きトラックバーの値', '`"track.xxx"` で `--track@xxx` の値を取得'),
            s('x', '基準座標X'), s('y', '基準座標Y'), s('z', '基準座標Z'), s('pos', '基準座標の3値'),
            s('rx', '基準X軸回転角度'), s('ry', '基準Y軸回転角度'), s('rz', '基準Z軸回転角度'), s('angle', '基準回転角度の3値'),
            s('cx', '基準中心座標X'), s('cy', '基準中心座標Y'), s('cz', '基準中心座標Z'), s('center', '基準中心座標の3値'),
            s('sx', '基準拡大率X(1.0=等倍)'), s('sy', '基準拡大率Y(1.0=等倍)'), s('sz', '基準拡大率Z(1.0=等倍)'), s('scale', '基準拡大率の3値'),
            s('zoom', '基準拡大率(100=等倍)', '※obj.zoom(1.0=等倍)と異なるので注意 ※互換対応'),
            s('aspect', '基準アスペクト比(-1.0〜1.0)', '※互換対応'),
            s('alpha', '基準不透明度(0.0〜1.0)'),
            s('time', 'オブジェクト基準の時間'),
            s('frame_s', 'シーン基準の開始フレーム'),
            s('frame_e', 'シーン基準の終了フレーム'),
            s('layer1.x', '別レイヤーのオブジェクトの値', '`"layer[番号].[設定種別]"` で別レイヤーの値、`"layer[番号]"` でオブジェクトの有無(true/false)'),
            s('scenechange', 'シーンチェンジでの表示割合(0.0〜1.0)', 'シーンチェンジのみ使用可'),
          ],
          2: SECTION_VALUES,
        },
      },
      {
        label: 'obj.getvalue(effect,item[,time,section])',
        doc: '現在のオブジェクトのエフェクトの設定値を取得します。\n\n例: `font = obj.getvalue("テキスト","フォント")` / `range = obj.getvalue("ぼかし:1","範囲")`',
        returns: 'トラックバーは指定時間の値 / セクション毎チェックボックスは指定時間のセクションの値 / それ以外はエイリアスファイルと同じフォーマットの値\n\n取得対象が存在しない場合は返却無し(nilで判定可)',
        params: [
          { label: 'effect', doc: '対象のエフェクト名(エイリアスファイルのeffect.nameの値)\n\n同じエフェクトが複数ある場合は `":n"` で指定(nは0からの番号)。無効状態のエフェクトは対象外' },
          { label: 'item', doc: '対象の設定項目の名称(エイリアスファイルのキーの名称) ※名称が数値の場合は利用不可' },
          { label: 'time', doc: 'どの時点の値を取得するかの時間(秒)(省略時は現時間)' },
          { label: 'section', doc: '時間の基準となる区間の番号(省略時は開始点)' },
        ],
        values: { 3: SECTION_VALUES },
      },
      {
        label: 'obj.getvalue(layer,effect,item[,time,section])',
        doc: '指定レイヤーのオブジェクト(現時間のオブジェクト)の設定値を取得します。',
        params: [
          { label: 'layer', doc: '対象レイヤー番号(1〜)' },
          { label: 'effect', doc: '対象のエフェクト名' },
          { label: 'item', doc: '対象の設定項目の名称' },
          { label: 'time', doc: 'どの時点の値を取得するかの時間(秒)(省略時は現時間)' },
          { label: 'section', doc: '時間の基準となる区間の番号(省略時は開始点)' },
        ],
        values: { 4: SECTION_VALUES },
      },
    ],
  },
  {
    name: 'obj.setanchor',
    summary: 'アンカーポイントを表示・反映',
    doc: 'アンカーポイントを表示します。呼び出した時にアンカーポイントの表示設定と、アンカーが移動していた場合の変数への反映を行います。\n\n' +
      '呼び出し順序や回数を変更すると正しく反映されない場合があります。\n\n例: `obj.setanchor("pos",3)` / `n = obj.setanchor("track",0,"line")`',
    overloads: [{
      label: 'obj.setanchor(name,num[,option,...])',
      returns: '取得したアンカーポイントの数',
      params: [
        { label: 'name', doc: '--value,--dialogの配列で定義されている座標を格納する変数名(文字列)\n\n`"track"` で--track0からのトラックバーの始点終点中間点を参照\n\n`"x,y,z"` のように2〜3項目列挙すると--track@xxxの各トラックバーを参照\n\n※直接テーブル変数を指定するとアンカー表示や移動なしで線だけを表示' },
        { label: 'num', doc: 'アンカーポイントの数(name="track"の場合は0)' },
        { label: 'option', doc: '各種オプション("line" "loop" "star" "arm" "mesh" "color" "rgba" "inout" "xyz" "offset" "offset.xyz" "screen" "small" {座標テーブル})' },
        { label: '...', doc: 'オプションを続けて列挙できます' },
      ],
    }],
    values: { 0: [s('track', '--track0からのトラックバーを参照')] },
    rest: {
      from: 2,
      values: [
        s('line', 'アンカーポイントを線で結ぶ'),
        s('loop', '線で結び一周させる'),
        s('star', 'オブジェクトの中心とそれぞれ線で結ぶ'),
        s('arm', 'アンカーポイントとオブジェクトの中心を線で結ぶ'),
        s('mesh', '網目状に線で結ぶ', '後続の引数に横数,縦数(格子点数)を指定'),
        s('color', '線の色(RGB)を変更', '後続の引数に色(0x000000〜0xffffff)を指定'),
        s('rgba', '線の色(RGBA)を変更', '後続の引数にα値を含めた色(0x00000000〜0xffffffff)を指定'),
        s('inout', '線の表示をIN,OUT側の2個にする', 'アンカー数は半々になります'),
        s('xyz', '3D座標で制御', 'デフォルトは2D座標'),
        s('offset', '表示オフセット', '後続の引数にX,Yを指定'),
        s('offset.xyz', '表示オフセット(3D)', '後続の引数にX,Y,Zを指定'),
        s('screen', 'スクリーン座標で制御', 'デフォルトはオブジェクト座標'),
        s('small', '小さいアンカーポイントで表示'),
      ],
    },
  },
  {
    name: 'obj.getpixel',
    summary: 'ピクセルの色情報を取得',
    doc: '現在のオブジェクトのピクセル情報を取得します。引数なしで呼ぶとオブジェクトのピクセル数を取得できます。\n\n' +
      '※VRAMアクセスを低減する為にキャッシュしたものから値を返却します。`obj.pixeloption("get",xxx)` で能動的にキャッシュを破棄できます。',
    overloads: [
      {
        label: 'obj.getpixel(x,y[,type])',
        returns: '"col": 色情報(0x000000〜0xffffff),不透明度 / "rgb": r,g,b,a(各0〜255) / "yc": y,cb,cr,a(旧内部形式)',
        params: [
          { label: 'x', doc: '取得するピクセルの座標X' },
          { label: 'y', doc: '取得するピクセルの座標Y' },
          { label: 'type', doc: 'ピクセル情報のタイプ("col","rgb","yc")\n\n※省略時は obj.pixeloption("type") で指定したタイプ(通常は"col")' },
        ],
        values: { 2: [s('col', '色情報と不透明度'), s('rgb', 'RGBA各8bit'), s('yc', 'YCbCr旧内部形式')] },
      },
      { label: 'obj.getpixel()', params: [], returns: '横,縦のピクセル数' },
    ],
  },
  {
    name: 'obj.putpixel',
    summary: 'ピクセルの色情報を書き換え',
    doc: '現在のオブジェクトのピクセル情報を書き換えます。受け渡すピクセル情報のタイプは obj.pixeloption("type") で指定したタイプになります。\n\n' +
      '※ピクセル毎にコンピュートシェーダーで実行するので処理は速くないです。\n\n' +
      '"col": `obj.putpixel(0,0,col,a)` / "rgb": `obj.putpixel(0,0,r,g,b,a)` / "yc": `obj.putpixel(0,0,y,cb,cr,a)`',
    overloads: [{
      label: 'obj.putpixel(x,y,...)',
      params: [
        { label: 'x', doc: '書き換えるピクセルの座標X' },
        { label: 'y', doc: '書き換えるピクセルの座標Y' },
        { label: '...', doc: '色情報(タイプにより col,a / r,g,b,a / y,cb,cr,a)' },
      ],
    }],
  },
  {
    name: 'obj.copypixel',
    summary: 'ピクセル情報をコピー',
    doc: '現在のオブジェクトのピクセル情報をコピーします。\n\n※ピクセル毎にコンピュートシェーダーで実行するので処理は速くないです。',
    overloads: [{
      label: 'obj.copypixel(dst_x,dst_y,src_x,src_y)',
      params: [
        { label: 'dst_x', doc: 'コピー先の座標X' },
        { label: 'dst_y', doc: 'コピー先の座標Y' },
        { label: 'src_x', doc: 'コピー元の座標X' },
        { label: 'src_y', doc: 'コピー元の座標Y' },
      ],
    }],
  },
  {
    name: 'obj.pixeloption',
    summary: 'ピクセル系関数の処理オプションを設定',
    doc: 'obj.getpixel(),obj.putpixel(),obj.copypixel() の処理オプションを設定します。\n\n※スクリプトの呼び出し毎に指定する必要があります。',
    values: {
      0: [s('type', 'ピクセル情報タイプ'), s('get', 'ピクセル情報の読み出し先'), s('put', 'ピクセル情報の書き込み先'), s('blend', '書き込む時のブレンドタイプ')],
    },
    overloads: [
      optionOverload('obj.pixeloption', 'type', [{ label: 'value', doc: '"col" / "rgb" / "yc"' }], 'ピクセル情報タイプを指定します。',
        { values: { 1: [s('col', '色情報と不透明度'), s('rgb', 'RGBA各8bit'), s('yc', 'YCbCr')] } }),
      optionOverload('obj.pixeloption', 'get', [{ label: 'value', doc: '"object"=オブジェクト / "framebuffer"=フレームバッファ' }], 'ピクセル情報の読み出し先を指定します。',
        { values: { 1: [BUF_OBJECT, BUF_FRAME] } }),
      optionOverload('obj.pixeloption', 'put', [{ label: 'value', doc: '"object"=オブジェクト / "framebuffer"=フレームバッファ' }], 'ピクセル情報の書き込み先を指定します。',
        { values: { 1: [BUF_OBJECT, BUF_FRAME] } }),
      optionOverload('obj.pixeloption', 'blend', [{ label: '[value]', doc: '引数なし=置き換え / 0=通常 / 1=加算 / 2=減算 / 3=乗算' }], '書き込む時のブレンドタイプを指定します。',
        { values: { 1: [v(0, '通常'), v(1, '加算'), v(2, '減算'), v(3, '乗算')] } }),
    ],
  },
  {
    name: 'obj.getpixeldata',
    summary: '画像バッファからRGBAデータを取得',
    doc: '画像バッファからRGBA(32bit)形式でデータを読み出します。スクリプトモジュールやDLLで画像処理をする為のものです。\n\n※VRAMからデータを取得するので処理は速くないです。\n\n例: `data,w,h = obj.getpixeldata("object","rgba")`',
    overloads: [{
      label: 'obj.getpixeldata(target[,format])',
      returns: '画像データのポインタ(ユーザーデータ),横,縦のピクセル数',
      params: [
        { label: 'target', doc: '読み込む画像バッファ("object" / "tempbuffer" / "cache:xxxx" / "framebuffer")' },
        { label: 'format', doc: '画像データのフォーマット("rgba"<デフォルト> / "bgra")' },
      ],
    }],
    values: { 0: [BUF_OBJECT, BUF_TEMP, BUF_CACHE, BUF_FRAME], 1: PIXEL_FORMAT_VALUES },
  },
  {
    name: 'obj.putpixeldata',
    summary: 'RGBAデータを画像バッファへ書き込み',
    doc: 'RGBA(32bit)形式のデータを画像バッファへ書き込みます。スクリプトモジュールやDLLで画像処理をする為のものです。\n\n※VRAMへデータを書き込むので処理は速くないです。\n\n例: `obj.putpixeldata("object",data,w,h,"rgba")`',
    overloads: [{
      label: 'obj.putpixeldata(target,data,w,h[,format])',
      params: [
        { label: 'target', doc: '書き込む画像バッファ("object" / "tempbuffer" / "cache:xxxx" / "framebuffer"(同サイズのみ))' },
        { label: 'data', doc: '画像データのポインタ(ユーザーデータ)' },
        { label: 'w', doc: '横のピクセル数' },
        { label: 'h', doc: '縦のピクセル数' },
        { label: 'format', doc: '画像データのフォーマット("rgba"<デフォルト> / "bgra")' },
      ],
    }],
    values: { 0: [BUF_OBJECT, BUF_TEMP, BUF_CACHE, BUF_FRAME], 4: PIXEL_FORMAT_VALUES },
  },
  {
    name: 'obj.getaudio',
    summary: '音声データを取得',
    doc: '音声ファイルからオーディオデータを取得します。オブジェクトの時間を基準とした位置のデータを取得します。\n\n' +
      '例: `n = obj.getaudio(buf,"audiobuffer","spectrum",32)` / `n,rate,buf = obj.getaudio(nil,"c:\\\\test.wav","pcm.r",1000)`',
    overloads: [{
      label: 'obj.getaudio(buf,file,type,size)',
      returns: '取得したデータ数,サンプリングレート(bufにnilを指定した場合は第3戻り値でテーブル)',
      params: [
        { label: 'buf', doc: 'データを受け取るテーブル(nilを指定すると第3戻り値でテーブルを返却)' },
        { label: 'file', doc: '音声ファイル名("audiobuffer"で編集中の音声データ)' },
        { label: 'type', doc: '取得データの種類("pcm" / "spectrum" / "fourier" / "xxxx.l" / "xxxx.r")' },
        { label: 'size', doc: '取得するデータ数(指定した値より少ない場合があります)' },
      ],
    }],
    values: {
      1: [s('audiobuffer', '編集中の音声データ')],
      2: [
        s('pcm', 'PCMサンプリングデータ', '16bitモノラルのスケール基準'),
        s('spectrum', '周波数毎の音量データ'),
        s('fourier', '離散フーリエ変換したデータ', 'sizeの指定は不要。元周波数の1/2048〜1/2まで1/2048刻みの1024個のデータ'),
        s('pcm.l', 'PCM(左チャンネル)'), s('pcm.r', 'PCM(右チャンネル)'),
        s('spectrum.l', 'スペクトラム(左チャンネル)'), s('spectrum.r', 'スペクトラム(右チャンネル)'),
        s('fourier.l', 'フーリエ(左チャンネル)'), s('fourier.r', 'フーリエ(右チャンネル)'),
      ],
    },
  },
  {
    name: 'obj.copybuffer',
    summary: '画像バッファをコピー',
    doc: '画像バッファをコピーします。※コピー先の画像バッファのサイズはコピー元のサイズに変更されます。\n\nキャッシュバッファの名前は全てのオブジェクトで共通で、1フレームの描画毎に破棄されます。',
    overloads: [{
      label: 'obj.copybuffer(dst,src)',
      returns: 'true=成功 / false=失敗',
      params: [
        { label: 'dst', doc: 'コピー先のバッファ("tempbuffer" / "object" / "cache:xxxx" / "framebuffer"(コピー元が同サイズの場合のみ))' },
        { label: 'src', doc: 'コピー元のバッファ("framebuffer" / "object" / "tempbuffer" / "cache:xxxx" / "image:xxxx")' },
      ],
    }],
    values: { 0: [BUF_TEMP, BUF_OBJECT, BUF_CACHE, BUF_FRAME], 1: [BUF_FRAME, BUF_OBJECT, BUF_TEMP, BUF_CACHE, BUF_IMAGE] },
  },
  {
    name: 'obj.clearbuffer',
    summary: '画像バッファをクリア',
    doc: '画像バッファをクリアします。',
    overloads: [
      {
        label: 'obj.clearbuffer(target[,color])',
        params: [
          { label: 'target', doc: 'クリアするバッファ名("object" / "tempbuffer" / "framebuffer" / "cache:xxxx")' },
          { label: 'color', doc: '色(0x000000〜0xffffff) ※未指定の場合は透明色' },
        ],
      },
      {
        label: 'obj.clearbuffer(target,w,h[,color])',
        doc: '画像バッファのサイズを変更してクリアします(フレームバッファはサイズ変更不可)。',
        params: [
          { label: 'target', doc: 'クリアするバッファ名' },
          { label: 'w', doc: '横のピクセル数' },
          { label: 'h', doc: '縦のピクセル数' },
          { label: 'color', doc: '色(0x000000〜0xffffff) ※未指定の場合は透明色' },
        ],
      },
    ],
    values: { 0: [BUF_OBJECT, BUF_TEMP, BUF_FRAME, BUF_CACHE] },
  },
  {
    name: 'obj.pixelshader',
    summary: 'ピクセルシェーダーを実行',
    doc: 'ピクセルシェーダーを実行します。シェーダーは `--[[pixelshader@登録名: ... ]]` で定義します。\n\n例: `obj.pixelshader("psmain","object",nil,{bright/100},"add")`',
    overloads: [{
      label: 'obj.pixelshader(name,target,{resource,...}[,{constant,...},blend,sampler])',
      params: [
        { label: 'name', doc: 'シェーダーの登録名(文字列)\n\n`"登録名@スクリプト名"` で他のスクリプトのシェーダー定義を利用できます' },
        { label: 'target', doc: '出力先のバッファ名(Direct3Dのレンダーターゲット)\n\n"object" / "tempbuffer" / "framebuffer" / "cache:xxxx"' },
        { label: '{resource,...}', doc: '参照するバッファ名の配列(1つの場合は直接バッファ名で指定可)。t0〜に設定\n\n"object" / "tempbuffer" / "framebuffer" / "cache:xxxx" / "random"\n\n※レンダーターゲットと同一の場合は複製して設定されます' },
        { label: '{constant,...}', doc: '参照する定数の配列(定数バッファb0にfloatの配列として設定)' },
        { label: 'blend', doc: '出力先へのブレンド方法(デフォルトは"copy")\n\n"copy" / "mask" / "draw" / "add"' },
        { label: 'sampler', doc: 'サンプラーの種別(s0に設定、デフォルトは未設定)\n\n"clip" / "clamp" / "loop" / "mirror" / "dot"' },
      ],
    }],
    values: {
      1: [BUF_OBJECT, BUF_TEMP, BUF_FRAME, BUF_CACHE],
      2: [BUF_OBJECT, BUF_TEMP, BUF_FRAME, BUF_CACHE, BUF_RANDOM],
      4: SHADER_BLEND_VALUES,
      5: SAMPLER_VALUES,
    },
    shaderName: 'pixelshader',
  },
  {
    name: 'obj.computeshader',
    summary: 'コンピュートシェーダーを実行',
    doc: 'コンピュートシェーダーを実行します。シェーダーは `--[[computeshader@登録名: ... ]]` で定義します。',
    overloads: [{
      label: 'obj.computeshader(name,{target},{resource,...}[,{constant,...},countX,countY,countZ,sampler])',
      params: [
        { label: 'name', doc: 'シェーダーの登録名(文字列)\n\n`"登録名@スクリプト名"` で他のスクリプトのシェーダー定義を利用できます' },
        { label: '{target}', doc: '読み書き先のバッファ名の配列(1つの場合は直接指定可)。UnorderedAccess(u0〜)に設定\n\n"object" / "tempbuffer" / "framebuffer" / "cache:xxxx"' },
        { label: '{resource,...}', doc: '参照するバッファ名の配列(1つの場合は直接指定可)。t0〜に設定\n\n"object" / "tempbuffer" / "framebuffer" / "cache:xxxx" / "random"' },
        { label: '{constant,...}', doc: '参照する定数の配列(定数バッファb0にfloatの配列として設定)' },
        { label: 'countX', doc: 'X軸スレッドグループ数 ※未指定の場合は1' },
        { label: 'countY', doc: 'Y軸スレッドグループ数 ※未指定の場合は1' },
        { label: 'countZ', doc: 'Z軸スレッドグループ数 ※未指定の場合は1' },
        { label: 'sampler', doc: 'サンプラーの種別(s0に設定、デフォルトは未設定)' },
      ],
    }],
    values: {
      1: [BUF_OBJECT, BUF_TEMP, BUF_FRAME, BUF_CACHE],
      2: [BUF_OBJECT, BUF_TEMP, BUF_FRAME, BUF_CACHE, BUF_RANDOM],
      7: SAMPLER_VALUES,
    },
    shaderName: 'computeshader',
  },
  {
    name: 'obj.getpoint',
    summary: 'トラックバー移動用の値を取得(tra2専用)',
    doc: 'トラックバーの値を取得します。トラックバー移動スクリプトのみ使用できます。',
    values: {
      0: [
        v(0, '開始点のトラックバー値'),
        s('index', '現在の区間での位置', '開始点と最初の中間点の間の場合は0.5等の小数'),
        s('num', '開始終了中間点の総数'),
        s('time', '現在の時間', 'optionで時間を取得する区間を指定可'),
        s('accelerate', '加速度が設定されているか'),
        s('decelerate', '減速度が設定されているか'),
        s('param', 'トラックバーの設定値', '設定値が複数ある場合は戻り値が複数'),
        s('link', '関連トラックでのインデックスと総数', 'X座標: 0,3 / Y座標: 1,3 / Z座標: 2,3'),
        s('timecontrol', '時間制御を反映した現在の値'),
        s('frame_s', 'シーン基準の開始フレーム'),
        s('frame_e', 'シーン基準の終了フレーム'),
        s('framerate', 'フレームレート'),
        s('default', 'トラックバーの標準値', '※互換対応'),
      ],
    },
    overloads: [
      {
        label: 'obj.getpoint(target[,option])',
        doc: 'target=整数: 各区間でのトラックバー値(0=開始点 / 1=最初の中間点 / ...)。optionで関連トラックの相対位置を指定できます。',
        params: [{ label: 'target', doc: '区間番号または取得する値の種別' }, { label: 'option', doc: '関連トラックの相対位置など' }],
      },
      optionOverload('obj.getpoint', 'index', [], '現在の区間での位置を取得します。', { returns: '位置(開始点と最初の中間点の間なら0.5等)' }),
      optionOverload('obj.getpoint', 'num', [], '開始終了中間点の総数を取得します。'),
      optionOverload('obj.getpoint', 'time', [{ label: '[option]', doc: '時間を取得する区間' }], '現在の時間を取得します。'),
      optionOverload('obj.getpoint', 'accelerate', [], '加速度が設定されているかを取得します。', { returns: 'true=有効 / false=無効' }),
      optionOverload('obj.getpoint', 'decelerate', [], '減速度が設定されているかを取得します。', { returns: 'true=有効 / false=無効' }),
      optionOverload('obj.getpoint', 'param', [], 'トラックバーの設定値を取得します(--paramを複数指定した場合は戻り値が複数)。\n\n例: `param1,param2 = obj.getpoint("param")`'),
      optionOverload('obj.getpoint', 'link', [], '関連トラックでのインデックスと総数を取得します。\n\n例: `index,num = obj.getpoint("link")`', { returns: 'X座標: 0,3 / Y座標: 1,3 / Z座標: 2,3' }),
      optionOverload('obj.getpoint', 'timecontrol', [
        { label: 'option', doc: '"index"=時間制御を反映した区間での位置 / "time"=時間制御を反映した時間 / "value"=時間制御の時間位置(開始点=0.0/終了点=1.0)' },
        { label: '[option2]', doc: '取得する時間(未指定の場合は現在の時間)' },
      ], '時間制御を反映した現在の値を取得します(--timecontrol指定時)。',
        { values: { 1: [s('index', '時間制御を反映した区間での位置'), s('time', '時間制御を反映した時間'), s('value', '時間制御の時間位置(0.0〜1.0)')] } }),
      optionOverload('obj.getpoint', 'frame_s', [], '全体(シーン)基準の現在のオブジェクトの開始フレームを取得します(0からの整数)。'),
      optionOverload('obj.getpoint', 'frame_e', [], '全体(シーン)基準の現在のオブジェクトの終了フレームを取得します(0からの整数)。'),
      optionOverload('obj.getpoint', 'framerate', [], 'フレームレートを取得します。'),
      optionOverload('obj.getpoint', 'default', [{ label: '[option]', doc: '取得するトラックバーの値の移動モード(名称)' }],
        'トラックバーの標準値を取得します ※互換対応\n\n※時間制御や設定値の情報が不足している場合は利用できません(標準値が返却されます)。'),
    ],
  },
  {
    name: 'obj.getinfo',
    summary: '各種環境情報を取得',
    doc: '各種環境情報を取得します。',
    values: {
      0: [
        s('script_path', 'スクリプトフォルダのパス'),
        s('filter', 'フィルタオブジェクトの処理中か'),
        s('saving', '動画の出力中か'),
        s('image_max', '最大画像サイズ(横幅,高さ)'),
        s('frame_max', 'オブジェクトが存在する最大のフレーム番号'),
        s('layer_max', 'オブジェクトが存在する最大のレイヤー番号'),
        s('bpm', '先頭のグリッド(BPM)情報'),
        s('bpm_list', 'グリッド(BPM)の一覧情報'),
        s('clock', 'アプリ起動からの経過時間(秒)'),
        s('script_time', 'スクリプト実行開始からの経過時間(ミリ秒)'),
        s('version', '本体のバージョン番号'),
      ],
    },
    overloads: [
      optionOverload('obj.getinfo', 'script_path', [], 'スクリプトフォルダのパスを取得します。', { returns: 'スクリプトフォルダのパス' }),
      optionOverload('obj.getinfo', 'filter', [], 'フィルタオブジェクトの処理中かを調べます。', { returns: 'true=フィルタオブジェクトの処理中' }),
      optionOverload('obj.getinfo', 'saving', [], '動画の出力中かを調べます。', { returns: 'true=出力中 / false=非出力中' }),
      optionOverload('obj.getinfo', 'image_max', [], '最大画像サイズを取得します。\n\n例: `max_x,max_y = obj.getinfo("image_max")`', { returns: '最大画像サイズ(横幅,高さ)' }),
      optionOverload('obj.getinfo', 'frame_max', [], 'オブジェクトが存在する最大のフレーム番号を取得します。', { returns: '最大のフレーム番号(0からの整数)' }),
      optionOverload('obj.getinfo', 'layer_max', [], 'オブジェクトが存在する最大のレイヤー番号を取得します。', { returns: '最大のレイヤー番号(1からの整数)' }),
      optionOverload('obj.getinfo', 'bpm', [], 'グリッド(BPM)の情報を取得します(先頭のBPM情報)。\n\n例: `tempo,beat,offset = obj.getinfo("bpm")`', { returns: 'テンポ,拍子,拍子オフセット(秒)' }),
      optionOverload('obj.getinfo', 'bpm_list', [], 'グリッド(BPM)の一覧情報を取得します。\n\n`bpm[1].tempo` テンポ / `bpm[1].beat` 拍子 / `bpm[1].start` 開始位置(秒) / `bpm[1].offset` 拍子オフセット(秒)', { returns: 'BPM情報テーブルの配列' }),
      optionOverload('obj.getinfo', 'clock', [], 'アプリ起動からの経過時間を取得します(パフォーマンスカウンターで計測)。', { returns: '経過時間(秒)' }),
      optionOverload('obj.getinfo', 'script_time', [], 'スクリプトの処理時間を取得します(パフォーマンスカウンターで計測)。', { returns: 'スクリプト実行開始からの経過時間(ミリ秒)' }),
      optionOverload('obj.getinfo', 'version', [], '本体のバージョン番号を取得します。', { returns: '本体のバージョン番号' }),
    ],
  },
  {
    name: 'obj.data',
    summary: '汎用データ領域を取得',
    doc: '汎用データ領域(`--data@登録名:サイズ`)を取得します。スクリプトモジュールやDLL向けです。\n\n例: `local data,size = obj.data("pos")`',
    overloads: [{
      label: 'obj.data(name)',
      returns: '汎用データ領域のポインタ(ユーザーデータ),サイズ',
      params: [{ label: 'name', doc: '汎用データ領域の登録名' }],
    }],
    dataName: true,
  },
  {
    name: 'obj.multiobject',
    summary: '個別オブジェクトとして複数描画',
    doc: 'オブジェクトを個別オブジェクトとして複数描画します。コールバック内では obj.index,obj.num が個別オブジェクトの値になります。\n\n' +
      '```lua\nlocal text = {"あ","い","う"}\nobj.multiobject(#text,function()\n    obj.load("text",text[obj.index + 1])\nend)\n```',
    overloads: [{
      label: 'obj.multiobject(num,func)',
      params: [
        { label: 'num', doc: '描画する個別オブジェクトの数' },
        { label: 'func', doc: '描画処理のコールバック関数(描画する回数呼ばれます)\n\n返却値で個別オブジェクトの基準時間のオフセット(秒)を返せます' },
      ],
    }],
  },
  {
    name: 'obj.module',
    summary: 'スクリプトモジュール(.mod2)の関数を取得',
    doc: 'スクリプトモジュール(.mod2)の関数を取得します。\n\n例:\n```lua\nlocal func = obj.module("ScriptModule")\nlocal total = func.sum(1,2,3)\n```',
    overloads: [{
      label: 'obj.module(name)',
      returns: 'スクリプトモジュールの関数テーブル',
      params: [{ label: 'name', doc: 'モジュール名(スクリプトモジュールのファイル名本体)' }],
    }],
  },
  {
    name: 'obj.interpolation',
    summary: '4点から補間座標を計算',
    doc: '連続した点p0,p1,p2,p3から時間time(0〜1)に応じたp1,p2間の座標を計算します。※y,z座標は省略できます。\n\n' +
      '例: `x,y,z = obj.interpolation(time,x0,y0,z0,x1,y1,z1,x2,y2,z2,x3,y3,z3)` / `x,y = obj.interpolation(time,x0,y0,x1,y1,x2,y2,x3,y3)`',
    overloads: [
      {
        label: 'obj.interpolation(time,x0,y0,z0,x1,y1,z1,x2,y2,z2,x3,y3,z3)',
        params: [
          { label: 'time', doc: '時間(0〜1)' },
          ...[0, 1, 2, 3].flatMap(i => ['x', 'y', 'z'].map(a => ({ label: `${a}${i}`, doc: `点p${i}の座標${a.toUpperCase()}` }))),
        ],
      },
      {
        label: 'obj.interpolation(time,x0,y0,x1,y1,x2,y2,x3,y3)',
        params: [
          { label: 'time', doc: '時間(0〜1)' },
          ...[0, 1, 2, 3].flatMap(i => ['x', 'y'].map(a => ({ label: `${a}${i}`, doc: `点p${i}の座標${a.toUpperCase()}` }))),
        ],
      },
      {
        label: 'obj.interpolation(time,x0,x1,x2,x3)',
        params: [
          { label: 'time', doc: '時間(0〜1)' },
          ...[0, 1, 2, 3].map(i => ({ label: `x${i}`, doc: `点p${i}の値` })),
        ],
      },
    ],
  },

  // ------------------------------
  // グローバル関数
  // ------------------------------
  {
    name: 'RGB',
    summary: '色情報とRGB要素の相互変換',
    doc: '色情報(0x000000〜0xffffff)と赤(0〜255),緑(0〜255),青(0〜255)各要素の相互変換をします。\n\nr,g,bを2つ指定した場合はオブジェクトの時間経過に応じて色を変化させます。',
    overloads: [
      { label: 'RGB(r,g,b)', returns: '色情報', params: [{ label: 'r', doc: '赤(0〜255)' }, { label: 'g', doc: '緑(0〜255)' }, { label: 'b', doc: '青(0〜255)' }] },
      { label: 'RGB(col)', returns: 'r,g,b', params: [{ label: 'col', doc: '色情報(0x000000〜0xffffff)' }] },
      {
        label: 'RGB(r1,g1,b1,r2,g2,b2)', returns: '時間経過に応じた色情報',
        params: ['r1', 'g1', 'b1', 'r2', 'g2', 'b2'].map(p => ({ label: p, doc: (p[1] === '1' ? '開始' : '終了') + 'の' + { r: '赤', g: '緑', b: '青' }[p[0]] + '(0〜255)' })),
      },
    ],
  },
  {
    name: 'HSV',
    summary: '色情報とHSV要素の相互変換',
    doc: '色情報(0x000000〜0xffffff)と色相(0〜360),彩度(0〜100),明度(0〜100)各要素の相互変換をします。\n\nh,s,vを2つ指定した場合はオブジェクトの時間経過に応じて色を変化させます。',
    overloads: [
      { label: 'HSV(h,s,v)', returns: '色情報', params: [{ label: 'h', doc: '色相(0〜360)' }, { label: 's', doc: '彩度(0〜100)' }, { label: 'v', doc: '明度(0〜100)' }] },
      { label: 'HSV(col)', returns: 'h,s,v', params: [{ label: 'col', doc: '色情報(0x000000〜0xffffff)' }] },
      {
        label: 'HSV(h1,s1,v1,h2,s2,v2)', returns: '時間経過に応じた色情報',
        params: ['h1', 's1', 'v1', 'h2', 's2', 'v2'].map(p => ({ label: p, doc: (p[1] === '1' ? '開始' : '終了') + 'の' + { h: '色相(0〜360)', s: '彩度(0〜100)', v: '明度(0〜100)' }[p[0]] })),
      },
    ],
  },
  ...['OR', 'AND', 'XOR'].map(op => ({
    name: op,
    summary: `ビット演算${op}`,
    doc: `${op}のビット演算をします。\n\n例: \`c = ${op}(a,b)\``,
    overloads: [{ label: `${op}(a,b)`, params: [{ label: 'a', doc: '' }, { label: 'b', doc: '' }] }],
  })),
  {
    name: 'SHIFT',
    summary: '算術シフト',
    doc: '算術シフトをします。shiftが正の数だと左シフト、負の数だと右シフトになります。\n\n例: `b = SHIFT(a,1)`',
    overloads: [{ label: 'SHIFT(a,shift)', params: [{ label: 'a', doc: '' }, { label: 'shift', doc: '正の数=左シフト / 負の数=右シフト' }] }],
  },
  {
    name: 'rotation',
    summary: '原点中心に座標を拡大縮小回転',
    doc: '原点(0,0)を中心に指定の座標を拡大縮小回転します。\n\n例: `x0,y0,x1,y1,x2,y2,x3,y3 = rotation(x0,y0,x1,y1,x2,y2,x3,y3,zoom,r)`',
    overloads: [{
      label: 'rotation(x0,y0,x1,y1,x2,y2,x3,y3,zoom,r)',
      returns: 'x0,y0,x1,y1,x2,y2,x3,y3',
      params: [
        ...[0, 1, 2, 3].flatMap(i => ['x', 'y'].map(a => ({ label: `${a}${i}`, doc: `頂点${i}の座標${a.toUpperCase()}` }))),
        { label: 'zoom', doc: '拡大率(1.0=等倍)' },
        { label: 'r', doc: '回転角度(360.0で一回転)' },
      ],
    }],
  },
  {
    name: 'print',
    summary: 'ログに文字列を出力',
    doc: '指定の文字列をログに出力します。引数が複数の場合は連結して出力します。第1引数にログレベルを指定できます。\n\n' +
      '※引数が関数やユーザーデータの場合は空文字が出力されます。\n\n例: `print("ログ表示")` / `print("@error","エラー表示")`',
    overloads: [{
      label: 'print(text[,...])',
      params: [{ label: 'text', doc: 'ログ文字列、またはログレベル("@info" "@warn" "@error" "@verbose") ※第1引数の場合のみ' }, { label: '...', doc: '連結して出力する値' }],
    }],
    values: { 0: [s('@info', 'ログレベル: 情報'), s('@warn', 'ログレベル: 警告'), s('@error', 'ログレベル: エラー'), s('@verbose', 'ログレベル: 詳細')] },
  },
  {
    name: 'debug_print',
    summary: 'ログに文字列を出力(print()の互換)',
    doc: 'print()と同じ機能です ※互換対応',
    overloads: [{
      label: 'debug_print(text[,...])',
      params: [{ label: 'text', doc: 'ログ文字列、またはログレベル("@info" "@warn" "@error" "@verbose") ※第1引数の場合のみ' }, { label: '...', doc: '連結して出力する値' }],
    }],
    values: { 0: [s('@info', 'ログレベル: 情報'), s('@warn', 'ログレベル: 警告'), s('@error', 'ログレベル: エラー'), s('@verbose', 'ログレベル: 詳細')] },
  },
  {
    name: 'require',
    summary: 'モジュールを読み込み(UTF-8対応)',
    doc: 'Lua標準のrequire()の引数をUTF-8文字列で利用できるようにフックしています。\n\n※Lua内部はSJIS扱いなのでpackage.xxx関係のパスはSJISで格納されます。',
    overloads: [{ label: 'require(modname)', params: [{ label: 'modname', doc: 'モジュール名' }] }],
  },
];

module.exports = { functions };
