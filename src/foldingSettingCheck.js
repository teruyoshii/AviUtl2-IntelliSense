// editor.defaultFoldingRangeProvider の確認
// Luaに対してこの設定が指定されていると、指定した拡張機能以外の折りたたみ範囲は使われない。
// 存在しない拡張機能ID(例: "LSP")の場合はすべての拡張機能の折りたたみが無効になり、
// インデントによる折りたたみだけになる(起動時に表示されていたタブだけ効くことがある)。
// その状態を検出して通知し、設定の削除を提案する。
const vscode = require('vscode');

const KEY = 'defaultFoldingRangeProvider';
const DISMISS_KEY = 'aviutl2.foldingSettingCheck.dismissedValue';

function ownId(context) {
  return context.extension ? context.extension.id : 'teruyoshi.aviutl2-intellisense';
}

function currentValue() {
  return vscode.workspace.getConfiguration('editor', { languageId: 'lua' }).get(KEY);
}

// Luaに効いている defaultFoldingRangeProvider の指定をすべて削除する(言語別・全体、ユーザー・ワークスペース)
async function removeSetting() {
  const cfg = vscode.workspace.getConfiguration('editor', { languageId: 'lua' });
  const info = cfg.inspect(KEY) || {};
  const T = vscode.ConfigurationTarget;
  const jobs = [];
  if (info.globalLanguageValue !== undefined) jobs.push([T.Global, true]);
  if (info.workspaceLanguageValue !== undefined) jobs.push([T.Workspace, true]);
  if (info.workspaceFolderLanguageValue !== undefined) jobs.push([T.WorkspaceFolder, true]);
  if (info.globalValue !== undefined) jobs.push([T.Global, false]);
  if (info.workspaceValue !== undefined) jobs.push([T.Workspace, false]);
  if (info.workspaceFolderValue !== undefined) jobs.push([T.WorkspaceFolder, false]);
  for (const [target, languageOverride] of jobs) {
    await cfg.update(KEY, undefined, target, languageOverride);
  }
  return jobs.length;
}

async function check(context) {
  const value = currentValue();
  if (!value || value === ownId(context)) return;
  if (context.globalState.get(DISMISS_KEY) === value) return;
  const exists = !!vscode.extensions.getExtension(value);
  const message = exists
    ? `Luaの折りたたみが設定「editor.defaultFoldingRangeProvider」で ${value} に限定されているため、AviUtl2の設定グループ・@セクション・シェーダー定義の折りたたみが使われません。`
    : `設定「editor.defaultFoldingRangeProvider」に存在しない拡張機能ID "${value}" が指定されているため、Luaの折りたたみ(AviUtl2の設定グループ・@セクション・シェーダー定義を含む)が無効になっています。`;
  const choice = await vscode.window.showWarningMessage(message, '設定を削除', '今後表示しない');
  if (choice === '設定を削除') {
    await removeSetting();
    vscode.window.showInformationMessage('設定を削除しました。開いているスクリプトはタブを開き直すと折りたたみが有効になります。');
  } else if (choice === '今後表示しない') {
    await context.globalState.update(DISMISS_KEY, value);
  }
}

function register(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('aviutl2.fixFoldingSetting', async () => {
      const value = currentValue();
      if (!value) {
        vscode.window.showInformationMessage('editor.defaultFoldingRangeProvider は指定されていません。');
        return;
      }
      await removeSetting();
      vscode.window.showInformationMessage(`editor.defaultFoldingRangeProvider("${value}")を削除しました。`);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(`editor.${KEY}`)) check(context);
    })
  );
  check(context);
}

module.exports = { register, removeSetting };
