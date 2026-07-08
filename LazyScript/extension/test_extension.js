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
const toolkit = path.resolve(__dirname, '..', '..');
const vscodeMock = {
  Position, Range, Location, CompletionItem, MarkdownString, SnippetString,
  Uri: { file: fsPath => ({ fsPath: path.resolve(fsPath) }) },
  SymbolKind: { Function:1, Method:2, Constant:3, Struct:4, Field:5, Module:6, Variable:7 },
  CompletionItemKind: { Function:1, Method:2, Constant:3, Class:4, Struct:5, Field:6, Module:7, Variable:8, Keyword:9, Property:10 },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: toolkit } }],
    getConfiguration: () => ({ get: (_name, fallback) => fallback })
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
    getText: () => text,
    offsetAt(position) {
      let offset = 0;
      for (let i = 0; i < position.line; i++) offset += lines[i].length + 1;
      return offset + position.character;
    },
    lineAt(line) { return { text: lines[line] || '' }; },
    getWordRangeAtPosition() { return null; },
    uri: { fsPath: uiSource }
  };
}

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

const snippetsText = fs.readFileSync(path.join(__dirname, 'snippets', 'lazyscriptex.json'), 'utf8');
const snippets = JSON.parse(snippetsText);
const canvasSnippet = snippets['Declarative LazyUI canvas'];
assert(canvasSnippet && canvasSnippet.body.some(line => line.includes('<rect class="${2:preview-shape}"')), 'declarative canvas snippet is missing');
assert(!snippetsText.includes('context.fill_rounded_rect'), 'extension still advertises imperative canvas drawing');
assert(canvasSnippet.body.some(line => line.includes('background = {${3:props.accent}}')), 'LSCSS {var} snippet is missing');
console.log('LazyScriptEX extension navigation, LSHTML/LSCSS symbols, and inferred member tests passed.');
