'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

class Position { constructor(line, character) { this.line = line; this.character = character; } translate(dl = 0, dc = 0) { return new Position(this.line + dl, this.character + dc); } }
class Range { constructor(start, end, endLine, endChar) { if (typeof start === 'number') { this.start = new Position(start, end); this.end = new Position(endLine, endChar); } else { this.start = start; this.end = end; } } }
class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class MarkdownString { constructor(value = '') { this.value = value; } appendCodeblock(value) { this.value += value; } appendMarkdown(value) { this.value += value; } }
class SnippetString { constructor(value = '') { this.value = value; } }
class TextEdit { static replace(range, newText) { return { range, newText }; } }
const toolkit = path.resolve(__dirname, '..', '..');
const configurationValues = {};
const vscodeMock = {
  Position, Range, Location, CompletionItem, MarkdownString, SnippetString, TextEdit,
  Uri: { file: fsPath => ({ fsPath: path.resolve(fsPath) }) },
  SymbolKind: { Function:1, Method:2, Constant:3, Struct:4, Field:5, Module:6, Variable:7 },
  CompletionItemKind: { Function:1, Method:2, Constant:3, Class:4, Struct:5, Field:6, Module:7, Variable:8, Keyword:9, Property:10, Folder:11, File:12 },
  window: { activeTextEditor: null },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: toolkit } }],
    getConfiguration: () => ({ get: (name, fallback) => Object.prototype.hasOwnProperty.call(configurationValues, name) ? configurationValues[name] : fallback })
  }
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};
const extension = require('./extension');
Module._load = originalLoad;

const grammarText = fs.readFileSync(path.join(__dirname, 'syntaxes', 'lazyscriptex.tmLanguage.json'), 'utf8');
const grammar = JSON.parse(grammarText);
assert(grammarText.includes('keyword.declaration.lshtml.lazyscriptex'), 'LSHTML keyword does not have a declaration-keyword scope');
assert(grammarText.includes('keyword.declaration.lscss.lazyscriptex'), 'LSCSS keyword does not have a declaration-keyword scope');
assert(grammarText.includes('meta.selector.lscss.lazyscriptex'), 'direct LSCSS selector scope is missing');
assert(grammarText.includes('meta.parameter.typed.dot.lazyscriptex'), 'dot parameter type scope is missing');
assert(grammarText.includes('struct|lshtml|lscss'), 'LSHTML/LSCSS keyword fallback is missing from the grammar');


const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-extension-'));
const source = path.join(sourceDir, 'main.lsx');
fs.writeFileSync(source, `
use "@LazyScript/bindings/Data/Json.lsx" as Json
use "@LazyScript/bindings/System/Threading.lsx" as Threading

fn worker(context)
    return 0
end

fn main()
    local document = Json.load("assets/data.json")
    local value = document.get(document.root,"name")
    local task = Threading.Thread.start(worker,null)
    task.join()
    return value
end
`);

const record = extension._test.loadRecordSync(source);
assert(record, 'main source was not indexed');
const jsonLoad = extension._test.resolveChain(record, ['Json', 'load']);
assert(jsonLoad && jsonLoad.symbol.name === 'load', 'Json.load did not resolve');
assert(jsonLoad.record.uri.fsPath.endsWith(path.join('bindings', 'Data', 'Json.lsx')), 'Json.load resolved to the wrong file');
const documentGet = extension._test.resolveChain(record, ['document', 'get']);
assert(documentGet && documentGet.parent.name === 'Document' && documentGet.symbol.name === 'get', 'document.get instance method did not resolve through Json.load return type');
const threadStart = extension._test.resolveChain(record, ['Threading', 'Thread', 'start']);
assert(threadStart && threadStart.parent.name === 'Thread', 'Threading.Thread.start did not resolve');
const taskJoin = extension._test.resolveChain(record, ['task', 'join']);
assert(taskJoin && taskJoin.parent.name === 'Thread' && taskJoin.symbol.name === 'join', 'task.join instance method did not resolve through Thread.start');
assert(taskJoin.symbol.documentation.length > 10, 'method IntelliSense documentation is missing');

