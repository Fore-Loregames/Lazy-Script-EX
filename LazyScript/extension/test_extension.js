'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const cp = require('child_process');

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


const sourceCompilerPath = path.join(toolkit, 'LazyScript', 'compiler', 'lazyscriptex.js');
const bundledCompilerPath = path.join(__dirname, 'compiler', 'lazyscriptex.js');
assert.strictEqual(
  fs.readFileSync(bundledCompilerPath, 'utf8'),
  fs.readFileSync(sourceCompilerPath, 'utf8'),
  'VS Code extension compiler is not synchronized with the source compiler',
);

const unanchoredBehaviorSource = path.join(sourceDir, 'UnanchoredBehavior.lsx');
fs.writeFileSync(unanchoredBehaviorSource, `export const GameObject = {
    lazyBehaviors = {}
    AddLazyBehavior = fn(behavior)
        self.lazyBehaviors.push(behavior)
        behavior.Start()
    end
    Update = fn()
        for behavior in self.lazyBehaviors do
            behavior.Update()
        end
    end
}
`);
const bundledBehaviorCheck = cp.spawnSync(process.execPath, [bundledCompilerPath, 'check', unanchoredBehaviorSource, '--diagnostics=json'], { encoding: 'utf8' });
assert.strictEqual(bundledBehaviorCheck.status, 0, bundledBehaviorCheck.stderr || bundledBehaviorCheck.stdout);
assert(!`${bundledBehaviorCheck.stdout}
${bundledBehaviorCheck.stderr}`.includes("unknown module or API namespace 'behavior'"), 'bundled extension compiler still treats local behavior values as namespaces');
const bundledVersion = cp.spawnSync(process.execPath, [bundledCompilerPath, '--version'], { encoding: 'utf8' });
assert.strictEqual(bundledVersion.status, 0, bundledVersion.stderr);
assert.strictEqual(bundledVersion.stdout.trim(), '0.18.16', 'extension did not bundle compiler 0.18.16');

const runtimeTypeDir = path.join(sourceDir, 'RuntimeTypes');
fs.mkdirSync(runtimeTypeDir, { recursive: true });
fs.writeFileSync(path.join(runtimeTypeDir, 'LazyBehavior.lsx'), `export const LazyBehavior = {
    Start = fn()
    end
}
`);
fs.writeFileSync(path.join(runtimeTypeDir, 'Transform.lsx'), `use "LazyBehavior.lsx" as B
export const Transform : base(B.LazyBehavior) = {
    x = 0
}
`);
const runtimeTypeEntry = path.join(runtimeTypeDir, 'main.lsx');
fs.writeFileSync(runtimeTypeEntry, `use "LazyBehavior.lsx" as B
use "Transform.lsx" as T
fn main()
    local behavior = T.Transform.new()
    local name = behavior.GetTypeName()
    local exact = behavior.IsType("Transform")
    local inherited = behavior.IsType("LazyBehavior")
    behavior.destroy()
    if name == null or exact == false or inherited == false then return 1 end
    return 0
end
`);
const bundledRuntimeTypeCheck = cp.spawnSync(process.execPath, [bundledCompilerPath, 'check', runtimeTypeEntry, '--diagnostics=json'], { encoding: 'utf8' });
assert.strictEqual(bundledRuntimeTypeCheck.status, 0, bundledRuntimeTypeCheck.stderr || bundledRuntimeTypeCheck.stdout);

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



function completionReplaceRange(item) {
  return item?.range?.replacing || item?.range || null;
}

function applyCompletionToText(sourceText, document, item) {
  const range = completionReplaceRange(item);
  assert(range, 'completion item is missing a replacement range');
  const start = document.offsetAt(range.start);
  const end = document.offsetAt(range.end);
  const insertText = item.insertText instanceof SnippetString ? item.insertText.value : String(item.insertText ?? (item.label?.label || item.label || ''));
  const plainText = insertText.replace(/\$\{\d+:([^}]+)\}/g, '$1').replace(/\$\d+/g, '');
  return sourceText.slice(0, start) + plainText + sourceText.slice(end);
}

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

