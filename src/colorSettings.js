// 色などの設定
// - aviutl2.tokenColors / aviutl2.tokenFontStyles の値を editor.tokenColorCustomizations(ユーザー設定)に反映する
// - コマンド「AviUtl2 IntelliSense: 設定」でカラーピッカー付きの設定画面を開く
const vscode = require('vscode');
const { TRACK_LABELS } = require('./providers/inlayHints');
const { TOKEN_ELEMENTS, DEFAULT_GROUP_COLORS, DEFAULT_SECTION_COLOR, DEFAULT_SHADER_COLOR, DEFAULT_TOKEN_COLORS, effectiveObject, buildRules, mergeCustomizations } = require('./colorRules');

const Global = vscode.ConfigurationTarget.Global;
const cfg = () => vscode.workspace.getConfiguration('aviutl2');
const tokenColors = () => effectiveObject(cfg().inspect('tokenColors'));
const tokenFontStyles = () => effectiveObject(cfg().inspect('tokenFontStyles'));

// 独自設定の内容を editor.tokenColorCustomizations に書き込む(変更が無ければ何もしない)
async function syncTokenColors() {
  const rules = buildRules(tokenColors(), tokenFontStyles());
  const editorCfg = vscode.workspace.getConfiguration('editor');
  const current = editorCfg.inspect('tokenColorCustomizations').globalValue;
  const next = mergeCustomizations(current, rules);
  if (next) await editorCfg.update('tokenColorCustomizations', next, Global);
}

// ユーザー設定のオブジェクト型設定の1項目を変更する
// value が null のときは「指定なし」。既定値がある項目は "" を書いてテーマの色にする
// 既定値と同じ値は書かずに項目を削除する(settings.json を既定値で埋めないため)
async function updateObjectSetting(section, key, value) {
  const info = cfg().inspect(section);
  const defaults = info.defaultValue || {};
  const current = { ...(info.globalValue || {}) };
  const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  if (value === null || value === undefined || value === '') {
    if (defaults[key]) current[key] = '';
    else delete current[key];
  } else if (same(value, defaults[key])) {
    delete current[key];
  } else {
    current[key] = value;
  }
  await cfg().update(section, Object.keys(current).length ? current : undefined, Global);
}

function state() {
  const c = cfg();
  return {
    elements: TOKEN_ELEMENTS.map(({ key, label, sample }) => ({ key, label, sample })),
    tokenColors: tokenColors(),
    tokenFontStyles: tokenFontStyles(),
    defaultTokenColors: DEFAULT_TOKEN_COLORS,
    group: {
      enable: c.get('groupHighlight.enable', true),
      showLabels: c.get('groupHighlight.showLabels', false),
      backgroundOpacity: c.get('groupHighlight.backgroundOpacity', 0.08),
      colors: c.get('groupHighlight.colors', DEFAULT_GROUP_COLORS),
    },
    section: {
      enable: c.get('sectionHighlight.enable', true),
      color: c.get('sectionHighlight.color', DEFAULT_SECTION_COLOR),
      opacity: c.get('sectionHighlight.opacity', 0.25),
    },
    shader: {
      enable: c.get('shaderHighlight.enable', true),
      color: c.get('shaderHighlight.color', DEFAULT_SHADER_COLOR),
      opacity: c.get('shaderHighlight.opacity', 0.08),
    },
    inlay: {
      enable: c.get('inlayHints.trackParameters', true),
      color: c.get('inlayHints.trackColor', ''),
      items: TRACK_LABELS.map(t => ({ key: t.key, label: t.label, doc: t.doc, enable: c.get(`inlayHints.track.${t.key}`, true) })),
    },
    defaultGroupColors: DEFAULT_GROUP_COLORS,
  };
}

let panel = null;

