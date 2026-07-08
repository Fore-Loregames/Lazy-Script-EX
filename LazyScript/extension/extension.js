'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { TAG_FUNCTIONS } = require('./compiler/inline_ui');

const LANGUAGE = 'lazyscriptex';
const index = new Map();
const apiByKey = new Map();
let output;
let diagnostics;
let status;
let watcher;
let externalWatchers = [];
let projectConfigs = [];
const diagnosticFiles = new Map();
const checkTimers = new Map();
let lastCheckGeneration = 0;

const KEYWORDS = [
  'use','as','export','extern','fn','const','static','lshtml','lscss','local','return','if','then','else','elseif','end','while','do','for','in','break','continue',
  'true','false','null','and','or','not','self','struct','i8','u8','i16','u16','i32','u32','i64','u64','f32','ptr','handle','fnptr','string','void','bool','table'
];

const BUILTIN_DOCS = {
  'console.open': ['console.open(title:string) -> bool', 'Opens or attaches a native Windows console and optionally sets its title.'],
  'console.write': ['console.write(value:string) -> void', 'Writes UTF-8 text to the native console without adding a newline.'],
  'console.write_line': ['console.write_line(value:string) -> void', 'Writes UTF-8 text followed by a newline to the native console.'],
  'console.error': ['console.error(value:string) -> void', 'Writes UTF-8 text to the native console error stream.'],
  'console.error_line': ['console.error_line(value:string) -> void', 'Writes UTF-8 text and a newline to the native console error stream.'],
  'console.wait': ['console.wait() -> void', 'Waits for Enter before the console closes. Useful for runnable examples.'],
  'console.close': ['console.close() -> void', 'Releases the native console opened by console.open.'],
  'string.length': ['string.length(value:string) -> i64', 'Returns the UTF-8 byte length of a zero-terminated LSX string.'],
  'string.byte_at': ['string.byte_at(value:string, index:i64) -> u8', 'Returns one UTF-8 byte from a string.'],
  'string.data_at': ['string.data_at(value:string, index:i64) -> ptr', 'Returns a native pointer to a byte inside a string for ABI interop.'],
  'string.equals': ['string.equals(left:string, right:string) -> bool', 'Compares two LSX strings for exact equality.'],
  'string.compare': ['string.compare(left:string, right:string) -> i32', 'Performs an ordinal native string comparison.'],
  'string.from_utf8': ['string.from_utf8(data:ptr) -> string', 'Treats a zero-terminated native UTF-8 buffer as an LSX string.'],
  'thread.start': ['thread.start(entry:fnptr, context:ptr) -> handle', 'Starts a real Windows operating-system thread at a compiled LSX function entry point.'],
  'thread.join': ['thread.join(handle:handle) -> bool', 'Waits until a native LSX worker thread exits.'],
  'thread.close': ['thread.close(handle:handle) -> bool', 'Closes a native thread handle.'],
  'thread.cpu_count': ['thread.cpu_count() -> i32', 'Returns the number of logical processors visible to the process.']
};

function keyForFile(file) {
  return path.normalize(file).toLowerCase();
}

function positionAtLine(line, column = 0) {
  return new vscode.Position(Math.max(0, line), Math.max(0, column));
}

function symbolKind(kind) {
  switch (kind) {
    case 'function': return vscode.SymbolKind.Function;
    case 'method': return vscode.SymbolKind.Method;
    case 'constant': return vscode.SymbolKind.Constant;
    case 'object': return vscode.SymbolKind.Struct;
    case 'struct': return vscode.SymbolKind.Struct;
    case 'field': return vscode.SymbolKind.Field;
    case 'import': return vscode.SymbolKind.Module;
    default: return vscode.SymbolKind.Variable;
  }
}

function completionKind(kind) {
  switch (kind) {
    case 'function': return vscode.CompletionItemKind.Function;
    case 'method': return vscode.CompletionItemKind.Method;
    case 'constant': return vscode.CompletionItemKind.Constant;
    case 'object': return vscode.CompletionItemKind.Class;
    case 'struct': return vscode.CompletionItemKind.Struct;
    case 'field': return vscode.CompletionItemKind.Field;
    case 'import': return vscode.CompletionItemKind.Module;
    default: return vscode.CompletionItemKind.Variable;
  }
}

function cleanCommentLine(raw) {
  return raw.replace(/^\s*--\s?/, '').trim();
}

function documentationBefore(lines, line) {
  const collected = [];
  let i = line - 1;
  while (i >= 0 && /^\s*$/.test(lines[i])) i--;
  while (i >= 0 && /^\s*--(?!\[\[)/.test(lines[i])) {
    collected.unshift(cleanCommentLine(lines[i]));
    i--;
  }
  if (collected.length) return collected.join('\n');
  return '';
}

function splitParameters(text) {
  if (!text || !text.trim()) return [];
  const out = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === '>' || ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function parameterInfo(text) {
  return splitParameters(text).map(raw => {
    // User-facing LSX uses inferred parameters. Keep explicit parsing for internal/native
    // sources so navigation continues to understand the bundled bindings.
    const dot = raw.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/);
    const colon = raw.match(/^([A-Za-z_]\w*)\s*:\s*(.+)$/);
    return { raw, name: dot?.[1] || colon?.[1] || raw, type: dot?.[2]?.trim() || colon?.[2]?.trim() || 'inferred' };
  });
}

function signatureParts(signature) {
  const match = signature.match(/^[^(]*\((.*)\)\s*(?:->\s*(.+))?$/);
  return {
    parameters: parameterInfo(match?.[1] || ''),
    returnType: match?.[2]?.trim() || ''
  };
}

function defaultDescription(moduleName, symbol) {
  const owner = symbol.owner ? `${symbol.owner}.` : '';
  const qualified = `${owner}${symbol.name}`;
  if (symbol.name.startsWith('_')) return `Internal implementation helper \`${qualified}\`. It is visible for source navigation but is not part of the normal public API.`;
  const common = {
    create: `Creates and returns a new native \`${symbol.owner || 'value'}\` instance.`,
    new: `Allocates a new packed native \`${symbol.owner || 'value'}\` instance.`,
    clone: `Creates a native copy of this value.`,
    destroy: `Releases storage owned by this value. Call it once when the value is no longer needed.`,
    close: `Closes the underlying native resource and makes the object safe to discard.`,
    valid: `Returns whether the underlying native resource or parsed document is valid.`,
    count: `Returns the number of child values or members.`,
    length: `Returns the current element or byte count.`,
    get: `Looks up and returns the requested value.`,
    set: `Updates the requested value.`,
    load: `Loads the requested resource and returns an owned result object.`,
    save: `Serializes and writes the current value to a file.`,
    stringify: `Serializes the value to owned UTF-8 JSON text.`,
    parse: `Parses the current UTF-8 source into the native JSON DOM.`,
    start: `Starts the requested native operation and returns its result object.`,
    join: `Waits for the native worker thread to finish.`,
    wait: `Waits for the native resource or synchronization object.`,
    lock: `Acquires the synchronization object.`,
    unlock: `Releases the synchronization object.`
  };
  if (common[symbol.name]) return common[symbol.name];
  if (symbol.kind === 'constant') return `${moduleName || 'LSX'} constant \`${symbol.name}\`.`;
  if (symbol.kind === 'field') return `Native field \`${qualified}\` with fixed compile-time layout.`;
  if (symbol.kind === 'object' || symbol.kind === 'struct') return `Packed native LSX type \`${symbol.name}\`. Its fields use fixed offsets and its methods compile to direct calls.`;
  const native = symbol.dll ? ` Calls \`${symbol.dll}\` directly through the native ABI.` : '';
  if (moduleName === 'OpenGL') return `OpenGL binding for \`${symbol.name}\`.${native}`;
  if (moduleName === 'GLFW') return `GLFW window, input, monitor, or context API binding for \`${symbol.name}\`.${native}`;
  if (moduleName === 'OpenAL' || moduleName?.startsWith('OpenAL/')) return `OpenAL audio API binding for \`${symbol.name}\`.${native}`;
  if (moduleName === 'System/Threading') return `Native operating-system threading or synchronization operation \`${qualified}\`.`;
  if (moduleName === 'System/File') return `Native UTF-8 file-system operation \`${qualified}\`.`;
  if (moduleName === 'Data/Json') return `LSX-native JSON DOM operation \`${qualified}\`.`;
  if (moduleName === 'Network/Sockets') return `Native WinSock2 networking operation \`${qualified}\`.`;
  if (moduleName === 'Network/Http') return `Native WinHTTP HTTP/HTTPS operation \`${qualified}\`.`;
  if (symbol.kind === 'method') return `Method \`${qualified}\` on a packed native LSX object.`;
  return `LSX ${symbol.kind || 'symbol'} \`${qualified}\`.`;
}

function moduleNameFromFile(file) {
  const normalized = file.replace(/\\/g, '/');
  const match = normalized.match(/\/bindings\/(.+)\.lsx$/i);
  if (!match) return '';
  const rel = match[1];
  if (rel === 'GLFW/GLFW') return 'GLFW';
  if (rel === 'OpenGL/OpenGL46') return 'OpenGL';
  if (rel === 'OpenAL/OpenAL') return 'OpenAL';
  return rel;
}

function apiKey(moduleName, owner, name) {
  return `${moduleName || ''}|${owner || ''}|${name}`.toLowerCase();
}

function loadApiMetadata() {
  apiByKey.clear();
  const candidates = [path.join(__dirname, 'api', 'api-data.json')];
  const root = findToolkitRoot();
  if (root) candidates.unshift(path.join(root, 'LazyScript', 'api', 'api-data.json'));
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const data = JSON.parse(fs.readFileSync(candidate, 'utf8').replace(/^\uFEFF/, ''));
      for (const entry of data.entries || []) apiByKey.set(apiKey(entry.module, entry.owner, entry.name), entry);
      return;
    } catch (err) {
      output?.appendLine(`API metadata load failed: ${err.message}`);
    }
  }
}

function enrichSymbol(record, symbol) {
  const moduleName = record.moduleName || moduleNameFromFile(record.uri.fsPath);
  const api = apiByKey.get(apiKey(moduleName, symbol.owner, symbol.name));
  if (api) {
    symbol.apiMetadata = api;
    if (!symbol.documentation) symbol.documentation = api.friendlyDescription || api.whatItIs || api.description || '';
    if ((!symbol.signature || symbol.signature === symbol.name) && api.signature) symbol.signature = api.signature;
  }
  if (!symbol.documentation) symbol.documentation = defaultDescription(moduleName, symbol);
  return symbol;
}

function parseMembers(lines, startLine, owner) {
  const members = [];
  let depth = 0;
  let started = false;
  for (let i = startLine; i < lines.length; i++) {
    const raw = lines[i];
    let inString = false;
    let escaped = false;
    for (const ch of raw) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') { depth++; started = true; }
      if (ch === '}') depth--;
    }
    let m;
    if ((m = raw.match(/^\s*([A-Za-z_]\w*)\s*=\s*fn\s*\(([^)]*)\)\s*(?:->\s*([^\s,}]+))?/))) {
      const returnType = m[3]?.trim() || '';
      members.push({
        name: m[1], kind: 'method', owner, parameters: parameterInfo(m[2]), returnType,
        signature: `${m[1]}(${m[2].trim()})${returnType ? ` -> ${returnType}` : ''}`,
        line: i, column: raw.indexOf(m[1]), exported: true, documentation: documentationBefore(lines, i)
      });
    } else if ((m = raw.match(/^\s*([A-Za-z_]\w*)\s*:\s*([^=,]+?)\s*=/))) {
      members.push({
        name: m[1], kind: 'field', owner, type: m[2].trim(), signature: `${m[1]}: ${m[2].trim()}`,
        line: i, column: raw.indexOf(m[1]), exported: true, documentation: documentationBefore(lines, i)
      });
    } else if ((m = raw.match(/^\s*([A-Za-z_]\w*)\s*=\s*(?!fn\b)([^,}]+)[,}]?\s*$/))) {
      members.push({
        name: m[1], kind: 'field', owner, type: 'inferred', signature: `${m[1]} = ${m[2].trim()}`,
        line: i, column: raw.indexOf(m[1]), exported: true, documentation: documentationBefore(lines, i)
      });
    }
    if (started && depth <= 0 && i > startLine) return { members, endLine: i };
  }
  return { members, endLine: startLine };
}

function parseStructMembers(lines, startLine, owner) {
  const members = [];
  for (let i = startLine + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*end\s*$/.test(raw)) return { members, endLine: i };
    const field = raw.match(/^\s*([A-Za-z_]\w*)\s*:\s*(.+?)\s*$/);
    if (field) members.push({
      name: field[1], kind: 'field', owner, type: field[2].trim(), signature: `${field[1]}: ${field[2].trim()}`,
      line: i, column: raw.indexOf(field[1]), exported: true, documentation: documentationBefore(lines, i)
    });
  }
  return { members, endLine: startLine };
}