const projectCheckDir = path.join(sourceDir, 'ProjectCheck');
const projectCheckSourceDir = path.join(projectCheckDir, 'src');
fs.mkdirSync(projectCheckSourceDir, { recursive: true });
const projectCheckConfig = path.join(projectCheckDir, 'lazyscriptex.json');
const projectCheckSource = path.join(projectCheckSourceDir, 'GameObject.lsx');
fs.writeFileSync(projectCheckConfig, JSON.stringify({ entry: 'src/GameObject.lsx', output: 'build/check.exe' }, null, 2));
fs.writeFileSync(projectCheckSource, 'export const GameObject = {}\n');
const projectCheckContext = extension._test.compilerCheckContext(projectCheckSource);
assert.strictEqual(projectCheckContext.target, projectCheckConfig, 'compiler checks inside a project should use lazyscriptex.json so call-site inference is available');
assert.strictEqual(projectCheckContext.command, 'check-project', 'project-aware diagnostics should call the compiler project checker');
assert.strictEqual(projectCheckContext.cwd, projectCheckDir, 'project-aware compiler checks should run from the project root');

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
const getTypeApi = extension._test.apiByKey.get('language/inheritance||gettypename');
const isTypeApi = extension._test.apiByKey.get('language/inheritance||istype');
assert(getTypeApi?.module === 'Language/Inheritance', 'GetTypeName is missing from the inheritance API metadata');
assert(isTypeApi?.module === 'Language/Inheritance', 'IsType is missing from the inheritance API metadata');
assert(getTypeApi?.audience === 'frontend', 'GetTypeName must remain in the beginner front-end API');
assert(isTypeApi?.audience === 'frontend', 'IsType must remain in the beginner front-end API');
const propertyHashApi = extension._test.apiByKey.get('ui/lazyui|binding|property_hash');
assert(propertyHashApi?.audience === 'backend', 'LazyUI property_hash must be hidden from the beginner front-end API');
const buttonFactoryApi = extension._test.apiByKey.get('ui/lazyui||button');
assert(buttonFactoryApi?.module === 'LazyUI/Programmatic elements', 'UI.button metadata did not keep its beginner-facing programmatic element group');
assert(buttonFactoryApi?.audience === 'frontend', 'UI.button must remain in the beginner front-end API');
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
const exactWidthRange = completionReplaceRange(exactWidth);
assert(exactWidthRange && exactWidthRange.start.character === exactCharacter - 4, 'parameter completion does not replace the currently typed identifier');
assert(exactItems.some(item => (item.label.label || item.label) === 'self.windowHandle'), 'current object fields are not offered as self.field suggestions');
const selfCompletionDoc = {
  ...mockDocument(localCompletionSource.replace('            wid', '            self.')),
  uri: { fsPath: path.join(sourceDir, 'WindowManagerSelf.lsx') }
};
const selfItems = new extension._test.CompletionProvider().provideCompletionItems(selfCompletionDoc, new Position(8, 17));
assert(selfItems.some(item => (item.label.label || item.label) === 'windowHandle'), 'self member completion is missing windowHandle');

const objectTypeCompletionSource = `const GameObject = {
    AddLazyBehavior = fn(behavior)
        behavior.
    end
}
`;
const objectTypeCompletionDoc = {
  ...mockDocument(objectTypeCompletionSource),
  uri: { fsPath: path.join(sourceDir, 'ObjectTypeCompletion.lsx') }
};
const objectTypeItems = new extension._test.CompletionProvider().provideCompletionItems(objectTypeCompletionDoc, new Position(2, '        behavior.'.length));
for (const expected of ['GetTypeName', 'IsType']) {
  assert(objectTypeItems.some(item => (item.label.label || item.label) === expected), `compiler-provided object completion is missing ${expected}`);
}
const objectTypeHit = extension._test.resolveObjectBuiltinChain(extension._test.loadRecordSync(unanchoredBehaviorSource), ['behavior', 'IsType']);
assert(objectTypeHit?.symbol?.signature === 'IsType(typeName) -> bool', 'IsType hover/signature metadata did not resolve');

