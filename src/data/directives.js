// スクリプトヘッダ指示子(設定項目など)の定義データ
// 出典: docs/lua.txt「設定項目」「トラックバー移動スクリプトの例」(2026/9/19版)
//
// form   : 'at'    = --name@変数名:... の形式
//          'colon' = --name:... の形式
//          'flag'  = --name のみ(引数無し)
// params : シグネチャヘルプ用の引数リスト。'at'形式では先頭 varCount 個が '@' と ':' の間の引数
// varCount : 'at'形式で ':' より前に並ぶ引数の数(省略時1)
// defines  : trueならLua側に同名の変数が作られる(アウトライン・定義ジャンプ・ホバーの対象)
// only     : 利用できるスクリプト種別(拡張子)。省略時は全種別
// legacy   : 旧スクリプト形式との互換用
// snippet  : '--' の後ろに挿入するスニペット

const directives = [
  // ------------------------------
  // 設定項目
  // ------------------------------
  {
    name: 'track', form: 'at', defines: true, kind: 'トラックバー',
    syntax: '--track@変数名:項目名,最小値,最大値,デフォルト値[,移動単位,ゼロ値名称,操作倍率]',
    doc: 'トラックバー項目を定義します。移動単位,ゼロ値名称,操作倍率は省略できます。',
    params: [
      { label: '変数名', doc: 'スクリプト内で値を受け取る変数名' },
      { label: '項目名', doc: '設定画面に表示する名前。`yyy::xxx` とすると最後の `::` 以降のみ表示されます。' },
      { label: '最小値', doc: '' },
      { label: '最大値', doc: '' },
      { label: 'デフォルト値', doc: '' },
      { label: '移動単位', doc: '設定値の最小単位 `1` / `0.1` / `0.01` / `0.001`\n\n※0.000000001まで指定可(範囲に応じて調整、内部は32bit整数)' },
      { label: 'ゼロ値名称', doc: '設定値が0の時にトラックバーに表示する文字列' },
      { label: '操作倍率', doc: '設定値の範囲に対するトラックバー操作範囲の倍率(1.0以下)' },
    ],
    snippet: 'track@${1:name}:${2:項目名},${3:0},${4:100},${5:0},${6:1}',
  },
  {
    name: 'trackgroup', form: 'at', varCount: 3, kind: 'トラックバーグループ',
    syntax: '--trackgroup@変数名1,変数名2[,変数名3]:項目名',
    doc: '先に定義したトラックバー項目を2〜3個グループ化します。\n\n項目名は表示されませんが保存データのキー名として利用されます。',
    params: [
      { label: '変数名1', doc: '先に定義されているトラックバー項目の変数名' },
      { label: '変数名2', doc: '先に定義されているトラックバー項目の変数名' },
      { label: '変数名3', doc: '先に定義されているトラックバー項目の変数名(省略可)' },
      { label: '項目名', doc: '保存データのキー名(表示はされません)' },
    ],
    snippet: 'trackgroup@${1:x},${2:y},${3:z}:${4:Group}',
  },
  {
    name: 'check', form: 'at', defines: true, kind: 'チェックボックス',
    syntax: '--check@変数名:項目名,デフォルト値',
    doc: 'チェックボックス項目を定義します。\n\nデフォルト値が `0`/`1` なら変数はnumber型、`true`/`false` ならboolean型になります。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: '`0`/`1` (number型) または `true`/`false` (boolean型)' },
    ],
    snippet: 'check@${1:name}:${2:項目名},${3|false,true,0,1|}',
  },
  {
    name: 'checksection', form: 'at', defines: true, kind: 'セクション毎チェックボックス',
    syntax: '--checksection@変数名:項目名,デフォルト値,セクション毎設定の初期値',
    doc: 'セクション毎のチェックボックス項目を定義します。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: '`true` / `false`' },
      { label: 'セクション毎設定の初期値', doc: '`true` / `false`' },
    ],
    snippet: 'checksection@${1:name}:${2:項目名},${3|false,true|},${4|false,true|}',
  },
  {
    name: 'color', form: 'at', defines: true, kind: '色設定',
    syntax: '--color@変数名:項目名,デフォルト値',
    doc: '色設定項目を定義します。デフォルト値に `nil` を指定すると透明色を選択できるようになります。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: '`0xRRGGBB` 形式の色、または `nil`(透明色を選択可能)' },
    ],
    snippet: 'color@${1:col}:${2:色},${3:0xffffff}',
  },
  {
    name: 'file', form: 'at', defines: true, kind: 'ファイル選択',
    syntax: '--file@変数名:項目名',
    doc: 'ファイル選択項目を定義します。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
    ],
    snippet: 'file@${1:path}:${2:ファイル}',
  },
  {
    name: 'folder', form: 'at', defines: true, kind: 'フォルダ選択',
    syntax: '--folder@変数名:項目名',
    doc: 'フォルダ選択項目を定義します。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
    ],
    snippet: 'folder@${1:path}:${2:フォルダ}',
  },
  {
    name: 'font', form: 'at', defines: true, kind: 'フォント設定',
    syntax: '--font@変数名:項目名,デフォルト値',
    doc: 'フォント設定項目を定義します。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: 'フォント名' },
    ],
    snippet: 'font@${1:font}:${2:フォント},${3:MS UI Gothic}',
  },
  {
    name: 'figure', form: 'at', defines: true, kind: '図形設定',
    syntax: '--figure@変数名:項目名,デフォルト値',
    doc: '図形設定項目を定義します。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: '図形名(例: 円 / 四角形 / 三角形)' },
    ],
    snippet: 'figure@${1:fig}:${2:図形},${3:円}',
  },
  {
    name: 'select', form: 'at', defines: true, kind: 'リスト選択',
    syntax: '--select@変数名:項目名[=デフォルト値],選択肢=値,選択肢=値,...',
    doc: 'リスト選択項目を定義します。デフォルト値は省略できます。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名[=デフォルト値]', doc: '項目名。`=値` でデフォルト値を指定(省略可)' },
      { label: '選択肢=値', doc: '表示名=値 の組を必要な数だけ並べます' },
    ],
    snippet: 'select@${1:name}:${2:項目名}=${3:0},${4:選択肢A}=0,${5:選択肢B}=1',
  },
  {
    name: 'text', form: 'at', defines: true, kind: 'テキスト設定',
    syntax: '--text@変数名:項目名,デフォルト値',
    doc: '複数行のテキスト設定項目を定義します。デフォルト値では `\\n` で改行を表せます。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: 'デフォルトの文字列(`\\n` で改行)' },
    ],
    snippet: 'text@${1:txt}:${2:テキスト},${3:}',
  },
  {
    name: 'string', form: 'at', defines: true, kind: '1行テキスト設定',
    syntax: '--string@変数名:項目名,デフォルト値',
    doc: '1行のテキスト設定項目を定義します。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: 'デフォルトの文字列' },
    ],
    snippet: 'string@${1:str}:${2:文字列},${3:}',
  },
  {
    name: 'value', form: 'at', defines: true, kind: '変数項目',
    syntax: '--value@変数名:項目名,デフォルト値',
    doc: '変数項目(テキスト入力)を定義します。デフォルト値の内容で数値・文字列・配列が切り替わります。',
    params: [
      { label: '変数名', doc: '' },
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: '数値 → `0`\n\n文字列 → `"0"`\n\n配列 → `{0,0,0}`' },
    ],
    snippet: 'value@${1:name}:${2:項目名},${3:0}',
  },
  {
    name: 'data', form: 'at', kind: '汎用データ領域',
    syntax: '--data@登録名:サイズ',
    doc: '汎用データ領域を定義します(スクリプトモジュールやDLL向け)。\n\n`obj.data("登録名")` でポインタ(ユーザーデータ)とサイズを取得できます。',
    params: [
      { label: '登録名', doc: '`obj.data()` で指定する名前' },
      { label: 'サイズ', doc: 'バイト数(16KB以下)' },
    ],
    snippet: 'data@${1:name}:${2:8}',
  },
  {
    name: 'hide', form: 'at', kind: '非表示条件',
    syntax: '--hide@変数名[:条件]',
    doc: '条件を満たした場合に変数名の項目を非表示にします。条件省略時は常に非表示。\n\n' +
      '条件は `(変数名)(比較演算子)(数値)` の形で、比較演算子は `==` `~=` `>` `<`。\n\n' +
      '条件に使える項目: チェックボックス / リスト選択 / ファイル選択(選択有無0/1) / フォルダ選択(選択有無0/1) / `filter`(フィルタオブジェクトか 0/1)\n\n' +
      '※セクション毎チェックボックスはセクション毎が有効の場合は2を返却(0/1/2)',
    params: [
      { label: '変数名', doc: '非表示にする項目の変数名' },
      { label: '条件', doc: '例: `chk==0` / `filter==1` / `mode~=2`(省略時は常に非表示)' },
    ],
    snippet: 'hide@${1:name}:${2:chk==0}',
  },

  // ------------------------------
  // 設定画面のレイアウト
  // ------------------------------
  {
    name: 'group', form: 'colon', optionalArgs: true, kind: '設定グループ',
    syntax: '--group[:グループ名,デフォルト表示状態]',
    doc: '以降の設定項目をグループ化します。デフォルト表示状態(`true`/`false`)は省略できます。\n\n引数無しの `--group` でグループの終端を定義できます。',
    params: [
      { label: 'グループ名', doc: '' },
      { label: 'デフォルト表示状態', doc: '`true`=展開 / `false`=折りたたみ(省略可)' },
    ],
    snippet: 'group:${1:グループ名},${2|true,false|}',
  },
  {
    name: 'separator', form: 'colon', kind: 'セパレーター',
    syntax: '--separator:セパレーター名',
    doc: '設定項目にセパレーターを追加します。',
    params: [{ label: 'セパレーター名', doc: '' }],
    snippet: 'separator:${1:セパレーター名}',
  },

  // ------------------------------
  // スクリプトの情報・動作設定
  // ------------------------------
  {
    name: 'label', form: 'colon', kind: 'ラベル',
    syntax: '--label:ラベル名',
    doc: 'オブジェクト追加メニューの階層のラベルの初期値を設定します。',
    params: [{ label: 'ラベル名', doc: '例: `加工`' }],
    snippet: 'label:${1:ラベル名}',
  },
  {
    name: 'information', form: 'colon', kind: '情報',
    syntax: '--information:情報文字列',
    doc: 'スクリプトの情報を設定します。\n\n例: `--information:テストスクリプト ver2.00 by Kenkun`',
    params: [{ label: '情報文字列', doc: '' }],
    snippet: 'information:${1:スクリプト名} v${2:1.0.0} by ${3:作者}',
  },
  {
    name: 'script', form: 'colon', kind: 'スクリプト種別',
    syntax: '--script:種別',
    doc: 'スクリプトの種別を指定します。未指定の場合は `luaJIT`(旧スクリプトファイルでは `lua`)。',
    params: [{ label: '種別', doc: '`luaJIT` / `lua`' }],
    snippet: 'script:${1|lua,luaJIT|}',
  },
  {
    name: 'require', form: 'colon', kind: '必要バージョン',
    syntax: '--require:本体のバージョン番号',
    doc: 'スクリプトが必要な本体のバージョンを設定します。\n\n例: `--require:2003500`\n\n※本体のバージョン番号は `obj.getinfo("version")` で取得できます。',
    params: [{ label: '本体のバージョン番号', doc: '例: `2003500`' }],
    snippet: 'require:${1:2003500}',
  },
  {
    name: 'filter', form: 'flag', kind: 'フィルタオブジェクト対応', only: ['anm2'],
    syntax: '--filter',
    doc: '(anm2) フィルタオブジェクトに対応します。\n\n`obj.getinfo("filter")` でフィルタオブジェクト処理を分けられます。\n\n' +
      'フィルタオブジェクトでは次の制限があります。\n' +
      '- オブジェクトのサイズを変更しないこと(終了時に変わっていなければ可)\n' +
      '- オブジェクトの変数を変更しないこと(終了時に変わっていなければ可)\n' +
      '- `obj.draw()` 以降のフィルタが継続する\n' +
      '- 引数無しの `obj.effect()` は処理されない',
    params: [],
    snippet: 'filter',
  },
  {
    name: 'hidemenu', form: 'flag', kind: 'メニュー非表示',
    syntax: '--hidemenu',
    doc: 'オブジェクトやフィルタ効果の追加メニューリストに表示しないようにします。',
    params: [],
    snippet: 'hidemenu',
  },

  // ------------------------------
  // トラックバー移動スクリプト(*.tra2)
  // ------------------------------
  {
    name: 'twopoint', form: 'flag', kind: '中間点無視', only: ['tra2'],
    syntax: '--twopoint',
    doc: '(tra2) 中間点を無視する設定にします。',
    params: [],
    snippet: 'twopoint',
  },
  {
    name: 'speed', form: 'colon', kind: '加減速', only: ['tra2'],
    syntax: '--speed:加速初期値,減速初期値',
    doc: '(tra2) 加減速の設定ができるようにします。',
    params: [
      { label: '加速初期値', doc: '`0` / `1`' },
      { label: '減速初期値', doc: '`0` / `1`' },
    ],
    snippet: 'speed:${1|0,1|},${2|0,1|}',
  },
  {
    name: 'param', form: 'colon', kind: '設定値',
    syntax: '--param:[項目名[/check|/select/選択肢=値/...],]初期値',
    doc: '(tra2) トラックバーの設定値を定義します。複数行指定すると複数の設定値を持てます(`obj.getpoint("param")` で取得)。\n\n' +
      '- `--param:初期値`\n' +
      '- `--param:項目名,初期値`\n' +
      '- `--param:項目名/check,初期値` (値は0か1)\n' +
      '- `--param:項目名/select/選択肢=値/選択肢=値,初期値`\n\n' +
      '※指定順序が変更されると保存された設定値が正しく取得できなくなります。\n\n' +
      '※tra2以外では旧スクリプト形式の `--param`(互換対応)として扱われます。',
    params: [
      { label: '項目名', doc: '設定ダイアログの項目名。`/check` でチェックボックス、`/select/選択肢=値/...` でリスト選択' },
      { label: '初期値', doc: '' },
    ],
    snippet: 'param:${1:項目名},${2:0}',
  },
  {
    name: 'timecontrol', form: 'flag', kind: '時間制御', only: ['tra2'],
    syntax: '--timecontrol',
    doc: '(tra2) トラックバーの時間制御編集ができるようにします。\n\n`obj.getpoint("timecontrol", ...)` で時間制御を反映した値を取得できます。',
    params: [],
    snippet: 'timecontrol',
  },

  // ------------------------------
  // 旧スクリプト形式(互換対応)
  // ------------------------------
  ...[0, 1, 2, 3].map(n => ({
    name: `track${n}`, form: 'colon', legacy: true, kind: `トラックバー${n}(旧形式)`,
    syntax: `--track${n}:項目名,最小値,最大値,デフォルト値[,移動単位]`,
    doc: `旧スクリプトファイル形式のトラックバー項目です(互換対応)。値は \`obj.track${n}\` で参照します。`,
    params: [
      { label: '項目名', doc: '' },
      { label: '最小値', doc: '' },
      { label: '最大値', doc: '' },
      { label: 'デフォルト値', doc: '' },
      { label: '移動単位', doc: '`1` / `0.1` / `0.01` / `0.001`' },
    ],
    snippet: `track${n}:\${1:項目名},\${2:0},\${3:100},\${4:0}`,
  })),
  {
    name: 'check0', form: 'colon', legacy: true, kind: 'チェックボックス(旧形式)',
    syntax: '--check0:項目名,デフォルト値',
    doc: '旧スクリプトファイル形式のチェックボックス項目です(互換対応、変数はboolean型)。',
    params: [
      { label: '項目名', doc: '' },
      { label: 'デフォルト値', doc: '`0` / `1`' },
    ],
    snippet: 'check0:${1:項目名},${2|0,1|}',
  },
  {
    name: 'color', form: 'colon', legacy: true, kind: '色設定(旧形式)',
    syntax: '--color:デフォルト値',
    doc: '旧スクリプトファイル形式の色設定項目です(互換対応)。',
    params: [{ label: 'デフォルト値', doc: '`0xRRGGBB` 形式の色' }],
    snippet: 'color:${1:0xffffff}',
  },
  {
    name: 'file', form: 'colon', legacy: true, kind: 'ファイル選択(旧形式)',
    syntax: '--file:',
    doc: '旧スクリプトファイル形式のファイル選択項目です(互換対応)。',
    params: [],
    snippet: 'file:',
  },
  {
    name: 'dialog', form: 'colon', legacy: true, kind: 'ダイアログ(旧形式)',
    syntax: '--dialog:項目名,変数名=初期値;...',
    doc: '旧スクリプトファイル形式の設定ダイアログ定義です(互換対応)。個々の設定項目が作成されます。',
    params: [{ label: '項目名,変数名=初期値;...', doc: '`項目名,変数名=初期値` を `;` 区切りで並べます' }],
    snippet: 'dialog:${1:項目名},${2:name}=${3:0};',
  },
];

// シェーダー定義ブロック(--[[pixelshader@登録名: ... ]])
const shaderBlocks = [
  {
    name: 'pixelshader',
    syntax: '--[[pixelshader@登録名:\n    (HLSL)\n]]',
    doc: 'ピクセルシェーダーをHLSLで定義します。登録名がエントリーポイントになります。\n\n' +
      '入力シグネチャ:\n' +
      '- `float4 psmain(float4 pos : SV_Position) : SV_Target`\n' +
      '- `float4 psmain(float4 pos : SV_Position, float2 uv : TEXCOORD) : SV_Target`\n\n' +
      '※uvは描画範囲が0.0〜1.0になるように設定されます。\n\n実行は `obj.pixelshader()`。',
  },
  {
    name: 'computeshader',
    syntax: '--[[computeshader@登録名:\n    (HLSL)\n]]',
    doc: 'コンピュートシェーダーをHLSLで定義します。登録名がエントリーポイントになります。\n\n実行は `obj.computeshader()`。',
  },
];

module.exports = { directives, shaderBlocks };