function parseTypeReference(typeText) {
  if (!typeText) return null;
  const cleaned = typeText.trim().replace(/^table\s*<.*>$/, 'table');
  const match = cleaned.match(/^(?:([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)$/);
  return match ? { alias: match[1] || '', type: match[2] } : null;
}

function parseText(uri, text) {
  const lines = text.split(/\r?\n/);
  const imports = new Map();
  const symbols = [];
  const moduleName = moduleNameFromFile(uri.fsPath);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    let m;
    if ((m = raw.match(/^\s*use\s+"([^"]+)"\s+as\s+([A-Za-z_]\w*)/))) {
      imports.set(m[2], { spec: m[1], alias: m[2], line: i, column: raw.indexOf(m[2]), documentation: `Imports \`${m[1]}\` as \`${m[2]}\`.` });
      symbols.push({ name: m[2], kind: 'import', signature: `use "${m[1]}" as ${m[2]}`, line: i, column: raw.indexOf(m[2]), exported: false, documentation: `Imported LSX module \`${m[1]}\`.` });
      continue;
    }
    if ((m = raw.match(/^\s*(export\s+)?lshtml\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*=\s*\{\s*\(/))) {
      const parameters = m[3] || '';
      symbols.push({ name: m[2], kind: 'function', parameters: parameterInfo(parameters), returnType: 'UI.Element', signature: `lshtml ${m[2]}(${parameters.trim()}) -> UI.Element`, line: i, column: raw.indexOf(m[2]), exported: Boolean(m[1]), documentation: documentationBefore(lines, i) || 'Native retained LSHTML template lowered to ordinary LazyUI element functions.' });
      continue;
    }
    if ((m = raw.match(/^\s*(export\s+)?lscss\s+(.+?)\s*=\s*\{/))) {
      const selector = m[2].trim();
      const parsed = parseMembers(lines, i, selector);
      symbols.push({ name: selector, kind: 'object', signature: `lscss ${selector}`, line: i, column: raw.indexOf(selector), exported: Boolean(m[1]), members: parsed.members, endLine: parsed.endLine, documentation: documentationBefore(lines, i) || 'Compile-time LSCSS selector declaration lowered into direct LazyUI style calls.' });
      i = parsed.endLine;
      continue;
    }
    if ((m = raw.match(/^\s*(export\s+)?extern\s+"([^"]+)"\s+fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*(.+?))?\s*$/))) {
      const returnType = m[5]?.trim() || 'void';
      symbols.push({ name: m[3], kind: 'function', dll: m[2], parameters: parameterInfo(m[4]), returnType, signature: `${m[3]}(${m[4].trim()}) -> ${returnType}`, line: i, column: raw.indexOf(m[3]), exported: Boolean(m[1]), documentation: documentationBefore(lines, i) });
      continue;
    }
    if ((m = raw.match(/^\s*(export\s+)?fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([A-Za-z_][A-Za-z0-9_.<>]*))?/))) {
      const returnType = m[4]?.trim() || '';
      symbols.push({ name: m[2], kind: 'function', parameters: parameterInfo(m[3]), returnType, signature: `${m[2]}(${m[3].trim()})${returnType ? ` -> ${returnType}` : ''}`, line: i, column: raw.indexOf(m[2]), exported: Boolean(m[1]), documentation: documentationBefore(lines, i) });
      continue;
    }
    if ((m = raw.match(/^\s*(export\s+)?(static\s+)?const\s+([A-Za-z_]\w*)\s*(?::\s*base\s*\([^)]*\))?\s*=\s*\{/))) {
      const parsed = parseMembers(lines, i, m[3]);
      const isStaticObject = Boolean(m[2]);
      const defaultDocs = isStaticObject
        ? 'One compiler-owned static object. It is initialized once, keeps shared mutable state, and its methods are called directly while self refers to the singleton.'
        : '';
      symbols.push({ name: m[3], kind: 'object', staticObject: isStaticObject, signature: `${isStaticObject ? 'static ' : ''}const ${m[3]}`, line: i, column: raw.indexOf(m[3]), exported: Boolean(m[1]), members: parsed.members, endLine: parsed.endLine, documentation: documentationBefore(lines, i) || defaultDocs });
      i = parsed.endLine;
      continue;
    }
    if ((m = raw.match(/^\s*(export\s+)?struct\s+([A-Za-z_]\w*)/))) {
      const parsed = parseStructMembers(lines, i, m[2]);
      symbols.push({ name: m[2], kind: 'struct', signature: `struct ${m[2]}`, line: i, column: raw.indexOf(m[2]), exported: Boolean(m[1]), members: parsed.members, endLine: parsed.endLine, documentation: documentationBefore(lines, i) });
      i = parsed.endLine;
      continue;
    }
    if ((m = raw.match(/^\s*export\s+const\s+([A-Za-z_]\w*)\s*=\s*(.+)$/))) {
      symbols.push({ name: m[1], kind: 'constant', signature: raw.trim(), line: i, column: raw.indexOf(m[1]), exported: true, documentation: documentationBefore(lines, i) });
      continue;
    }
    if ((m = raw.match(/^\s*export\s+([A-Za-z_]\w*)\s*=\s*(.+)$/))) {
      symbols.push({ name: m[1], kind: 'constant', signature: raw.trim(), line: i, column: raw.indexOf(m[1]), exported: true, documentation: documentationBefore(lines, i) });
      continue;
    }
    if ((m = raw.match(/^\s*local\s+([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*=\s*(.+)$/))) {
      symbols.push({ name: m[1], kind: 'variable', type: m[2]?.trim() || '', initializer: m[3].trim(), typeRef: parseTypeReference(m[2]), signature: raw.trim(), line: i, column: raw.indexOf(m[1]), exported: false, documentation: documentationBefore(lines, i) });
      continue;
    }
    if ((m = raw.match(/^\s*local\s+([A-Za-z_]\w*)\s*(?::\s*(.+?))?\s*$/))) {
      symbols.push({ name: m[1], kind: 'variable', type: m[2]?.trim() || '', typeRef: parseTypeReference(m[2]), signature: raw.trim(), line: i, column: raw.indexOf(m[1]), exported: false, documentation: documentationBefore(lines, i) });
    }
  }
  const record = { uri, text, lines, imports, symbols, exports: symbols.filter(s => s.exported), moduleName, mtime: Date.now() };
  for (const symbol of symbols) {
    enrichSymbol(record, symbol);
    for (const member of symbol.members || []) enrichSymbol(record, member);
  }
  return record;
}

function directoryExists(value) {
  try { return Boolean(value) && fs.statSync(value).isDirectory(); }
  catch { return false; }
}

function fileExists(value) {
  try { return Boolean(value) && fs.statSync(value).isFile(); }
  catch { return false; }
}

function normalizeLazyScriptRoot(value) {
  if (!value) return null;
  let candidate = path.resolve(String(value));
  if (fileExists(candidate)) candidate = path.dirname(candidate);
  const base = path.basename(candidate).toLowerCase();
  if ((base === 'api' || base === 'bindings' || base === 'compiler') && directoryExists(path.join(path.dirname(candidate), 'bindings'))) {
    candidate = path.dirname(candidate);
  }
  if (directoryExists(path.join(candidate, 'bindings')) && directoryExists(path.join(candidate, 'compiler'))) return candidate;
  const nested = path.join(candidate, 'LazyScript');
  if (directoryExists(path.join(nested, 'bindings')) && directoryExists(path.join(nested, 'compiler'))) return nested;
  return null;
}

function readProjectConfig(configPath) {
  try {
    if (!fileExists(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    const root = path.dirname(configPath);
    const moduleRoots = {};
    if (raw.moduleRoots && typeof raw.moduleRoots === 'object' && !Array.isArray(raw.moduleRoots)) {
      for (const [name, value] of Object.entries(raw.moduleRoots)) {
        if (typeof value === 'string' && value.trim()) moduleRoots[name] = path.resolve(root, value);
      }
    }
    return { configPath, root, entry: typeof raw.entry === 'string' ? path.resolve(root, raw.entry) : null, moduleRoots, raw };
  } catch {
    return null;
  }
}

function findProjectConfigAbove(startFile) {
  let dir;
  try { dir = directoryExists(startFile) ? path.resolve(startFile) : path.dirname(path.resolve(startFile)); }
  catch { dir = path.dirname(path.resolve(startFile)); }
  for (;;) {
    const config = path.join(dir, 'lazyscriptex.json');
    if (fileExists(config)) return readProjectConfig(config);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function configuredModuleRoots() {
  const configured = vscode.workspace.getConfiguration('lazyscriptex').get('moduleRoots', {}) || {};
  const roots = {};
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    for (const [name, value] of Object.entries(configured)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      roots[name] = name === 'LazyScript' ? (normalizeLazyScriptRoot(value) || path.resolve(value)) : path.resolve(value);
    }
  }
  return roots;
}

function pathInside(file, root) {
  if (!file || !root) return false;
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function associatedProjectConfigs(startFile) {
  const direct = findProjectConfigAbove(startFile);
  const found = direct ? [direct] : [];
  for (const config of projectConfigs) {
    if (!config || found.some(item => keyForFile(item.configPath) === keyForFile(config.configPath))) continue;
    if (pathInside(startFile, config.root) || Object.values(config.moduleRoots || {}).some(root => pathInside(startFile, root))) found.push(config);
  }
  found.sort((a, b) => path.relative(a.root, startFile).length - path.relative(b.root, startFile).length);
  return found;
}

function findLazyScriptRoot(startPath) {
  const configured = vscode.workspace.getConfiguration('lazyscriptex').get('lazyScriptRoot', '').trim();
  const selected = normalizeLazyScriptRoot(configured);
  if (selected) return selected;

  const configuredRoots = configuredModuleRoots();
  const configuredNamed = normalizeLazyScriptRoot(configuredRoots.LazyScript);
  if (configuredNamed) return configuredNamed;

  for (const project of associatedProjectConfigs(startPath)) {
    const projectRoot = normalizeLazyScriptRoot(project.moduleRoots?.LazyScript);
    if (projectRoot) return projectRoot;
  }

  let dir;
  try { dir = directoryExists(startPath) ? path.resolve(startPath) : path.dirname(path.resolve(startPath)); }
  catch { dir = path.dirname(path.resolve(startPath)); }
  while (true) {
    if (path.basename(dir).toLowerCase() === 'lazyscript') {
      const normalized = normalizeLazyScriptRoot(dir);
      if (normalized) return normalized;
    }
    const child = normalizeLazyScriptRoot(path.join(dir, 'LazyScript'));
    if (child) return child;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const direct = normalizeLazyScriptRoot(folder.uri.fsPath);
    if (direct) return direct;
    let current = folder.uri.fsPath;
    while (true) {
      const candidate = normalizeLazyScriptRoot(path.join(current, 'LazyScript'));
      if (candidate) return candidate;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

function knownModuleRoots(fromFile) {
  const roots = configuredModuleRoots();
  for (const project of [...associatedProjectConfigs(fromFile), ...projectConfigs]) {
    for (const [name, value] of Object.entries(project?.moduleRoots || {})) if (!roots[name] && directoryExists(value)) roots[name] = value;
  }
  const lazy = findLazyScriptRoot(fromFile);
  if (lazy) roots.LazyScript = lazy;
  return roots;
}

function resolveImport(spec, fromFile) {
  if (spec.startsWith('@')) {
    const slash = spec.indexOf('/');
    if (slash <= 1) return null;
    const rootName = spec.slice(1, slash);
    const roots = knownModuleRoots(fromFile);
    const direct = roots[rootName] || Object.entries(roots).find(([name]) => name.toLowerCase() === rootName.toLowerCase())?.[1];
    return direct ? path.normalize(path.join(direct, spec.slice(slash + 1))) : null;
  }
  return path.normalize(path.resolve(path.dirname(fromFile), spec));
}

function compilerModuleRootArgs(startFile) {
  const roots = knownModuleRoots(startFile);
  const args = [];
  for (const [name, value] of Object.entries(roots)) {
    if (!directoryExists(value)) continue;
    if (name === 'LazyScript') args.push('--lazy-script-root', value);
    else args.push('--module-root', `${name}=${value}`);
  }
  return args;
}

function importPathContext(document, position, requireOpen = true) {
  const line = document.lineAt(position.line).text;
  const quoteStart = line.indexOf('"');
  if (quoteStart < 0 || !/^\s*use\s+"/.test(line)) return null;
  const quoteEnd = line.indexOf('"', quoteStart + 1);
  if (position.character < quoteStart + 1) return null;
  if (quoteEnd >= 0 && position.character > quoteEnd) return null;
  if (requireOpen && quoteEnd >= 0 && position.character === quoteEnd + 1) return null;
  const end = quoteEnd >= 0 ? quoteEnd : line.length;
  const full = line.slice(quoteStart + 1, end);
  const typed = line.slice(quoteStart + 1, position.character);
  return { line, quoteStart, quoteEnd, full, typed };
}

function importCompletionItems(document, position) {
  const context = importPathContext(document, position, false);
  if (!context) return null;
  const typed = context.typed.replace(/\\/g, '/');
  const roots = knownModuleRoots(document.uri.fsPath);
  if (typed.startsWith('@') && !typed.includes('/')) {
    const start = new vscode.Position(position.line, context.quoteStart + 1);
    const range = new vscode.Range(start, position);
    return Object.keys(roots).sort().map(name => {
      const item = new vscode.CompletionItem(`@${name}/`, vscode.CompletionItemKind.Module);
      item.insertText = `@${name}/`;
      item.range = range;
      item.detail = `Named LSX module root: ${roots[name]}`;
      item.documentation = new vscode.MarkdownString(`Starts an import from the configured \`@${name}\` root. Continue typing a folder or file; path completion stays active after each slash.`);
      item.command = { command: 'editor.action.triggerSuggest', title: 'Continue LSX import path' };
      return item;
    });
  }

  let baseDirectory;
  let relativePart;
  let namedRoot = false;
  if (typed.startsWith('@')) {
    const slash = typed.indexOf('/');
    if (slash <= 1) return [];
    const name = typed.slice(1, slash);
    const root = roots[name] || Object.entries(roots).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
    if (!root) return [];
    baseDirectory = root;
    relativePart = typed.slice(slash + 1);
    namedRoot = true;
  } else {
    baseDirectory = path.dirname(document.uri.fsPath);
    relativePart = typed;
  }

  const slash = relativePart.lastIndexOf('/');
  const parentPart = slash >= 0 ? relativePart.slice(0, slash + 1) : '';
  const segment = slash >= 0 ? relativePart.slice(slash + 1) : relativePart;
  const browseDirectory = path.resolve(baseDirectory, parentPart.replace(/\//g, path.sep) || '.');
  if (!directoryExists(browseDirectory)) return [];
  const ignored = new Set(['.git', '.cache', 'node_modules', 'build', 'dist', 'out']);
  let entries = [];
  try {
    entries = fs.readdirSync(browseDirectory, { withFileTypes: true })
      .filter(entry => (entry.isDirectory() && !ignored.has(entry.name.toLowerCase())) || (entry.isFile() && entry.name.toLowerCase().endsWith('.lsx')))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  } catch { return []; }

  const start = new vscode.Position(position.line, Math.max(context.quoteStart + 1, position.character - segment.length));
  const range = new vscode.Range(start, position);
  const items = entries.map(entry => {
    const directory = entry.isDirectory();
    const label = directory ? `${entry.name}/` : entry.name;
    const kind = directory ? (vscode.CompletionItemKind.Folder || vscode.CompletionItemKind.Module) : (vscode.CompletionItemKind.File || vscode.CompletionItemKind.Module);
    const item = new vscode.CompletionItem(label, kind);
    item.insertText = label;
    item.range = range;
    const resolved = path.join(browseDirectory, entry.name);
    item.detail = directory ? `LSX source folder: ${resolved}` : `LSX module: ${resolved}`;
    item.documentation = new vscode.MarkdownString(directory
      ? `Open this folder in the import path. Completion will immediately show its LSX files and child folders.`
      : `Imports \`${resolved}\`. Add \`as Alias\` after the closing quote, then call exported members with \`Alias.member\`.`);
    if (directory) item.command = { command: 'editor.action.triggerSuggest', title: 'Continue LSX import path' };
    return item;
  });

  if (!namedRoot && !parentPart && !segment) {
    for (const name of Object.keys(roots).sort().reverse()) {
      const item = new vscode.CompletionItem(`@${name}/`, vscode.CompletionItemKind.Module);
      item.insertText = `@${name}/`;
      item.range = range;
      item.detail = `Named LSX module root: ${roots[name]}`;
      item.documentation = new vscode.MarkdownString(`Import from the configured \`@${name}\` folder without counting parent directories.`);
      item.command = { command: 'editor.action.triggerSuggest', title: 'Continue LSX import path' };
      items.unshift(item);
    }
    for (const value of ['../', './']) {
      const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Folder || vscode.CompletionItemKind.Module);
      item.insertText = value;
      item.range = range;
      item.detail = value === './' ? 'Import from the current source folder' : 'Import from the parent source folder';
      item.command = { command: 'editor.action.triggerSuggest', title: 'Continue LSX import path' };
      items.unshift(item);
    }
  }
  return items;
}

function loadRecordSync(file, seen = new Set()) {
  if (!file) return null;
  const normalized = path.normalize(file);
  const key = keyForFile(normalized);
  if (seen.has(key)) return index.get(key) || null;
  seen.add(key);
  try {
    const stat = fs.statSync(normalized);
    const cached = index.get(key);
    if (cached && cached.diskMtime === stat.mtimeMs) return cached;
    const uri = vscode.Uri.file(normalized);
    const record = parseText(uri, fs.readFileSync(normalized, 'utf8'));
    record.diskMtime = stat.mtimeMs;
    index.set(key, record);
    for (const imp of record.imports.values()) loadRecordSync(resolveImport(imp.spec, normalized), seen);
    return record;
  } catch {
    index.delete(key);
    return null;
  }
}

async function indexUri(uri) {
  loadRecordSync(uri.fsPath);
}

function walkLsxFiles(root, outputFiles, maxFiles = 20000) {
  if (!directoryExists(root) || outputFiles.length >= maxFiles) return;
  const ignored = new Set(['.git', '.cache', 'node_modules', 'build', 'dist', 'out', '.vs']);
  const stack = [path.resolve(root)];
  while (stack.length && outputFiles.length < maxFiles) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name.toLowerCase())) stack.push(path.join(current, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lsx')) outputFiles.push(path.join(current, entry.name));
    }
  }
}

function refreshExternalWatchers(roots) {
  for (const external of externalWatchers) external.dispose?.();
  externalWatchers = [];
  if (!vscode.workspace.createFileSystemWatcher || !vscode.RelativePattern) return;
  for (const root of roots) {
    if (!directoryExists(root)) continue;
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.lsx'));
    watcher.onDidCreate(indexUri);
    watcher.onDidChange(indexUri);
    watcher.onDidDelete(uri => index.delete(keyForFile(uri.fsPath)));
    externalWatchers.push(watcher);
  }
}

async function refreshIndex() {
  if (!vscode.workspace.workspaceFolders) return;
  status.text = '$(sync~spin) LSX indexing';
  const exclude = vscode.workspace.getConfiguration('lazyscriptex').get('exclude', '**/{build,node_modules,.git,.cache}/**');
  const uris = await vscode.workspace.findFiles('**/*.lsx', exclude);
  const configUris = await vscode.workspace.findFiles('**/lazyscriptex.json', exclude);
  projectConfigs = configUris.map(uri => readProjectConfig(uri.fsPath)).filter(Boolean);
  index.clear();
  for (const uri of uris) loadRecordSync(uri.fsPath);

  const roots = new Set();
  for (const folder of vscode.workspace.workspaceFolders || []) roots.add(path.resolve(folder.uri.fsPath));
  for (const config of projectConfigs) for (const root of Object.values(config.moduleRoots || {})) roots.add(path.resolve(root));
  for (const root of Object.values(configuredModuleRoots())) roots.add(path.resolve(root));
  const lazy = findLazyScriptRoot(vscode.window.activeTextEditor?.document?.uri?.fsPath || vscode.workspace.workspaceFolders[0].uri.fsPath);
  if (lazy) roots.add(path.resolve(lazy));

  if (vscode.workspace.getConfiguration('lazyscriptex').get('recursiveIndex', true)) {
    const externalFiles = [];
    for (const root of roots) walkLsxFiles(root, externalFiles);
    for (const file of externalFiles) loadRecordSync(file);
  }
  refreshExternalWatchers([...roots]);

  loadApiMetadata();
  status.text = `$(database) LSX ${index.size} files`;
  status.tooltip = lazy
    ? `LazyScriptEX recursively indexed ${index.size} LSX files. @LazyScript = ${lazy}`
    : `LazyScriptEX indexed ${index.size} LSX files. Select the LazyScript/API folder to enable @LazyScript imports.`;
}

function indexedFile(file) {
  return loadRecordSync(file);
}

function activeRecord(document) {
  const openText = document.getText();
  const record = parseText(document.uri, openText);
  try { record.diskMtime = fs.statSync(document.uri.fsPath).mtimeMs; } catch { record.diskMtime = 0; }
  index.set(keyForFile(document.uri.fsPath), record);
  return record;
}


function stripCodeForScope(raw, state = { blockComment: false }) {
  let out = '';
  let quote = '';
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1] || '';
    if (state.blockComment) {
      if (ch === ']' && next === ']') {
        state.blockComment = false;
        out += '  ';
        i++;
      } else out += ' ';
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; out += ' '; continue; }
      if (ch === '\\') { escaped = true; out += ' '; continue; }
      if (ch === quote) quote = '';
      out += ' ';
      continue;
    }
    if (ch === '-' && next === '-' && raw[i + 2] === '[' && raw[i + 3] === '[') {
      state.blockComment = true;
      out += '    ';
      i += 3;
      continue;
    }
    if (ch === '-' && next === '-') {
      out += ' '.repeat(raw.length - i);
      break;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

function makeScopeSymbol(name, kind, line, column, extra = {}) {
  const label = kind === 'parameter' ? 'parameter' : kind === 'loop' ? 'loop variable' : 'local variable';
  return {
    name,
    kind: 'variable',
    scopeKind: kind,
    line,
    column,
    signature: extra.signature || `${label} ${name}`,
    documentation: extra.documentation || `${label[0].toUpperCase()}${label.slice(1)} \`${name}\` visible in the current scope.`,
    type: extra.type || '',
    typeRef: extra.typeRef || null,
    initializer: extra.initializer || '',
    depth: extra.depth || 0
  };
}

function collectVisibleScopeSymbols(document, position) {
  const text = document.getText();
  const lines = text.split(/\r?\n/);
  const lastLine = Math.min(Math.max(0, position.line), Math.max(0, lines.length - 1));
  const scopes = [{ type: 'root', symbols: [] }];
  const commentState = { blockComment: false };

  function pushScope(type, symbols = []) {
    scopes.push({ type, symbols });
  }
  function popScope() {
    if (scopes.length > 1) scopes.pop();
  }
  function addSymbol(symbol) {
    symbol.depth = scopes.length - 1;
    scopes[scopes.length - 1].symbols.push(symbol);
  }
  function parameterSymbols(raw, line, baseColumn = 0) {
    return parameterInfo(raw).filter(p => /^[A-Za-z_]\w*$/.test(p.name)).map(p => {
      const column = Math.max(baseColumn, (lines[line] || '').indexOf(p.name, baseColumn));
      return makeScopeSymbol(p.name, 'parameter', line, Math.max(0, column), {
        type: p.type === 'inferred' ? '' : p.type,
        typeRef: p.type === 'inferred' ? null : parseTypeReference(p.type),
        signature: `parameter ${p.name}${p.type !== 'inferred' ? `: ${p.type}` : ''}`,
        documentation: `Function parameter \`${p.name}\`. LSX infers its value type from how the function is called and used.`
      });
    });
  }

  for (let lineIndex = 0; lineIndex <= lastLine; lineIndex++) {
    const rawLine = lineIndex === lastLine ? (lines[lineIndex] || '').slice(0, position.character) : (lines[lineIndex] || '');
    const code = stripCodeForScope(rawLine, commentState).trim();
    if (!code) continue;

    // A branch starts a fresh child scope while preserving its parent function/loop scope.
    if (/^(?:elseif\b|else\b)/.test(code)) {
      if (scopes.at(-1)?.type === 'branch') popScope();
      pushScope('branch');
    }

    // Close completed blocks before reading declarations that follow them on the same line.
    if (/^end\b/.test(code)) popScope();

    let match;
    const method = code.match(/^([A-Za-z_]\w*)\s*=\s*fn\s*\(([^)]*)\)/);
    const fn = code.match(/^(?:export\s+)?fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    if (method || fn) {
      const paramsText = (method || fn)[2] || '';
      const openParen = rawLine.indexOf('(') + 1;
      const params = parameterSymbols(paramsText, lineIndex, Math.max(0, openParen));
      if (method) params.unshift(makeScopeSymbol('self', 'parameter', lineIndex, Math.max(0, rawLine.indexOf(method[1])), {
        signature: 'current object instance self',
        documentation: '`self` is the current object instance. Use dot access such as `self.windowHandle`.'
      }));
      pushScope('function', params);
    } else {
      const lshtml = code.match(/^(?:export\s+)?lshtml\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?/);
      if (lshtml && lshtml[2]) pushScope('lshtml', parameterSymbols(lshtml[2], lineIndex, rawLine.indexOf('(') + 1));
    }

    const forMatch = code.match(/^for\s+([A-Za-z_]\w*)(?:\s*,\s*([A-Za-z_]\w*))?\s+in\b.*\bdo\b/);
    if (forMatch) {
      const vars = [forMatch[1], forMatch[2]].filter(Boolean).map(name => makeScopeSymbol(name, 'loop', lineIndex, Math.max(0, rawLine.indexOf(name)), {
        signature: `loop variable ${name}`,
        documentation: `Loop variable \`${name}\`, available until this loop's \`end\`.`
      }));
      pushScope('loop', vars);
    } else if (/^(?:if\b.*\bthen\b|while\b.*\bdo\b|do\s*$)/.test(code) && !/\bend\b/.test(code)) {
      pushScope(/^if\b/.test(code) ? 'branch' : 'block');
    }

    const local = code.match(/^local\s+([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?$/);
    if (local) {
      const typeText = local[2]?.trim() || '';
      const initializer = local[3]?.trim() || '';
      addSymbol(makeScopeSymbol(local[1], 'local', lineIndex, Math.max(0, rawLine.indexOf(local[1])), {
        type: typeText,
        typeRef: parseTypeReference(typeText),
        initializer,
        signature: `local ${local[1]}${typeText ? `: ${typeText}` : ''}${initializer ? ` = ${initializer}` : ''}`,
        documentation: `Local variable \`${local[1]}\` visible in the current block${initializer ? `. It is initialized with \`${initializer}\`.` : '.'}`
      }));
    }

    // Handle compact lines such as: if ready then return 1 end
    const endCount = (code.match(/\bend\b/g) || []).length - (/^end\b/.test(code) ? 1 : 0);
    for (let n = 0; n < endCount; n++) popScope();
  }

  const visible = new Map();
  for (let depth = 0; depth < scopes.length; depth++) {
    for (const symbol of scopes[depth].symbols) visible.set(symbol.name, { ...symbol, depth });
  }
  return [...visible.values()];
}

function enclosingObjectAt(record, line) {
  return record.symbols
    .filter(symbol => symbol.members && Number.isInteger(symbol.endLine) && symbol.line <= line && line <= symbol.endLine)
    .sort((a, b) => (a.endLine - a.line) - (b.endLine - b.line))[0] || null;
}

function completionForScopeSymbol(symbol) {
  const item = new vscode.CompletionItem(symbol.name, vscode.CompletionItemKind.Variable);
  const label = symbol.scopeKind === 'parameter' ? 'Function parameter' : symbol.scopeKind === 'loop' ? 'Loop variable' : 'Local variable';
  item.detail = `${label}: ${symbol.name}${symbol.type ? ` (${symbol.type})` : ' (inferred)'}`;
  const md = new vscode.MarkdownString();
  md.appendCodeblock(symbol.signature || symbol.name, 'lazyscriptex');
  md.appendMarkdown(`\n${symbol.documentation || label}.`);
  item.documentation = md;
  item.insertText = symbol.name;
  item.sortText = `00_${String(999 - (symbol.depth || 0)).padStart(3, '0')}_${symbol.name}`;
  return item;
}

function symbolLocation(record, sym) {
  const start = positionAtLine(sym.line, sym.column);
  return new vscode.Location(record.uri, new vscode.Range(start, start.translate(0, sym.name.length)));
}

function importedSymbol(record, alias, member, childName = null) {
  const imp = record.imports.get(alias);
  if (!imp) return null;
  const target = indexedFile(resolveImport(imp.spec, record.uri.fsPath));
  if (!target) return null;
  const sym = target.exports.find(s => s.name === member);
  if (childName) {
    const child = sym?.members?.find(m => m.name === childName);
    return child ? { record: target, symbol: child, parent: sym } : null;
  }
  if (sym) return { record: target, symbol: sym };
  for (const obj of target.exports.filter(s => s.members)) {
    const child = obj.members.find(m => m.name === member);
    if (child) return { record: target, symbol: child, parent: obj };
  }
  return null;
}

function inferTypeFromInitializer(record, initializer, visited = new Set()) {
  if (!initializer) return null;
  let m;
  if ((m = initializer.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\.new\s*\(/))) return { alias: m[1], type: m[2] };
  if ((m = initializer.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/))) {
    const hit = importedSymbol(record, m[1], m[2], m[3]);
    const explicit = parseTypeReference(hit?.symbol?.returnType);
    if (explicit) return { alias: explicit.alias || m[1], type: explicit.type };
    if (['new','create','start','clone','load','open','connect','listen','accept'].includes(m[3])) return { alias: m[1], type: m[2] };
  }
  if ((m = initializer.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/))) {
    const hit = importedSymbol(record, m[1], m[2]);
    const explicit = parseTypeReference(hit?.symbol?.returnType);
    if (explicit) return { alias: explicit.alias || m[1], type: explicit.type };
  }
  if ((m = initializer.match(/^([A-Za-z_]\w*)\.new\s*\(/))) return { alias: '', type: m[1] };
  if ((m = initializer.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/))) {
    const sourceVar = record.symbols.find(s => s.kind === 'variable' && s.name === m[1]);
    if (sourceVar && !visited.has(sourceVar.name)) {
      visited.add(sourceVar.name);
      const sourceType = sourceVar.typeRef || inferTypeFromInitializer(record, sourceVar.initializer, visited);
      const resolved = resolveTypeObject(record, sourceType);
      const method = resolved?.object?.members?.find(x => x.name === m[2]);
      const explicit = parseTypeReference(method?.returnType);
      if (explicit) return { alias: explicit.alias || sourceType?.alias || '', type: explicit.type };
    }
  }
  return null;
}

function resolveTypeObject(record, typeRef) {
  if (!typeRef) return null;
  if (typeRef.alias) {
    const imp = record.imports.get(typeRef.alias);
    const target = imp && indexedFile(resolveImport(imp.spec, record.uri.fsPath));
    const object = target?.exports.find(s => s.name === typeRef.type && s.members);
    return object ? { record: target, object } : null;
  }
  const local = record.symbols.find(s => s.name === typeRef.type && s.members);
  if (local) return { record, object: local };
  for (const [alias] of record.imports) {
    const hit = importedSymbol(record, alias, typeRef.type);
    if (hit?.symbol?.members) return { record: hit.record, object: hit.symbol };
  }
  return null;
}

function resolveInstanceMember(record, variableName, memberName) {
  if (variableName === 'self') {
    const object = record.symbols.find(s => s.members?.some(m => m.name === memberName));
    const member = object?.members?.find(m => m.name === memberName);
    return member ? { record, symbol: member, parent: object } : null;
  }
  const variable = record.symbols.find(s => s.kind === 'variable' && s.name === variableName);
  if (!variable) return null;
  const typeRef = variable.typeRef || inferTypeFromInitializer(record, variable.initializer);
  const resolved = resolveTypeObject(record, typeRef);
  const member = resolved?.object?.members?.find(m => m.name === memberName);
  return member ? { record: resolved.record, symbol: member, parent: resolved.object } : null;
}

function chainContext(document, position) {
  const line = document.lineAt(position.line).text;
  let cursor = Math.min(position.character, line.length);
  if (cursor === line.length || !/[A-Za-z0-9_.]/.test(line[cursor] || '')) cursor--;
  if (cursor < 0 || !/[A-Za-z0-9_.]/.test(line[cursor])) return { chain: [], word: '', range: null, line };
  let start = cursor;
  let end = cursor + 1;
  while (start > 0 && /[A-Za-z0-9_.]/.test(line[start - 1])) start--;
  while (end < line.length && /[A-Za-z0-9_.]/.test(line[end])) end++;
  const text = line.slice(start, end).replace(/^\.+|\.+$/g, '');
  const chain = text.split('.').filter(Boolean);
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/)
    || document.getWordRangeAtPosition(new vscode.Position(position.line, Math.max(0, cursor)), /[A-Za-z_]\w*/);
  return { chain, word: wordRange ? document.getText(wordRange) : chain.at(-1) || '', range: wordRange, line, text };
}

function resolveChain(record, chain) {
  if (!chain.length) return null;
  if (chain.length >= 3 && record.imports.has(chain[0])) return importedSymbol(record, chain[0], chain[1], chain[2]);
  if (chain.length >= 2 && record.imports.has(chain[0])) return importedSymbol(record, chain[0], chain[1]);
  if (chain.length >= 2) {
    const instance = resolveInstanceMember(record, chain[0], chain[1]);
    if (instance) return instance;
    const object = record.symbols.find(s => s.name === chain[0] && s.members);
    const member = object?.members?.find(m => m.name === chain[1]);
    if (member) return { record, symbol: member, parent: object };
  }
  const local = record.symbols.find(s => s.name === chain.at(-1));
  if (local) return { record, symbol: local };
  return null;
}

function markdownForSymbol(record, symbol, parent = null) {
  enrichSymbol(record, symbol);
  const api = symbol.apiMetadata || null;
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.supportHtml = false;
  md.appendCodeblock(symbol.signature || symbol.name, 'lazyscriptex');

  const summary = api?.friendlyDescription || api?.whatItIs || symbol.documentation;
  if (summary) md.appendMarkdown(`\n${String(summary).replace(/\n/g, '  \n')}\n`);
  if (api?.whatItIs && api.whatItIs !== summary) md.appendMarkdown(`\n**What this is**  \n${api.whatItIs.replace(/\n/g, '  \n')}\n`);
  if (api?.whenToUse) md.appendMarkdown(`\n**When to use it**  \n${api.whenToUse.replace(/\n/g, '  \n')}\n`);
  if (api?.beginnerNote) md.appendMarkdown(`\n> **Beginner note:** ${api.beginnerNote.replace(/\n/g, '  \n')}\n`);
  if (api?.memberSummary) md.appendMarkdown(`\n**What it contains**  \n${api.memberSummary.replace(/\n/g, '  \n')}\n`);
  if (api?.howToGet) md.appendMarkdown(`\n**How you get one**  \n${api.howToGet.replace(/\n/g, '  \n')}\n`);
  if (api?.workflow) md.appendMarkdown(`\n**How it fits into a real task**  \n${api.workflow.replace(/\n/g, '  \n')}\n`);
  if (api?.commonMistake) md.appendMarkdown(`\n> **Common mistake:** ${api.commonMistake.replace(/\n/g, '  \n')}\n`);
  if (api?.requires) md.appendMarkdown(`\n**Requires**  \n${api.requires.replace(/\n/g, '  \n')}\n`);

  const parts = symbol.parameters ? { parameters: symbol.parameters, returnType: symbol.returnType || '' } : signatureParts(symbol.signature || '');
  if (parts.parameters.length) {
    md.appendMarkdown('\n**Parameters**\n');
    for (const parameter of parts.parameters) {
      const explanation = api?.parameterDocs?.[parameter.name];
      md.appendMarkdown(`\n- \`${parameter.name}\` — \`${parameter.type}\`${explanation ? `: ${explanation}` : ''}`);
    }
    md.appendMarkdown('\n');
  }
  if (parts.returnType) {
    md.appendMarkdown(`\n**Returns:** \`${parts.returnType}\`${api?.returnsDescription ? ` — ${api.returnsDescription}` : ''}\n`);
  }
  if (api?.example) {
    md.appendMarkdown(`\n**Example${api.exampleNote ? ` — ${api.exampleNote}` : ''}**\n`);
    md.appendCodeblock(api.example, 'lazyscriptex');
  }
  if (api?.cleanup) md.appendMarkdown(`\n**Cleanup**  \n${api.cleanup.replace(/\n/g, '  \n')}\n`);
  if (api?.related?.length) md.appendMarkdown(`\n**Related:** ${api.related.map(value => `\`${value}\``).join(', ')}\n`);
  if (symbol.dll) md.appendMarkdown(`\n**Native library:** \`${symbol.dll}\`\n`);
  if (parent) md.appendMarkdown(`\n**Part of:** \`${parent.name}\`\n`);
  if (parent?.staticObject) {
    md.appendMarkdown(`\n> **Static object:** Call this directly as \`ModuleAlias.${parent.name}.${symbol.name}(...)\`. Do not create it with \`.new()\`; \`self\` refers to the one shared object.\n`);
  }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  md.appendMarkdown(`\n**Defined in:** \`${root ? path.relative(root, record.uri.fsPath) : record.uri.fsPath}:${symbol.line + 1}\``);
  return md;
}

function snippetForCallable(symbol) {
  const parameters = symbol.parameters || signatureParts(symbol.signature || '').parameters;
  if (!parameters.length) return new vscode.SnippetString(`${symbol.name}()`);
  return new vscode.SnippetString(`${symbol.name}(${parameters.map((p, i) => `\${${i + 1}:${p.name}}`).join(', ')})`);
}

function completionFor(record, symbol, prefix = '', parent = null) {
  enrichSymbol(record, symbol);
  const item = new vscode.CompletionItem(symbol.name, completionKind(symbol.kind));
  item.detail = `${prefix}${symbol.signature}`;
  item.documentation = markdownForSymbol(record, symbol, parent);
  item.sortText = `${symbol.kind === 'method' || symbol.kind === 'function' ? '0' : '1'}_${symbol.name}`;
  if (symbol.apiMetadata?.friendlyDescription) item.label = { label: symbol.name, description: symbol.apiMetadata.friendlyDescription };
  if (symbol.kind === 'method' || symbol.kind === 'function') item.insertText = snippetForCallable(symbol);
  return item;
}


const LSHTML_VOID_TAGS = new Set([
  'spacer','separator','hr','img','image','input','number','range','slider','color','file','search','date','time','keybind',
  'progress','meter','icon','rect','circle','ellipse','line','triangle','polygon','polyline','path','canvas-image'
]);

const LSHTML_TAG_DOCS = {
  ui: ['Root interface container', 'Use one as the top element of a screen, menu, HUD, or editor panel. It normally fills the window and becomes the root passed to UI.document().', '<ui class="screen">...</ui>'],
  panel: ['General-purpose container', 'Groups related controls and can receive backgrounds, borders, padding, layout, scrolling, and events.', '<panel class="inventory-panel">...</panel>'],
  row: ['Horizontal layout container', 'Places child elements from left to right. Use gap, align_items, and justify_content in LSCSS to control spacing.', '<row class="toolbar"><button>Save</button><button>Run</button></row>'],
  column: ['Vertical layout container', 'Stacks child elements from top to bottom. It is useful for forms, settings, lists, and card content.', '<column class="settings">...</column>'],
  button: ['Clickable action control', 'Use onclick={handler} to run an LSX function when the user activates it.', '<button onclick={save_clicked}>Save</button>'],
  input: ['Single-line text field', 'Use value, placeholder, oninput, and onchange for names, paths, search text, and other editable strings.', '<input value={props.name} placeholder="Character name" oninput={name_changed} />'],
  textarea: ['Multi-line text field', 'Use for descriptions, scripts, notes, dialogue, or any text that needs multiple lines.', '<textarea value={props.notes} placeholder="Write notes here" />'],
  checkbox: ['On/off control', 'Use checked for the starting state and onchange for changes.', '<checkbox checked onchange={toggle_shadows}>Shadows</checkbox>'],
  range: ['Numeric slider', 'Use min, max, step, and number-value/value bindings for volume, speed, strength, and similar settings.', '<range min=0 max=100 step=1 number-value={props.volume} />'],
  image: ['Texture-backed image element', 'Use it for icons, portraits, thumbnails, and UI artwork. Bind a loaded texture through the texture attribute.', '<image texture={portrait} class="portrait" />'],
  canvas: ['Custom drawing surface', 'Use for graphs, minimaps, procedural HUD shapes, editor overlays, or custom visualizations. Declarative child shapes are preferred for static content; CanvasContext is available for runtime drawing.', '<canvas id="minimap"><rect x="0" y="0" width="160" height="160" /></canvas>'],
  rect: ['Canvas rectangle', 'Draws a rectangle inside the nearest canvas. Set x, y, width, height, and style it with LSCSS.', '<rect x="16" y="16" width="120" height="48" class="card" />'],
  circle: ['Canvas circle', 'Draws a circle inside the nearest canvas using cx, cy, and r.', '<circle cx="80" cy="80" r="32" class="marker" />'],
  line: ['Canvas line', 'Draws a straight line inside the nearest canvas using x1, y1, x2, and y2.', '<line x1="10" y1="10" x2="150" y2="90" class="guide" />'],
  scroll: ['Scrollable container', 'Give it a fixed or limited height and set overflow_y = "auto" or "scroll" in LSCSS. Children remain inside while the user scrolls.', '<scroll class="inventory-list">...</scroll>'],
  list: ['List container', 'Groups repeated rows or items. Combine with overflow_y for long inventories, logs, search results, and object lists.', '<list class="results">...</list>'],
  tabs: ['Tabbed navigation container', 'Groups tab buttons and pages. Use click handlers to switch the active page when building custom behavior.', '<tabs><tab>Graphics</tab><tab>Audio</tab></tabs>'],
  table: ['Row-and-column data layout', 'Use with thead, tbody, tr, th, and td for structured data such as profiler results or asset properties.', '<table><tr><th>Name</th><th>Value</th></tr></table>'],
  dialog: ['Modal or focused popup content', 'Use for confirmations, settings windows, import options, and tasks that temporarily need the user’s attention.', '<dialog class="confirm-dialog">...</dialog>'],
  tooltip: ['Small contextual help popup', 'Use to explain an icon, property, or unfamiliar control without permanently occupying layout space.', '<tooltip>Deletes the selected object.</tooltip>'],
  nodeeditor: ['Visual node workspace', 'Use as the retained container for graph nodes, ports, links, selection, panning, and zooming in editor tools.', '<nodeeditor id="behavior-graph" />'],
  inspector: ['Editor inspector container', 'Use for selected-object properties, foldouts, fields, asset pickers, and component controls.', '<inspector id="inspector">...</inspector>'],
  hierarchy: ['Scene hierarchy container', 'Use for parent/child game-object rows, selection, foldouts, and drag-and-drop reparenting.', '<hierarchy id="scene-tree">...</hierarchy>'],
  viewport: ['Scene or game rendering area', 'Use as the editor region that presents a rendered scene, preview, or camera output.', '<viewport id="scene-view" />']
};

function humanTagName(tag) {
  return String(tag || '').replace(/-/g, ' ').replace(/\b\w/g, value => value.toUpperCase());
}

function lshtmlTagInfo(tag) {
  const name = String(tag || '').toLowerCase();
  if (LSHTML_TAG_DOCS[name]) return LSHTML_TAG_DOCS[name];
  if (/^(h[1-6]|p|paragraph|span|text|strong|em|small|mark|code|pre|kbd|subtitle)$/.test(name)) {
    return [`${humanTagName(name)} text element`, 'Displays text with semantic styling. Put text or an LSX binding between the opening and closing tags, then style it with LSCSS.', `<${name}>Visible text</${name}>`];
  }
  if (/^(health-bar|healthbar|mana-bar|manabar|progress|meter)$/.test(name)) {
    return [`${humanTagName(name)} value display`, 'Shows a current value relative to a maximum. Use it for health, mana, loading, progress, capacity, or other bounded values.', `<${name} value={current} max={maximum} />`];
  }
  if (/^(asset|object|texture|material|enum|vector[234]|rect|transform)field$/.test(name.replace(/-/g,''))) {
    return [`${humanTagName(name)} editor field`, 'An editor-oriented property control. Bind it to the selected object or property and handle changes through the matching event.', `<${name} value={props.value} onchange={value_changed} />`];
  }
  if (/(editor|graph|view|browser|mixer|timeline|profiler|console)$/.test(name.replace(/-/g,''))) {
    return [`${humanTagName(name)} editor widget`, 'A specialized retained container for editor tooling. Use its API and child elements to provide the data and behavior needed by that tool.', `<${name} id="${name}" />`];
  }
  if (/^(div|section|article|main|header|footer|aside|nav|form|fieldset|group|stack|grid|overlay|window|root|fragment)$/.test(name)) {
    return [`${humanTagName(name)} container`, 'Groups child elements and participates in LazyUI layout. Use LSCSS to choose size, direction, spacing, alignment, background, border, and overflow.', `<${name} class="container">...</${name}>`];
  }
  return [`${humanTagName(name)} LazyUI element`, 'A retained LazyUI element. Add it in LSHTML, style it with LSCSS, and use bindings or event handlers when it needs runtime behavior.', LSHTML_VOID_TAGS.has(name) ? `<${name} />` : `<${name}>...</${name}>`];
}

function markdownForLshtmlTag(tag) {
  const [title, description, example] = lshtmlTagInfo(tag);
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${title}**  \n${description}\n\n`);
  md.appendCodeblock(example, 'lazyscriptex');
  md.appendMarkdown('\nStyle this element with an `lscss` class or ID selector. Bind LSX values with `{value}` expressions.');
  return md;
}

const LSHTML_ATTRIBUTES = [
  ['id', 'id="${1:name}"', 'Unique element ID used by #id LSCSS rules and find_id.'],
  ['class', 'class="${1:class-name}"', 'One or more space-separated LSCSS classes.'],
  ['title', 'title="${1:text}"', 'Element title or tooltip text.'],
  ['value', 'value={${1:value}}', 'Bind an LSX value to this element.'],
  ['context', 'context={${1:props}}', 'Pass a normal LSX object to an event handler.'],
  ['onclick', 'onclick={${1:handler}}', 'Click event handler.'],
  ['onchange', 'onchange={${1:handler}}', 'Value-change event handler.'],
  ['oninput', 'oninput={${1:handler}}', 'Input event handler.'],
  ['onfocus', 'onfocus={${1:handler}}', 'Focus event handler.'],
  ['onblur', 'onblur={${1:handler}}', 'Blur event handler.'],
  ['onkeydown', 'onkeydown={${1:handler}}', 'Keyboard-down event handler.'],
  ['onkeyup', 'onkeyup={${1:handler}}', 'Keyboard-up event handler.'],
  ['onpointerdown', 'onpointerdown={${1:handler}}', 'Pointer-down event handler.'],
  ['onpointerup', 'onpointerup={${1:handler}}', 'Pointer-up event handler.'],
  ['onpointermove', 'onpointermove={${1:handler}}', 'Pointer-move event handler.'],
  ['onscroll', 'onscroll={${1:handler}}', 'Scroll event handler.'],
  ['disabled', 'disabled', 'Disable interaction.'],
  ['checked', 'checked', 'Initial checked state.'],
  ['selected', 'selected', 'Initial selected state.'],
  ['hidden', 'hidden', 'Hide this element.'],
  ['readonly', 'readonly', 'Prevent editing.'],
  ['placeholder', 'placeholder="${1:text}"', 'Placeholder text.'],
  ['min', 'min={${1:0}}', 'Minimum numeric value.'],
  ['max', 'max={${1:100}}', 'Maximum numeric value.'],
  ['step', 'step={${1:1}}', 'Numeric step.'],
  ['texture', 'texture={${1:texture}}', 'Texture object or texture identifier.'],
  ['x', 'x={${1:0}}', 'Canvas-local X coordinate.'],
  ['y', 'y={${1:0}}', 'Canvas-local Y coordinate.'],
  ['width', 'width={${1:100}}', 'Canvas shape width.'],
  ['height', 'height={${1:100}}', 'Canvas shape height.'],
  ['cx', 'cx={${1:0}}', 'Canvas circle/ellipse center X.'],
  ['cy', 'cy={${1:0}}', 'Canvas circle/ellipse center Y.'],
  ['r', 'r={${1:10}}', 'Canvas circle radius.'],
  ['rx', 'rx={${1:10}}', 'Canvas ellipse horizontal radius.'],
  ['ry', 'ry={${1:10}}', 'Canvas ellipse vertical radius.'],
  ['x1', 'x1={${1:0}}', 'Canvas line first X coordinate.'],
  ['y1', 'y1={${1:0}}', 'Canvas line first Y coordinate.'],
  ['x2', 'x2={${1:100}}', 'Canvas line second X coordinate.'],
  ['y2', 'y2={${1:100}}', 'Canvas line second Y coordinate.'],
  ['points', 'points="${1:0,0 100,0 50,100}"', 'Static canvas polygon/polyline points.']
];

function documentTextBefore(document, position) {
  if (typeof document.offsetAt === 'function' && typeof document.getText === 'function') {
    return document.getText().slice(0, document.offsetAt(position));
  }
  const lines = [];
  for (let line = 0; line <= position.line; line++) {
    const text = document.lineAt(line).text;
    lines.push(line === position.line ? text.slice(0, position.character) : text);
  }
  return lines.join('\n');
}

function insideLshtml(document, position) {
  const before = documentTextBefore(document, position);
  const declaration = before.lastIndexOf('lshtml');
  if (declaration < 0) return false;
  const closed = before.lastIndexOf(')}');
  return declaration > closed;
}

function nearestOpenLshtmlTag(before) {
  const stack = [];
  const tags = before.matchAll(/<\s*(\/)?\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s[^<>]*?)?(\/?)>/g);
  for (const match of tags) {
    const tag = match[2].toLowerCase();
    if (match[1]) {
      const at = stack.lastIndexOf(tag);
      if (at >= 0) stack.splice(at, 1);
    } else if (!match[3] && !LSHTML_VOID_TAGS.has(tag)) stack.push(tag);
  }
  return stack.at(-1) || '';
}

function lshtmlCompletionItems(document, position) {
  if (!insideLshtml(document, position)) return null;
  const before = documentTextBefore(document, position);
  const lastLt = before.lastIndexOf('<');
  const lastGt = before.lastIndexOf('>');
  if (lastLt <= lastGt) return null;
  const fragment = before.slice(lastLt);
  const closing = /^<\//.test(fragment);
  const tagToken = fragment.match(/^<\/?([A-Za-z0-9_-]*)$/);
  if (tagToken) {
    const items = [];
    if (closing) {
      const nearest = nearestOpenLshtmlTag(before.slice(0, lastLt));
      if (nearest) {
        const preferred = new vscode.CompletionItem(nearest, vscode.CompletionItemKind.Class);
        preferred.detail = `Close <${nearest}>`;
        preferred.insertText = nearest;
        preferred.sortText = `0_${nearest}`;
        items.push(preferred);
      }
    }
    for (const tag of [...TAG_FUNCTIONS].sort()) {
      if (items.some(item => item.label === tag)) continue;
      const item = new vscode.CompletionItem(tag, vscode.CompletionItemKind.Class);
      const [title] = lshtmlTagInfo(tag);
      item.detail = title;
      item.documentation = markdownForLshtmlTag(tag);
      item.insertText = tag;
      item.sortText = `1_${tag}`;
      items.push(item);
    }
    return items;
  }
  if (/^<[A-Za-z][A-Za-z0-9_-]*(?:\s+[^<>]*)?$/.test(fragment) && !closing) {
    return LSHTML_ATTRIBUTES.map(([name, snippet, description]) => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property ?? vscode.CompletionItemKind.Field);
      item.detail = `LSHTML ${name} attribute`;
      item.documentation = new vscode.MarkdownString(description);
      item.insertText = new vscode.SnippetString(snippet);
      item.sortText = `0_${name}`;
      return item;
    });
  }
  return null;
}



const LSCSS_PROPERTY_DOCS = {
  display: ['Layout participation', 'Controls whether the element participates in layout. Use "none" to hide it and "flex" for ordinary retained layout.', 'display = "flex"'],
  width: ['Element width', 'Sets the preferred width. Numeric values are pixels/local units; percentage and automatic sizing may be used where the layout supports them.', 'width = 320'],
  height: ['Element height', 'Sets the preferred height. A scrollable panel normally needs a fixed height or max_height so overflow has a boundary.', 'height = 260'],
  min_width: ['Minimum width', 'Prevents the element from becoming narrower than this value during layout.', 'min_width = 180'],
  min_height: ['Minimum height', 'Prevents the element from becoming shorter than this value during layout.', 'min_height = 80'],
  max_width: ['Maximum width', 'Limits how wide the element may grow.', 'max_width = 720'],
  max_height: ['Maximum height', 'Limits vertical growth. Combine it with overflow_y = "auto" for long lists.', 'max_height = 420'],
  padding: ['Inner spacing', 'Adds space between the element border/background and its children. One value applies to every side.', 'padding = 16'],
  padding_left: ['Left inner spacing', 'Adds space between the left edge and child content.', 'padding_left = 12'],
  padding_right: ['Right inner spacing', 'Adds space between the right edge and child content.', 'padding_right = 12'],
  padding_top: ['Top inner spacing', 'Adds space above child content.', 'padding_top = 10'],
  padding_bottom: ['Bottom inner spacing', 'Adds space below child content.', 'padding_bottom = 10'],
  margin: ['Outer spacing', 'Adds space outside the element, separating it from neighboring elements.', 'margin = 8'],
  gap: ['Spacing between children', 'Adds consistent space between direct children in a row, column, grid, or list.', 'gap = 10'],
  flex_direction: ['Child layout direction', 'Use "row" to place children left-to-right or "column" to stack them top-to-bottom.', 'flex_direction = "column"'],
  flex_grow: ['Extra-space growth', 'A value greater than zero lets the element consume remaining space in its parent.', 'flex_grow = 1'],
  flex_shrink: ['Shrink permission', 'Use 0 when a row/card must keep its requested size inside a scrolling container.', 'flex_shrink = 0'],
  align_items: ['Cross-axis alignment', 'Aligns children across the parent’s secondary axis. Common values are "start", "center", "end", and "stretch".', 'align_items = "center"'],
  justify_content: ['Main-axis alignment', 'Positions children along the parent’s layout direction. Common values are "start", "center", "end", "space-between", and "space-around".', 'justify_content = "space-between"'],
  position: ['Positioning mode', 'Use "relative" for normal layout and "absolute" for overlays positioned with left/top/right/bottom.', 'position = "absolute"'],
  left: ['Left offset', 'Positions an absolute element from its parent’s left edge.', 'left = 16'],
  right: ['Right offset', 'Positions an absolute element from its parent’s right edge.', 'right = 16'],
  top: ['Top offset', 'Positions an absolute element from its parent’s top edge.', 'top = 16'],
  bottom: ['Bottom offset', 'Positions an absolute element from its parent’s bottom edge.', 'bottom = 16'],
  background: ['Background paint', 'Sets the element background. Use a solid color or an LSCSS gradient value.', 'background = "#162238"'],
  color: ['Text/foreground color', 'Sets the text and default foreground color. It can also use an LSX binding such as {props.text_color}.', 'color = "#f3f7ff"'],
  opacity: ['Overall opacity', 'Multiplies the element and child opacity. Values normally range from 0.0 (invisible) to 1.0 (fully visible).', 'opacity = 0.85'],
  border: ['Border shorthand', 'Sets border thickness/style/color when using the shorthand form supported by LazyUI.', 'border = "1px solid #334a68"'],
  border_width: ['Border thickness', 'Sets the thickness of the element border.', 'border_width = 1'],
  border_color: ['Border color', 'Sets the packed or textual color used by the border.', 'border_color = "#334a68"'],
  border_radius: ['Corner rounding', 'Rounds panel, button, input, and image corners.', 'border_radius = 8'],
  font_size: ['Text size', 'Sets the text size used by this element and inherited text children where applicable.', 'font_size = 16'],
  font_weight: ['Text weight', 'Selects normal or emphasized text weight when supported by the active font renderer.', 'font_weight = 700'],
  text_align: ['Text alignment', 'Aligns text inside its content box. Common values are "left", "center", and "right".', 'text_align = "center"'],
  overflow_x: ['Horizontal overflow', 'Use "auto" to show horizontal scrolling only when needed, "scroll" to keep it enabled, or "hidden" to clip.', 'overflow_x = "auto"'],
  overflow_y: ['Vertical overflow / scrolling', 'Use "auto" for a scrollbar only when content is taller than the fixed/max-height container, or "scroll" to keep scrolling enabled.', 'overflow_y = "auto"'],
  cursor: ['Mouse cursor', 'Changes the cursor shown over interactive elements, for example "pointer", "text", or "default".', 'cursor = "pointer"'],
  white_space: ['Text wrapping behavior', 'Controls whether text wraps or preserves spaces/newlines. Use it for code views, logs, and labels.', 'white_space = "pre-wrap"'],
  z_index: ['Overlay order', 'Larger values place positioned overlays above lower-valued siblings.', 'z_index = 10'],
  scrollbar_width: ['Scrollbar thickness', 'Sets the visual width of a vertical scrollbar when the current LazyUI theme exposes custom scrollbar styling.', 'scrollbar_width = 10'],
  scrollbar_track: ['Scrollbar track color', 'Sets the background behind the draggable scrollbar thumb.', 'scrollbar_track = "#0c1420"'],
  scrollbar_thumb: ['Scrollbar thumb color', 'Sets the draggable part of the scrollbar.', 'scrollbar_thumb = "#42648d"'],
  scrollbar_thumb_hover: ['Hovered scrollbar thumb color', 'Sets the thumb color while the pointer is over it.', 'scrollbar_thumb_hover = "#5b83b5"']
};

function insideLscss(document, position) {
  const before = documentTextBefore(document, position);
  const matches = [...before.matchAll(/\blscss\s+[^=\n]+?=\s*\{/g)];
  if (!matches.length) return false;
  const start = matches.at(-1).index + matches.at(-1)[0].length - 1;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = start; i < before.length; i++) {
    const ch = before[i];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return depth > 0;
}

function markdownForLscssProperty(name) {
  const info = LSCSS_PROPERTY_DOCS[name];
  if (!info) return null;
  const [title, description, example] = info;
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${title} — \`${name}\`**  \n${description}\n\n`);
  md.appendCodeblock(example, 'lazyscriptex');
  if (name === 'overflow_y') md.appendMarkdown('\nFor a working scrollbar, also give the container a fixed `height`/`max_height` and use `flex_shrink = 0` on rows that must keep their height.');
  else md.appendMarkdown('\nLSCSS values may use ordinary literals or LSX bindings such as `{props.value}`.');
  return md;
}

function lscssCompletionItems(document, position) {
  if (!insideLscss(document, position)) return null;
  const line = document.lineAt(position.line).text.slice(0, position.character);
  if (/=\s*[^=]*$/.test(line) && !/^\s*[A-Za-z_]\w*\s*$/.test(line)) return null;
  return Object.entries(LSCSS_PROPERTY_DOCS).map(([name, info]) => {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property ?? vscode.CompletionItemKind.Field);
    item.detail = info[0];
    item.documentation = markdownForLscssProperty(name);
    item.insertText = new vscode.SnippetString(`${name} = \${1:${info[2].split(' = ')[1] || 'value'}}`);
    item.sortText = `0_${name}`;
    return item;
  });
}


function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}


function normalizeLsxLineSpacing(raw, state) {
  let out = '';
  let quote = '';
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1] || '';
    if (state.blockComment) {
      out += ch;
      if (ch === ']' && next === ']') {
        out += next;
        i++;
        state.blockComment = false;
      }
      continue;
    }
    if (quote) {
      out += ch;
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '-' && next === '-' && raw[i + 2] === '[' && raw[i + 3] === '[') {
      out += '--[[';
      i += 3;
      state.blockComment = true;
      continue;
    }
    if (ch === '-' && next === '-') {
      out += raw.slice(i);
      break;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === ',') {
      out = out.replace(/[ \t]+$/g, '') + ',';
      let j = i + 1;
      while (j < raw.length && /[ \t]/.test(raw[j])) j++;
      if (j < raw.length && !/[\)\]\}]/.test(raw[j])) out += ' ';
      i = j - 1;
      continue;
    }
    out += ch;
  }
  return out.replace(/\bfn\s+\(/g, 'fn(').replace(/[ \t]+$/g, '');
}

function formatCodeView(raw, state) {
  let out = '';
  let quote = '';
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1] || '';
    if (state.blockComment) {
      if (ch === ']' && next === ']') {
        state.blockComment = false;
        out += '  ';
        i++;
      } else out += ' ';
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; out += ' '; continue; }
      if (ch === '\\') { escaped = true; out += ' '; continue; }
      if (ch === quote) quote = '';
      out += ' ';
      continue;
    }
    if (ch === '-' && next === '-' && raw[i + 2] === '[' && raw[i + 3] === '[') {
      state.blockComment = true;
      out += '    ';
      i += 3;
      continue;
    }
    if (ch === '-' && next === '-') {
      out += ' '.repeat(raw.length - i);
      break;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

function htmlIndentDelta(code, active) {
  if (!active && !/<\/?[A-Za-z][\w-]*(?:\s|>|\/)/.test(code)) return { delta: 0, leadingClosers: 0 };
  let delta = 0;
  let leadingClosers = 0;
  const trimmed = code.trimStart();
  const regex = /<(\/)?([A-Za-z][\w-]*)(?:\s[^<>]*?)?(\/?)>/g;
  let match;
  while ((match = regex.exec(code))) {
    const closing = Boolean(match[1]);
    const tag = match[2].toLowerCase();
    const selfClosing = Boolean(match[3]) || LSHTML_VOID_TAGS.has(tag);
    if (closing) {
      delta--;
      if (match.index === code.indexOf(trimmed) || trimmed.startsWith(match[0])) leadingClosers++;
    } else if (!selfClosing) delta++;
  }
  return { delta, leadingClosers };
}

function formatLsxText(text, options = {}) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalNewline = /\r?\n$/.test(text);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (hadFinalNewline && lines.at(-1) === '') lines.pop();
  const insertSpaces = options.insertSpaces !== false;
  const tabSize = Number.isFinite(options.tabSize) && options.tabSize > 0 ? options.tabSize : 4;
  const indentUnit = insertSpaces ? ' '.repeat(tabSize) : '\t';
  const state = { blockComment: false };
  const spacingState = { blockComment: false };
  let indent = 0;
  let lshtmlDepth = 0;
  const outputLines = [];

  for (const original of lines) {
    const trimmed = original.trim();
    if (!trimmed) {
      outputLines.push('');
      continue;
    }

    const formattedContent = normalizeLsxLineSpacing(trimmed, spacingState);
    const codeRaw = formatCodeView(formattedContent, state);
    const code = codeRaw.trim();
    const lshtmlStart = /^(?:export\s+)?lshtml\b.*=\s*\{\(\s*$/.test(code);
    const lshtmlEnd = /^\)\}\s*$/.test(code);
    const normalized = code.replace(/\{\(/g, '{').replace(/\)\}/g, '}');

    const startsEnd = /^end\b/.test(code);
    const startsBranch = /^(?:else\b|elseif\b)/.test(code);
    let leadingDelimiterClosers = 0;
    const leading = normalized.match(/^[\s]*[\}\]\)]+/);
    if (leading) leadingDelimiterClosers = countMatches(leading[0], /[\}\]\)]/g);
    const html = htmlIndentDelta(code, lshtmlDepth > 0 || lshtmlStart);
    const preDedent = (startsEnd || startsBranch ? 1 : 0) + leadingDelimiterClosers + html.leadingClosers;
    const lineIndent = Math.max(0, indent - preDedent);
    outputLines.push(indentUnit.repeat(lineIndent) + formattedContent);

    const openDelimiters = countMatches(normalized, /[\{\[\(]/g);
    const closeDelimiters = countMatches(normalized, /[\}\]\)]/g);
    const endCount = countMatches(code, /\bend\b/g);
    let keywordOpens = 0;
    const compact = endCount > 0;
    if (!compact && (/^(?:export\s+)?fn\s+[A-Za-z_]\w*\s*\(/.test(code) || /^[A-Za-z_]\w*\s*=\s*fn\s*\(/.test(code) || /^local\s+[A-Za-z_]\w*\s*=\s*fn\s*\(/.test(code))) keywordOpens++;
    if (!compact && /^if\b.*\bthen\b/.test(code)) keywordOpens++;
    if (!compact && /^while\b.*\bdo\b/.test(code)) keywordOpens++;
    if (!compact && /^for\b.*\bdo\b/.test(code)) keywordOpens++;
    if (!compact && /^do\s*$/.test(code)) keywordOpens++;
    // elseif/else close the previous branch for display but keep the same block depth.
    if (startsBranch) keywordOpens = 0;

    indent = Math.max(0, indent + keywordOpens - endCount + openDelimiters - closeDelimiters + html.delta);
    if (lshtmlStart) lshtmlDepth++;
    if (lshtmlEnd) lshtmlDepth = Math.max(0, lshtmlDepth - 1);
  }

  return outputLines.join(eol) + (hadFinalNewline ? eol : '');
}

class DocumentFormattingProvider {
  provideDocumentFormattingEdits(document, options) {
    if (!vscode.workspace.getConfiguration('lazyscriptex').get('format.enable', true)) return [];
    const original = document.getText();
    const formatted = formatLsxText(original, options);
    if (formatted === original) return [];
    const start = new vscode.Position(0, 0);
    const lastLine = Math.max(0, document.lineCount - 1);
    const end = document.lineAt(lastLine).range?.end || new vscode.Position(lastLine, document.lineAt(lastLine).text.length);
    return [vscode.TextEdit.replace(new vscode.Range(start, end), formatted)];
  }
}

class CompletionProvider {
  provideCompletionItems(document, position) {
    const importItems = importCompletionItems(document, position);
    if (importItems) return importItems;
    const markupItems = lshtmlCompletionItems(document, position);
    if (markupItems) return markupItems;
    const styleItems = lscssCompletionItems(document, position);
    if (styleItems) return styleItems;
    const record = activeRecord(document);
    const scopeSymbols = collectVisibleScopeSymbols(document, position);
    const scopeRecord = { ...record, symbols: [...scopeSymbols, ...record.symbols.filter(symbol => symbol.kind !== 'variable')] };
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    const chainMatch = prefix.match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)?$/);
    if (chainMatch) {
      const base = chainMatch[1].split('.');
      if (base.length === 2 && record.imports.has(base[0])) {
        const hit = importedSymbol(record, base[0], base[1]);
        if (hit?.symbol?.members) return hit.symbol.members.filter(sym => !sym.name.startsWith('_')).map(sym => completionFor(hit.record, sym, `${base.join('.')}.`, hit.symbol));
      }
      if (base.length === 1 && record.imports.has(base[0])) {
        const imp = record.imports.get(base[0]);
        const target = indexedFile(resolveImport(imp.spec, record.uri.fsPath));
        return target ? target.exports.map(sym => completionFor(target, sym, `${base[0]}.`)) : [];
      }
      if (base.length === 1) {
        if (base[0] === 'self') {
          const object = enclosingObjectAt(record, position.line);
          if (object) return object.members.filter(sym => !sym.name.startsWith('_')).map(sym => completionFor(record, sym, 'self.', object));
        }
        const builtinItems = Object.entries(BUILTIN_DOCS).filter(([name]) => name.startsWith(`${base[0]}.`)).map(([name, info]) => {
          const method = name.slice(base[0].length + 1);
          const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Function);
          item.detail = info[0];
          const md = new vscode.MarkdownString();
          md.appendCodeblock(info[0], 'lazyscriptex');
          md.appendMarkdown(`\n${info[1]}`);
          item.documentation = md;
          const pseudo = { name: method, signature: info[0].replace(`${base[0]}.`, ''), parameters: signatureParts(info[0]).parameters };
          item.insertText = snippetForCallable(pseudo);
          return item;
        });
        if (builtinItems.length) return builtinItems;
        const variable = scopeSymbols.find(s => s.name === base[0]) || record.symbols.find(s => s.kind === 'variable' && s.name === base[0]);
        if (variable) {
          const typeRef = variable.typeRef || inferTypeFromInitializer(scopeRecord, variable.initializer);
          const resolved = resolveTypeObject(scopeRecord, typeRef);
          if (resolved) return resolved.object.members.filter(sym => !sym.name.startsWith('_')).map(sym => completionFor(resolved.record, sym, `${base[0]}.`, resolved.object));
        }
        const object = record.symbols.find(s => s.name === base[0] && s.members);
        if (object) return object.members.filter(sym => !sym.name.startsWith('_')).map(sym => completionFor(record, sym, `${base[0]}.`, object));
      }
    }
    const items = KEYWORDS.map(keyword => new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword));
    const addedNames = new Set();
    for (const sym of scopeSymbols.sort((a, b) => (b.depth || 0) - (a.depth || 0))) {
      if (addedNames.has(sym.name)) continue;
      items.push(completionForScopeSymbol(sym));
      addedNames.add(sym.name);
    }
    for (const sym of record.symbols) {
      if (sym.kind === 'variable' || addedNames.has(sym.name)) continue;
      items.push(completionFor(record, sym));
      addedNames.add(sym.name);
    }
    for (const [alias, imp] of record.imports) {
      const item = new vscode.CompletionItem(alias, vscode.CompletionItemKind.Module);
      item.detail = `LSX module: ${imp.spec}`;
      item.documentation = new vscode.MarkdownString(`Imported from \`${imp.spec}\`. Type \`${alias}.\` to browse its exported API.`);
      items.push(item);
    }
    return items;
  }
}