const partialObjectTypeSource = objectTypeCompletionSource.replace('behavior.', 'behavior.us');
const partialObjectTypeDoc = {
  ...mockDocument(partialObjectTypeSource),
  uri: { fsPath: path.join(sourceDir, 'ObjectTypePartialCompletion.lsx') }
};
const partialObjectTypeLine = 2;
const partialObjectTypePosition = new Position(partialObjectTypeLine, '        behavior.us'.length);
const partialObjectTypeItems = new extension._test.CompletionProvider().provideCompletionItems(partialObjectTypeDoc, partialObjectTypePosition);
const partialIsType = partialObjectTypeItems.find(item => (item.label.label || item.label) === 'IsType');
assert(partialIsType, 'partial object-method completion is missing IsType');
const partialIsTypeRange = completionReplaceRange(partialIsType);
assert(partialIsTypeRange, 'partial object-method completion has no replacement range');
assert.strictEqual(partialObjectTypeDoc.getText(partialIsTypeRange), 'us', 'partial object-method completion inserts after the typed fragment instead of replacing it');
const partialApplied = applyCompletionToText(partialObjectTypeSource, partialObjectTypeDoc, partialIsType);
assert(partialApplied.includes('behavior.IsType(typeName)'), `partial object-method completion produced ${partialApplied}`);
assert(!partialApplied.includes('behavior.usIsType'), 'partial object-method completion still appends after the typed fragment');

const selectedRange = new Range(new Position(partialObjectTypeLine, '        behavior.'.length), partialObjectTypePosition);
vscodeMock.window.activeTextEditor = {
  document: partialObjectTypeDoc,
  selection: { start: selectedRange.start, end: selectedRange.end, active: selectedRange.end }
};
const selectedObjectTypeItems = new extension._test.CompletionProvider().provideCompletionItems(partialObjectTypeDoc, partialObjectTypePosition);
const selectedIsType = selectedObjectTypeItems.find(item => (item.label.label || item.label) === 'IsType');
const selectedIsTypeRange = completionReplaceRange(selectedIsType);
assert(selectedIsTypeRange, 'selected object-method completion has no replacement range');
assert.strictEqual(selectedIsTypeRange.start.character, selectedRange.start.character, 'completion did not replace the full highlighted selection');
assert.strictEqual(selectedIsTypeRange.end.character, selectedRange.end.character, 'completion selection replacement ended at the wrong position');

// Reverse-direction selections must replace too. VS Code may report the completion
// position at either edge depending on how the user highlighted the partial word.
vscodeMock.window.activeTextEditor = {
  document: partialObjectTypeDoc,
  selection: { start: selectedRange.start, end: selectedRange.end, active: selectedRange.start }
};
const reverseSelectedItems = new extension._test.CompletionProvider().provideCompletionItems(partialObjectTypeDoc, selectedRange.start);
const reverseSelectedIsType = reverseSelectedItems.find(item => (item.label.label || item.label) === 'IsType');
const reverseRange = completionReplaceRange(reverseSelectedIsType);
assert(reverseRange, 'reverse-selected completion has no replacement range');
assert.strictEqual(reverseRange.start.character, selectedRange.start.character, 'reverse-selected completion did not start at the highlighted text');
assert.strictEqual(reverseRange.end.character, selectedRange.end.character, 'reverse-selected completion did not end at the highlighted text');