const uiSource = path.join(sourceDir, 'ui.lsx');
fs.writeFileSync(uiSource, `
lscss .inspector = {
    width = {props.width}
    background = "linear-gradient(135deg, #181b22, #222938)"
}

lscss .orb = {
    background = {props.accent}
}

lshtml inspector(props) = {(
    <panel id="inspector" class="inspector">
        <button onclick={save_clicked}>Save</button>
        <canvas id="preview">
            <rect class="card" x="20" y="20" width="240" height="120" />
            <circle class="orb" cx="340" cy="80" r="48" />
            <canvas-text x="40" y="60">Preview</canvas-text>
        </canvas>
    </panel>
)}

fn save_clicked(element,event,props)
    return 0
end
`);
const uiRecord = extension._test.loadRecordSync(uiSource);
assert(uiRecord.symbols.some(symbol => symbol.name === '.inspector' && symbol.kind === 'object'), 'LSCSS declaration was not indexed');
assert(uiRecord.symbols.some(symbol => symbol.name === '.orb' && symbol.kind === 'object'), 'second LSCSS declaration was not indexed');
assert(uiRecord.symbols.some(symbol => symbol.name === 'inspector' && symbol.kind === 'function'), 'LSHTML declaration was not indexed');


function mockDocument(text) {
  const lines = text.split('\n');
  return {
    getText: range => {
      if (!range) return text;
      const start = (() => { let value = 0; for (let i = 0; i < range.start.line; i++) value += lines[i].length + 1; return value + range.start.character; })();
      const end = (() => { let value = 0; for (let i = 0; i < range.end.line; i++) value += lines[i].length + 1; return value + range.end.character; })();
      return text.slice(start, end);
    },
    offsetAt(position) {
      let offset = 0;
      for (let i = 0; i < position.line; i++) offset += lines[i].length + 1;
      return offset + position.character;
    },
    lineAt(line) { const value = lines[line] || ''; return { text: value, range: new Range(new Position(line, 0), new Position(line, value.length)) }; },
    lineCount: lines.length,
    getWordRangeAtPosition() { return null; },
    uri: { fsPath: uiSource }
  };
}


const importCompletionText = 'use "@LazyScript/bindings/Math/';
const importCompletionDoc = {
  ...mockDocument(importCompletionText),
  uri: { fsPath: source }
};
const importItems = extension._test.importCompletionItems(importCompletionDoc, new Position(0, importCompletionText.length));
assert(importItems && importItems.some(item => item.label === 'GLM.lsx'), 'named-root import completion is missing GLM.lsx');
assert(importItems.some(item => item.label === 'Camera.lsx'), 'named-root import completion is missing Camera.lsx');
const rootArgs = extension._test.compilerModuleRootArgs(source);
assert(rootArgs.includes('--lazy-script-root'), 'compiler diagnostics do not receive the selected/discovered LazyScript root');

const sharedEngine = path.join(sourceDir, 'SharedEngine');
const sharedWindow = path.join(sharedEngine, 'Window');
fs.mkdirSync(sharedWindow, { recursive: true });
fs.writeFileSync(path.join(sharedWindow, 'WindowManager.lsx'), 'export const WindowManager = { title = "Window" }\n');
configurationValues.moduleRoots = { Engine: sharedEngine };
const customImportText = 'use "@Engine/Window/';
const customImportDoc = { ...mockDocument(customImportText), uri: { fsPath: source } };
const customImportItems = extension._test.importCompletionItems(customImportDoc, new Position(0, customImportText.length));
assert(customImportItems && customImportItems.some(item => item.label === 'WindowManager.lsx'), 'custom named-root import completion is missing a recursively nested LSX file');
const customResolved = extension.resolveImport('@Engine/Window/WindowManager.lsx', source);
assert.strictEqual(path.resolve(customResolved), path.resolve(sharedWindow, 'WindowManager.lsx'), 'custom named module root did not resolve from extension settings');
const customRootArgs = extension._test.compilerModuleRootArgs(source);
assert(customRootArgs.includes('--module-root') && customRootArgs.includes(`Engine=${sharedEngine}`), 'custom named module root is not passed to compiler diagnostics');
configurationValues.moduleRoots = {};

