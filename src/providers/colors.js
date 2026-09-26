// 色の表示とカラーピッカー(0xRRGGBB 形式の色)
const vscode = require('vscode');
const common = require('../common');

const HEX_RE = /(?<![\w.])0x([0-9a-fA-F]{6})(?![\w.])/g;

const provider = {
  provideDocumentColors(document) {
    const mode = common.config().get('colorDecorator', 'all');
    if (mode === 'off') return [];
    const result = [];
    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;
      // 'directive' 指定時は --color@ / --color: の行のみ
      if (mode === 'directive' && !/^--color[@:]/.test(text)) continue;
      for (const m of text.matchAll(HEX_RE)) {
        const n = parseInt(m[1], 16);
        const color = new vscode.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1);
        result.push(new vscode.ColorInformation(new vscode.Range(line, m.index, line, m.index + m[0].length), color));
      }
    }
    return result;
  },
  provideColorPresentations(color, context) {
    const original = context.document.getText(context.range);
    const upper = /[A-F]/.test(original);
    const hex = [color.red, color.green, color.blue]
      .map(c => Math.round(c * 255).toString(16).padStart(2, '0'))
      .join('');
    return [new vscode.ColorPresentation('0x' + (upper ? hex.toUpperCase() : hex))];
  },
};

function register(context, selector) {
  context.subscriptions.push(vscode.languages.registerColorProvider(selector, provider));
}

module.exports = { register };