// If arguments already follow the partial method, replace only the method name and
// do not inject a second pair of call parentheses/snippet placeholders.
const existingCallSource = objectTypeCompletionSource.replace('behavior.', 'behavior.us(behavior)');
const existingCallDoc = { ...mockDocument(existingCallSource), uri: { fsPath: path.join(sourceDir, 'ObjectTypeExistingCall.lsx') } };
const existingCallPosition = new Position(2, '        behavior.us'.length);
vscodeMock.window.activeTextEditor = null;
const existingCallItems = new extension._test.CompletionProvider().provideCompletionItems(existingCallDoc, existingCallPosition);
const existingCallIsType = existingCallItems.find(item => (item.label.label || item.label) === 'IsType');
assert(existingCallIsType, 'existing-call completion is missing IsType');
assert.strictEqual(existingCallIsType.insertText, 'IsType', 'completion duplicated call parentheses when arguments already existed');
const existingCallApplied = applyCompletionToText(existingCallSource, existingCallDoc, existingCallIsType);
assert(existingCallApplied.includes('behavior.IsType(behavior)'), `existing-call completion produced ${existingCallApplied}`);
assert(!existingCallApplied.includes('usIsType'), 'existing-call completion appended after the partial method name');

vscodeMock.window.activeTextEditor = null;

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

const braceConstructorFormatted = extension._test.formatLsxText(`const Transform : base(Engine.LazyBehavior) = {
constructor = fn(){
self.lazyVars = {
position = {0, 0, 0}
rotation = {0, 0, 0}
scale = {1, 1, 1}
}
}
}
`, { insertSpaces: true, tabSize: 4 });
assert(braceConstructorFormatted.includes('    constructor = fn(){'), 'formatter did not preserve the brace-delimited constructor form');
assert(braceConstructorFormatted.includes('        self.lazyVars = {'), 'brace-delimited constructor body was double-indented');
assert(braceConstructorFormatted.includes('    }\n}'), 'brace-delimited constructor and object closers are not aligned');

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


const compactStatementsFormatted = extension._test.formatLsxText(`export static const Color = {
_Clamp255 = fn(value)
if value < 0 then return 0 end
if value > 255 then return 255 end
return value
end
Hex = fn(value) return self.RGBA(0, 0, 0, 255) end
}
`, { insertSpaces: true, tabSize: 4 });
assert(compactStatementsFormatted.includes(`    _Clamp255 = fn(value)
        if value < 0 then
            return 0
        end
        if value > 255 then
            return 255
        end
        return value
    end`), `formatter did not expand compact if statements:\n${compactStatementsFormatted}`);
assert(compactStatementsFormatted.includes(`    Hex = fn(value)
        return self.RGBA(0, 0, 0, 255)
    end`), `formatter did not expand a compact function:\n${compactStatementsFormatted}`);

const pastedColorFormatted = extension._test.formatLsxText(`export static const Color = {
    RGBA = fn(red, green, blue, alpha)
red = self._Clamp255(red)
return red +
green * 256 +
blue * 65536 +
alpha * 16777216
end

Hex = fn(value)
if value == null then return self.RGBA(0, 0, 0, 255) end
local length=string.length(value)
if length < 4 then return self.RGBA(0, 0, 0, 255) end
end
}
`, { insertSpaces: true, tabSize: 4 });
assert(pastedColorFormatted.includes(`    RGBA = fn(red, green, blue, alpha)
        red = self._Clamp255(red)
        return red +
            green * 256 +
            blue * 65536 +
            alpha * 16777216
    end`), `external paste continuation indentation is wrong:\n${pastedColorFormatted}`);
assert(pastedColorFormatted.includes(`    Hex = fn(value)
        if value == null then
            return self.RGBA(0, 0, 0, 255)
        end
        local length = string.length(value)
        if length < 4 then
            return self.RGBA(0, 0, 0, 255)
        end
    end`), `external paste block formatting is wrong:\n${pastedColorFormatted}`);