async function handleMessage(msg) {
  switch (msg.type) {
    case 'tokenColor':
      await updateObjectSetting('tokenColors', msg.key, msg.value);
      break;
    case 'tokenFontStyle':
      await updateObjectSetting('tokenFontStyles', msg.key, msg.value);
      break;
    case 'group':
      await cfg().update(`groupHighlight.${msg.key}`, msg.value, Global);
      break;
    case 'resetTokens':
      // 既定の色に戻す
      await cfg().update('tokenColors', undefined, Global);
      await cfg().update('tokenFontStyles', undefined, Global);
      break;
    case 'resetTokensTheme':
      // すべての要素をテーマの色にする(既定の色がある要素は "" で打ち消す)
      await cfg().update('tokenColors', Object.fromEntries(Object.keys(DEFAULT_TOKEN_COLORS).map(k => [k, ''])), Global);
      await cfg().update('tokenFontStyles', undefined, Global);
      break;
    case 'inlay':
      // msg.key は 'trackParameters' または 'track.min' など
      if (/^(trackParameters|trackColor|track\.\w+)$/.test(msg.key)) await cfg().update(`inlayHints.${msg.key}`, msg.value, Global);
      break;
    case 'section':
      await cfg().update(`sectionHighlight.${msg.key}`, msg.value, Global);
      break;
    case 'resetSection':
      for (const key of ['enable', 'color', 'opacity']) {
        await cfg().update(`sectionHighlight.${key}`, undefined, Global);
      }
      break;
    case 'shader':
      if (/^(enable|color|opacity)$/.test(msg.key)) await cfg().update(`shaderHighlight.${msg.key}`, msg.value, Global);
      break;
    case 'resetShader':
      for (const key of ['enable', 'color', 'opacity']) {
        await cfg().update(`shaderHighlight.${key}`, undefined, Global);
      }
      break;
    case 'resetGroup':
      for (const key of ['enable', 'showLabels', 'backgroundOpacity', 'colors']) {
        await cfg().update(`groupHighlight.${key}`, undefined, Global);
      }
      break;
    case 'openJson':
      await vscode.commands.executeCommand('workbench.action.openSettingsJson');
      return;
    default:
      return;
  }
  // 画面を作り直すとカラーピッカーが閉じてしまうため、状態を送り返すのはリセット時のみ
  if (panel && msg.type.startsWith('reset')) panel.webview.postMessage({ type: 'state', state: state() });
}

function openPanel(context) {
  if (panel) {
    panel.reveal();
    return;
  }
  panel = vscode.window.createWebviewPanel('aviutl2Colors', 'AviUtl2 IntelliSense: 設定', vscode.ViewColumn.Beside, { enableScripts: true });
  panel.webview.html = html(panel.webview);
  panel.onDidDispose(() => { panel = null; }, null, context.subscriptions);
  panel.webview.onDidReceiveMessage(msg => handleMessage(msg).catch(e => vscode.window.showErrorMessage(`色設定の保存に失敗しました: ${e.message}`)), null, context.subscriptions);
  panel.webview.postMessage({ type: 'state', state: state() });
}

