// 色設定の定義と、editor.tokenColorCustomizations への変換(VSCodeに依存しない部分)

// 色を個別に設定できるハイライト要素
// scopes は syntaxes/aviutl2.injection.tmLanguage.json で付けているスコープ名。
// 1つのトークンに複数のスコープ名を付けている場合(例: 'keyword.other.directive.aviutl2 aul2.settings.lua')は
// 後ろ(内側)のスコープ名に当たるルールが優先されるため、そのトークンのスコープ名をすべて含めること。
// (含めないと、旧フォーク版向けの設定やテーマの entity.name.function / markup.heading などに負ける)
// sample は設定画面の見本。[ ] で囲んだ部分がこの要素の色で表示される部分
const TOKEN_ELEMENTS = [
  { key: 'directive', label: '指示子', sample: '[--track@]speed:速度', scopes: ['keyword.other.directive.aviutl2', 'aul2.settings.lua'] },
  { key: 'directiveVariable', label: '指示子の変数名', sample: '--track@[speed]:速度', scopes: ['variable.other.definition.aviutl2'] },
  { key: 'directiveText', label: '指示子の項目名・文字列', sample: '--track@speed:[速度]', scopes: ['string.unquoted.aviutl2', 'string.quoted.double.aviutl2'] },
  { key: 'directiveValue', label: '指示子の数値・真偽値', sample: '[0],[100],[true]', scopes: ['constant.numeric.aviutl2', 'constant.language.aviutl2', 'constant.other.aviutl2'] },
  { key: 'directiveColor', label: '指示子の色コード', sample: '--color@col:色,[0xff8800]', scopes: ['constant.numeric.hex.aviutl2', 'aul2.type.lua'] },
  { key: 'directivePunctuation', label: '指示子の区切り記号', sample: '--hide@x[:]chk[==]0', scopes: ['punctuation.separator.aviutl2', 'punctuation.separator.comma.aviutl2', 'keyword.operator.aviutl2'] },
  { key: 'section', label: '@セクション名', sample: '[@スクリプト名]', scopes: ['keyword.control.section.aviutl2', 'keyword.control.aul2', 'entity.name.section.aviutl2', 'markup.heading.aviutl2'] },
  { key: 'shaderName', label: 'シェーダー登録名', sample: 'pixelshader@[psmain]:', scopes: ['entity.name.function.shader.aviutl2'] },
  { key: 'obj', label: 'obj', sample: '[obj].ox', scopes: ['variable.language.obj.aviutl2'] },
  { key: 'objVariable', label: 'obj変数', sample: 'obj.[ox]', scopes: ['variable.other.property.aviutl2', 'support.variable.property.aviutl2'] },
  { key: 'function', label: 'obj関数・独自関数', sample: 'obj.[draw]() [RGB]()', scopes: ['support.function.aviutl2', 'entity.name.function.aviutl2'] },
  { key: 'global', label: 'global', sample: '[global].xxx', scopes: ['variable.language.global.aviutl2'] },
];

// 見本の [ ] を取り除いた文字列
const plainSample = sample => sample.replace(/\[([^\]]*)\]/g, '$1');

const FONT_STYLES = ['bold', 'italic', 'underline', 'strikethrough'];

// 要素毎の既定の文字色(利用者が手動で指定していた色を既定として取り込んだもの)
// 利用者設定で "" を指定した要素はテーマの色になる
const DEFAULT_TOKEN_COLORS = {
  directive: '#FF8800',
  directiveColor: '#C6A553',
  section: '#FF0000',
  shaderName: '#9790FE',
  obj: '#6484E3',
  objVariable: '#A8C4FF',
  function: '#82AAFF',
  global: '#BE22DD',
};

// オブジェクト型設定の実際の値(既定値 → ユーザー → ワークスペース → フォルダの順に上書き)
// VSCodeはオブジェクト型設定の既定値と利用者の値を項目単位では合成しないため、自前で合成する
function effectiveObject(info = {}) {
  return {
    ...(info.defaultValue || {}),
    ...(info.globalValue || {}),
    ...(info.workspaceValue || {}),
    ...(info.workspaceFolderValue || {}),
  };
}

// グループ表示の既定色(グループ毎に順番に使う)
const DEFAULT_GROUP_COLORS = ['#4FC1FF', '#C586C0', '#DCDCAA', '#4EC9B0', '#F48771', '#B5CEA8'];

// @スクリプト名 の行の背景色の既定値
const DEFAULT_SECTION_COLOR = '#C586C0';

// シェーダー定義の範囲の背景色の既定値
const DEFAULT_SHADER_COLOR = '#9790FE';

// この拡張機能が書き込んだルールの目印(name の先頭)
const RULE_PREFIX = 'AviUtl2: ';

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// aviutl2.tokenColors / aviutl2.tokenFontStyles の値から textMateRules を作る
function buildRules(colors = {}, fontStyles = {}) {
  const rules = [];
  for (const el of TOKEN_ELEMENTS) {
    const settings = {};
    const color = colors[el.key];
    if (typeof color === 'string' && HEX_COLOR_RE.test(color.trim())) settings.foreground = color.trim();
    const style = fontStyles[el.key];
    if (typeof style === 'string' && style.trim() !== '') {
      settings.fontStyle = style.split(/\s+/).filter(s => FONT_STYLES.includes(s)).join(' ');
    }
    if (Object.keys(settings).length) rules.push({ name: RULE_PREFIX + el.label, scope: el.scopes, settings });
  }
  return rules;
}

// 既存の editor.tokenColorCustomizations に、この拡張機能のルールを差し替えて入れる
// 利用者が自分で書いたルールや他の設定はそのまま残す
// 戻り値: 新しい設定値(変更不要なら null)
function mergeCustomizations(existing, rules) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const oldRules = Array.isArray(base.textMateRules) ? base.textMateRules : [];
  const userRules = oldRules.filter(r => !(r && typeof r.name === 'string' && r.name.startsWith(RULE_PREFIX)));
  const newRules = [...userRules, ...rules];
  if (JSON.stringify(newRules) === JSON.stringify(oldRules)) return null;
  const next = { ...base };
  if (newRules.length) next.textMateRules = newRules;
  else delete next.textMateRules;
  return next;
}

// '#RGB' / '#RRGGBB' / '#RRGGBBAA' を rgba() に変換する(opacity を掛ける)
function toRgba(hex, opacity = 1) {
  if (typeof hex !== 'string' || !HEX_COLOR_RE.test(hex.trim())) return null;
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = (h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1) * opacity;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

module.exports = {
  TOKEN_ELEMENTS, plainSample, FONT_STYLES, DEFAULT_TOKEN_COLORS, effectiveObject, DEFAULT_GROUP_COLORS, DEFAULT_SECTION_COLOR, DEFAULT_SHADER_COLOR, RULE_PREFIX, HEX_COLOR_RE, buildRules, mergeCustomizations, toRgba };