// A block header can span multiple physical lines. The formatter must wait for
// the final `then`/`do` before opening the body; otherwise the matching `end`
// incorrectly closes the surrounding branch and pulls the rest of a long
// function back toward column zero.
const multilineConditionFormatted = extension._test.formatLsxText(`export static const Color = {
Hex = fn(value)
if length == 4 or length == 5 then
return 1
elseif length == 7 or length == 9 then
if redHigh < 0 or redLow < 0 or
greenHigh < 0 or greenLow < 0 or
blueHigh < 0 or blueLow < 0 then
return 0
end
red = redHigh * 16 + redLow
else
return -1
end
return red
end
Red = fn(value)
return value / 255.0
end
}
`, { insertSpaces: true, tabSize: 4 });
assert(multilineConditionFormatted.includes(`        elseif length == 7 or length == 9 then
            if redHigh < 0 or redLow < 0 or
                greenHigh < 0 or greenLow < 0 or
                blueHigh < 0 or blueLow < 0 then
                return 0
            end
            red = redHigh * 16 + redLow
        else
            return -1
        end
        return red
    end
    Red = fn(value)
        return value / 255.0
    end
}`), `multiline if formatting pulled the rest of the function to column zero:
${multilineConditionFormatted}`);

// Formatting a pasted or selected multiline fragment must use the surrounding
// object/function depth. The old range formatter started every fragment at
// column zero, which is why code pasted from outside VS Code was flattened.
const pasteContextSource = `export static const Color = {
    Hex = fn(value)
local length=string.length(value)
if length < 4 then
return 0
end
    end
}
`;
const pasteContextDoc = mockDocument(pasteContextSource);
const pasteRange = new Range(new Position(2, 0), new Position(5, 3));
const pasteEdits = new extension._test.DocumentRangeFormattingProvider().provideDocumentRangeFormattingEdits(
  pasteContextDoc,
  pasteRange,
  { insertSpaces: true, tabSize: 4 },
);
assert.strictEqual(pasteEdits.length, 1, 'contextual paste/range formatting produced no edit');
assert.strictEqual(
  pasteEdits[0].newText,
  '        local length = string.length(value)\n        if length < 4 then\n            return 0\n        end',
  `pasted LSX block lost its surrounding indentation:\n${pasteEdits[0].newText}`,
);

const extensionPackage = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
assert.strictEqual(extensionPackage.contributes.configurationDefaults['[lazyscriptex]']['editor.formatOnPaste'], true, 'LSX external paste formatting must be enabled');
assert.strictEqual(extensionPackage.contributes.configurationDefaults['[lazyscriptex]']['editor.acceptSuggestionOnEnter'], 'smart', 'LSX Enter must use normal VS Code smart completion acceptance');
const popupEnterBindings = extensionPackage.contributes.keybindings.filter(binding =>
  binding.key === 'enter' &&
  binding.command === 'lazyscriptex.enterWithoutCompletion' &&
  binding.when.includes('suggestWidgetVisible &&')
);
assert.strictEqual(popupEnterBindings.length, 1, 'LSX must contribute one popup-autocomplete newline fallback');
assert(popupEnterBindings[0].when.includes('!suggestWidgetHasFocusedSuggestion'), 'LSX Enter fallback must only run when no completion was deliberately selected');
assert(!extensionPackage.contributes.keybindings.some(binding =>
  binding.key === 'enter' &&
  binding.command === 'lazyscriptex.enterWithoutCompletion' &&
  binding.when.includes('suggestWidgetVisible &&') &&
  !binding.when.includes('!suggestWidgetHasFocusedSuggestion')
), 'LSX Enter still overrides acceptance of a selected completion');
assert(extensionPackage.contributes.keybindings.some(binding =>
  binding.key === 'enter' &&
  binding.command === 'lazyscriptex.enterWithoutCompletion' &&
  binding.when.includes('inlineSuggestionVisible')
), 'LSX Enter keybinding does not bypass unselected inline autocomplete');
const extensionSourceForEnter = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
assert(extensionSourceForEnter.includes("executeCommand('hideSuggestWidget')"), 'Enter command does not explicitly close popup autocomplete');
assert(extensionSourceForEnter.includes("executeCommand('editor.action.inlineSuggest.hide')"), 'Enter command does not explicitly close inline autocomplete');
assert(extensionSourceForEnter.includes("executeCommand('type', { text: '\\n' })"), 'Enter command does not type a normal newline');
assert(!grammarText.includes('|<>|'), 'syntax grammar still advertises unsupported <>');