class HoverProvider {
  provideHover(document, position) {
    const importContext = importPathContext(document, position, false);
    if (importContext) {
      const resolved = resolveImport(importContext.full, document.uri.fsPath);
      const md = new vscode.MarkdownString();
      md.appendCodeblock(`use "${importContext.full}" as Alias`, 'lazyscriptex');
      if (resolved) md.appendMarkdown(`\n**Resolved file:** \`${resolved}\`\n\n${fileExists(resolved) ? 'This module exists and can be opened with Go to Definition.' : 'This path does not currently point to an LSX file.'}`);
      else md.appendMarkdown('\nThis named module root is not configured. Run **LazyScriptEX: Select LazyScript/API Folder** or configure `moduleRoots`.');
      return new vscode.Hover(md);
    }
    const ctx = chainContext(document, position);
    if (insideLshtml(document, position) && ctx.word && TAG_FUNCTIONS.has(ctx.word.toLowerCase())) {
      return new vscode.Hover(markdownForLshtmlTag(ctx.word.toLowerCase()));
    }
    if (insideLscss(document, position) && ctx.word && LSCSS_PROPERTY_DOCS[ctx.word]) {
      return new vscode.Hover(markdownForLscssProperty(ctx.word));
    }
    const record = activeRecord(document);
    const hit = resolveChain(record, ctx.chain);
    if (hit) return new vscode.Hover(markdownForSymbol(hit.record, hit.symbol, hit.parent));
    const builtinKey = ctx.chain.slice(-2).join('.');
    const builtin = BUILTIN_DOCS[builtinKey];
    if (builtin) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock(builtin[0], 'lazyscriptex');
      md.appendMarkdown(`\n${builtin[1]}`);
      return new vscode.Hover(md);
    }
    for (const r of index.values()) {
      const sym = r.exports.find(s => s.name === ctx.word);
      if (sym) return new vscode.Hover(markdownForSymbol(r, sym));
    }
    return null;
  }
}

