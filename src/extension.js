// AviUtl2 IntelliSense 拡張機能のエントリポイント
const completion = require('./providers/completion');
const signature = require('./providers/signature');
const navigation = require('./providers/navigation');
const symbols = require('./providers/symbols');
const colors = require('./providers/colors');
const diagnostics = require('./providers/diagnostics');
const folding = require('./providers/folding');
const groups = require('./providers/groups');
const colorSettings = require('./colorSettings');
const foldingSettingCheck = require('./foldingSettingCheck');
const sections = require('./providers/sections');
const shaders = require('./providers/shaders');
const inlayHints = require('./providers/inlayHints');

// AviUtl2のスクリプトファイル(*.anm2 / *.obj2 / *.cam2 / *.scn2 / *.tra2)のみを対象にする
const selector = [
  { language: 'lua', pattern: '**/*.{anm2,obj2,cam2,scn2,tra2}' },
];

function activate(context) {
  completion.register(context, selector);
  signature.register(context, selector);
  navigation.register(context, selector);
  symbols.register(context, selector);
  colors.register(context, selector);
  folding.register(context, selector);
  inlayHints.register(context);
  diagnostics.register(context);
  groups.register(context);
  sections.register(context);
  shaders.register(context);
  colorSettings.register(context);
  foldingSettingCheck.register(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