const snippetsText = fs.readFileSync(path.join(__dirname, 'snippets', 'lazyscriptex.json'), 'utf8');
const snippets = JSON.parse(snippetsText);
const canvasSnippet = snippets['Declarative LazyUI canvas'];
assert(canvasSnippet && canvasSnippet.body.some(line => line.includes('<rect class="${2:preview-shape}"')), 'declarative canvas snippet is missing');
assert(!snippetsText.includes('context.fill_rounded_rect'), 'extension still advertises imperative canvas drawing');
assert(canvasSnippet.body.some(line => line.includes('background = {${3:props.accent}}')), 'LSCSS {var} snippet is missing');
assert(snippets['Object type name']?.body.some(line => line.includes('.GetTypeName()')), 'GetTypeName snippet is missing');
assert(snippets['Inherited object type check']?.body.some(line => line.includes('.IsType(')), 'IsType snippet is missing');
assert(snippets['Find LazyBehavior by type']?.body.some(line => line.includes('behavior.IsType(typeName)')), 'behavior lookup snippet is missing');

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

// A dotted imported-module expression must complete from the imported file,
// not fall back to unrelated symbols from the current source file. Completion
// matching is case-insensitive so a partially mistyped alias can still expose
// the correct declared module and let the user accept the proper symbol case.
const importedCompletionSource = `use "StaticService.lsx" as ServiceMod
export static const Consumer = {
    localOnly = 99
    Run = fn()
        ServiceMod.
    end
}
`;
const importedCompletionDoc = {
  ...mockDocument(importedCompletionSource),
  uri: { fsPath: path.join(sourceDir, 'ImportedCompletion.lsx') }
};
fs.writeFileSync(importedCompletionDoc.uri.fsPath, importedCompletionSource);
const importedModuleItems = new extension._test.CompletionProvider().provideCompletionItems(importedCompletionDoc, new Position(4, '        ServiceMod.'.length));
assert(importedModuleItems.some(item => (item.label.label || item.label) === 'StaticService'), 'module alias completion is missing the imported exported object');
assert(!importedModuleItems.some(item => (item.label.label || item.label) === 'localOnly'), 'module alias completion leaked current-file fields');
assert(!importedModuleItems.some(item => (item.label.label || item.label) === 'self'), 'module alias completion leaked current-scope variables');

// A duplicated qualifier prefix is a common editing mistake. IntelliSense must
// keep browsing the imported file rather than falling back to current locals.
const duplicatedAliasSource = importedCompletionSource.replace('ServiceMod.', 'ServiceServiceMod.');
const duplicatedAliasDoc = {
  ...mockDocument(duplicatedAliasSource),
  uri: { fsPath: path.join(sourceDir, 'DuplicatedAliasCompletion.lsx') }
};
fs.writeFileSync(duplicatedAliasDoc.uri.fsPath, duplicatedAliasSource);
const duplicatedAliasColumn = '        ServiceServiceMod.'.length;
const duplicatedAliasItems = new extension._test.CompletionProvider().provideCompletionItems(duplicatedAliasDoc, new Position(4, duplicatedAliasColumn));
assert(duplicatedAliasItems.some(item => (item.label.label || item.label) === 'StaticService'), 'duplicated module alias completion is missing the imported exported object');
const duplicatedStaticService = duplicatedAliasItems.find(item => (item.label.label || item.label) === 'StaticService');
assert(duplicatedStaticService.additionalTextEdits?.[0]?.newText === 'ServiceMod', 'duplicated module alias completion did not repair the qualifier');
assert(!duplicatedAliasItems.some(item => (item.label.label || item.label) === 'localOnly'), 'duplicated module alias completion fell back to current-file symbols');