class DefinitionProvider {
  provideDefinition(document, position) {
    const importContext = importPathContext(document, position, false);
    if (importContext) {
      const target = resolveImport(importContext.full, document.uri.fsPath);
      if (target && fileExists(target)) return new vscode.Location(vscode.Uri.file(target), new vscode.Position(0, 0));
    }
    const record = activeRecord(document);
    const ctx = chainContext(document, position);
    if (!ctx.chain.length) return null;
    const word = ctx.word;
    if (record.imports.has(word)) {
      const imp = record.imports.get(word);
      const target = indexedFile(resolveImport(imp.spec, record.uri.fsPath));
      if (target) return new vscode.Location(target.uri, new vscode.Position(0, 0));
    }
    const hit = resolveChain(record, ctx.chain);
    if (hit) return symbolLocation(hit.record, hit.symbol);
    for (const r of index.values()) {
      const sym = r.exports.find(s => s.name === word);
      if (sym) return symbolLocation(r, sym);
    }
    return null;
  }
}

function allWordLocations(word) {
  const locations = [];
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'g');
  for (const record of index.values()) {
    for (let line = 0; line < record.lines.length; line++) {
      let match;
      while ((match = re.exec(record.lines[line]))) {
        const start = new vscode.Position(line, match.index);
        locations.push(new vscode.Location(record.uri, new vscode.Range(start, start.translate(0, word.length))));
      }
      re.lastIndex = 0;
    }
  }
  return locations;
}