function html(webview) {
  const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 16px 24px; }
  h2 { font-size: 1.1em; margin: 20px 0 6px; }
  p.note { color: var(--vscode-descriptionForeground); margin: 4px 0 10px; }
  table { border-collapse: collapse; width: 100%; max-width: 760px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, #8884); }
  th { font-weight: normal; color: var(--vscode-descriptionForeground); }
  .sample { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
            background: var(--vscode-editor-background); padding: 2px 8px; border-radius: 3px; white-space: nowrap; }
  .sample .rest { color: var(--vscode-descriptionForeground); opacity: .7; }
  input[type=color] { width: 44px; height: 24px; padding: 0; border: none; background: none; vertical-align: middle; }
  input[type=color]:disabled { opacity: .3; }
  .style label { margin-right: 8px; white-space: nowrap; }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
           border: none; padding: 4px 10px; cursor: pointer; margin-right: 6px; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .palette { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .preview { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
             background: var(--vscode-editor-background); max-width: 760px; margin-top: 10px; }
  .preview div { padding: 0 8px; white-space: pre; }
  .row { margin: 6px 0; }
</style>
</head>
<body>
<h2>ハイライトの色</h2>
<p class="note">「色を指定」をオンにした要素は指定の色、オフにした要素はテーマの色で表示します。変更はすぐにエディタへ反映され、ユーザー設定(settings.json)に保存されます。</p>
<table>
  <thead><tr><th>要素</th><th>見本</th><th>色を指定</th><th>色</th><th>スタイル</th></tr></thead>
  <tbody id="tokens"></tbody>
</table>
<div class="row"><button id="resetTokens">既定の色に戻す</button><button id="resetTokensTheme">すべてテーマの色にする</button><button id="openJson">settings.json を開く</button></div>

<h2>--track@ の補助表示</h2>
<div class="row"><label><input type="checkbox" id="inlayEnable"> --track@ の各値の前に項目名を表示する</label></div>
<div class="row" id="inlayItems"></div>
<div class="row"><label><input type="checkbox" id="inlayColorEnable"> 色を指定する</label> <input type="color" id="inlayColor"> (オフの場合はテーマのインレイヒントの色)</div>
<div class="preview" id="inlayPreview"></div>

<h2>@スクリプト名 の行の背景色</h2>
<div class="row"><label><input type="checkbox" id="sectionEnable"> @スクリプト名 から始まる行全体に背景色を付ける</label></div>
<div class="row">背景色 <input type="color" id="sectionColor"> 濃さ <input type="range" id="sectionOpacity" min="0" max="1" step="0.01"> <span id="sectionOpacityValue"></span></div>
<div class="row"><button id="resetSection">既定に戻す</button></div>
<div class="preview" id="sectionPreview"></div>

<h2>ピクセルシェーダー定義の背景色</h2>
<div class="row"><label><input type="checkbox" id="shaderEnable"> --[[pixelshader@ ～ ]] の範囲に背景色を付ける(computeshader も同様)</label></div>
<div class="row">背景色 <input type="color" id="shaderColor"> 濃さ <input type="range" id="shaderOpacity" min="0" max="1" step="0.01"> <span id="shaderOpacityValue"></span></div>
<div class="row"><button id="resetShader">既定に戻す</button></div>
<div class="preview" id="shaderPreview"></div>

<h2>設定グループ(--group)の範囲表示</h2>
<div class="row"><label><input type="checkbox" id="groupEnable"> グループの範囲を色付きの線と背景で表示する</label></div>
<div class="row"><label><input type="checkbox" id="groupLabels"> 開始・終了行に「▼ グループ」「▲ ここまで」を表示する</label></div>
<div class="row">背景の濃さ <input type="range" id="groupOpacity" min="0" max="0.4" step="0.01"> <span id="groupOpacityValue"></span></div>
<div class="row">グループの色(グループ毎に順番に使います)</div>
<div class="palette" id="palette"></div>
<div class="row"><button id="addColor">色を追加</button><button id="resetGroup">既定に戻す</button></div>
<div class="preview" id="preview"></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let state = null;
  const $ = id => document.getElementById(id);
  const send = msg => vscode.postMessage(msg);

  // 連続した変更(カラーピッカーのドラッグ中など)はまとめて送る
  const timers = {};
  const debounce = (key, fn, ms = 250) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };

  const toInputColor = c => {
    if (typeof c !== 'string') return '#ffffff';
    let h = c.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    return '#' + h.slice(0, 6);
  };

  // 見本のうち、この要素に当たる部分([ ] で囲んだ部分)だけに色・スタイルを付ける
  function applySampleStyle(sample, color, style) {
    for (const el of sample.querySelectorAll('.hl')) {
      el.style.color = color || '';
      el.style.fontWeight = /bold/.test(style || '') ? 'bold' : '';
      el.style.fontStyle = /italic/.test(style || '') ? 'italic' : '';
      const deco = [/underline/.test(style || '') ? 'underline' : '', /strikethrough/.test(style || '') ? 'line-through' : ''].filter(Boolean).join(' ');
      el.style.textDecoration = deco;
    }
  }

  // '[global].xxx' → 色を付ける部分とそれ以外の部分に分けて表示する
  function fillSample(sample, text) {
    // ※このスクリプトはテンプレート文字列の中にあるため、正規表現の \ は二重に書く
    text.split(/(\\[[^\\]]*\\])/).filter(Boolean).forEach(part => {
      const span = document.createElement('span');
      if (part.startsWith('[')) {
        span.className = 'hl';
        span.textContent = part.slice(1, -1);
      } else {
        span.className = 'rest';
        span.textContent = part;
      }
      sample.append(span);
    });
  }

  function renderTokens() {
    const body = $('tokens');
    body.innerHTML = '';
    for (const el of state.elements) {
      const color = state.tokenColors[el.key];
      const style = state.tokenFontStyles[el.key] || '';
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td><span class="sample"></span></td><td><input type="checkbox"></td><td><input type="color"></td><td class="style"></td>';
      tr.children[0].textContent = el.label;
      const sample = tr.querySelector('.sample');
      fillSample(sample, el.sample);
      applySampleStyle(sample, color, style);
      const check = tr.querySelector('input[type=checkbox]');
      const picker = tr.querySelector('input[type=color]');
      check.checked = !!color;
      picker.value = toInputColor(color || state.defaultTokenColors[el.key] || '#ff8800');
      picker.disabled = !color;
      check.addEventListener('change', () => {
        picker.disabled = !check.checked;
        const value = check.checked ? picker.value : null;
        applySampleStyle(sample, value, style);
        send({ type: 'tokenColor', key: el.key, value });
      });
      picker.addEventListener('input', () => {
        applySampleStyle(sample, picker.value, style);
        debounce('token:' + el.key, () => send({ type: 'tokenColor', key: el.key, value: picker.value }));
      });
      const styleCell = tr.querySelector('.style');
      for (const [name, text] of [['bold', '太字'], ['italic', '斜体'], ['underline', '下線']]) {
        const label = document.createElement('label');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = style.split(' ').includes(name);
        box.dataset.style = name;
        box.addEventListener('change', () => {
          const next = [...styleCell.querySelectorAll('input:checked')].map(b => b.dataset.style).join(' ');
          applySampleStyle(sample, check.checked ? picker.value : null, next);
          send({ type: 'tokenFontStyle', key: el.key, value: next || null });
        });
        label.append(box, ' ' + text);
        styleCell.append(label);
      }
      body.append(tr);
    }
  }

  function renderGroup() {
    const g = state.group;
    $('groupEnable').checked = g.enable;
    $('groupLabels').checked = g.showLabels;
    $('groupOpacity').value = g.backgroundOpacity;
    $('groupOpacityValue').textContent = Math.round(g.backgroundOpacity * 100) + '%';
    const palette = $('palette');
    palette.innerHTML = '';
    g.colors.forEach((c, i) => {
      const wrap = document.createElement('span');
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = toInputColor(c);
      picker.addEventListener('input', () => {
        g.colors[i] = picker.value;
        renderPreview();
        debounce('group:colors', () => send({ type: 'group', key: 'colors', value: g.colors }));
      });
      const del = document.createElement('button');
      del.textContent = '×';
      del.title = 'この色を削除';
      del.disabled = g.colors.length <= 1;
      del.addEventListener('click', () => { g.colors.splice(i, 1); send({ type: 'group', key: 'colors', value: g.colors }); renderGroup(); });
      wrap.append(picker, del);
      palette.append(wrap);
    });
    renderPreview();
  }

  function rgba(hex, a) {
    const h = toInputColor(hex).slice(1);
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }

  function renderPreview() {
    const g = state.group;
    const preview = $('preview');
    preview.innerHTML = '';
    const groups = [['基本設定', ['--track@size:サイズ,0,500,100', '--color@col:色,0xffffff']], ['詳細', ['--check@glow:発光,false', '--group']]];
    groups.forEach(([name, lines], i) => {
      const color = g.colors[i % g.colors.length];
      const all = ['--group:' + name + ',true', ...lines];
      all.forEach((text, j) => {
        const div = document.createElement('div');
        div.textContent = text;
        if (g.enable) {
          div.style.borderLeft = '3px solid ' + rgba(color, 1);
          div.style.background = rgba(color, g.backgroundOpacity);
          if (g.showLabels && (j === 0 || j === all.length - 1)) {
            const note = document.createElement('span');
            note.textContent = j === 0 ? '    ▼ グループ「' + name + '」 ' + lines.filter(l => l !== '--group').length + '項目' : '    ▲ 「' + name + '」ここまで';
            note.style.color = rgba(color, 0.9);
            note.style.fontStyle = 'italic';
            div.append(note);
          }
        }
        preview.append(div);
      });
    });
  }

  $('groupEnable').addEventListener('change', e => { state.group.enable = e.target.checked; renderPreview(); send({ type: 'group', key: 'enable', value: e.target.checked }); });
  $('groupLabels').addEventListener('change', e => { state.group.showLabels = e.target.checked; renderPreview(); send({ type: 'group', key: 'showLabels', value: e.target.checked }); });
  $('groupOpacity').addEventListener('input', e => {
    state.group.backgroundOpacity = Number(e.target.value);
    $('groupOpacityValue').textContent = Math.round(state.group.backgroundOpacity * 100) + '%';
    renderPreview();
    debounce('group:opacity', () => send({ type: 'group', key: 'backgroundOpacity', value: state.group.backgroundOpacity }));
  });
  $('addColor').addEventListener('click', () => {
    const g = state.group;
    g.colors.push(state.defaultGroupColors[g.colors.length % state.defaultGroupColors.length]);
    send({ type: 'group', key: 'colors', value: g.colors });
    renderGroup();
  });
  $('resetTokens').addEventListener('click', () => send({ type: 'resetTokens' }));
  $('resetTokensTheme').addEventListener('click', () => send({ type: 'resetTokensTheme' }));
  $('resetGroup').addEventListener('click', () => send({ type: 'resetGroup' }));

  function renderInlay() {
    const inlay = state.inlay;
    $('inlayEnable').checked = inlay.enable;
    $('inlayColorEnable').checked = !!inlay.color;
    $('inlayColor').value = toInputColor(inlay.color || '#888888');
    $('inlayColor').disabled = !inlay.color;
    const box = $('inlayItems');
    box.innerHTML = '';
    for (const item of inlay.items) {
      const label = document.createElement('label');
      label.style.marginRight = '14px';
      label.title = item.doc;
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = item.enable;
      check.disabled = !inlay.enable;
      check.addEventListener('change', () => {
        item.enable = check.checked;
        renderInlayPreview();
        send({ type: 'inlay', key: 'track.' + item.key, value: check.checked });
      });
      // 説明の括弧書き以降は省く(テンプレート文字列内なので \ は二重に書く)
      label.append(check, ' ' + item.label + '(' + item.doc.replace(/\\(.*$/, '') + ')');
      box.append(label);
    }
    renderInlayPreview();
  }
  function renderInlayPreview() {
    const values = ['0', '100', '10', '0.01'];
    const preview = $('inlayPreview');
    preview.innerHTML = '';
    const div = document.createElement('div');
    div.append('--track@speed:速度');
    values.forEach((v, i) => {
      div.append(',');
      const item = state.inlay.items[i];
      if (state.inlay.enable && item.enable) {
        const hint = document.createElement('span');
        hint.textContent = item.label + ' ';
        hint.style.color = state.inlay.color || 'var(--vscode-editorInlayHint-parameterForeground, var(--vscode-editorInlayHint-foreground))';
        hint.style.background = 'var(--vscode-editorInlayHint-background)';
        hint.style.fontSize = '90%';
        div.append(hint);
      }
      div.append(v);
    });
    preview.append(div);
  }
  $('inlayColorEnable').addEventListener('change', e => {
    $('inlayColor').disabled = !e.target.checked;
    state.inlay.color = e.target.checked ? $('inlayColor').value : '';
    renderInlayPreview();
    send({ type: 'inlay', key: 'trackColor', value: state.inlay.color });
  });
  $('inlayColor').addEventListener('input', e => {
    state.inlay.color = e.target.value;
    renderInlayPreview();
    debounce('inlay:color', () => send({ type: 'inlay', key: 'trackColor', value: state.inlay.color }));
  });
  $('inlayEnable').addEventListener('change', e => {
    state.inlay.enable = e.target.checked;
    renderInlay();
    send({ type: 'inlay', key: 'trackParameters', value: e.target.checked });
  });

  function renderSection() {
    const sec = state.section;
    $('sectionEnable').checked = sec.enable;
    $('sectionColor').value = toInputColor(sec.color);
    $('sectionOpacity').value = sec.opacity;
    $('sectionOpacityValue').textContent = Math.round(sec.opacity * 100) + '%';
    const preview = $('sectionPreview');
    preview.innerHTML = '';
    for (const text of ['obj.draw()', '', '@スクリプト2', '--track@size:サイズ,0,500,100']) {
      const div = document.createElement('div');
      div.textContent = text || ' ';
      if (sec.enable && text.startsWith('@')) div.style.background = rgba(sec.color, sec.opacity);
      preview.append(div);
    }
  }
  $('sectionEnable').addEventListener('change', e => { state.section.enable = e.target.checked; renderSection(); send({ type: 'section', key: 'enable', value: e.target.checked }); });
  $('sectionColor').addEventListener('input', e => {
    state.section.color = e.target.value;
    renderSection();
    debounce('section:color', () => send({ type: 'section', key: 'color', value: state.section.color }));
  });
  $('sectionOpacity').addEventListener('input', e => {
    state.section.opacity = Number(e.target.value);
    renderSection();
    debounce('section:opacity', () => send({ type: 'section', key: 'opacity', value: state.section.opacity }));
  });
  $('resetSection').addEventListener('click', () => send({ type: 'resetSection' }));

  function renderShader() {
    const sh = state.shader;
    $('shaderEnable').checked = sh.enable;
    $('shaderColor').value = toInputColor(sh.color);
    $('shaderOpacity').value = sh.opacity;
    $('shaderOpacityValue').textContent = Math.round(sh.opacity * 100) + '%';
    const preview = $('shaderPreview');
    preview.innerHTML = '';
    const lines = ['--[[pixelshader@psmain:', 'float4 psmain(float4 pos : SV_Position) : SV_Target {', '    return float4(1, 0, 0, 1);', '}', ']]', 'obj.pixelshader("psmain", "object", {})'];
    lines.forEach((text, i) => {
      const div = document.createElement('div');
      div.textContent = text;
      if (sh.enable && i <= 4) div.style.background = rgba(sh.color, sh.opacity);
      preview.append(div);
    });
  }
  $('shaderEnable').addEventListener('change', e => { state.shader.enable = e.target.checked; renderShader(); send({ type: 'shader', key: 'enable', value: e.target.checked }); });
  $('shaderColor').addEventListener('input', e => {
    state.shader.color = e.target.value;
    renderShader();
    debounce('shader:color', () => send({ type: 'shader', key: 'color', value: state.shader.color }));
  });
  $('shaderOpacity').addEventListener('input', e => {
    state.shader.opacity = Number(e.target.value);
    renderShader();
    debounce('shader:opacity', () => send({ type: 'shader', key: 'opacity', value: state.shader.opacity }));
  });
  $('resetShader').addEventListener('click', () => send({ type: 'resetShader' }));
  $('openJson').addEventListener('click', () => send({ type: 'openJson' }));

  window.addEventListener('message', e => {
    if (e.data.type !== 'state') return;
    state = e.data.state;
    state.group.colors = [...state.group.colors];
    renderTokens();
    renderInlay();
    renderSection();
    renderShader();
    renderGroup();
  });
</script>
</body>
</html>`;
}

function register(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('aviutl2.customizeColors', () => openPanel(context)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aviutl2.tokenColors') || e.affectsConfiguration('aviutl2.tokenFontStyles')) {
        syncTokenColors().catch(err => vscode.window.showErrorMessage(`色設定の反映に失敗しました: ${err.message}`));
      }
    })
  );
  syncTokenColors().catch(() => {});
}

module.exports = { register, syncTokenColors };