const tagCompletionText = 'lshtml view(props) = {(\n    <ui>\n        <';
const tagCompletionDoc = mockDocument(tagCompletionText);
const tagPosition = new Position(2, 9);
const tagItems = extension._test.lshtmlCompletionItems(tagCompletionDoc, tagPosition);
assert(tagItems && tagItems.some(item => item.label === 'panel'), 'LSHTML <tag completion is missing panel');
assert(tagItems.some(item => item.label === 'canvas'), 'LSHTML <tag completion is missing canvas');

const partialTagText = 'lshtml view(props) = {(\n    <ui';
const partialTagDoc = mockDocument(partialTagText);
const partialTagItems = extension._test.lshtmlCompletionItems(partialTagDoc, new Position(1, 7));
assert(partialTagItems && partialTagItems.some(item => item.label === 'ui'), 'LSHTML partial <ui completion is missing');
assert(partialTagItems.some(item => item.label === 'panel'), 'LSHTML partial tag completion did not keep the full element list available');
const extensionSourceText = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
assert(extensionSourceText.includes("...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'"), 'LSHTML completion does not retrigger while typing tag names');

const attrCompletionText = 'lshtml view(props) = {(\n    <button ';
const attrCompletionDoc = mockDocument(attrCompletionText);
const attrItems = extension._test.lshtmlCompletionItems(attrCompletionDoc, new Position(1, 12));
assert(attrItems && attrItems.some(item => item.label === 'onclick'), 'LSHTML attribute completion is missing onclick');
assert(attrItems.some(item => item.label === 'class'), 'LSHTML attribute completion is missing class');

const closeCompletionText = 'lshtml view(props) = {(\n    <panel>\n        </';
const closeCompletionDoc = mockDocument(closeCompletionText);
const closeItems = extension._test.lshtmlCompletionItems(closeCompletionDoc, new Position(2, 10));
assert(closeItems && closeItems[0].label === 'panel', 'LSHTML closing-tag completion did not prefer the nearest open tag');


const lscssCompletionText = 'lscss .inventory = {\n    over';
const lscssCompletionDoc = mockDocument(lscssCompletionText);
const lscssItems = extension._test.lscssCompletionItems(lscssCompletionDoc, new Position(1, 8));
assert(lscssItems && lscssItems.some(item => item.label === 'overflow_y'), 'LSCSS completion is missing overflow_y');
assert(lscssItems.some(item => item.label === 'flex_shrink'), 'LSCSS completion is missing flex_shrink');
const overflowHover = extension._test.markdownForLscssProperty('overflow_y');
assert(overflowHover && overflowHover.value.includes('working scrollbar'), 'LSCSS overflow_y tooltip does not explain how to create a scrollbar');

extension._test.loadApiMetadata();
const lazyUiBinding = extension._test.loadRecordSync(path.join(toolkit, 'LazyScript', 'bindings', 'UI', 'LazyUI.lsx'));
const canvasCommand = lazyUiBinding.exports.find(symbol => symbol.name === 'CanvasCommand');
assert(canvasCommand, 'CanvasCommand was not indexed');
const canvasCommandHover = extension._test.markdownForSymbol(lazyUiBinding, canvasCommand);
assert(canvasCommandHover.value.includes('CanvasContext converts friendly calls'), 'CanvasCommand hover does not explain what creates it');
assert(canvasCommandHover.value.includes('What it contains'), 'CanvasCommand hover does not explain its stored data');
assert(canvasCommandHover.value.includes('How you get one'), 'CanvasCommand hover does not explain the real creation path');
assert(canvasCommandHover.value.includes('Normal game/UI code should not call CanvasCommand.new()'), 'CanvasCommand hover does not warn beginners away from internal construction');