class ReferenceProvider {
  provideReferences(document, position) {
    const ctx = chainContext(document, position);
    return ctx.word ? allWordLocations(ctx.word) : [];
  }
}

class RenameProvider {
  prepareRename(document, position) {
    const ctx = chainContext(document, position);
    if (!ctx.range) throw new Error('Place the cursor on an LSX identifier.');
    return ctx.range;
  }
  provideRenameEdits(document, position, newName) {
    if (!/^[A-Za-z_]\w*$/.test(newName)) throw new Error('Invalid LSX identifier.');
    const ctx = chainContext(document, position);
    if (!ctx.word) return null;
    const edit = new vscode.WorkspaceEdit();
    for (const location of allWordLocations(ctx.word)) edit.replace(location.uri, location.range, newName);
    return edit;
  }
}

class SignatureProvider {
  provideSignatureHelp(document, position) {
    const record = activeRecord(document);
    const text = document.getText(new vscode.Range(new vscode.Position(position.line, 0), position));
    const call = text.match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(([^()]*)$/);
    if (!call) return null;
    const chain = call[1].split('.');
    const hit = resolveChain(record, chain);
    let symbol = hit?.symbol;
    let symbolRecord = hit?.record;
    if (!symbol && chain.length === 1) {
      for (const r of index.values()) {
        const candidate = r.exports.find(s => s.name === chain[0]);
        if (candidate) { symbol = candidate; symbolRecord = r; break; }
      }
    }
    if (!symbol) {
      const builtin = BUILTIN_DOCS[chain.join('.')];
      if (builtin) {
        symbol = { name: chain.at(-1), kind: 'function', signature: builtin[0], documentation: builtin[1], parameters: signatureParts(builtin[0]).parameters };
        symbolRecord = record;
      }
    }
    if (!symbol || !['function','method'].includes(symbol.kind)) return null;
    const help = new vscode.SignatureHelp();
    const signature = new vscode.SignatureInformation(symbol.signature, markdownForSymbol(symbolRecord, symbol, hit?.parent));
    const params = symbol.parameters || signatureParts(symbol.signature).parameters;
    signature.parameters = params.map(p => new vscode.ParameterInformation(p.raw, `\`${p.name}\`: \`${p.type}\``));
    help.signatures = [signature];
    help.activeSignature = 0;
    help.activeParameter = Math.min(Math.max(0, splitParameters(call[2]).length - (call[2].trim() ? 0 : 1)), Math.max(0, params.length - 1));
    return help;
  }
}

