// obj変数・global変数の定義データ
// 出典: docs/lua.txt「変数」(2026/9/19版)
// readonly: 読み取り専用 / legacy: 旧スクリプト形式との互換用

const objVariables = [
  { name: 'ox', doc: '基準座標からの相対座標X' },
  { name: 'oy', doc: '基準座標からの相対座標Y' },
  { name: 'oz', doc: '基準座標からの相対座標Z' },
  { name: 'rx', doc: 'X軸回転角度(360.0で一回転)' },
  { name: 'ry', doc: 'Y軸回転角度(360.0で一回転)' },
  { name: 'rz', doc: 'Z軸回転角度(360.0で一回転)' },
  { name: 'cx', doc: '中心の相対座標X' },
  { name: 'cy', doc: '中心の相対座標Y' },
  { name: 'cz', doc: '中心の相対座標Z' },
  { name: 'sx', doc: 'X座標の拡大率(1.0=等倍)' },
  { name: 'sy', doc: 'Y座標の拡大率(1.0=等倍)' },
  { name: 'sz', doc: 'Z座標の拡大率(1.0=等倍)' },
  { name: 'zoom', doc: '拡大率(1.0=等倍) ※互換対応\n\n※zoom,aspectは旧スクリプトファイルの利用かで算出反映処理が異なります' },
  { name: 'aspect', doc: 'アスペクト比(-1.0〜1.0/プラス=横縮小/マイナス=縦縮小) ※互換対応' },
  { name: 'alpha', doc: '不透明度(0.0〜1.0/0.0=透明/1.0=不透明)' },
  { name: 'x', readonly: true, doc: '表示基準座標X' },
  { name: 'y', readonly: true, doc: '表示基準座標Y' },
  { name: 'z', readonly: true, doc: '表示基準座標Z' },
  { name: 'w', readonly: true, doc: '画像サイズW(常にオブジェクトのピクセル数)' },
  { name: 'h', readonly: true, doc: '画像サイズH(常にオブジェクトのピクセル数)' },
  { name: 'screen_w', readonly: true, doc: 'スクリーンサイズW' },
  { name: 'screen_h', readonly: true, doc: 'スクリーンサイズH' },
  { name: 'framerate', readonly: true, doc: 'フレームレート' },
  { name: 'frame', readonly: true, doc: 'オブジェクト基準での現在のフレーム番号\n\n※シーンチェンジ対象の場合はtotalframeを超える場合があります' },
  { name: 'time', readonly: true, doc: 'オブジェクト基準での現在の時間(秒)\n\n※シーンチェンジ対象の場合はtotaltimeを超える場合があります' },
  { name: 'totalframe', readonly: true, doc: 'オブジェクトの総フレーム数' },
  { name: 'totaltime', readonly: true, doc: 'オブジェクトの総時間(秒)' },
  { name: 'layer', readonly: true, doc: 'オブジェクトが配置されているレイヤー(描画対象のオブジェクトのレイヤー位置)' },
  { name: 'index', doc: '複数オブジェクト時の番号 ※個別オブジェクト用\n\n※スクリプトで個別オブジェクトとして描画する場合は `obj.multiobject()` を利用します' },
  { name: 'num', doc: '複数オブジェクト時の数(1=単体オブジェクト/0=不定) ※個別オブジェクト用' },
  { name: 'id', readonly: true, doc: '描画対象のオブジェクトの固有ID(アプリ起動毎)' },
  { name: 'effect_id', readonly: true, doc: '処理対象のフィルタ効果・オブジェクト入出力の固有ID(アプリ起動毎)' },
  { name: 'frame_s', readonly: true, doc: '全体(シーン)基準のオブジェクトの開始フレーム(0からの整数)' },
  { name: 'frame_e', readonly: true, doc: '全体(シーン)基準のオブジェクトの終了フレーム(0からの整数)' },
  { name: 'effect_layer', readonly: true, doc: '対象エフェクトが配置されているレイヤー(自身のオブジェクトのレイヤー位置)' },
  { name: 'originframe', readonly: true, doc: '全体(シーン)基準のレンダリングの起点フレーム(0からの整数)' },
  // 旧スクリプト形式の --track0: で定義した値(lua.txtの使用例で使用)
  ...[0, 1, 2, 3].map(n => ({ name: `track${n}`, legacy: true, doc: `\`--track${n}:\` で定義したトラックバーの値 ※旧形式(互換対応)` })),
];

const globalVariables = [
  {
    name: 'global',
    doc: 'スクリプトで共用のテーブル変数。`global.xxx`(xxxは任意のキー名)で読み書きします。\n\n※値はバイナリセーフな文字列型で保持されます\n\n```lua\nglobal.test = 123\nprint(global.test)\n```',
  },
];

module.exports = { objVariables, globalVariables };