const diagnostics = extension._test.parseCompilerDiagnostics(JSON.stringify({kind:'diagnostic',severity:'error',code:'LSX2200',message:"unknown function 'fly'",hint:'Check spelling and capitalization.',file:source,line:9,column:18,endLine:9,endColumn:21,sourceLine:'    player.fly()'}) + '\n');
assert(diagnostics.length === 1, 'JSON compiler diagnostic was not parsed');
assert(diagnostics[0].code === 'LSX2200', 'compiler diagnostic code was not preserved');
assert(diagnostics[0].hint.includes('spelling'), 'compiler diagnostic hint was not preserved');


const localCompletionSource = `const WindowManager = {
    windowHandle = 0

    CreateWindow = fn(width,height,title)
        local requestedWidth = width
        if width > 0 then
            local requestedHeight = height
            self.windowHandle = 0
            wid
        end
    end
}
`;
const localCompletionDoc = {
  ...mockDocument(localCompletionSource),
  uri: { fsPath: path.join(sourceDir, 'WindowManager.lsx') }
};
const localPosition = new Position(8, 15);
const visibleLocals = extension._test.collectVisibleScopeSymbols(localCompletionDoc, localPosition);
for (const expected of ['self', 'width', 'height', 'title', 'requestedWidth', 'requestedHeight']) {
  assert(visibleLocals.some(symbol => symbol.name === expected), `current-scope completion is missing ${expected}`);
}
const localProviderItems = new extension._test.CompletionProvider().provideCompletionItems(localCompletionDoc, localPosition);
assert(localProviderItems.some(item => (item.label.label || item.label) === 'width'), 'function parameter completion is missing width');
assert(localProviderItems.some(item => (item.label.label || item.label) === 'requestedWidth'), 'local variable completion is missing requestedWidth');

assert(extension._test.shouldAutoTriggerSuggestions(localCompletionDoc, localPosition, 't'), 'automatic local suggestion trigger did not activate inside an object method');
const exactUserSource = `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
export static const WindowManager = {
    windowHandle = 0
    CreateWindow = fn(width,height,title)
        self.windowHandle = GLFW.glfwCreateWindow(widt,720,title,0,0)
    end
}
`;
const exactUserDoc = { ...mockDocument(exactUserSource), uri: { fsPath: path.join(sourceDir, 'ExactWindowManager.lsx') } };
const exactLine = 4;
const exactCharacter = exactUserSource.split('\n')[exactLine].indexOf('widt') + 4;
const exactItems = new extension._test.CompletionProvider().provideCompletionItems(exactUserDoc, new Position(exactLine, exactCharacter));
for (const expected of ['width', 'height', 'title']) {
  assert(exactItems.some(item => (item.label.label || item.label) === expected), `exact function-call completion is missing ${expected}`);
}
const exactWidth = exactItems.find(item => (item.label.label || item.label) === 'width');
assert(exactWidth.range && exactWidth.range.start.character === exactCharacter - 4, 'parameter completion does not replace the currently typed identifier');
assert(exactItems.some(item => (item.label.label || item.label) === 'self.windowHandle'), 'current object fields are not offered as self.field suggestions');
const selfCompletionDoc = {
  ...mockDocument(localCompletionSource.replace('            wid', '            self.')),
  uri: { fsPath: path.join(sourceDir, 'WindowManagerSelf.lsx') }
};
const selfItems = new extension._test.CompletionProvider().provideCompletionItems(selfCompletionDoc, new Position(8, 17));
assert(selfItems.some(item => (item.label.label || item.label) === 'windowHandle'), 'self member completion is missing windowHandle');

const unformatted = `const WindowManager = {
windowHandle = 0
CreateWindow = fn(width,height,title)
if width > 0 then
self.windowHandle = GLFW.glfwCreateWindow(
width,
height,
title,
0,
0
)
end
end
}
`;
const formatted = extension._test.formatLsxText(unformatted, { insertSpaces: true, tabSize: 4 });
assert(formatted.includes('    CreateWindow = fn(width, height, title)'), 'formatter did not indent an object method');
assert(formatted.includes('        if width > 0 then'), 'formatter did not indent an if block');
assert(formatted.includes('            self.windowHandle = GLFW.glfwCreateWindow('), 'formatter did not indent code inside the if block');
assert(formatted.includes('                width,'), 'formatter did not indent multiline arguments');
assert(formatted.includes('            )\n        end\n    end\n}'), 'formatter did not align closing delimiters and end statements');