class DocumentSymbolProvider {
  provideDocumentSymbols(document) {
    const record = activeRecord(document);
    return record.symbols.filter(s => s.kind !== 'variable').map(sym => {
      const start = new vscode.Position(sym.line, sym.column);
      const endLine = sym.endLine ?? sym.line;
      const end = new vscode.Position(endLine, record.lines[endLine]?.length || sym.column + sym.name.length);
      const out = new vscode.DocumentSymbol(sym.name, sym.signature, symbolKind(sym.kind), new vscode.Range(start, end), new vscode.Range(start, start.translate(0, sym.name.length)));
      out.children = (sym.members || []).map(m => {
        const ms = new vscode.Position(m.line, m.column);
        return new vscode.DocumentSymbol(m.name, m.signature, symbolKind(m.kind), new vscode.Range(ms, ms.translate(0, Math.max(m.name.length, m.signature.length))), new vscode.Range(ms, ms.translate(0, m.name.length)));
      });
      return out;
    });
  }
}

class WorkspaceSymbolProvider {
  provideWorkspaceSymbols(query) {
    const lower = query.toLowerCase();
    const out = [];
    for (const record of index.values()) {
      for (const sym of record.symbols) {
        if (!lower || sym.name.toLowerCase().includes(lower)) out.push(new vscode.SymbolInformation(sym.name, symbolKind(sym.kind), sym.signature, symbolLocation(record, sym)));
        for (const member of sym.members || []) if (!lower || member.name.toLowerCase().includes(lower)) out.push(new vscode.SymbolInformation(`${sym.name}.${member.name}`, symbolKind(member.kind), record.moduleName || path.basename(record.uri.fsPath), symbolLocation(record, member)));
      }
    }
    return out.slice(0, 4000);
  }
}

