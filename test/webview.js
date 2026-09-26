// 色設定画面(Webview)のテスト
// HTMLはテンプレート文字列で組み立てているため、埋め込みスクリプトの構文と正規表現のエスケープを確認する
// 実行: node test/webview.js
const assert = require('assert');
const Module = require('module');
const path = require('path');

const mockPath = path.join(__dirname, 'vscode-mock.js');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? mockPath : originalResolve.call(this, request, ...rest);
};
const vscode = require('vscode');
vscode.ConfigurationTarget = { Global: 1 };
vscode.ViewColumn = { Beside: -2 };
let html = null;
vscode.window = {
  createWebviewPanel: () => ({
    webview: { cspSource: 'x', set html(v) { html = v; }, onDidReceiveMessage: () => {}, postMessage: () => {} },
    onDidDispose: () => {},
  }),
  showErrorMessage: () => {},
};
let openCommand = null;
vscode.commands = { registerCommand: (id, fn) => { if (id === 'aviutl2.customizeColors') openCommand = fn; return {}; } };
vscode.workspace.onDidChangeConfiguration = () => ({});
vscode.workspace.getConfiguration = () => ({ get: (k, d) => d, inspect: () => ({}), update: async () => {} });

require('../src/colorSettings').register({ subscriptions: [] });
openCommand();

const script = /<script nonce="[^"]+">([\s\S]*)<\/script>/.exec(html)[1];
assert.doesNotThrow(() => new Function(script), '埋め込みスクリプトに構文エラーがある');

// 見本の分割に使う正規表現が、エスケープが消えずに生成されていること
const re = eval(/split\((\/.*?\/)\)/.exec(script)[1]);
assert.deepStrictEqual('[global].xxx'.split(re).filter(Boolean), ['[global]', '.xxx']);
assert.deepStrictEqual('obj.[draw]() [RGB]()'.split(re).filter(Boolean), ['obj.', '[draw]', '() ', '[RGB]', '()']);

console.log('ok   色設定画面のスクリプト\n\nすべて成功');