const spacingFormatted = extension._test.formatLsxText(`fn main()
local width=1280
if width==1280 then
local ok=true
end
end
`, { insertSpaces: true, tabSize: 4 });
assert(spacingFormatted.includes('local width = 1280'), 'formatter did not normalize assignment spacing');
assert(spacingFormatted.includes('if width == 1280 then'), 'formatter did not normalize comparison spacing');
const markupFormatted = extension._test.formatLsxText(`lshtml view() = {(
<button id="save" onclick={save}>Save</button>
)}
`, { insertSpaces: true, tabSize: 4 });
assert(markupFormatted.includes('id="save"'), 'formatter changed LSHTML attribute syntax');
assert(!markupFormatted.includes('id = "save"'), 'formatter inserted LSX assignment spacing into LSHTML markup');

const snippetsText = fs.readFileSync(path.join(__dirname, 'snippets', 'lazyscriptex.json'), 'utf8');
const snippets = JSON.parse(snippetsText);
const canvasSnippet = snippets['Declarative LazyUI canvas'];
assert(canvasSnippet && canvasSnippet.body.some(line => line.includes('<rect class="${2:preview-shape}"')), 'declarative canvas snippet is missing');
assert(!snippetsText.includes('context.fill_rounded_rect'), 'extension still advertises imperative canvas drawing');
assert(canvasSnippet.body.some(line => line.includes('background = {${3:props.accent}}')), 'LSCSS {var} snippet is missing');

// Static objects are indexed as one shared service and their methods resolve
// directly through an imported module without suggesting .new().
const staticServiceFile = path.join(sourceDir, 'StaticService.lsx');
fs.writeFileSync(staticServiceFile, `
export static const StaticService = {
    value = 0
    SetValue = fn(value)
        self.value = value
    end
}
`);
const staticConsumerFile = path.join(sourceDir, 'StaticConsumer.lsx');
fs.writeFileSync(staticConsumerFile, `
use "StaticService.lsx" as ServiceMod
fn main()
    ServiceMod.StaticService.SetValue(4)
    return ServiceMod.StaticService.value
end
`);
const staticServiceRecord = extension._test.loadRecordSync(staticServiceFile);
const staticServiceSymbol = staticServiceRecord.exports.find(symbol => symbol.name === 'StaticService');
assert(staticServiceSymbol?.staticObject, 'static const object was not marked as a static object');
assert(staticServiceSymbol.signature.startsWith('static const'), 'static object hover signature is missing static');
const staticConsumerRecord = extension._test.loadRecordSync(staticConsumerFile);
const staticMethod = extension._test.resolveChain(staticConsumerRecord, ['ServiceMod', 'StaticService', 'SetValue']);
assert(staticMethod?.symbol?.name === 'SetValue', 'imported static object method did not resolve');
assert(staticMethod.parent?.staticObject, 'static method parent lost its static-object identity');
const staticFormatted = extension._test.formatLsxText(`export static const App = {\nrunning = true\nStop = fn()\nself.running = false\nend\n}\n`, { insertSpaces: true, tabSize: 4 });
assert(staticFormatted.includes('export static const App = {'), 'formatter damaged static const declaration');
assert(grammarText.includes('export|static|local|const'), 'syntax grammar does not highlight static');

const staticMethodHover = extension._test.markdownForSymbol(staticServiceRecord, staticMethod.symbol, staticMethod.parent);
assert(staticMethodHover.value.includes('Static object'), 'static method hover does not explain direct singleton calls');
assert(staticMethodHover.value.includes('Do not create it with `.new()`'), 'static method hover does not warn against .new()');

console.log('LazyScriptEX extension navigation, forced local-scope completion, formatting, static objects, LSHTML/LSCSS, and inferred member tests passed.');