function findProject(startFile) {
  const direct = findProjectConfigAbove(startFile);
  return direct?.root || null;
}

async function selectProjectForFile(startFile) {
  const direct = findProject(startFile);
  if (direct) return direct;
  const candidates = associatedProjectConfigs(startFile);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].root;
  const picked = await vscode.window.showQuickPick(candidates.map(config => ({
    label: path.basename(config.root),
    description: config.root,
    detail: config.entry ? `Entry: ${config.entry}` : config.configPath,
    root: config.root
  })), { placeHolder: 'This shared LSX file belongs to more than one executable project. Choose which project to build.' });
  return picked?.root || null;
}

function compilerPath(startFile) {
  const configured = vscode.workspace.getConfiguration('lazyscriptex').get('compilerPath', '').trim();
  if (configured) return configured;
  const lazyRoot = findLazyScriptRoot(startFile);
  const candidate = lazyRoot && path.join(lazyRoot, 'compiler', 'lazyscriptex.js');
  if (candidate && fs.existsSync(candidate)) return candidate;
  return path.join(__dirname, 'compiler', 'lazyscriptex.js');
}

function runProcess(args, cwd, title = 'LazyScriptEX', reveal = true) {
  if (reveal) output.show(true);
  output.appendLine(`\n> ${process.execPath} ${args.map(a => JSON.stringify(a)).join(' ')}`);
  return new Promise(resolve => {
    const child = cp.spawn(process.execPath, args, { cwd, windowsHide: true });
    let captured = '';
    child.stdout.on('data', d => { const text = d.toString(); captured += text; output.append(text); });
    child.stderr.on('data', d => { const text = d.toString(); captured += text; output.append(text); });
    child.on('error', err => { output.appendLine(err.message); vscode.window.showErrorMessage(`${title}: ${err.message}`); resolve({ code: -1, text: err.message }); });
    child.on('close', code => { output.appendLine(`\n[exit ${code}]`); resolve({ code, text: captured }); });
  });
}

function parseCompilerDiagnostics(text) {
  const items = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith('{')) continue;
    try {
      const value = JSON.parse(line);
      if (value?.kind === 'diagnostic') items.push(value);
    } catch {
      // Normal compiler output can contain braces. Ignore non-diagnostic lines.
    }
  }
  if (items.length) return items;

  // Backward compatibility with older compilers that only print a location.
  const regex = /(?:LazyScriptEX error(?:\s*\[[^\]]+\])?:\s*)?(.+?\.lsx):(\d+):(\d+):\s*([^\r\n]+)/g;
  let match;
  while ((match = regex.exec(String(text || '')))) {
    items.push({
      kind: 'diagnostic', severity: 'error', code: 'LSX9000', file: path.resolve(match[1]),
      line: Number(match[2]), column: Number(match[3]), endLine: Number(match[2]), endColumn: Number(match[3]) + 1,
      message: match[4], hint: ''
    });
  }
  return items;
}

function vscodeSeverity(value) {
  switch (String(value || '').toLowerCase()) {
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    case 'information': return vscode.DiagnosticSeverity.Information;
    case 'hint': return vscode.DiagnosticSeverity.Hint;
    default: return vscode.DiagnosticSeverity.Error;
  }
}