const importedMemberSource = importedCompletionSource.replace('ServiceMod.', 'servicemod.StaticService.');
const importedMemberDoc = {
  ...mockDocument(importedMemberSource),
  uri: { fsPath: path.join(sourceDir, 'ImportedMemberCompletion.lsx') }
};
fs.writeFileSync(importedMemberDoc.uri.fsPath, importedMemberSource);
const memberColumn = '        servicemod.StaticService.'.length;
const importedMemberItems = new extension._test.CompletionProvider().provideCompletionItems(importedMemberDoc, new Position(4, memberColumn));
for (const expected of ['value', 'SetValue']) {
  assert(importedMemberItems.some(item => (item.label.label || item.label) === expected), `imported object completion is missing ${expected}`);
}
const importedSetValue = importedMemberItems.find(item => (item.label.label || item.label) === 'SetValue');
assert(importedSetValue.additionalTextEdits?.[0]?.newText === 'ServiceMod.StaticService', 'imported completion did not correct the qualifier to its declared case');
assert(!importedMemberItems.some(item => (item.label.label || item.label) === 'localOnly'), 'imported object completion leaked current-file fields');
assert(!importedMemberItems.some(item => (item.label.label || item.label) === 'Run'), 'imported object completion leaked the current object method');


// Nested named tables inside a static object are real compiler-visible object
// shapes. IntelliSense must keep their members nested instead of flattening
// Left/Right onto Input or treating MouseButton as an empty growable table.
const nestedInputPath = path.join(sourceDir, 'NestedInput.lsx');
fs.writeFileSync(nestedInputPath, `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW

export static const Input = {
    MouseButton = {
        Button1 = GLFW.GLFW_MOUSE_BUTTON_1
        Left = GLFW.GLFW_MOUSE_BUTTON_LEFT
        Right = GLFW.GLFW_MOUSE_BUTTON_RIGHT
        Middle = GLFW.GLFW_MOUSE_BUTTON_MIDDLE
    }
}
`);
const nestedInputRecord = extension._test.loadRecordSync(nestedInputPath);
const nestedInputObject = nestedInputRecord.exports.find(symbol => symbol.name === 'Input');
const nestedMouseButton = nestedInputObject?.members?.find(member => member.name === 'MouseButton');
assert(nestedMouseButton?.members?.some(member => member.name === 'Left'), 'nested static-object parser did not attach Left to MouseButton');
assert(!nestedInputObject?.members?.some(member => member.name === 'Left'), 'nested static-object parser flattened Left onto Input');

const nestedInputConsumerSource = `use "NestedInput.lsx" as InputMod
fn main()
    InputMod.Input.MouseButton.
    return 0
end
`;
const nestedInputConsumerDoc = {
  ...mockDocument(nestedInputConsumerSource),
  uri: { fsPath: path.join(sourceDir, 'NestedInputConsumer.lsx') }
};
fs.writeFileSync(nestedInputConsumerDoc.uri.fsPath, nestedInputConsumerSource);
const nestedInputItems = new extension._test.CompletionProvider().provideCompletionItems(
  nestedInputConsumerDoc,
  new Position(2, '    InputMod.Input.MouseButton.'.length)
);
for (const expected of ['Button1', 'Left', 'Right', 'Middle']) {
  assert(nestedInputItems.some(item => (item.label.label || item.label) === expected), `nested Input.MouseButton completion is missing ${expected}`);
}
assert(!nestedInputItems.some(item => (item.label.label || item.label) === 'push'), 'nested closed object was mistaken for a growable table');
const nestedConsumerRecord = extension._test.loadRecordSync(nestedInputConsumerDoc.uri.fsPath);
const nestedLeft = extension._test.resolveChain(nestedConsumerRecord, ['InputMod', 'Input', 'MouseButton', 'Left']);
assert.strictEqual(nestedLeft?.symbol?.name, 'Left', 'nested imported hover/navigation did not resolve MouseButton.Left');

console.log('LazyScriptEX extension runtime object types, navigation, local and imported-module completion, formatting, static objects, LSHTML/LSCSS, and inferred member tests passed.');
