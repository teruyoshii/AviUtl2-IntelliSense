// テスト用の最小限の vscode モジュールのモック
class Position {
  constructor(line, character) { this.line = line; this.character = character; }
}
class Range {
  constructor(a, b, c, d) {
    if (a instanceof Position) { this.start = a; this.end = b; } else { this.start = new Position(a, b); this.end = new Position(c, d); }
  }
}
class MarkdownString { constructor(value) { this.value = value; } }
class SnippetString { constructor(value) { this.value = value; } }
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class SignatureHelp { constructor() { this.signatures = []; } }
class SignatureInformation { constructor(label, documentation) { this.label = label; this.documentation = documentation; this.parameters = []; } }
class ParameterInformation { constructor(label, documentation) { this.label = label; this.documentation = documentation; } }
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
class DocumentSymbol {
  constructor(name, detail, kind, range, selectionRange) { Object.assign(this, { name, detail, kind, range, selectionRange, children: [] }); }
}
class Color { constructor(red, green, blue, alpha) { Object.assign(this, { red, green, blue, alpha }); } }
class ColorInformation { constructor(range, color) { this.range = range; this.color = color; } }
class ColorPresentation { constructor(label) { this.label = label; } }
class FoldingRange { constructor(start, end, kind) { Object.assign(this, { start, end, kind }); } }
class InlayHint { constructor(position, label, kind) { Object.assign(this, { position, label, kind }); } }
class EventEmitter { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} }
class Diagnostic { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } }

const enumProxy = () => new Proxy({}, { get: (_, key) => key });

const providers = {};
const config = {};

// テキストからドキュメントを作る(解析キャッシュが混ざらないようURIは毎回別にする)
let documentCount = 0;
function createDocument(text, fileName = 'test.anm2') {
  const lines = text.split('\n');
  const starts = [0];
  for (let i = 0; i < lines.length - 1; i++) starts.push(starts[i] + lines[i].length + 1);
  const uri = `file:///${++documentCount}/${fileName}`;
  const doc = {
    uri: { toString: () => uri },
    fileName,
    version: 1,
    lineCount: lines.length,
    lineAt: line => ({ text: lines[line] }),
    offsetAt: pos => starts[pos.line] + pos.character,
    positionAt: offset => {
      let line = 0;
      while (line + 1 < starts.length && starts[line + 1] <= offset) line++;
      return new Position(line, offset - starts[line]);
    },
    getText: range => range ? text.slice(doc.offsetAt(range.start), doc.offsetAt(range.end)) : text,
    getWordRangeAtPosition: (pos, regex) => {
      const re = new RegExp(regex.source, 'g');
      const line = lines[pos.line];
      for (const m of line.matchAll(re)) {
        if (m.index <= pos.character && pos.character <= m.index + m[0].length) {
          return new Range(pos.line, m.index, pos.line, m.index + m[0].length);
        }
      }
      return undefined;
    },
  };
  return doc;
}

module.exports = {
  Position, Range, MarkdownString, SnippetString, CompletionItem, SignatureHelp, SignatureInformation,
  ParameterInformation, Hover, Location, DocumentSymbol, Color, ColorInformation, ColorPresentation, Diagnostic, FoldingRange, InlayHint, EventEmitter,
  InlayHintKind: { Type: 1, Parameter: 2 },
  FoldingRangeKind: { Region: 3 },
  CompletionItemKind: enumProxy(),
  SymbolKind: enumProxy(),
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  workspace: {
    onDidChangeConfiguration: () => ({ dispose() {} }),
    getConfiguration: () => ({ get: (key, dflt) => (key in config ? config[key] : dflt) }),
  },
  languages: {
    registerCompletionItemProvider: (sel, p) => { providers.completion = p; },
    registerSignatureHelpProvider: (sel, p) => { providers.signature = p; },
    registerHoverProvider: (sel, p) => { providers.hover = p; },
    registerDefinitionProvider: (sel, p) => { providers.definition = p; },
    registerDocumentSymbolProvider: (sel, p) => { providers.symbols = p; },
    registerColorProvider: (sel, p) => { providers.colors = p; },
    registerFoldingRangeProvider: (sel, p) => { providers.folding = p; },
    registerInlayHintsProvider: (sel, p) => { providers.inlayHints = p; },
  },
  // テスト用
  _providers: providers,
  _config: config,
  _createDocument: createDocument,
};