function applyCompilerDiagnostics(items, fallbackDocument = null, projectRoot = null) {
  const grouped = new Map();
  for (const item of items) {
    if (!item.file) continue;
    const file = path.resolve(item.file);
    const key = keyForFile(file);
    if (!grouped.has(key)) grouped.set(key, { file, items: [] });
    grouped.get(key).items.push(item);
  }

  for (const [previousKey, previousPath] of [...diagnosticFiles]) {
    const shouldClear = !projectRoot || previousKey.startsWith(keyForFile(projectRoot) + path.sep) || previousKey === keyForFile(fallbackDocument?.uri?.fsPath || '');
    if (!shouldClear || grouped.has(previousKey)) continue;
    diagnostics.delete(vscode.Uri.file(previousPath));
    diagnosticFiles.delete(previousKey);
  }

  let count = 0;
  for (const [key, group] of grouped) {
    const converted = group.items.map(item => {
      const line = Math.max(0, Number(item.line || 1) - 1);
      const column = Math.max(0, Number(item.column || 1) - 1);
      const endLine = Math.max(line, Number(item.endLine || item.line || 1) - 1);
      const endColumn = Math.max(column + 1, Number(item.endColumn || (Number(item.column || 1) + 1)) - 1);
      const message = item.hint ? `${item.message}\nHint: ${item.hint}` : item.message;
      const diagnostic = new vscode.Diagnostic(new vscode.Range(line, column, endLine, endColumn), message, vscodeSeverity(item.severity));
      diagnostic.source = 'LazyScriptEX';
      diagnostic.code = item.code || 'LSX9000';
      if (Array.isArray(item.related) && vscode.DiagnosticRelatedInformation) {
        diagnostic.relatedInformation = item.related.filter(related => related.file).map(related => new vscode.DiagnosticRelatedInformation(
          new vscode.Location(vscode.Uri.file(path.resolve(related.file)), new vscode.Range(
            Math.max(0, Number(related.line || 1) - 1), Math.max(0, Number(related.column || 1) - 1),
            Math.max(0, Number(related.line || 1) - 1), Math.max(1, Number(related.column || 1))
          )), related.message || 'Related LSX location'
        ));
      }
      return diagnostic;
    });
    diagnostics.set(vscode.Uri.file(group.file), converted);
    diagnosticFiles.set(key, group.file);
    count += converted.length;
  }

  if (!items.length && fallbackDocument) {
    diagnostics.delete(fallbackDocument.uri);
    diagnosticFiles.delete(keyForFile(fallbackDocument.uri.fsPath));
  }
  status.text = count ? `$(error) LSX ${count} problem${count === 1 ? '' : 's'}` : `$(check) LSX clean`;
  status.tooltip = count
    ? 'LazyScriptEX found a compiler error. Open the Problems panel for the exact range and beginner hint.'
    : 'The last LazyScriptEX compiler check passed.';
  return count;
}

async function checkDocument(document, showOutput = false) {
  if (!document || document.languageId !== LANGUAGE || document.isUntitled) return;
  const generation = ++lastCheckGeneration;
  const compiler = compilerPath(document.uri.fsPath);
  const project = findProject(document.uri.fsPath);
  const args = [compiler, 'check', document.uri.fsPath, ...compilerModuleRootArgs(document.uri.fsPath), '--diagnostics=json'];
  const result = await runProcess(args, project || path.dirname(document.uri.fsPath), 'LSX check', showOutput);
  if (generation !== lastCheckGeneration && !showOutput) return;
  const found = parseCompilerDiagnostics(result.text);
  const count = applyCompilerDiagnostics(found, document, project);
  if (showOutput) {
    if (result.code === 0) vscode.window.showInformationMessage('LazyScriptEX check passed.');
    else vscode.window.showErrorMessage(`LazyScriptEX found ${count || 1} compiler problem${count === 1 ? '' : 's'}. See Problems or Output for details.`);
  }
}

function scheduleCheck(document) {
  if (!document || document.languageId !== LANGUAGE || document.isUntitled) return;
  const configuration = vscode.workspace.getConfiguration('lazyscriptex');
  if (!configuration.get('checkOnType', true)) return;
  const key = keyForFile(document.uri.fsPath);
  clearTimeout(checkTimers.get(key));
  const delay = Math.max(250, Number(configuration.get('checkDelay', 700)) || 700);
  checkTimers.set(key, setTimeout(() => {
    checkTimers.delete(key);
    checkDocument(document, false);
  }, delay));
}

async function buildProject(runAfter = false) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return vscode.window.showErrorMessage('Open an LSX file first.');
  const project = await selectProjectForFile(editor.document.uri.fsPath);
  if (!project) return vscode.window.showErrorMessage('No lazyscriptex.json is associated with this file. Open the workspace containing the executable project, or add the shared folder through moduleRoots.');
  await editor.document.save();
  const compiler = compilerPath(editor.document.uri.fsPath);
  const result = await runProcess([compiler, 'build', project, ...compilerModuleRootArgs(editor.document.uri.fsPath), '--diagnostics=json'], project, 'LSX build');
  const buildDiagnostics = parseCompilerDiagnostics(result.text);
  const buildProblemCount = applyCompilerDiagnostics(buildDiagnostics, editor.document, project);
  if (result.code !== 0) return vscode.window.showErrorMessage(`LazyScriptEX build failed with ${buildProblemCount || 1} compiler problem${buildProblemCount === 1 ? '' : 's'}. See Problems or Output.`);
  vscode.window.showInformationMessage('LazyScriptEX build completed.');
  if (!runAfter) return;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(project, 'lazyscriptex.json'), 'utf8').replace(/^\uFEFF/, ''));
    const exe = path.resolve(project, config.output || 'build/main.exe');
    if (!fs.existsSync(exe)) return vscode.window.showErrorMessage(`Built executable was not found: ${exe}`);
    const cwd = path.dirname(exe);

    // Run inside a persistent terminal instead of detaching and discarding all
    // output. Fast LSX tools can finish in milliseconds; the terminal remains so
    // the exit code and paths to persistent logs are still visible.
    if (process.platform === 'win32') {
      const shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
      const terminal = vscode.window.createTerminal({
        name: `LazyScriptEX Run - ${path.basename(exe)}`,
        shellPath: shell,
        shellArgs: ['/d', '/v:on'],
        cwd,
      });
      const quotedExe = `"${exe.replace(/"/g, '""')}"`;
      terminal.show(true);
      terminal.sendText(`title LazyScriptEX Run & ${quotedExe} & set "LSX_EXIT=!errorlevel!" & echo. & echo [LazyScriptEX exit code: !LSX_EXIT!] & echo [Runtime log: ${path.join(cwd, 'LazyScriptEX-runtime.log')}] & echo [Application log: ${path.join(cwd, 'logs', 'LazyScriptEX.log')}]`, true);
    } else {
      const terminal = vscode.window.createTerminal({ name: `LazyScriptEX Run - ${path.basename(exe)}`, cwd });
      terminal.show(true);
      terminal.sendText(`"${exe.replace(/"/g, '\"')}"`, true);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Could not run project: ${err.message}`);
  }
}

async function selectLazyScriptRoot() {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select the LazyScript folder, its api folder, or the toolkit root'
  });
  if (!picked?.length) return;
  const root = normalizeLazyScriptRoot(picked[0].fsPath);
  if (!root) return vscode.window.showErrorMessage('That folder does not contain LazyScript bindings and compiler folders. Select LazyScript, LazyScript/api, or the toolkit root.');
  const configuration = vscode.workspace.getConfiguration('lazyscriptex');
  await configuration.update('lazyScriptRoot', root, vscode.ConfigurationTarget.Workspace);
  const api = path.join(root, 'api', 'index.html');
  if (fileExists(api)) await configuration.update('apiPath', api, vscode.ConfigurationTarget.Workspace);
  await refreshIndex();
  vscode.window.showInformationMessage(`LazyScriptEX root set to ${root}. @LazyScript imports, API opening, diagnostics, and path completion now use this folder.`);
}

async function selectApiPath() {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    filters: { 'API page': ['html'] },
    title: 'Select LazyScript/api or its index.html'
  });
  if (!picked?.length) return;
  let selected = picked[0].fsPath;
  if (directoryExists(selected)) selected = path.join(selected, 'index.html');
  if (!fileExists(selected)) return vscode.window.showErrorMessage('No index.html was found at that API location.');
  await vscode.workspace.getConfiguration('lazyscriptex').update('apiPath', selected, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`LazyScriptEX offline API set to ${selected}.`);
}

class ImportCodeActionProvider {
  provideCodeActions(_document, _range, context) {
    const actions = [];
    for (const diagnostic of context.diagnostics || []) {
      if (String(diagnostic.code) !== 'LSX2101') continue;
      const action = new vscode.CodeAction('Select LazyScript/API folder', vscode.CodeActionKind.QuickFix);
      action.command = { command: 'lazyscriptex.selectLazyScriptRoot', title: 'Select LazyScript/API folder' };
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      actions.push(action);
    }
    return actions;
  }
}

function findToolkitRoot() {
  for (const folder of vscode.workspace.workspaceFolders || []) {
    let current = folder.uri.fsPath;
    while (true) {
      if (fs.existsSync(path.join(current, 'LazyScript')) && fs.existsSync(path.join(current, 'Projects'))) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const lazy = findLazyScriptRoot(editor.document.uri.fsPath);
    if (lazy) return path.dirname(lazy);
  }
  return null;
}

async function openApi() {
  const configured = vscode.workspace.getConfiguration('lazyscriptex').get('apiPath', '').trim();
  const root = findToolkitRoot();
  const bundled = path.join(__dirname, 'api', 'index.html');
  const api = configured || (root ? path.join(root, 'LazyScript', 'api', 'index.html') : bundled);
  if (!api || !fs.existsSync(api)) return vscode.window.showErrorMessage('Offline API index.html could not be found.');
  await vscode.env.openExternal(vscode.Uri.file(api));
}

async function createProject() {
  const root = findToolkitRoot();
  if (!root) return vscode.window.showErrorMessage('Open the toolkit root containing LazyScript and Projects.');
  const name = await vscode.window.showInputBox({ prompt: 'Project folder name', validateInput: v => /^[A-Za-z0-9_-]+$/.test(v) ? null : 'Use letters, numbers, underscores, or hyphens.' });
  if (!name) return;
  const source = path.join(root, 'Projects', 'ProjectTemplate');
  const dest = path.join(root, 'Projects', name);
  if (!fs.existsSync(source)) return vscode.window.showErrorMessage('ProjectTemplate is missing.');
  if (fs.existsSync(dest)) return vscode.window.showErrorMessage('That project folder already exists.');
  fs.cpSync(source, dest, { recursive: true });
  const cfgPath = path.join(dest, 'lazyscriptex.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''));
  cfg.output = `build/${name}.exe`;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  const doc = await vscode.workspace.openTextDocument(path.join(dest, 'main.lsx'));
  await vscode.window.showTextDocument(doc);
  await refreshIndex();
  vscode.window.showInformationMessage(`Created LSX project ${name}.`);
}

async function activate(context) {
  output = vscode.window.createOutputChannel('LazyScriptEX');
  diagnostics = vscode.languages.createDiagnosticCollection('lazyscriptex');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  status.command = 'lazyscriptex.refreshIndex';
  status.text = '$(database) LSX index';
  status.show();

  context.subscriptions.push(output, diagnostics, status);
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.refreshIndex', refreshIndex));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.buildProject', () => buildProject(false)));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.runProject', () => buildProject(true)));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.checkCurrent', () => checkDocument(vscode.window.activeTextEditor?.document, true)));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.openApi', openApi));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.createProject', createProject));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.showOutput', () => output.show(true)));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.explainSymbol', () => vscode.commands.executeCommand('editor.action.showHover')));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.selectLazyScriptRoot', selectLazyScriptRoot));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.selectApiPath', selectApiPath));
  context.subscriptions.push(vscode.commands.registerCommand('lazyscriptex.formatDocument', () => vscode.commands.executeCommand('editor.action.formatDocument')));

  const selector = { language: LANGUAGE, scheme: 'file' };
  const completionTriggers = ['.', '<', '/', ' ', '=', '"', '{', '-', ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new CompletionProvider(), ...completionTriggers));
  context.subscriptions.push(vscode.languages.registerHoverProvider(selector, new HoverProvider()));
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new DefinitionProvider()));
  context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, new ReferenceProvider()));
  context.subscriptions.push(vscode.languages.registerRenameProvider(selector, new RenameProvider()));
  context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(selector, new SignatureProvider(), '(', ','));
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new DocumentSymbolProvider()));
  context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider()));
  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(selector, new DocumentFormattingProvider()));
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, new ImportCodeActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));

  watcher = vscode.workspace.createFileSystemWatcher('**/*.lsx');
  watcher.onDidCreate(indexUri);
  watcher.onDidChange(indexUri);
  watcher.onDidDelete(uri => index.delete(keyForFile(uri.fsPath)));
  context.subscriptions.push(watcher);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => { if (doc.languageId === LANGUAGE) activeRecord(doc); }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId === LANGUAGE) {
      activeRecord(event.document);
      scheduleCheck(event.document);
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
    if (doc.languageId === LANGUAGE) {
      activeRecord(doc);
      if (vscode.workspace.getConfiguration('lazyscriptex').get('checkOnSave', true)) checkDocument(doc, false);
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refreshIndex));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('lazyscriptex.lazyScriptRoot') || event.affectsConfiguration('lazyscriptex.moduleRoots') || event.affectsConfiguration('lazyscriptex.exclude')) refreshIndex();
  }));

  await refreshIndex();
}

function deactivate() {
  for (const external of externalWatchers) external.dispose?.();
  externalWatchers = [];
  for (const timer of checkTimers.values()) clearTimeout(timer);
  checkTimers.clear();
}
module.exports = {
  activate, deactivate, parseText, resolveImport, chainContext, inferTypeFromInitializer,
  _test: { index, loadRecordSync, importedSymbol, resolveChain, resolveInstanceMember, apiByKey, loadApiMetadata, markdownForSymbol, insideLshtml, lshtmlCompletionItems, nearestOpenLshtmlTag, lshtmlTagInfo, markdownForLshtmlTag, insideLscss, lscssCompletionItems, markdownForLscssProperty, LSCSS_PROPERTY_DOCS, CompletionProvider, HoverProvider, DocumentFormattingProvider, formatLsxText, collectVisibleScopeSymbols, completionForScopeSymbol, enclosingObjectAt, parseCompilerDiagnostics, normalizeLazyScriptRoot, knownModuleRoots, importPathContext, importCompletionItems, compilerModuleRootArgs }
};
