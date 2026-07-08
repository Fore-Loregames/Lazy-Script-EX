#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildNativeBindings } = require('./native_bindings');
const { compileInlineUiSource } = require('./inline_ui');

const VERSION = '0.18.2';


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
  if (base === 'api' && directoryExists(path.join(path.dirname(candidate), 'bindings'))) candidate = path.dirname(candidate);
  if (base === 'compiler' && directoryExists(path.join(path.dirname(candidate), 'bindings'))) candidate = path.dirname(candidate);

  if (directoryExists(path.join(candidate, 'bindings')) && directoryExists(path.join(candidate, 'compiler'))) return candidate;
  const nested = path.join(candidate, 'LazyScript');
  if (directoryExists(path.join(nested, 'bindings')) && directoryExists(path.join(nested, 'compiler'))) return nested;
  return null;
}

function environmentModuleRoots() {
  const roots = {};
  const json = process.env.LAZYSCRIPTEX_MODULE_ROOTS;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [name, value] of Object.entries(parsed)) if (typeof value === 'string' && value.trim()) roots[name] = path.resolve(value);
      }
    } catch {
      // Ignore malformed environment configuration. Command-line and project roots still work.
    }
  }
  const lazyValue = process.env.LAZYSCRIPTEX_LAZYSCRIPT_ROOT || process.env.LAZYSCRIPTEX_ROOT;
  const lazyRoot = normalizeLazyScriptRoot(lazyValue);
  if (lazyRoot) roots.LazyScript = lazyRoot;
  return roots;
}

function compilerLazyScriptRoot() {
  return normalizeLazyScriptRoot(path.resolve(__dirname, '..'));
}

function findNearestProjectConfig(startPath) {
  let current;
  try { current = fs.statSync(startPath).isDirectory() ? path.resolve(startPath) : path.dirname(path.resolve(startPath)); }
  catch { current = path.dirname(path.resolve(startPath)); }
  for (;;) {
    const config = path.join(current, 'lazyscriptex.json');
    if (fileExists(config)) return config;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function findNamedDirectoryRecursive(startPath, name, maxDepth = 8, maxVisited = 6000) {
  if (!directoryExists(startPath)) return null;
  const wanted = String(name).toLowerCase();
  const ignored = new Set(['.git', '.cache', 'node_modules', 'build', 'dist', 'out', '.vs', '.vscode']);
  const queue = [{ dir: path.resolve(startPath), depth: 0 }];
  let visited = 0;
  while (queue.length && visited < maxVisited) {
    const current = queue.shift();
    visited += 1;
    if (path.basename(current.dir).toLowerCase() === wanted) return current.dir;
    if (current.depth >= maxDepth) continue;
    let entries;
    try { entries = fs.readdirSync(current.dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || ignored.has(entry.name.toLowerCase())) continue;
      if (entry.name.toLowerCase() === wanted) return path.join(current.dir, entry.name);
      queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
    }
  }
  return null;
}

function parseModuleRootFlags(args) {
  const roots = {};
  const assign = (raw, friendlyName = null) => {
    if (!raw) throw new CompileError(`${friendlyName || '--module-root'} requires a path`);
    if (friendlyName === '--lazy-script-root') {
      const normalized = normalizeLazyScriptRoot(raw);
      if (!normalized) throw new CompileError(`--lazy-script-root does not point to a LazyScript folder or toolkit root: ${raw}`);
      roots.LazyScript = normalized;
      return;
    }
    const split = String(raw).indexOf('=');
    if (split <= 0 || split === String(raw).length - 1) throw new CompileError(`--module-root requires Name=Path, for example --module-root LazyScript=C:\\LazyScriptEX\\LazyScript`);
    const name = String(raw).slice(0, split).trim();
    const value = String(raw).slice(split + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || !value) throw new CompileError(`invalid --module-root value '${raw}'`);
    if (name === 'LazyScript') {
      const normalized = normalizeLazyScriptRoot(value);
      if (!normalized) throw new CompileError(`module root LazyScript does not point to a LazyScript folder or toolkit root: ${value}`);
      roots[name] = normalized;
    } else roots[name] = path.resolve(value);
  };

  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--module-root') { assign(args[++i]); continue; }
    if (value.startsWith('--module-root=')) { assign(value.slice('--module-root='.length)); continue; }
    if (value === '--lazy-script-root') { assign(args[++i], '--lazy-script-root'); continue; }
    if (value.startsWith('--lazy-script-root=')) { assign(value.slice('--lazy-script-root='.length), '--lazy-script-root'); continue; }
  }
  return roots;
}

class CompileError extends Error {
  constructor(message, token = null, filePath = null, details = null) {
    const file = token?.filePath || filePath;
    const line = token?.line;
    const column = token?.column;
    const prefix = file ? `${file}${line ? `:${line}${column ? `:${column}` : ''}` : ''}: ` : '';
    super(`${prefix}${message}`);
    this.name = 'CompileError';
    this.rawMessage = message;
    this.filePath = file || null;
    this.line = line || null;
    this.column = column || null;
    this.length = Math.max(1, Number(details?.length || token?.length || String(token?.value || '').length || 1));
    this.code = details?.code || null;
    this.hint = details?.hint || null;
    this.related = Array.isArray(details?.related) ? details.related : [];
  }
}

function diagnosticDetails(message) {
  const text = String(message || 'Unknown compiler error');
  const rules = [
    [/unterminated block comment/i, 'LSX1001', 'Close the comment with ]] before continuing.'],
    [/unterminated string literal/i, 'LSX1002', 'Add the closing quote. Use a backtick string for multiline text.'],
    [/invalid string literal/i, 'LSX1003', 'Check escape sequences such as \" and \\ inside the string.'],
    [/invalid hexadecimal number|invalid numeric exponent|invalid floating-point literal/i, 'LSX1004', 'Check the number spelling. Hex values need digits after 0x, and exponents need a number after e.'],
    [/unexpected character/i, 'LSX1005', 'Remove the character or replace it with valid LSX syntax.'],
    [/expected .+, found/i, 'LSX1100', 'Read the highlighted token and the token immediately before it. A missing comma, closing bracket, then, do, or end is the usual cause.'],
    [/expected expression/i, 'LSX1101', 'Place a value, variable, function call, object literal, or parenthesized expression here.'],
    [/expected assignment, call, or control statement/i, 'LSX1102', 'An LSX statement must assign a value, call a function, or start a control statement such as if, while, or for.'],
    [/left side of assignment/i, 'LSX1103', 'Assign only to a variable, object field, or table index. Function results and constants cannot be assigned to.'],
    [/cannot mix positional values and named fields|cannot mix named fields and positional values/i, 'LSX1200', 'Use either a list like {1,2,3} or an object like {x=1,y=2}. Do not combine both forms in one literal.'],
    [/unterminated table literal/i, 'LSX1201', 'Add the missing } that closes this table or object literal.'],
    [/expected ',' or '}' after object value/i, 'LSX1202', 'Put a comma between entries, or close the object with }.'],
    [/symbol '.+' already exists|duplicate field|table member '.+' already exists|module alias '.+' already exists/i, 'LSX2000', 'Rename one declaration or remove the duplicate. LSX names must be unique in the same scope.'],
    [/unknown module alias/i, 'LSX2100', 'Import the module first with use "..." as Alias, then use the same alias spelling.'],
    [/named module root .+ was not found/i, 'LSX2101', 'Run LazyScriptEX: Select LazyScript/API Folder in VS Code, use --lazy-script-root, or add moduleRoots.LazyScript to lazyscriptex.json.'],
    [/script not found|required runtime file not found/i, 'LSX2102', 'Check the path and filename. @LazyScript imports are resolved from the toolkit LazyScript folder.'],
    [/does not export|module cannot name inferred type/i, 'LSX2103', 'The symbol is private or the module is not imported. Export it, or use a public symbol from that module.'],
    [/unknown (constant|type|closed table|function|variable|symbol)|has no (function|constant|field)|table has no function/i, 'LSX2200', 'Check spelling and capitalization. Hover the object or type in VS Code to see the members it actually provides.'],
    [/cannot initialize field|cannot assign|conflicting inferred types|incompatible|requires a numeric/i, 'LSX2300', 'The values resolve to different types. Keep one consistent value shape, or convert the value before assigning it.'],
    [/accepts .+ arguments|requires .+ arguments|argument/i, 'LSX2400', 'Hover the function in VS Code to see its parameter order and a working call example.'],
    [/division by zero/i, 'LSX2500', 'Change the divisor so it cannot be zero.'],
    [/circular|recursive inline layout/i, 'LSX2600', 'Break the cycle by removing the self-reference or storing the relationship in a separate table/object.'],
    [/base object|base inheritance|inherit/i, 'LSX2700', 'Check that the base object is imported, declared before use, and contains the function or field you are accessing.'],
    [/entry script must define fn main|project entry does not define fn main/i, 'LSX3000', 'Add fn main() to the project entry file and return an exit code such as 0.'],
    [/external parameter .+ requires an ABI type|external function .+ requires an ABI return type/i, 'LSX3100', 'Only extern/native declarations need explicit ABI types. Normal LSX functions should continue using inferred parameters.'],
    [/optimization level|--opt requires/i, 'LSX3200', 'Choose an optimization level from 0 through 6. Use 6 for optimized release builds.'],
    [/target CPU|--cpu requires/i, 'LSX3201', 'Use baseline, avx2, or avx2-fma. baseline works on the widest range of computers.'],
  ];
  for (const [pattern, code, hint] of rules) if (pattern.test(text)) return { code, hint };
  return {
    code: 'LSX9000',
    hint: 'Use the file, line, and highlighted range below. Hover nearby functions and values in VS Code to compare against their documented examples.'
  };
}

function sourceExcerpt(filePath, line) {
  if (!filePath || !line) return null;
  try {
    const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    return lines[line - 1] ?? '';
  } catch {
    return null;
  }
}

function compilerDiagnostic(error) {
  const rawMessage = error?.rawMessage || String(error?.message || error || 'Unknown compiler error').replace(/^.*?:\d+:\d+:\s*/, '');
  const details = diagnosticDetails(rawMessage);
  const filePath = error?.filePath ? path.resolve(error.filePath) : null;
  const line = Number(error?.line || 0) || null;
  const column = Number(error?.column || 0) || null;
  const length = Math.max(1, Number(error?.length || 1));
  return {
    kind: 'diagnostic',
    severity: 'error',
    code: error?.code || details.code,
    message: rawMessage,
    hint: error?.hint || details.hint,
    file: filePath,
    line,
    column,
    endLine: line,
    endColumn: column ? column + length : null,
    sourceLine: sourceExcerpt(filePath, line),
    related: error?.related || [],
  };
}

function formatHumanDiagnostic(diagnostic) {
  const location = diagnostic.file
    ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ''}` : ''}`
    : 'LazyScriptEX';
  const lines = [`LazyScriptEX error [${diagnostic.code}]: ${location}: ${diagnostic.message}`];
  if (diagnostic.sourceLine !== null && diagnostic.line) {
    const width = String(diagnostic.line).length;
    lines.push(`${String(diagnostic.line).padStart(width)} | ${diagnostic.sourceLine}`);
    const caretColumn = Math.max(1, diagnostic.column || 1);
    const caretLength = Math.max(1, Math.min(80, (diagnostic.endColumn || caretColumn + 1) - caretColumn));
    lines.push(`${' '.repeat(width)} | ${' '.repeat(caretColumn - 1)}${'^'.repeat(caretLength)}`);
  }
  if (diagnostic.hint) lines.push(`Hint: ${diagnostic.hint}`);
  return lines.join('\n');
}

function wantsJsonDiagnostics(argv) {
  return argv.includes('--diagnostics=json') || argv.includes('--json-diagnostics');
}

function align(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function frameSizeFor(totalBytes) {
  const total = Math.max(32, totalBytes);
  return Math.ceil((total - 8) / 16) * 16 + 8;
}

function stableId(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 10);
}

function functionProfileKey(fn) {
  return `${path.normalize(fn.module?.filePath || '').toLowerCase()}::${fn.name}`;
}

function functionProfileId(fn) {
  const digest = crypto.createHash('sha256').update(functionProfileKey(fn)).digest();
  return digest.readBigUInt64LE(0);
}

function loadPgoProfile(profilePath, program) {
  const absolute = path.resolve(profilePath);
  let buffer;
  try { buffer = fs.readFileSync(absolute); }
  catch (error) { throw new CompileError(`could not read PGO profile '${absolute}': ${error.message}`, null, absolute); }
  if (buffer.length < 16 || buffer.subarray(0, 8).toString('ascii') !== 'LSXPGO1\0') {
    throw new CompileError(`invalid LazyScriptEX PGO profile '${absolute}'`, null, absolute);
  }
  const count = Number(buffer.readBigUInt64LE(8));
  if (!Number.isSafeInteger(count) || buffer.length < 16 + count * 16) throw new CompileError(`truncated LazyScriptEX PGO profile '${absolute}'`, null, absolute);
  const counts = new Map();
  for (let index = 0; index < count; index += 1) {
    const offset = 16 + index * 16;
    counts.set(buffer.readBigUInt64LE(offset).toString(), buffer.readBigUInt64LE(offset + 8));
  }
  let matched = 0;
  for (const module of program.moduleOrder) for (const fn of module.functions.values()) {
    const profileCount = counts.get(functionProfileId(fn).toString()) || 0n;
    fn.profileCount = profileCount > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(profileCount);
    if (profileCount > 0n) matched += 1;
  }
  return { path: absolute, records: count, matched };
}


const PRIMITIVE_TYPES = new Map([
  ['void', { kind: 'primitive', name: 'void', size: 0, alignment: 1 }],
  ['bool', { kind: 'primitive', name: 'bool', size: 1, alignment: 1 }],
  ['i8', { kind: 'primitive', name: 'i8', size: 1, alignment: 1 }],
  ['u8', { kind: 'primitive', name: 'u8', size: 1, alignment: 1 }],
  ['i16', { kind: 'primitive', name: 'i16', size: 2, alignment: 2 }],
  ['u16', { kind: 'primitive', name: 'u16', size: 2, alignment: 2 }],
  ['i32', { kind: 'primitive', name: 'i32', size: 4, alignment: 4 }],
  ['u32', { kind: 'primitive', name: 'u32', size: 4, alignment: 4 }],
  ['f32', { kind: 'primitive', name: 'f32', size: 4, alignment: 4 }],
  ['i64', { kind: 'primitive', name: 'i64', size: 8, alignment: 8 }],
  ['u64', { kind: 'primitive', name: 'u64', size: 8, alignment: 8 }],
  ['ptr', { kind: 'primitive', name: 'ptr', size: 8, alignment: 8 }],
  ['handle', { kind: 'primitive', name: 'handle', size: 8, alignment: 8 }],
  ['fnptr', { kind: 'primitive', name: 'fnptr', size: 8, alignment: 8 }],
  ['string', { kind: 'primitive', name: 'string', size: 8, alignment: 8 }],
]);

function isAutoType(type) { return type === null || type === undefined || type === '' || type === 'auto'; }
function isFloatType(type) { return type === 'f32'; }
function isVoidType(type) { return type === 'void'; }
function isIntegerType(type) { return ['bool', 'i8', 'u8', 'i16', 'u16', 'i32', 'u32', 'i64', 'u64', 'ptr', 'handle', 'fnptr', 'string'].includes(type); }
function isNumericType(type) { return isFloatType(type) || ['bool', 'i8', 'u8', 'i16', 'u16', 'i32', 'u32', 'i64', 'u64'].includes(type); }
function isTableTypeName(type) { return typeof type === 'string' && /^table<.+>$/.test(type); }
function tableElementTypeName(type) { const match = typeof type === 'string' ? /^table<(.+)>$/.exec(type) : null; return match ? match[1] : null; }
function isGenericTableType(type) { return isTableTypeName(type) && tableElementTypeName(type) === 'any'; }
const GENERIC_TABLE_ELEMENT = { kind: 'any', name: 'any', size: 0, alignment: 1 };

// Tables keep plain scalar records inline, while object-like records retain
// stable pointer identity. This preserves contiguous value storage for data
// records such as SDF glyph metrics and JSON nodes without moving retained UI,
// graph, ECS-owner, or resource objects when a table grows.
function tableStructUsesReferenceStorage(struct) {
  if (!struct) return true;
  if (struct.methods?.has('destroy')) return true;
  for (const field of struct.fieldOrder || []) {
    const info = field.typeInfo;
    if (!info) return true;
    if (info.kind === 'struct' || info.kind === 'table') return true;
    if (info.kind === 'primitive' && ['ptr', 'handle', 'fnptr', 'string'].includes(info.name)) return true;
  }
  return false;
}
function tableElementUsesReferenceStorage(element) {
  return Boolean(element && element.kind === 'struct' && tableStructUsesReferenceStorage(element.struct));
}
function tableElementStorageSize(element) {
  if (!element) return 8;
  if (element.kind === 'struct') {
    if (tableElementUsesReferenceStorage(element)) return 8;
    return Math.max(1, Number(element.struct?.size || 0));
  }
  return Math.max(1, Number(element.size || 8));
}
const TYPE_ALIASES = new Map([
  ['int', 'i64'],
  ['uint', 'u64'],
  ['byte', 'u8'],
  ['sbyte', 'i8'],
  ['short', 'i16'],
  ['ushort', 'u16'],
  ['float', 'f32'],
]);
function canonicalTypeName(type) {
  if (isAutoType(type)) return 'auto';
  const compact = String(type).replace(/\s+/g, '');
  if (TYPE_ALIASES.has(compact)) return TYPE_ALIASES.get(compact);
  const generic = /^table<(.+)>$/.exec(compact);
  if (generic) return `table<${canonicalTypeName(generic[1])}>`;
  return compact;
}
function callArguments(expr) { return expr.effectiveArgs || expr.args || []; }
function expressionType(expr) { return expr?.inferredType || expr?.valueType || 'i64'; }
function canAssignType(from, to) {
  if (isAutoType(from) || isAutoType(to) || from === to) return true;
  if (isNumericType(from) && isNumericType(to)) return true;
  if (isIntegerType(from) && isIntegerType(to)) return true;
  if ((from === 'ptr' || from === 'handle' || from === 'i64' || from === 'u64') && !PRIMITIVE_TYPES.has(to)) return true;
  if (!PRIMITIVE_TYPES.has(from) && (to === 'ptr' || to === 'handle')) return true;
  if (isTableTypeName(from) && isTableTypeName(to)) return from === to || isGenericTableType(from) || isGenericTableType(to);
  return false;
}

const KEYWORDS = new Set([
  'use', 'as', 'export', 'local', 'extern', 'fn', 'return', 'if', 'then', 'elseif',
  'else', 'end', 'while', 'do', 'break', 'true', 'false', 'null', 'not', 'and', 'or',
  'struct', 'class', 'for', 'in', 'const',
]);

class Lexer {
  constructor(source, filePath) {
    this.source = source.replace(/^\uFEFF/, '');
    this.filePath = path.resolve(filePath);
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  peek(offset = 0) { return this.source[this.index + offset] || '\0'; }

  advance() {
    const ch = this.source[this.index++] || '\0';
    if (ch === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return ch;
  }

  token(type, value, line, column) {
    this.tokens.push({ type, value, line, column, filePath: this.filePath });
  }

  skipWhitespaceAndComments() {
    for (;;) {
      while (/\s/.test(this.peek())) this.advance();
      if (this.peek() === '-' && this.peek(1) === '-' && this.peek(2) === '[' && this.peek(3) === '[') {
        const startLine = this.line;
        const startColumn = this.column;
        this.advance(); this.advance(); this.advance(); this.advance();
        while (!(this.peek() === ']' && this.peek(1) === ']')) {
          if (this.peek() === '\0') {
            throw new CompileError('unterminated block comment', { filePath: this.filePath, line: startLine, column: startColumn });
          }
          this.advance();
        }
        this.advance(); this.advance();
        continue;
      }
      if (this.peek() === '-' && this.peek(1) === '-') {
        while (this.peek() !== '\n' && this.peek() !== '\r' && this.peek() !== '\0') this.advance();
        continue;
      }
      break;
    }
  }

  readString() {
    const line = this.line;
    const column = this.column;
    this.advance();
    let raw = '"';
    let escaped = false;
    while (this.peek() !== '\0') {
      const ch = this.advance();
      raw += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        try {
          const value = JSON.parse(raw);
          this.token('string', value, line, column);
          return;
        } catch {
          throw new CompileError('invalid string literal', { filePath: this.filePath, line, column });
        }
      } else if (ch === '\n' || ch === '\r') {
        throw new CompileError('unterminated string literal', { filePath: this.filePath, line, column });
      }
    }
    throw new CompileError('unterminated string literal', { filePath: this.filePath, line, column });
  }

  readRawString() {
    const line = this.line;
    const column = this.column;
    this.advance();
    let value = '';
    while (this.peek() !== '\0') {
      const ch = this.advance();
      if (ch === '`') {
        this.token('string', value, line, column);
        return;
      }
      value += ch;
    }
    throw new CompileError('unterminated raw string literal', { filePath: this.filePath, line, column });
  }

  readNumber() {
    const line = this.line;
    const column = this.column;
    let text = '';
    if (this.peek() === '0' && /[xX]/.test(this.peek(1))) {
      text += this.advance();
      text += this.advance();
      while (/[0-9A-Fa-f]/.test(this.peek())) text += this.advance();
      if (text.length <= 2) throw new CompileError('invalid hexadecimal number', { filePath: this.filePath, line, column });
    } else {
      while (/[0-9]/.test(this.peek())) text += this.advance();
      if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
        text += this.advance();
        while (/[0-9]/.test(this.peek())) text += this.advance();
      }
      if (/[eE]/.test(this.peek())) {
        text += this.advance();
        if (/[+-]/.test(this.peek())) text += this.advance();
        if (!/[0-9]/.test(this.peek())) throw new CompileError('invalid numeric exponent', { filePath: this.filePath, line, column });
        while (/[0-9]/.test(this.peek())) text += this.advance();
      }
      if (/[fF]/.test(this.peek())) text += this.advance();
    }
    this.token('number', text, line, column);
  }

  readIdentifier() {
    const line = this.line;
    const column = this.column;
    let text = '';
    while (/[A-Za-z0-9_]/.test(this.peek())) text += this.advance();
    this.token(KEYWORDS.has(text) ? 'keyword' : 'identifier', text, line, column);
  }

  lex() {
    const twoCharacter = new Set(['==', '~=', '<=', '>=', '->']);
    const single = new Set(['(', ')', '{', '}', '[', ']', ',', '.', ':', '=', '+', '-', '*', '/', '%', '<', '>']);
    while (this.index < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.index >= this.source.length) break;
      const ch = this.peek();
      const line = this.line;
      const column = this.column;
      if (ch === '"') {
        this.readString();
      } else if (ch === '`') {
        this.readRawString();
      } else if (/[0-9]/.test(ch)) {
        this.readNumber();
      } else if (/[A-Za-z_]/.test(ch)) {
        this.readIdentifier();
      } else if (twoCharacter.has(ch + this.peek(1))) {
        this.token('symbol', ch + this.peek(1), line, column);
        this.advance(); this.advance();
      } else if (single.has(ch)) {
        this.token('symbol', ch, line, column);
        this.advance();
      } else {
        throw new CompileError(`unexpected character '${ch}'`, { filePath: this.filePath, line, column });
      }
    }
    this.tokens.push({ type: 'eof', value: '<eof>', line: this.line, column: this.column, filePath: this.filePath });
    return this.tokens;
  }
}

class Parser {
  constructor(tokens, filePath) {
    this.tokens = tokens;
    this.filePath = path.resolve(filePath);
    this.index = 0;
    this.hiddenCounter = 0;
  }

  current() { return this.tokens[this.index]; }
  previous() { return this.tokens[this.index - 1]; }
  at(type, value = null) {
    const t = this.current();
    return t.type === type && (value === null || t.value === value);
  }
  match(type, value = null) {
    if (!this.at(type, value)) return false;
    this.index += 1;
    return true;
  }
  expect(type, value = null, message = null) {
    if (!this.at(type, value)) {
      const expected = message || (value !== null ? `'${value}'` : type);
      throw new CompileError(`expected ${expected}, found '${this.current().value}'`, this.current());
    }
    return this.tokens[this.index++];
  }
  keyword(value) { return this.match('keyword', value); }
  expectKeyword(value) { return this.expect('keyword', value); }
  identifier(message = 'identifier') { return this.expect('identifier', null, message); }

  parseTypeName() {
    const parts = [this.identifier('type name').value];
    while (this.match('symbol', '.')) parts.push(this.identifier('type name').value);
    let name = parts.join('.');
    if (this.match('symbol', '<')) {
      const inner = this.parseTypeName();
      this.expect('symbol', '>');
      name += `<${inner}>`;
    }
    return canonicalTypeName(name);
  }

  parseType(defaultType = 'i64') {
    if (!this.match('symbol', ':')) return defaultType;
    return this.parseTypeName();
  }

  // Normal LSX functions may declare an optional parameter type as name.Type.
  // The older colon form remains available internally for native bindings and
  // generated code, but user-facing APIs and examples use the dot form.
  parseParameterType(defaultType = null) {
    if (this.match('symbol', '.')) return this.parseTypeName();
    return this.parseType(defaultType);
  }

  parseBaseClause() {
    if (!this.match('symbol', ':')) return null;
    const marker = this.identifier("'base'");
    if (marker.value !== 'base') throw new CompileError("expected 'base' inheritance clause", marker);
    this.expect('symbol', '(');
    const parts = [this.identifier('base object name').value];
    while (this.match('symbol', '.')) parts.push(this.identifier('base object name').value);
    this.expect('symbol', ')');
    return { path: parts, token: marker };
  }

  parseStruct(exported, startToken, declarationKind = 'struct') {
    const name = this.identifier(`${declarationKind} name`);
    const fields = [];
    const methods = [];
    while (!this.at('eof') && !this.at('keyword', 'end')) {
      const token = this.current();
      if (this.keyword('fn')) {
        methods.push(this.parseFunction(false, token));
        continue;
      }
      const field = this.identifier('field name');
      this.expect('symbol', ':');
      const type = this.parseTypeName();
      let expression = null;
      if (this.match('symbol', '=')) expression = this.parseExpression();
      fields.push({ name: field.value, type, explicitType: true, expression, token: field });
    }
    this.expectKeyword('end');
    return { kind: 'struct', name: name.value, fields, methods, exported, declarationKind, token: startToken };
  }

  parseFunction(exported, startToken) {
    const name = this.identifier('function name');
    this.expect('symbol', '(');
    const params = [];
    if (!this.at('symbol', ')')) {
      do {
        const param = this.identifier('parameter name');
        const type = this.parseParameterType(null);
        params.push({ name: param.value, type, explicitType: Boolean(type), token: param });
      } while (this.match('symbol', ','));
    }
    this.expect('symbol', ')');
    let returnType = null;
    if (this.match('symbol', '->')) returnType = this.parseTypeName();
    const body = this.parseBlock(new Set(['end']));
    this.expectKeyword('end');
    return { kind: 'function', name: name.value, params, returnType, explicitReturnType: Boolean(returnType), body, exported, token: startToken };
  }

  parseFunctionExpression(startToken) {
    this.expect('symbol', '(');
    const params = [];
    if (!this.at('symbol', ')')) {
      do {
        const param = this.identifier('parameter name');
        const type = this.parseParameterType(null);
        params.push({ name: param.value, type, explicitType: Boolean(type), token: param });
      } while (this.match('symbol', ','));
    }
    this.expect('symbol', ')');
    let returnType = null;
    if (this.match('symbol', '->')) returnType = this.parseTypeName();
    const body = this.parseBlock(new Set(['end']));
    this.expectKeyword('end');
    return { kind: 'function_expression', params, returnType, explicitReturnType: Boolean(returnType), body, token: startToken };
  }

  parseTableLiteral(startToken) {
    const entries = [];
    let positional = null;
    while (!this.at('symbol', '}')) {
      if (this.at('eof')) throw new CompileError('unterminated table literal', startToken);
      const entryStart = this.current();
      const next = this.tokens[this.index + 1];
      const named = this.at('identifier') && (next?.value === '=' || next?.value === ':');
      if (named) {
        if (positional === true) throw new CompileError('cannot mix positional values and named fields in the same object literal', entryStart);
        positional = false;
        const key = this.identifier('table member name');
        let declaredType = null;
        if (this.match('symbol', ':')) declaredType = this.parseTypeName();
        this.expect('symbol', '=');
        const expression = this.parseExpression();
        entries.push({ name: key.value, declaredType, expression, token: key, positionalIndex: null });
      } else {
        if (positional === false) throw new CompileError('cannot mix named fields and positional values in the same object literal', entryStart);
        positional = true;
        const expression = this.parseExpression();
        const index = entries.length;
        entries.push({ name: `__item${index}`, declaredType: null, expression, token: expression.token || entryStart, positionalIndex: index });
      }
      if (!this.match('symbol', ',')) {
        if (!this.at('symbol', '}')) {
          const nextToken = this.current();
          if (nextToken.line === entryStart.line) throw new CompileError("expected ',' or '}' after object value", nextToken);
        }
      }
    }
    this.expect('symbol', '}');
    return { kind: 'table_literal', entries, positional: positional === true, token: startToken };
  }

  parseExtern(exported, startToken) {
    const dll = this.expect('string', null, 'DLL name');
    this.expectKeyword('fn');
    const name = this.identifier('external function name');
    this.expect('symbol', '(');
    const params = [];
    if (!this.at('symbol', ')')) {
      do {
        const param = this.identifier('parameter name');
        const type = this.parseParameterType(null);
        if (!type) throw new CompileError(`external parameter '${param.value}' requires an ABI type`, param);
        params.push({ name: param.value, type, token: param });
      } while (this.match('symbol', ','));
    }
    this.expect('symbol', ')');
    if (!this.match('symbol', '->')) throw new CompileError(`external function '${name.value}' requires an ABI return type`, name);
    const returnType = this.parseTypeName();
    return { kind: 'extern', dll: dll.value, name: name.value, params, returnType, exported, token: startToken };
  }

  parseModule() {
    const declarations = [];
    const legacyStatements = [];
    while (!this.at('eof')) {
      const token = this.current();
      if (this.keyword('use')) {
        const source = this.expect('string', null, 'module path');
        this.expectKeyword('as');
        const alias = this.identifier('module alias');
        declarations.push({ kind: 'use', source: source.value, alias: alias.value, token });
        continue;
      }

      let exported = false;
      if (this.keyword('export')) exported = true;

      if (this.keyword('const')) {
        const name = this.identifier('constant or table name');
        const baseClause = this.parseBaseClause();
        this.expect('symbol', '=');
        const expression = this.parseExpression();
        if (expression.kind === 'table_literal') {
          declarations.push({ kind: 'table', name: name.value, entries: expression.entries, positional: expression.positional, exported, basePath: baseClause?.path || null, baseToken: baseClause?.token || null, token });
        } else {
          if (baseClause) throw new CompileError('base inheritance requires an object table literal', baseClause.token);
          declarations.push({ kind: 'constant', name: name.value, expression, exported, immutable: true, token });
        }
        continue;
      }
      if (this.keyword('struct')) {
        declarations.push(this.parseStruct(exported, token, 'struct'));
        continue;
      }
      if (this.keyword('class')) {
        declarations.push(this.parseStruct(exported, token, 'class'));
        continue;
      }
      if (this.keyword('extern')) {
        declarations.push(this.parseExtern(exported, token));
        continue;
      }
      if (this.keyword('fn')) {
        declarations.push(this.parseFunction(exported, token));
        continue;
      }

      if (exported || this.keyword('local')) {
        const isExport = exported;
        const name = this.identifier('constant name');
        const baseClause = this.parseBaseClause();
        this.expect('symbol', '=');
        const expression = this.parseExpression();
        if (expression.kind === 'table_literal') {
          declarations.push({ kind: 'table', name: name.value, entries: expression.entries, positional: expression.positional, exported: isExport, basePath: baseClause?.path || null, baseToken: baseClause?.token || null, token });
        } else {
          if (baseClause) throw new CompileError('base inheritance requires an object table literal', baseClause.token);
          declarations.push({ kind: 'constant', name: name.value, expression, exported: isExport, token });
        }
        continue;
      }

      // A closed table may be assembled in readable namespace style:
      // const Math = {}
      // Math.clamp = fn(...) ... end
      if (this.at('identifier') && this.tokens[this.index + 1]?.value === '.'
          && this.tokens[this.index + 2]?.type === 'identifier'
          && this.tokens[this.index + 3]?.value === '=') {
        const tableName = this.identifier('table name');
        this.expect('symbol', '.');
        const member = this.identifier('table member name');
        this.expect('symbol', '=');
        const expression = this.parseExpression();
        declarations.push({ kind: 'table_member', tableName: tableName.value, memberName: member.value, expression, exported: false, token });
        continue;
      }

      // Backward-compatible top-level calls are wrapped into an implicit main.
      const expression = this.parseExpression();
      if (expression.kind !== 'call') {
        throw new CompileError('only function calls and closed-table member definitions are allowed at the top level', expression.token || token);
      }
      legacyStatements.push({ kind: 'expr', expression, token });
    }
    return { kind: 'module', filePath: this.filePath, declarations, legacyStatements };
  }

  parseBlock(stopKeywords) {
    const statements = [];
    while (!this.at('eof') && !(this.at('keyword') && stopKeywords.has(this.current().value))) {
      const statement = this.parseStatement();
      if (Array.isArray(statement)) statements.push(...statement);
      else statements.push(statement);
    }
    return statements;
  }

  parseStatement() {
    const token = this.current();
    if (this.at('keyword', 'local') || this.at('keyword', 'const')) {
      const immutable = this.keyword('const');
      if (!immutable) this.expectKeyword('local');
      const name = this.identifier('local variable name');
      const type = this.parseType(null);
      let expression = { kind: 'literal', value: 0n, valueType: 'i64', token: name };
      if (this.match('symbol', '=')) expression = this.parseExpression();
      return { kind: 'local', name: name.value, declaredType: type, expression, immutable, token };
    }
    if (this.keyword('return')) {
      if (this.at('keyword', 'end') || this.at('keyword', 'else') || this.at('keyword', 'elseif') || this.at('eof')) {
        return { kind: 'return', expression: null, token };
      }
      return { kind: 'return', expression: this.parseExpression(), token };
    }
    if (this.keyword('break')) return { kind: 'break', token };
    if (this.keyword('if')) {
      const condition = this.parseExpression();
      this.expectKeyword('then');
      const branches = [{ condition, body: this.parseBlock(new Set(['elseif', 'else', 'end'])), token }];
      while (this.keyword('elseif')) {
        const branchToken = this.previous();
        const branchCondition = this.parseExpression();
        this.expectKeyword('then');
        branches.push({ condition: branchCondition, body: this.parseBlock(new Set(['elseif', 'else', 'end'])), token: branchToken });
      }
      let elseBody = [];
      if (this.keyword('else')) elseBody = this.parseBlock(new Set(['end']));
      this.expectKeyword('end');
      return { kind: 'if', branches, elseBody, token };
    }
    if (this.keyword('while')) {
      const condition = this.parseExpression();
      this.expectKeyword('do');
      const body = this.parseBlock(new Set(['end']));
      this.expectKeyword('end');
      return { kind: 'while', condition, body, token };
    }
    if (this.keyword('for')) {
      const item = this.identifier('table loop item');
      this.expectKeyword('in');
      const tableExpression = this.parseExpression();
      this.expectKeyword('do');
      const body = this.parseBlock(new Set(['end']));
      this.expectKeyword('end');
      const id = this.hiddenCounter++;
      const tableName = `__lsx_for_table_${id}`;
      const indexName = `__lsx_for_index_${id}`;
      const tableRef = () => ({ kind: 'reference', path: [tableName], token });
      const indexRef = () => ({ kind: 'reference', path: [indexName], token });
      const countCall = { kind: 'call', path: [tableName, 'length'], args: [], token };
      const atCall = { kind: 'call', path: [tableName, 'get'], args: [indexRef()], token };
      return [
        { kind: 'local', name: tableName, declaredType: null, expression: tableExpression, token },
        { kind: 'local', name: indexName, declaredType: 'i64', expression: { kind: 'literal', value: 0n, valueType: 'i64', token }, token },
        {
          kind: 'while',
          condition: { kind: 'binary', operator: '<', left: indexRef(), right: countCall, token },
          body: [
            { kind: 'local', name: item.value, declaredType: null, expression: atCall, token: item },
            ...body,
            { kind: 'assign', name: indexName, targetPath: [indexName], expression: { kind: 'binary', operator: '+', left: indexRef(), right: { kind: 'literal', value: 1n, valueType: 'i64', token }, token }, token },
          ],
          token,
        },
      ];
    }

    const expression = this.parseExpression();
    if (this.match('symbol', '=')) {
      const value = this.parseExpression();
      if (expression.kind === 'reference') {
        if (expression.path.length === 1) return { kind: 'assign', name: expression.path[0], targetPath: expression.path, expression: value, token: expression.token };
        return { kind: 'field_assign', targetPath: expression.path, expression: value, token: expression.token };
      }
      if (expression.kind === 'index') return { kind: 'index_assign', target: expression, expression: value, token: expression.token };
      throw new CompileError('left side of assignment must be a variable, table field, or table index', expression.token || token);
    }
    if (expression.kind !== 'call') throw new CompileError('expected assignment, call, or control statement', expression.token || token);
    return { kind: 'expr', expression, token };
  }

  parseExpression() { return this.parseOr(); }
  parseOr() {
    let expression = this.parseAnd();
    while (this.keyword('or')) expression = { kind: 'binary', operator: 'or', left: expression, right: this.parseAnd(), token: this.previous() };
    return expression;
  }
  parseAnd() {
    let expression = this.parseComparison();
    while (this.keyword('and')) expression = { kind: 'binary', operator: 'and', left: expression, right: this.parseComparison(), token: this.previous() };
    return expression;
  }
  parseComparison() {
    let expression = this.parseTerm();
    while (this.at('symbol') && ['==', '~=', '<', '<=', '>', '>='].includes(this.current().value)) {
      const op = this.current(); this.index += 1;
      expression = { kind: 'binary', operator: op.value, left: expression, right: this.parseTerm(), token: op };
    }
    return expression;
  }
  parseTerm() {
    let expression = this.parseFactor();
    while (this.at('symbol') && ['+', '-'].includes(this.current().value)) {
      const op = this.current(); this.index += 1;
      expression = { kind: 'binary', operator: op.value, left: expression, right: this.parseFactor(), token: op };
    }
    return expression;
  }
  parseFactor() {
    let expression = this.parseUnary();
    while (this.at('symbol') && ['*', '/', '%'].includes(this.current().value)) {
      const op = this.current(); this.index += 1;
      expression = { kind: 'binary', operator: op.value, left: expression, right: this.parseUnary(), token: op };
    }
    return expression;
  }
  parseUnary() {
    if (this.match('symbol', '-')) return { kind: 'unary', operator: '-', expression: this.parseUnary(), token: this.previous() };
    if (this.keyword('not')) return { kind: 'unary', operator: 'not', expression: this.parseUnary(), token: this.previous() };
    return this.parsePrimary();
  }
  parsePrimary() {
    const token = this.current();
    if (this.match('number')) {
      if (/[.eEfF]/.test(token.value)) {
        const numeric = Number(token.value.replace(/[fF]$/, ''));
        if (!Number.isFinite(numeric)) throw new CompileError('invalid floating-point literal', token);
        return { kind: 'literal', value: Math.fround(numeric), valueType: 'f32', token };
      }
      const value = BigInt(token.value);
      return { kind: 'literal', value, valueType: 'i64', token };
    }
    if (this.match('string')) return { kind: 'literal', value: token.value, valueType: 'string', token };
    if (this.keyword('true')) return { kind: 'literal', value: 1n, valueType: 'bool', token };
    if (this.keyword('false')) return { kind: 'literal', value: 0n, valueType: 'bool', token };
    if (this.keyword('null')) return { kind: 'literal', value: 0n, valueType: 'ptr', token };
    if (this.keyword('fn')) return this.parseFunctionExpression(token);
    if (this.match('symbol', '{')) return this.parseTableLiteral(token);
    if (this.match('symbol', '(')) {
      const expression = this.parseExpression();
      this.expect('symbol', ')');
      return expression;
    }
    if (this.match('identifier')) {
      const parts = [token.value];
      while (this.match('symbol', '.')) parts.push(this.identifier('name after dot').value);
      let expression;
      if (this.match('symbol', '(')) {
        const args = [];
        if (!this.at('symbol', ')')) {
          do { args.push(this.parseExpression()); } while (this.match('symbol', ','));
        }
        this.expect('symbol', ')');
        expression = { kind: 'call', path: parts, args, token };
      } else {
        expression = { kind: 'reference', path: parts, token };
      }
      while (this.match('symbol', '[')) {
        const index = this.parseExpression();
        this.expect('symbol', ']');
        expression = { kind: 'index', object: expression, index, token };
      }
      return expression;
    }
    throw new CompileError(`expected expression, found '${token.value}'`, token);
  }

}

function parseFile(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new CompileError(`script not found: ${absolute}`, null, absolute);
  const originalSource = fs.readFileSync(absolute, 'utf8');
  let source = originalSource;
  try { source = compileInlineUiSource(originalSource, absolute).source; }
  catch (error) { throw new CompileError(error.message, null, absolute); }
  const tokens = new Lexer(source, absolute).lex();
  return new Parser(tokens, absolute).parseModule();
}

function astUsesSelf(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.kind === 'reference' && node.path?.[0] === 'self') return true;
  if (node.kind === 'call' && node.path?.[0] === 'self') return true;
  if ((node.kind === 'field_assign' || node.kind === 'assign') && node.targetPath?.[0] === 'self') return true;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'token' || key === 'resolvedCallable' || key === 'resolvedReference') continue;
    if (Array.isArray(value)) {
      if (value.some(astUsesSelf)) return true;
    } else if (value && typeof value === 'object' && astUsesSelf(value)) return true;
  }
  return false;
}

function inferLiteralType(expression) {
  if (!expression) return null;
  if (expression.kind === 'literal') return canonicalTypeName(expression.valueType);
  return null;
}

function constantIntegerLiteralValue(expression) {
  if (!expression) return null;
  if (expression.kind === 'literal' && expression.valueType === 'i64' && typeof expression.value === 'bigint') return expression.value;
  if (expression.kind === 'unary' && expression.operator === '-') {
    const value = constantIntegerLiteralValue(expression.expression);
    return value === null ? null : -value;
  }
  return null;
}

function inferPositionalNativeElementType(entries, inferredTypes) {
  if (!entries?.length || entries.length !== inferredTypes.length) return null;
  const types = inferredTypes.map((type) => canonicalTypeName(type));
  if (types.some((type) => isAutoType(type) || !isNumericType(type) || type === 'bool')) return null;

  // Any decimal value makes the entire positional literal a tightly packed f32
  // buffer. Integer members are converted while being written into the buffer.
  if (types.some((type) => type === 'f32')) return 'f32';

  // Plain non-negative integer literals are the natural representation for
  // OpenGL index buffers. Keep them packed as u32 unless their values require
  // a wider native integer. Signed literals use i32 when they fit.
  const values = entries.map((entry) => constantIntegerLiteralValue(entry.expression));
  if (values.every((value) => value !== null)) {
    const zero = 0n;
    const maxU32 = 0xFFFFFFFFn;
    const minI32 = -0x80000000n;
    const maxI32 = 0x7FFFFFFFn;
    if (values.every((value) => value >= zero && value <= maxU32)) return 'u32';
    if (values.every((value) => value >= minI32 && value <= maxI32)) return 'i32';
    if (values.every((value) => value >= zero)) return 'u64';
    return 'i64';
  }

  // Runtime values keep their already inferred homogeneous native type.
  const first = types[0];
  return types.every((type) => type === first) ? first : null;
}

class Program {
  constructor(entryPath = null, moduleRoots = {}) {
    this.entryPath = entryPath ? path.resolve(entryPath) : null;
    const mergedRoots = { ...environmentModuleRoots(), ...(moduleRoots || {}) };
    const bundledRoot = compilerLazyScriptRoot();
    if (!mergedRoots.LazyScript && bundledRoot) mergedRoots.LazyScript = bundledRoot;
    this.moduleRoots = new Map(Object.entries(mergedRoots).map(([name, value]) => [name, path.resolve(value)]));
    this.modules = new Map();
    this.moduleOrder = [];
    this.imports = new Map();
    this.usesBuiltins = new Set();
    this.anonymousTableCounter = 0;
  }

  symbolExists(module, name) {
    return module.constants.has(name) || module.structs.has(name) || module.functions.has(name) || module.externs.has(name);
  }

  registerMethod(module, packedType, sourceName, functionDecl, exported = false, forceInstance = null) {
    if (packedType.methods.has(sourceName)) throw new CompileError(`table member '${sourceName}' already exists on ${packedType.name}`, functionDecl.token);
    const usesSelf = forceInstance === null ? astUsesSelf(functionDecl.body) : Boolean(forceInstance);
    const isStatic = packedType.tableModel ? !usesSelf : false;
    const params = isStatic
      ? [...functionDecl.params]
      : [{ name: 'self', type: packedType.name, token: functionDecl.token }, ...functionDecl.params];
    const method = {
      ...functionDecl,
      kind: 'function',
      name: `${packedType.name}$${sourceName}`,
      sourceName,
      params,
      exported,
      module,
      methodOf: packedType,
      isStatic,
      usesSelf,
      label: `fn_${module.id}_${packedType.name}_${sourceName}`,
    };
    packedType.methods.set(sourceName, method);
    module.functions.set(method.name, method);
    return method;
  }

  registerPackedType(module, decl, tableModel = false, runtimeLiteral = false) {
    if (this.symbolExists(module, decl.name)) throw new CompileError(`symbol '${decl.name}' already exists`, decl.token);
    const fieldDeclarations = [];
    const methodEntries = [];
    const staticValues = new Map();
    if (tableModel) {
      for (const entry of decl.entries || []) {
        if (entry.expression.kind === 'function_expression') {
          methodEntries.push(entry);
          continue;
        }
        const literalType = inferLiteralType(entry.expression);
        const type = entry.declaredType ? canonicalTypeName(entry.declaredType) : ((literalType === 'ptr' && entry.expression.kind === 'literal' && entry.expression.value === 0n) ? 'auto' : (literalType || 'auto'));
        fieldDeclarations.push({ name: entry.name, type, explicitType: Boolean(entry.declaredType), expression: runtimeLiteral ? null : entry.expression, token: entry.token, positionalIndex: entry.positionalIndex ?? null });
        const emptySequenceField = entry.expression.kind === 'table_literal' && entry.expression.entries.length === 0;
        if (!runtimeLiteral && !emptySequenceField) staticValues.set(entry.name, {
          kind: 'constant', name: entry.name, expression: entry.expression, exported: decl.exported,
          module, resolved: false, resolving: false, value: null, type: null, token: entry.token,
        });
      }
    } else {
      fieldDeclarations.push(...(decl.fields || []));
      for (const method of decl.methods || []) methodEntries.push({ name: method.name, expression: { ...method, kind: 'function_expression' }, token: method.token });
    }
    const packedType = {
      ...decl,
      kind: 'struct',
      module,
      tableModel,
      positional: Boolean(decl.positional),
      runtimeLiteral: Boolean(runtimeLiteral),
      positionalElement: null,
      positionalStride: 0,
      declarationKind: tableModel ? 'table' : (decl.declarationKind || 'struct'),
      fieldDeclarations,
      fields: new Map(),
      fieldOrder: [],
      methods: new Map(),
      staticValues,
      size: null,
      alignment: null,
      layoutResolved: false,
      layoutResolving: false,
      inheritanceResolved: false,
      inheritanceResolving: false,
      basePath: decl.basePath || null,
      baseToken: decl.baseToken || decl.token,
      baseType: null,
      ownMethods: new Set(),
      newLabel: `struct_${module.id}_${decl.name}_new`,
      cloneLabel: `struct_${module.id}_${decl.name}_clone`,
      destroyLabel: `struct_${module.id}_${decl.name}_destroy`,
      initLabel: `struct_${module.id}_${decl.name}_init`,
    };
    for (const field of packedType.fieldDeclarations) field.declaringStruct = packedType;
    module.structs.set(decl.name, packedType);
    if (tableModel) module.tables.set(decl.name, packedType);
    for (const entry of methodEntries) {
      this.registerMethod(module, packedType, entry.name, entry.expression, decl.exported, tableModel ? null : true);
      packedType.ownMethods.add(entry.name);
    }
    return packedType;
  }

  addClosedTableMember(module, decl) {
    const table = module.tables.get(decl.tableName);
    if (!table) throw new CompileError(`unknown closed table '${decl.tableName}'`, decl.token);
    if (table.layoutResolved) throw new CompileError(`closed table '${decl.tableName}' was sealed before member '${decl.memberName}'`, decl.token);
    if (decl.expression.kind === 'function_expression') {
      this.registerMethod(module, table, decl.memberName, decl.expression, table.exported);
      table.ownMethods.add(decl.memberName);
      return;
    }
    if (table.staticValues.has(decl.memberName) || table.fieldDeclarations.some((field) => field.name === decl.memberName)) {
      throw new CompileError(`table member '${decl.memberName}' already exists on ${table.name}`, decl.token);
    }
    const literalType = inferLiteralType(decl.expression);
    const type = (literalType === 'ptr' && decl.expression.kind === 'literal' && decl.expression.value === 0n) ? 'auto' : (literalType || 'auto');
    table.fieldDeclarations.push({ name: decl.memberName, type, explicitType: false, expression: decl.expression, token: decl.token, declaringStruct: table });
    table.staticValues.set(decl.memberName, {
      kind: 'constant', name: decl.memberName, expression: decl.expression, exported: table.exported,
      module, resolved: false, resolving: false, value: null, type: null, token: decl.token,
    });
  }

  registerAnonymousTables(module) {
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.kind === 'table_literal' && node.entries.length > 0 && !node.tableStruct) {
        const name = `__table_${module.id}_${this.anonymousTableCounter++}`;
        const packed = this.registerPackedType(module, {
          kind: 'table', name, entries: node.entries, positional: Boolean(node.positional), exported: false, token: node.token,
        }, true, true);
        node.tableStruct = packed;
        node.tableType = name;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'token' || key === 'tableStruct') continue;
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    for (const fn of [...module.functions.values()]) visit(fn.body);
    for (const statement of module.legacyStatements) visit(statement);
  }

  load(filePath) {
    const absolute = path.resolve(filePath);
    if (this.modules.has(absolute)) return this.modules.get(absolute);
    const ast = parseFile(absolute);
    const module = {
      filePath: absolute,
      ast,
      id: `m_${stableId(absolute)}`,
      uses: new Map(),
      constants: new Map(),
      structs: new Map(),
      tables: new Map(),
      functions: new Map(),
      externs: new Map(),
      legacyStatements: ast.legacyStatements,
    };
    this.modules.set(absolute, module);
    this.moduleOrder.push(module);

    for (const decl of ast.declarations) {
      if (decl.kind === 'use') {
        if (module.uses.has(decl.alias)) throw new CompileError(`module alias '${decl.alias}' already exists`, decl.token);
        module.uses.set(decl.alias, { source: decl.source, target: null, token: decl.token });
      } else if (decl.kind === 'struct') {
        this.registerPackedType(module, decl, false);
      } else if (decl.kind === 'table') {
        this.registerPackedType(module, decl, true);
      } else if (decl.kind === 'table_member') {
        this.addClosedTableMember(module, decl);
      } else if (decl.kind === 'constant') {
        if (this.symbolExists(module, decl.name)) throw new CompileError(`symbol '${decl.name}' already exists`, decl.token);
        module.constants.set(decl.name, { ...decl, module, resolved: false, resolving: false, value: null, type: null });
      } else if (decl.kind === 'function') {
        if (this.symbolExists(module, decl.name)) throw new CompileError(`symbol '${decl.name}' already exists`, decl.token);
        module.functions.set(decl.name, { ...decl, module, label: `fn_${module.id}_${decl.name}` });
      } else if (decl.kind === 'extern') {
        if (this.symbolExists(module, decl.name)) throw new CompileError(`symbol '${decl.name}' already exists`, decl.token);
        const ext = { ...decl, module, importKey: `${decl.dll.toLowerCase()}::${decl.name}` };
        module.externs.set(decl.name, ext);
        this.imports.set(ext.importKey, ext);
      }
    }

    // Resolve after declarations are registered so circular module references work.
    for (const [alias, use] of module.uses) {
      const targetPath = this.resolveModulePath(absolute, use.source, use.token);
      use.target = this.load(targetPath);
      module.uses.set(alias, use);
    }
    this.registerAnonymousTables(module);
    return module;
  }


  resolveModulePath(importerPath, source, token = null) {
    if (!source.startsWith('@')) return path.resolve(path.dirname(importerPath), source);
    const slash = source.indexOf('/');
    if (slash <= 1) throw new CompileError(`invalid named module root '${source}'`, token, importerPath);
    const rootName = source.slice(1, slash);
    const remainder = source.slice(slash + 1);
    let root = this.moduleRoots.get(rootName) || null;
    if (!root) root = [...this.moduleRoots.entries()].find(([name]) => name.toLowerCase() === rootName.toLowerCase())?.[1] || null;
    if (rootName.toLowerCase() === 'lazyscript') root = normalizeLazyScriptRoot(root) || root;
    if (root && !directoryExists(root)) root = null;
    if (!root) {
      let current = path.dirname(importerPath);
      for (;;) {
        if (path.basename(current).toLowerCase() === rootName.toLowerCase()) { root = current; break; }
        const candidate = path.join(current, rootName);
        if (directoryExists(candidate)) { root = candidate; break; }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    if (!root) {
      const configPath = findNearestProjectConfig(importerPath);
      const searchRoot = configPath ? path.dirname(configPath) : process.cwd();
      root = findNamedDirectoryRecursive(searchRoot, rootName);
    }
    if (!root && rootName.toLowerCase() === 'lazyscript') root = compilerLazyScriptRoot();
    if (!root) throw new CompileError(`named module root '@${rootName}' was not found. Select the LazyScript/API folder in VS Code, pass --lazy-script-root, or configure moduleRoots.${rootName} in lazyscriptex.json`, token, importerPath);
    return path.resolve(root, remainder);
  }

  resolveStructIdentity(module, typeName) {
    const name = canonicalTypeName(typeName);
    if (isAutoType(name) || PRIMITIVE_TYPES.has(name) || isTableTypeName(name)) return null;
    const parts = name.split('.');
    if (parts.length === 1) return module.structs.get(parts[0]) || null;
    if (parts.length === 2) {
      const use = module.uses.get(parts[0]);
      const struct = use?.target.structs.get(parts[1]);
      return struct?.exported ? struct : null;
    }
    return null;
  }

  translateInferredType(typeName, fromModule, toModule) {
    const name = canonicalTypeName(typeName);
    if (isAutoType(name) || PRIMITIVE_TYPES.has(name)) return name;
    if (isTableTypeName(name)) {
      return `table<${this.translateInferredType(tableElementTypeName(name), fromModule, toModule)}>`;
    }
    const struct = this.resolveStructIdentity(fromModule, name);
    if (!struct) return name;
    if (struct.module === toModule) return struct.name;
    for (const [alias, use] of toModule.uses) {
      if (use.target === struct.module) return `${alias}.${struct.name}`;
    }
    throw new CompileError(`module cannot name inferred type '${struct.name}' because its source module is not imported`, struct.token);
  }

  inferenceTypesSame(leftType, leftModule, rightType, rightModule) {
    const left = canonicalTypeName(leftType);
    const right = canonicalTypeName(rightType);
    if (isAutoType(left) || isAutoType(right)) return true;
    if (left === right && leftModule === rightModule) return true;
    if (PRIMITIVE_TYPES.has(left) || PRIMITIVE_TYPES.has(right)) return left === right;
    if (isTableTypeName(left) || isTableTypeName(right)) {
      if (!isTableTypeName(left) || !isTableTypeName(right)) return false;
      return this.inferenceTypesSame(tableElementTypeName(left), leftModule, tableElementTypeName(right), rightModule);
    }
    return this.resolveStructIdentity(leftModule, left) === this.resolveStructIdentity(rightModule, right);
  }

  mergeInferredTypes(currentType, currentModule, incomingType, incomingModule, explicit = false, token = null, label = 'value') {
    const current = canonicalTypeName(currentType);
    const incoming = canonicalTypeName(incomingType);
    if (isAutoType(incoming)) return current;
    const translated = this.translateInferredType(incoming, incomingModule, currentModule);
    if (isAutoType(current) || current === 'any') return translated;
    if (translated === 'any') return current;
    if (isGenericTableType(current) && isTableTypeName(translated) && !isGenericTableType(translated)) return translated;
    if (isGenericTableType(translated) && isTableTypeName(current)) return current;
    if (this.inferenceTypesSame(current, currentModule, translated, currentModule)) return current;

    if (isNumericType(current) && isNumericType(translated)) {
      if (explicit) return current;
      if (isFloatType(current) || isFloatType(translated)) return 'f32';
      if (current === 'bool' && translated === 'bool') return 'bool';
      return 'i64';
    }
    if (isIntegerType(current) && isIntegerType(translated)) {
      if (explicit) return current;
      const special = new Set(['ptr', 'handle', 'string']);
      if (special.has(translated) && !special.has(current)) return translated;
      if (special.has(current)) return current;
      return 'i64';
    }

    const currentStruct = this.resolveStructIdentity(currentModule, current);
    const incomingStruct = this.resolveStructIdentity(currentModule, translated);
    if (!explicit && current === 'ptr' && (incomingStruct || isTableTypeName(translated))) return translated;
    if ((currentStruct || isTableTypeName(current)) && translated === 'ptr') return current;
    if ((current === 'ptr' || current === 'handle') && (translated === 'ptr' || translated === 'handle')) return current;

    throw new CompileError(`conflicting inferred types for ${label}: ${current} and ${translated}`, token);
  }

  setInferredSlot(owner, key, incomingType, incomingModule, targetModule, explicit = false, token = null, label = 'value') {
    if (isAutoType(incomingType)) return false;
    const current = owner[key];
    const merged = this.mergeInferredTypes(current, targetModule, incomingType, incomingModule, explicit, token, label);
    if (canonicalTypeName(current) !== canonicalTypeName(merged)) {
      owner[key] = merged;
      this.inferenceChanged = true;
      return true;
    }
    return false;
  }

  fieldDeclaration(struct, name) {
    const own = (struct.fieldDeclarations || []).find((field) => field.name === name) || null;
    if (own) return own;
    return struct.baseType ? this.fieldDeclaration(struct.baseType, name) : null;
  }

  methodDeclaration(struct, name) {
    const own = struct.methods?.get(name) || null;
    if (own) return own;
    return struct.baseType ? this.methodDeclaration(struct.baseType, name) : null;
  }

  visibleInferenceStructs(module) {
    const result = [];
    const seen = new Set();
    const add = (struct) => {
      if (!struct || seen.has(struct)) return;
      seen.add(struct);
      result.push(struct);
    };
    for (const struct of module.structs.values()) add(struct);
    for (const use of module.uses.values()) {
      for (const struct of use.target.structs.values()) {
        if (struct.exported) add(struct);
      }
    }
    return result;
  }

  inferUniqueStructForMember(module, memberName, methodOnly = false) {
    const matches = [];
    for (const struct of this.visibleInferenceStructs(module)) {
      const found = methodOnly
        ? this.methodDeclaration(struct, memberName)
        : (this.fieldDeclaration(struct, memberName) || this.methodDeclaration(struct, memberName));
      if (found) matches.push(struct);
    }
    return matches.length === 1 ? matches[0] : null;
  }

  applyUniqueMemberInference(owner, memberName, module, scope, token = null, methodOnly = false) {
    if (!owner || !isAutoType(owner.type)) return false;
    const modulePath = String(module.filePath || '').replaceAll('\\', '/').toLowerCase();
    if (modulePath.includes('/bindings/')) return false;
    const sourceExpression = owner.sourceExpression || owner.expression || null;
    if (sourceExpression?.kind === 'table_literal') return false;
    const candidate = this.inferUniqueStructForMember(module, memberName, methodOnly);
    if (!candidate) return false;
    const inferredType = this.translateInferredType(candidate.name, candidate.module, module);
    owner.type = inferredType;
    if (owner.declaration) owner.declaration.inferredType = inferredType;
    this.inferenceChanged = true;
    if (owner.param) {
      this.setInferredSlot(
        owner.param, 'type', inferredType, module, scope.function.module,
        Boolean(owner.param.explicitType), token,
        `parameter '${owner.param.name}'`,
      );
    }
    return true;
  }

  inferConstantType(module, pathParts) {
    try {
      if (pathParts.length === 1) {
        const constant = module.constants.get(pathParts[0]);
        if (!constant) return null;
        const value = this.resolveConstant(constant);
        return { type: value.type, module };
      }
      if (pathParts.length === 2) {
        const localTable = module.tables.get(pathParts[0]);
        if (localTable) {
          const constant = localTable.staticValues.get(pathParts[1]);
          if (!constant) return null;
          const value = this.resolveConstant(constant);
          return { type: value.type, module: localTable.module };
        }
        const use = module.uses.get(pathParts[0]);
        const constant = use?.target.constants.get(pathParts[1]);
        if (!constant || !constant.exported) return null;
        const value = this.resolveConstant(constant);
        return { type: value.type, module: use.target };
      }
      if (pathParts.length === 3) {
        const use = module.uses.get(pathParts[0]);
        const table = use?.target.tables.get(pathParts[1]);
        const constant = table?.staticValues.get(pathParts[2]);
        if (!table?.exported || !constant) return null;
        const value = this.resolveConstant(constant);
        return { type: value.type, module: table.module };
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  inferenceReference(module, pathParts, scope) {
    if (!pathParts?.length) return null;
    let current = null;
    let index = 0;
    const variable = scope.variables.get(pathParts[0]);
    if (variable) {
      // In object methods, an untyped peer parameter that is used through the
      // same known fields is inferred as the owning table type. This makes
      // vec.add(other) declaration-free without weakening field validation.
      if (isAutoType(variable.type) && pathParts.length > 1 && scope.function.methodOf) {
        const owner = scope.function.methodOf;
        if (this.fieldDeclaration(owner, pathParts[1])) {
          const ownerType = this.translateInferredType(owner.name, owner.module, module);
          variable.type = ownerType;
          this.inferenceChanged = true;
          if (variable.param) {
            this.setInferredSlot(variable.param, 'type', ownerType, module, scope.function.module, Boolean(variable.param.explicitType), variable.param.token, `parameter '${variable.param.name}'`);
          }
        }
      }
      if (isAutoType(variable.type) && pathParts.length > 1) {
        this.applyUniqueMemberInference(variable, pathParts[1], module, scope, variable.param?.token || null, false);
      }
      current = { type: variable.type, module, variable };
      index = 1;
    } else if (pathParts[0] === 'self' && scope.function.methodOf) {
      current = { type: scope.function.methodOf.name, module: scope.function.methodOf.module, self: true };
      index = 1;
    } else {
      const constant = this.inferConstantType(module, pathParts);
      if (constant) return constant;
      if (pathParts.length === 1) {
        const fn = module.functions.get(pathParts[0]);
        if (fn) return { type: 'fnptr', module: fn.module, function: fn };
      } else if (pathParts.length === 2) {
        const use = module.uses.get(pathParts[0]);
        const fn = use?.target.functions.get(pathParts[1]);
        if (fn?.exported) return { type: 'fnptr', module: fn.module, function: fn };
      }
      return null;
    }

    while (index < pathParts.length) {
      if (isAutoType(current.type)) return { ...current, unresolvedPath: pathParts.slice(index) };
      const struct = this.resolveStructIdentity(current.module, current.type);
      if (!struct) return null;
      const field = this.fieldDeclaration(struct, pathParts[index]);
      if (!field) return null;
      const declaringStruct = field.declaringStruct || struct;
      current = { type: field.type, module: declaringStruct.module, field, struct: declaringStruct };
      index += 1;
    }
    return current;
  }

  applyInferenceExpected(expression, expectedType, expectedModule, module, scope) {
    if (!expression || isAutoType(expectedType)) return;
    if (expression.kind === 'reference') {
      const resolved = this.inferenceReference(module, expression.path, scope);
      if (resolved?.variable) {
        // A reference such as props.root does not mean props itself has the
        // type expected for root. Leave unresolved member paths alone until a
        // call site or another assignment identifies the owning object.
        if (resolved.unresolvedPath?.length) return;
        const variable = resolved.variable;
        const explicit = Boolean(variable.explicitType);
        if (explicit) return;
        const expected = this.translateInferredType(expectedType, expectedModule, module);
        const forceIntegerConversion = isNumericType(expected) && !isFloatType(expected) && isFloatType(canonicalTypeName(variable.type));
        let changed = false;
        if (forceIntegerConversion) {
          variable.type = expected;
          this.inferenceChanged = true;
          changed = true;
        } else {
          changed = this.setInferredSlot(variable, 'type', expectedType, expectedModule, module, explicit, expression.token, `variable '${variable.name}'`);
          if (changed && variable.sourceExpression) this.applyInferenceExpected(variable.sourceExpression, variable.type, module, module, scope);
        }
        if (variable.param) {
          if (forceIntegerConversion && !variable.param.explicitType) {
            variable.param.type = this.translateInferredType(variable.type, module, scope.function.module);
            this.inferenceChanged = true;
          } else {
            this.setInferredSlot(variable.param, 'type', variable.type, module, scope.function.module, Boolean(variable.param.explicitType), expression.token, `parameter '${variable.param.name}'`);
          }
        }
        return;
      }
      if (resolved?.field) {
        // props.graph.width constrains width, not the unresolved graph field.
        // Wait until an assignment or call site identifies the intermediate
        // object before applying an expectation to the leaf member.
        if (resolved.unresolvedPath?.length) return;
        if (resolved.field.explicitType) return;
        this.setInferredSlot(resolved.field, 'type', expectedType, expectedModule, resolved.struct.module, false, expression.token, `field '${resolved.struct.name}.${resolved.field.name}'`);
      }
      return;
    }
    if (expression.kind === 'call') {
      const callable = this.inferenceCallable(module, expression, scope);
      if (callable?.target && callable.kind === 'internal') {
        const target = callable.target;
        const translated = this.translateInferredType(expectedType, expectedModule, target.module);
        const forceIntegerConversion = !target.explicitReturnType
          && isNumericType(translated) && !isFloatType(translated)
          && isFloatType(canonicalTypeName(target.returnType));
        if (forceIntegerConversion) {
          target.returnType = translated;
          this.inferenceChanged = true;
        } else {
          this.setInferredSlot(target, 'returnType', expectedType, expectedModule, target.module, Boolean(target.explicitReturnType), expression.token, `return type of '${target.sourceName || target.name}'`);
        }
      }
      return;
    }
    if (expression.kind === 'binary') {
      const comparison = ['==', '~=', '<', '<=', '>', '>='].includes(expression.operator);
      const logical = expression.operator === 'and' || expression.operator === 'or';
      if (expression.operator === '%') {
        this.applyInferenceExpected(expression.left, 'i64', module, module, scope);
        this.applyInferenceExpected(expression.right, 'i64', module, module, scope);
        return;
      }
      if (!comparison && !logical && isNumericType(canonicalTypeName(expectedType))) {
        this.applyInferenceExpected(expression.left, expectedType, expectedModule, module, scope);
        this.applyInferenceExpected(expression.right, expectedType, expectedModule, module, scope);
      }
      return;
    }
    if (expression.kind === 'unary') {
      this.applyInferenceExpected(expression.expression, expectedType, expectedModule, module, scope);
      return;
    }
    if (expression.kind === 'table_literal') {
      expression.expectedType = this.translateInferredType(expectedType, expectedModule, module);
      return;
    }
    if (expression.kind === 'index') {
      let objectType = null;
      if (expression.object.kind === 'reference') objectType = this.inferenceReference(module, expression.object.path, scope);
      const positionalStruct = objectType ? this.resolveStructIdentity(objectType.module, objectType.type) : null;
      if ((!objectType || isAutoType(objectType.type) || isGenericTableType(objectType.type)) && !positionalStruct?.positional) {
        this.applyInferenceExpected(expression.object, `table<${this.translateInferredType(expectedType, expectedModule, module)}>`, module, module, scope);
      }
    }
  }

  inferenceCallable(module, call, scope) {
    const pathParts = call.path;
    const fullName = pathParts.join('.');
    const builtinTarget = BUILTINS.get(fullName);
    if (builtinTarget) return { kind: 'builtin', target: builtinTarget, returnType: builtinTarget.returnType, module };

    if (pathParts.length === 2 && pathParts[0] === 'base' && scope?.function?.methodOf) {
      const owner = scope.function.methodOf;
      const base = owner.baseType;
      if (!base) throw new CompileError(`object '${owner.name}' has no base object`, call.token);
      const method = base.methods.get(pathParts[1]);
      if (!method) throw new CompileError(`base object '${base.name}' has no function '${pathParts[1]}'`, call.token);
      if (!method.isStatic && !scope.variables.has('self')) throw new CompileError(`base function '${pathParts[1]}' requires an instance`, call.token);
      const receiverExpr = method.isStatic ? null : { kind: 'reference', path: ['self'], token: call.token };
      return { kind: 'internal', target: method, returnType: method.returnType, module: method.module, receiverExpr, baseCall: true };
    }

    if (pathParts.length === 1) {
      const fn = module.functions.get(pathParts[0]);
      if (fn) return { kind: 'internal', target: fn, returnType: fn.returnType, module: fn.module };
      const ext = module.externs.get(pathParts[0]);
      if (ext) return { kind: 'extern', target: ext, returnType: ext.returnType, module: ext.module };
    }

    if (pathParts.length === 2) {
      const use = module.uses.get(pathParts[0]);
      if (use) {
        const fn = use.target.functions.get(pathParts[1]);
        if (fn?.exported) return { kind: 'internal', target: fn, returnType: fn.returnType, module: fn.module };
        const ext = use.target.externs.get(pathParts[1]);
        if (ext?.exported) return { kind: 'extern', target: ext, returnType: ext.returnType, module: ext.module };
      }
      const table = module.tables.get(pathParts[0]);
      if (table) {
        if (pathParts[1] === 'new') return { kind: 'struct_new', target: null, returnType: table.name, module: table.module, struct: table };
        const method = table.methods.get(pathParts[1]);
        if (method?.isStatic) return { kind: 'internal', target: method, returnType: method.returnType, module: method.module };
      }
    }

    if (pathParts.length === 3) {
      const use = module.uses.get(pathParts[0]);
      const table = use?.target.tables.get(pathParts[1]);
      if (table?.exported) {
        if (pathParts[2] === 'new') return { kind: 'struct_new', target: null, returnType: this.translateInferredType(table.name, table.module, module), module, struct: table };
        const method = table.methods.get(pathParts[2]);
        if (method?.isStatic) return { kind: 'internal', target: method, returnType: method.returnType, module: method.module };
      }
    }

    const methodName = pathParts[pathParts.length - 1];
    const receiverPath = pathParts.slice(0, -1);
    const receiverExpr = { kind: 'reference', path: receiverPath, token: call.token };
    let receiver = this.inferenceReference(module, receiverPath, scope);
    if (receiver && isAutoType(receiver.type) && !receiver.unresolvedPath?.length) {
      const owner = receiver.variable || receiver.field || null;
      if (this.applyUniqueMemberInference(owner, methodName, module, scope, call.token, true)) {
        receiver = this.inferenceReference(module, receiverPath, scope);
      }
    }
    if (!receiver || isAutoType(receiver.type)) return { kind: 'unresolved_method', receiverExpr, methodName, returnType: 'auto', module };

    const receiverType = canonicalTypeName(receiver.type);
    if (isTableTypeName(receiverType)) {
      const element = tableElementTypeName(receiverType);
      const definitions = {
        push: { params: [element], returnType: 'i64' },
        add: { params: [], returnType: element },
        add_copy: { params: [element], returnType: element },
        get: { params: ['i64'], returnType: element },
        at: { params: ['i64'], returnType: element },
        first: { params: [], returnType: element },
        last: { params: [], returnType: element },
        length: { params: [], returnType: 'i64' },
        count: { params: [], returnType: 'i64' },
        capacity: { params: [], returnType: 'i64' },
        byte_length: { params: [], returnType: 'i64' },
        bytes: { params: [], returnType: 'i64' },
        data: { params: [], returnType: 'ptr' },
        data_at: { params: ['i64'], returnType: 'ptr' },
        byte_data: { params: [], returnType: 'ptr' },
        copy_bytes_from_ptr: { params: ['ptr', 'i64'], returnType: 'bool' },
        is_empty: { params: [], returnType: 'bool' },
        reserve: { params: ['i64'], returnType: 'bool' },
        reserve_bytes: { params: ['i64'], returnType: 'bool' },
        resize: { params: ['i64'], returnType: 'bool' },
        resize_bytes: { params: ['i64'], returnType: 'bool' },
        remove: { params: ['i64'], returnType: 'bool' },
        remove_at: { params: ['i64'], returnType: 'bool' },
        remove_fast: { params: ['i64'], returnType: 'bool' },
        remove_swap: { params: ['i64'], returnType: 'bool' },
        pop: { params: [], returnType: 'bool' },
        clear: { params: [], returnType: 'void' },
        destroy: { params: [], returnType: 'void' },
      };
      const definition = definitions[methodName];
      if (definition) {
        return {
          kind: 'table_builtin', receiverExpr, element,
          target: { params: definition.params.map((type, index) => ({ name: `arg${index}`, type })), returnType: definition.returnType, module },
          returnType: definition.returnType, module,
        };
      }
    }

    const struct = this.resolveStructIdentity(receiver.module, receiver.type);
    if (struct) {
      if (struct.positional && methodName === 'length') return { kind: 'packed_length', target: { params: [], returnType: 'i64', module }, returnType: 'i64', module, struct };
      if (struct.positional && (methodName === 'byte_length' || methodName === 'bytes')) return { kind: 'packed_byte_length', target: { params: [], returnType: 'i64', module }, returnType: 'i64', module, struct };
      if (struct.positional && methodName === 'data') return { kind: 'packed_data', target: { params: [], returnType: 'ptr', module }, returnType: 'ptr', module, struct };
      if (methodName === 'clone') return { kind: 'struct_clone', target: { params: [], returnType: receiver.type, module }, returnType: receiver.type, module };
      if (methodName === 'destroy') return { kind: 'struct_destroy', target: { params: [], returnType: 'void', module }, returnType: 'void', module };
      const method = struct.methods.get(methodName);
      if (method && !method.isStatic) return { kind: 'internal', target: method, returnType: method.returnType, module: method.module, receiverExpr };
    }
    return null;
  }

  inferExpression(expression, module, scope, expectedType = null, expectedModule = module) {
    if (!expression) return { type: 'void', module };
    if (!isAutoType(expectedType)) this.applyInferenceExpected(expression, expectedType, expectedModule, module, scope);

    if (expression.kind === 'literal') return { type: canonicalTypeName(expression.valueType), module };
    if (expression.kind === 'reference') {
      const resolved = this.inferenceReference(module, expression.path, scope);
      return resolved ? { type: canonicalTypeName(resolved.type), module: resolved.module } : { type: 'auto', module };
    }
    if (expression.kind === 'table_literal') {
      if (expression.expectedType) return { type: canonicalTypeName(expression.expectedType), module };
      if (expression.tableStruct) {
        const packed = expression.tableStruct;
        if (packed.runtimeLiteral) {
          const inferredEntries = [];
          for (const entry of expression.entries || []) {
            if (entry.expression.kind === 'function_expression') continue;
            const field = (packed.fieldDeclarations || []).find((candidate) => candidate.name === entry.name);
            if (!field) continue;
            // Positional literals infer one contiguous native element type from
            // the whole value list. Named object fields continue to infer
            // independently.
            const expected = packed.positional ? null : (isAutoType(field.type) ? null : field.type);
            const actual = this.inferExpression(entry.expression, module, scope, expected, packed.module);
            inferredEntries.push(actual.type);
            if (isAutoType(field.type) && !isAutoType(actual.type)) {
              this.setInferredSlot(field, 'type', actual.type, actual.module, packed.module, Boolean(field.explicitType), entry.token || expression.token, `object value '${entry.name}'`);
            }
          }
          if (packed.positional) {
            const commonType = inferPositionalNativeElementType(expression.entries || [], inferredEntries);
            if (commonType) {
              for (const field of packed.fieldDeclarations || []) {
                if (field.explicitType || field.type === commonType) continue;
                field.type = commonType;
                this.inferenceChanged = true;
              }
            }
          }
        }
        return { type: packed.name, module: packed.module };
      }
      return { type: 'auto', module };
    }
    if (expression.kind === 'unary') {
      if (expression.operator === 'not') {
        this.inferExpression(expression.expression, module, scope, 'bool', module);
        return { type: 'bool', module };
      }
      return this.inferExpression(expression.expression, module, scope, expectedType, expectedModule);
    }
    if (expression.kind === 'binary') {
      const comparison = ['==', '~=', '<', '<=', '>', '>='].includes(expression.operator);
      const logical = expression.operator === 'and' || expression.operator === 'or';
      if (expression.operator === '%') {
        this.inferExpression(expression.left, module, scope, 'i64', module);
        this.inferExpression(expression.right, module, scope, 'i64', module);
        return { type: 'i64', module };
      }
      if (logical) {
        this.inferExpression(expression.left, module, scope, 'bool', module);
        this.inferExpression(expression.right, module, scope, 'bool', module);
        return { type: 'bool', module };
      }
      let left = this.inferExpression(expression.left, module, scope);
      let right = this.inferExpression(expression.right, module, scope);
      if (!comparison && !logical && isAutoType(left.type) && !isAutoType(right.type) && isNumericType(canonicalTypeName(right.type))) {
        this.applyInferenceExpected(expression.left, right.type, right.module, module, scope);
        left = this.inferExpression(expression.left, module, scope);
      }
      if (!comparison && !logical && isAutoType(right.type) && !isAutoType(left.type) && isNumericType(canonicalTypeName(left.type))) {
        this.applyInferenceExpected(expression.right, left.type, left.module, module, scope);
        right = this.inferExpression(expression.right, module, scope);
      }
      if (comparison) return { type: 'bool', module };
      if (isFloatType(canonicalTypeName(left.type)) || isFloatType(canonicalTypeName(right.type))) return { type: 'f32', module };
      if (!isAutoType(left.type) || !isAutoType(right.type)) return { type: 'i64', module };
      if (!isAutoType(expectedType)) return { type: canonicalTypeName(expectedType), module: expectedModule };
      return { type: 'auto', module };
    }
    if (expression.kind === 'index') {
      const object = this.inferExpression(expression.object, module, scope);
      this.inferExpression(expression.index, module, scope, 'i64', module);
      if (isTableTypeName(object.type)) {
        const element = tableElementTypeName(object.type);
        if (element === 'any') {
          if (!isAutoType(expectedType)) {
            this.applyInferenceExpected(expression.object, `table<${this.translateInferredType(expectedType, expectedModule, module)}>`, module, module, scope);
            return { type: canonicalTypeName(expectedType), module: expectedModule };
          }
          return { type: 'auto', module };
        }
        return { type: element, module: object.module };
      }
      const positionalStruct = this.resolveStructIdentity(object.module, object.type);
      if (positionalStruct?.positional) {
        const fields = (positionalStruct.fieldDeclarations || [])
          .filter((field) => field.positionalIndex !== null && field.positionalIndex !== undefined)
          .sort((left, right) => left.positionalIndex - right.positionalIndex);
        if (expression.index.kind === 'literal' && typeof expression.index.value === 'bigint') {
          const field = fields[Number(expression.index.value)];
          if (field) return { type: canonicalTypeName(field.type), module: positionalStruct.module };
        }
        const firstType = fields[0]?.type;
        if (firstType && !isAutoType(firstType) && fields.every((field) => canonicalTypeName(field.type) === canonicalTypeName(firstType))) {
          return { type: canonicalTypeName(firstType), module: positionalStruct.module };
        }
      }
      if (!isAutoType(expectedType)) {
        this.applyInferenceExpected(expression.object, `table<${this.translateInferredType(expectedType, expectedModule, module)}>`, module, module, scope);
        return { type: canonicalTypeName(expectedType), module: expectedModule };
      }
      return { type: 'auto', module };
    }
    if (expression.kind === 'call') {
      let callable = this.inferenceCallable(module, expression, scope);
      const args = expression.args || [];
      const byteTableMethods = new Set(['byte_data','copy_bytes_from_ptr','reserve_bytes','resize_bytes']);
      const genericTableMethods = new Set(['length','count','byte_length','bytes','data','data_at','copy_from_ptr','is_empty','reserve','resize','remove','remove_fast','remove_at','remove_swap','pop','clear','capacity']);
      if (callable?.kind === 'unresolved_method' && byteTableMethods.has(callable.methodName)) {
        this.applyInferenceExpected(callable.receiverExpr, 'table<u8>', module, module, scope);
        callable = this.inferenceCallable(module, expression, scope);
      }
      if (callable?.kind === 'unresolved_method' && genericTableMethods.has(callable.methodName)) {
        const receiverInfo = this.inferenceReference(module, callable.receiverExpr.path, scope);
        const source = receiverInfo?.variable?.sourceExpression || receiverInfo?.field?.expression || null;
        // Do not guess that a normal user parameter is a sequence merely
        // because it calls resize/count/etc. Ordinary objects expose the same
        // method names. Native binding modules may keep their compact generic
        // byte-table helpers, while user functions wait for call-site inference.
        const bindingPath = String(module.filePath || '').replaceAll('\\', '/').toLowerCase();
        const isBindingModule = bindingPath.includes('/bindings/');
        const isSequenceCandidate = source?.kind === 'table_literal'
          || (Boolean(receiverInfo?.variable?.param) && isBindingModule);
        if (isSequenceCandidate) {
          this.applyInferenceExpected(callable.receiverExpr, 'table<any>', module, module, scope);
          callable = this.inferenceCallable(module, expression, scope);
        }
      }
      if (callable?.kind === 'unresolved_method' && callable.methodName === 'push' && args.length === 1) {
        const actual = this.inferExpression(args[0], module, scope);
        if (!isAutoType(actual.type)) {
          let elementType = actual.type;
          const literalValue = constantIntegerLiteralValue(args[0]);
          if (literalValue !== null) {
            if (literalValue >= 0n && literalValue <= 0xFFn) elementType = 'u8';
            else if (literalValue >= 0n && literalValue <= 0xFFFFn) elementType = 'u16';
            else if (literalValue >= 0n && literalValue <= 0xFFFFFFFFn) elementType = 'u32';
            else if (literalValue >= 0n) elementType = 'u64';
            else if (literalValue >= -0x80n) elementType = 'i8';
            else if (literalValue >= -0x8000n) elementType = 'i16';
            else if (literalValue >= -0x80000000n) elementType = 'i32';
            else elementType = 'i64';
          }
          const element = this.translateInferredType(elementType, actual.module, module);
          this.applyInferenceExpected(callable.receiverExpr, `table<${element}>`, module, module, scope);
          callable = this.inferenceCallable(module, expression, scope);
        }
      }
      if (callable?.kind === 'table_builtin' && callable.element === 'any') {
        const tableMethod = expression.path[expression.path.length - 1];
        if (byteTableMethods.has(tableMethod)) {
          this.applyInferenceExpected(callable.receiverExpr, 'table<u8>', module, module, scope);
          callable = this.inferenceCallable(module, expression, scope);
        } else if ((tableMethod === 'push' || tableMethod === 'add_copy') && args.length === 1) {
          const actual = this.inferExpression(args[0], module, scope);
          if (!isAutoType(actual.type)) {
            let elementType = actual.type;
            const literalValue = constantIntegerLiteralValue(args[0]);
            if (literalValue !== null) {
              if (literalValue >= 0n && literalValue <= 0xFFn) elementType = 'u8';
              else if (literalValue >= 0n && literalValue <= 0xFFFFn) elementType = 'u16';
              else if (literalValue >= 0n && literalValue <= 0xFFFFFFFFn) elementType = 'u32';
              else if (literalValue >= 0n) elementType = 'u64';
              else if (literalValue >= -0x80n) elementType = 'i8';
              else if (literalValue >= -0x8000n) elementType = 'i16';
              else if (literalValue >= -0x80000000n) elementType = 'i32';
              else elementType = 'i64';
            }
            const element = this.translateInferredType(elementType, actual.module, module);
            this.applyInferenceExpected(callable.receiverExpr, `table<${element}>`, module, module, scope);
            callable = this.inferenceCallable(module, expression, scope);
          }
        } else if (['get','at','first','last','add'].includes(tableMethod) && !isAutoType(expectedType)) {
          this.applyInferenceExpected(callable.receiverExpr, `table<${this.translateInferredType(expectedType, expectedModule, module)}>`, module, module, scope);
          callable = this.inferenceCallable(module, expression, scope);
        }
      }
      if (!callable) return { type: 'auto', module };

      // LSHTML lowering keeps the retained element, callback, and ordinary LSX
      // context object in one hidden binding call. Infer the callback signature
      // from those values so user handlers stay declaration-free.
      const uiBindingName = expression.path[expression.path.length - 1];
      const isUiEventBinding = new Set([
        '_bind_click', '_bind_change', '_bind_input', '_bind_focus', '_bind_blur',
        '_bind_key_down', '_bind_key_up', '_bind_pointer_down', '_bind_pointer_up',
        '_bind_pointer_move', '_bind_scroll',
      ]).has(uiBindingName);
      if (isUiEventBinding && args.length >= 3 && args[1]?.kind === 'reference') {
        const entry = this.inferenceReference(module, args[1].path, scope);
        const element = this.inferExpression(args[0], module, scope);
        let contextExpression = args[2];
        if (contextExpression?.kind === 'call'
          && contextExpression.path?.join('.') === 'memory.ptr'
          && contextExpression.args?.length > 0) {
          contextExpression = contextExpression.args[0];
        }
        const context = this.inferExpression(contextExpression, module, scope);
        const use = expression.path.length >= 2 ? module.uses.get(expression.path[0]) : null;
        const uiModule = use?.target || callable.target?.module || module;
        const uiEvent = uiModule.structs.get('UIEvent');
        if (entry?.function && entry.function.params.length >= 3) {
          const parameters = entry.function.params;
          if (!isAutoType(element.type)) {
            this.setInferredSlot(
              parameters[0], 'type', element.type, element.module, entry.function.module,
              Boolean(parameters[0].explicitType), args[1].token || expression.token,
              `parameter '${parameters[0].name}'`,
            );
          }
          if (uiEvent) {
            const eventType = this.translateInferredType(uiEvent.name, uiEvent.module, entry.function.module);
            this.setInferredSlot(
              parameters[1], 'type', eventType, entry.function.module, entry.function.module,
              Boolean(parameters[1].explicitType), args[1].token || expression.token,
              `parameter '${parameters[1].name}'`,
            );
          }
          if (!isAutoType(context.type)) {
            this.setInferredSlot(
              parameters[2], 'type', context.type, context.module, entry.function.module,
              Boolean(parameters[2].explicitType), args[1].token || expression.token,
              `parameter '${parameters[2].name}'`,
            );
          }
        }
      }

      // Public thread helpers keep native ABI details in the binding while the
      // LSX callback remains inference-only. Infer the callback's context
      // parameter from the object passed beside it, so front-end code can use
      // Thread.start(worker, work) without worker:Work annotations.
      const isThreadStartCall = expression.path.length >= 2
        && expression.path[expression.path.length - 2] === 'Thread'
        && (expression.path[expression.path.length - 1] === 'start'
          || expression.path[expression.path.length - 1] === 'start_with_stack');
      if (isThreadStartCall && args.length >= 2 && args[0]?.kind === 'reference') {
        const entry = this.inferenceReference(module, args[0].path, scope);
        const context = this.inferExpression(args[1], module, scope);
        if (entry?.function && entry.function.params.length === 1 && !isAutoType(context.type)) {
          const parameter = entry.function.params[0];
          this.setInferredSlot(
            parameter,
            'type',
            context.type,
            context.module,
            entry.function.module,
            Boolean(parameter.explicitType),
            args[0].token || expression.token,
            `parameter '${parameter.name}'`,
          );
        }
      }

      const signature = callable.target;
      if (signature?.params) {
        const visibleParams = callable.kind === 'internal' && callable.target.methodOf && !callable.target.isStatic
          ? callable.target.params.slice(1)
          : callable.target.params;
        for (let index = 0; index < Math.min(args.length, visibleParams.length); index += 1) {
          const param = visibleParams[index];
          const actual = this.inferExpression(args[index], module, scope);
          const opaqueObjectAddress = callable.kind === 'builtin'
            && expression.path?.join('.') === 'memory.ptr'
            && index === 0;
          const paramIsGenericTable = isGenericTableType(param.type);
          const actualIsSpecificTable = isTableTypeName(actual.type) && !isGenericTableType(actual.type);
          const actualIsGenericTable = isGenericTableType(actual.type);
          const paramIsSpecificTable = isTableTypeName(param.type) && !isGenericTableType(param.type);
          if ((isAutoType(param.type) || paramIsGenericTable) && !isAutoType(actual.type) && (!paramIsGenericTable || actualIsSpecificTable) && callable.kind === 'internal') {
            this.setInferredSlot(param, 'type', actual.type, actual.module, callable.target.module, Boolean(param.explicitType), args[index].token || expression.token, `parameter '${param.name}'`);
          } else if (!opaqueObjectAddress && !isAutoType(param.type) && (isAutoType(actual.type) || (actualIsGenericTable && paramIsSpecificTable))) {
            this.applyInferenceExpected(args[index], param.type, callable.target.module || module, module, scope);
          }
        }
      }
      if (callable.kind === 'internal' && isAutoType(callable.target.returnType) && !isAutoType(expectedType)) {
        this.setInferredSlot(callable.target, 'returnType', expectedType, expectedModule, callable.target.module, Boolean(callable.target.explicitReturnType), expression.token, `return type of '${callable.target.sourceName || callable.target.name}'`);
      }
      const returnType = callable.kind === 'internal' ? callable.target.returnType : callable.returnType;
      return { type: canonicalTypeName(returnType), module: callable.module || module };
    }
    return { type: 'auto', module };
  }

  inferFunction(fn) {
    const variables = new Map();
    const inferenceModulePath = String(fn.module.filePath || '').replaceAll('\\', '/').toLowerCase();
    const persistInferredLocals = !inferenceModulePath.includes('/bindings/');
    fn.params.forEach((param) => {
      if (!isAutoType(param.type)) param.type = canonicalTypeName(param.type);
      variables.set(param.name, { name: param.name, type: param.type || 'auto', explicitType: Boolean(param.explicitType), param, sourceExpression: null });
    });
    const scope = { variables, function: fn };
    let sawValueReturn = false;
    let sawAnyReturn = false;

    const inferStatements = (statements) => {
      for (const statement of statements) {
        if (statement.kind === 'local') {
          const explicit = Boolean(statement.declaredType);
          const expected = explicit ? canonicalTypeName(statement.declaredType) : null;
          const inferred = this.inferExpression(statement.expression, fn.module, scope, expected, fn.module);
          const nullInitializer = statement.expression?.kind === 'literal'
            && statement.expression.valueType === 'ptr'
            && statement.expression.value === 0n;
          const type = expected || (nullInitializer || isAutoType(inferred.type)
            ? 'auto'
            : this.translateInferredType(inferred.type, inferred.module, fn.module));
          if (persistInferredLocals) statement.inferredType = type;
          variables.set(statement.name, {
            name: statement.name, type, explicitType: explicit, sourceExpression: statement.expression, declaration: statement,
          });
          if (!isAutoType(type)) this.applyInferenceExpected(statement.expression, type, fn.module, fn.module, scope);
        } else if (statement.kind === 'assign') {
          const variable = variables.get(statement.name);
          if (!variable) continue;
          const inferred = this.inferExpression(statement.expression, fn.module, scope, variable.type, fn.module);
          if (!variable.explicitType && !isAutoType(inferred.type)) {
            const changed = this.setInferredSlot(variable, 'type', inferred.type, inferred.module, fn.module, false, statement.token, `variable '${variable.name}'`);
            if (changed && persistInferredLocals && variable.declaration) variable.declaration.inferredType = variable.type;
            if (changed && variable.sourceExpression) this.applyInferenceExpected(variable.sourceExpression, variable.type, fn.module, fn.module, scope);
            if (variable.param) this.setInferredSlot(variable.param, 'type', variable.type, fn.module, fn.module, Boolean(variable.param.explicitType), statement.token, `parameter '${variable.param.name}'`);
          }
        } else if (statement.kind === 'field_assign') {
          const target = this.inferenceReference(fn.module, statement.targetPath, scope);
          const unresolvedMember = Boolean(target?.unresolvedPath?.length);
          const expected = unresolvedMember ? null : target?.type;
          const inferred = this.inferExpression(statement.expression, fn.module, scope, expected, target?.module || fn.module);
          if (target?.field && !unresolvedMember && !target.field.explicitType && !isAutoType(inferred.type)) {
            this.setInferredSlot(target.field, 'type', inferred.type, inferred.module, target.struct.module, false, statement.token, `field '${target.struct.name}.${target.field.name}'`);
          }
        } else if (statement.kind === 'index_assign') {
          let target = this.inferExpression(statement.target, fn.module, scope);
          const actual = this.inferExpression(statement.expression, fn.module, scope);
          if (isAutoType(target.type) || target.type === 'any') {
            let elementType = actual.type;
            const literalValue = constantIntegerLiteralValue(statement.expression);
            if (literalValue !== null) {
              if (literalValue >= 0n && literalValue <= 0xFFn) elementType = 'u8';
              else if (literalValue >= 0n && literalValue <= 0xFFFFn) elementType = 'u16';
              else if (literalValue >= 0n && literalValue <= 0xFFFFFFFFn) elementType = 'u32';
              else if (literalValue >= 0n) elementType = 'u64';
              else if (literalValue >= -0x80n) elementType = 'i8';
              else if (literalValue >= -0x8000n) elementType = 'i16';
              else if (literalValue >= -0x80000000n) elementType = 'i32';
              else elementType = 'i64';
            }
            if (!isAutoType(elementType) && statement.target.object) {
              this.applyInferenceExpected(statement.target.object, `table<${this.translateInferredType(elementType, actual.module, fn.module)}>`, fn.module, fn.module, scope);
              target = this.inferExpression(statement.target, fn.module, scope);
            }
          }
          this.inferExpression(statement.expression, fn.module, scope, target.type, target.module);
        } else if (statement.kind === 'expr') {
          this.inferExpression(statement.expression, fn.module, scope);
        } else if (statement.kind === 'return') {
          sawAnyReturn = true;
          if (statement.expression) {
            sawValueReturn = true;
            const actual = this.inferExpression(statement.expression, fn.module, scope, fn.returnType, fn.module);
            if (!isAutoType(actual.type)) {
              this.setInferredSlot(fn, 'returnType', actual.type, actual.module, fn.module, Boolean(fn.explicitReturnType), statement.token, `return type of '${fn.sourceName || fn.name}'`);
            }
          } else {
            this.setInferredSlot(fn, 'returnType', 'void', fn.module, fn.module, Boolean(fn.explicitReturnType), statement.token, `return type of '${fn.sourceName || fn.name}'`);
          }
        } else if (statement.kind === 'if') {
          for (const branch of statement.branches) {
            this.inferExpression(branch.condition, fn.module, scope, 'bool', fn.module);
            inferStatements(branch.body);
          }
          inferStatements(statement.elseBody);
        } else if (statement.kind === 'while') {
          this.inferExpression(statement.condition, fn.module, scope, 'bool', fn.module);
          inferStatements(statement.body);
        }
      }
    };

    inferStatements(fn.body);
    fn.inferenceHasReturn = sawAnyReturn;
    fn.inferenceHasValueReturn = sawValueReturn;
    if (!sawAnyReturn) {
      if (isAutoType(fn.returnType)) this.setInferredSlot(fn, 'returnType', 'void', fn.module, fn.module, false, fn.token, `return type of '${fn.sourceName || fn.name}'`);
    }
  }

  inferTypes() {
    for (const module of this.moduleOrder) {
      for (const struct of module.structs.values()) {
        for (const field of struct.fieldDeclarations || []) {
          if (!isAutoType(field.type)) field.type = canonicalTypeName(field.type);
        }
      }
      for (const fn of module.functions.values()) {
        for (const param of fn.params) if (!isAutoType(param.type)) param.type = canonicalTypeName(param.type);
        if (!isAutoType(fn.returnType)) fn.returnType = canonicalTypeName(fn.returnType);
      }
    }

    for (let pass = 0; pass < 32; pass += 1) {
      this.inferenceChanged = false;
      for (const module of this.moduleOrder) {
        for (const fn of module.functions.values()) this.inferFunction(fn);
      }
      if (!this.inferenceChanged) break;
    }

    // Unanchored parameters use the language's default integer type, then one
    // more inference wave lets returned/forwarded parameters determine results.
    for (const module of this.moduleOrder) {
      for (const fn of module.functions.values()) {
        for (const param of fn.params) if (isAutoType(param.type)) param.type = 'i64';
      }
    }
    for (let pass = 0; pass < 8; pass += 1) {
      this.inferenceChanged = false;
      for (const module of this.moduleOrder) {
        for (const fn of module.functions.values()) this.inferFunction(fn);
      }
      if (!this.inferenceChanged) break;
    }

    for (const module of this.moduleOrder) {
      for (const struct of module.structs.values()) {
        for (const field of struct.fieldDeclarations || []) {
          if (isAutoType(field.type)) {
            const literal = inferLiteralType(field.expression);
            const emptySequence = field.expression?.kind === 'table_literal' && field.expression.entries.length === 0;
            field.type = emptySequence ? 'table<any>' : (literal && literal !== 'ptr' ? literal : 'ptr');
          }
        }
      }
      for (const fn of module.functions.values()) {
        if (isAutoType(fn.returnType)) fn.returnType = fn.inferenceHasValueReturn ? 'i64' : 'void';
      }
    }
  }


  resolveType(module, typeName, token = null) {
    const name = canonicalTypeName(typeName || 'i64');
    if (PRIMITIVE_TYPES.has(name)) return PRIMITIVE_TYPES.get(name);
    if (isTableTypeName(name)) {
      const elementName = tableElementTypeName(name);
      const element = elementName === 'any' ? GENERIC_TABLE_ELEMENT : this.resolveType(module, elementName, token);
      if (element.kind !== 'struct' && element.kind !== 'any' && !PRIMITIVE_TYPES.has(element.name)) {
        throw new CompileError(`table element type '${elementName}' is not supported`, token);
      }
      return { kind: 'table', name, size: 8, alignment: 8, element };
    }
    const parts = name.split('.');
    let struct = null;
    if (parts.length === 1) struct = module.structs.get(parts[0]);
    else if (parts.length === 2) {
      const use = module.uses.get(parts[0]);
      if (!use) throw new CompileError(`unknown module alias '${parts[0]}' in type '${name}'`, token);
      struct = use.target.structs.get(parts[1]);
      if (struct && !struct.exported) struct = null;
    }
    if (!struct) throw new CompileError(`unknown type '${name}'`, token);
    // Closed LSX objects are pointer-valued fields. Permit self-referential and
    // mutually-referential object graphs without trying to inline their layouts.
    // The pointed-to layout is completed by its own declaration pass.
    if (!struct.layoutResolving) this.resolveStructLayout(struct);
    return { kind: 'struct', name, size: 8, alignment: 8, struct };
  }

  externalizeType(typeName, declarationModule, callerModule) {
    const name = canonicalTypeName(typeName || 'i64');
    if (!declarationModule || declarationModule === callerModule || PRIMITIVE_TYPES.has(name)) return name;
    if (isTableTypeName(name)) {
      return `table<${this.externalizeType(tableElementTypeName(name), declarationModule, callerModule)}>`;
    }
    if (name.includes('.')) return name;
    if (!declarationModule.structs.has(name)) return name;
    for (const [alias, use] of callerModule.uses) {
      if (use.target === declarationModule) return `${alias}.${name}`;
    }
    return name;
  }

  compatibleTypes(fromType, fromModule, toType, toModule, token = null) {
    const from = canonicalTypeName(fromType);
    const to = canonicalTypeName(toType);
    if (canAssignType(from, to)) return true;
    let fromInfo;
    let toInfo;
    try {
      fromInfo = this.resolveType(fromModule, from, token);
      toInfo = this.resolveType(toModule, to, token);
    } catch (_) {
      return false;
    }
    if (fromInfo.kind === 'struct' && toInfo.kind === 'struct') {
      return fromInfo.struct === toInfo.struct || this.isDerivedFrom(fromInfo.struct, toInfo.struct);
    }
    if (fromInfo.kind === 'table' && toInfo.kind === 'table') {
      if (fromInfo.element.name === 'any' || toInfo.element.name === 'any') return true;
      if (fromInfo.element.kind === 'struct' && toInfo.element.kind === 'struct') return fromInfo.element.struct === toInfo.element.struct;
      return fromInfo.element.name === toInfo.element.name;
    }
    return false;
  }

  resolveStructByPath(module, pathParts, token = null) {
    if (pathParts.length === 1) return module.structs.get(pathParts[0]) || null;
    if (pathParts.length === 2) {
      const use = module.uses.get(pathParts[0]);
      const struct = use?.target.structs.get(pathParts[1]);
      return struct?.exported ? struct : null;
    }
    return null;
  }

  resolvePackedInheritance(struct) {
    if (struct.inheritanceResolved) return struct;
    if (struct.inheritanceResolving) throw new CompileError(`circular base inheritance involving '${struct.name}'`, struct.baseToken || struct.token);
    struct.inheritanceResolving = true;

    if (struct.basePath) {
      const base = this.resolveStructByPath(struct.module, struct.basePath, struct.baseToken || struct.token);
      if (!base) throw new CompileError(`unknown or inaccessible base object '${struct.basePath.join('.')}'`, struct.baseToken || struct.token);
      if (base === struct) throw new CompileError(`object '${struct.name}' cannot inherit from itself`, struct.baseToken || struct.token);
      this.resolvePackedInheritance(base);
      struct.baseType = base;

      for (const field of struct.fieldDeclarations || []) {
        const inherited = this.fieldDeclaration(base, field.name);
        if (inherited) throw new CompileError(`field '${field.name}' already exists on base object '${base.name}'`, field.token);
      }

      for (const [name, method] of base.methods) {
        if (!struct.methods.has(name)) struct.methods.set(name, method);
      }
      for (const [name, constant] of base.staticValues) {
        if (!struct.staticValues.has(name)) struct.staticValues.set(name, constant);
      }
    }

    struct.inheritanceResolving = false;
    struct.inheritanceResolved = true;
    return struct;
  }

  resolveInheritance() {
    for (const module of this.moduleOrder) {
      for (const struct of module.structs.values()) this.resolvePackedInheritance(struct);
    }
  }

  isDerivedFrom(candidate, expectedBase) {
    let current = candidate?.baseType || null;
    while (current) {
      if (current === expectedBase) return true;
      current = current.baseType || null;
    }
    return false;
  }

  resolveStructLayout(struct) {
    if (struct.layoutResolved) return struct;
    this.resolvePackedInheritance(struct);
    if (struct.layoutResolving) throw new CompileError(`recursive inline layout for struct '${struct.name}'`, struct.token);
    struct.layoutResolving = true;
    let offset = 0;
    let maxAlignment = 1;

    if (struct.baseType) {
      const base = this.resolveStructLayout(struct.baseType);
      for (const baseField of base.fieldOrder) {
        const inheritedType = this.externalizeType(baseField.type, baseField.struct?.module || base.module, struct.module);
        const inheritedField = {
          ...baseField,
          type: inheritedType,
          struct,
          inheritedFrom: baseField.inheritedFrom || baseField.struct || base,
        };
        struct.fields.set(inheritedField.name, inheritedField);
        struct.fieldOrder.push(inheritedField);
      }
      offset = base.size;
      maxAlignment = base.alignment;
    }

    const fieldList = struct.fieldDeclarations || [];
    for (const fieldDecl of fieldList) {
      if (struct.fields.has(fieldDecl.name)) throw new CompileError(`duplicate field '${fieldDecl.name}' in ${struct.name}`, fieldDecl.token);
      const typeInfo = this.resolveType(struct.module, fieldDecl.type, fieldDecl.token);
      const embedded = typeInfo.kind === 'primitive';
      const size = embedded ? typeInfo.size : 8;
      const alignment = Math.min(8, embedded ? typeInfo.alignment : 8);
      offset = align(offset, alignment);
      let defaultValue = null;
      let defaultType = fieldDecl.type;
      let defaultConstructTable = false;
      if (fieldDecl.expression) {
        if (fieldDecl.expression.kind === 'table_literal' && fieldDecl.expression.entries.length === 0 && typeInfo.kind === 'table') {
          // An inferred `field = {}` means an owned empty native table for every
          // object instance. A null placeholder crashes on first use.
          defaultValue = 0n;
          defaultType = fieldDecl.type;
          defaultConstructTable = true;
        } else {
          const evaluated = this.evalConstantExpression(fieldDecl.expression, struct.module, [`${struct.name}.${fieldDecl.name}`]);
          if (!canAssignType(evaluated.type, fieldDecl.type)) throw new CompileError(`cannot initialize field '${fieldDecl.name}' of type ${fieldDecl.type} with ${evaluated.type}`, fieldDecl.token);
          defaultValue = evaluated.value;
          defaultType = evaluated.type;
        }
      } else if (typeInfo.kind === 'primitive') {
        defaultValue = typeInfo.name === 'string' ? '' : (typeInfo.name === 'f32' ? 0.0 : 0n);
      } else defaultValue = 0n;
      const field = { ...fieldDecl, struct, typeInfo, offset, size, alignment, defaultValue, defaultType, defaultConstructTable };
      struct.fields.set(field.name, field);
      struct.fieldOrder.push(field);
      offset += size;
      maxAlignment = Math.max(maxAlignment, alignment);
    }
    struct.size = align(offset, maxAlignment);
    struct.alignment = maxAlignment;
    if (struct.positional) {
      const positionalFields = struct.fieldOrder
        .filter((field) => field.positionalIndex !== null && field.positionalIndex !== undefined)
        .sort((left, right) => left.positionalIndex - right.positionalIndex);
      struct.positionalCount = positionalFields.length;
      if (positionalFields.length > 0) {
        const first = positionalFields[0];
        const homogeneous = first.typeInfo.kind === 'primitive'
          && positionalFields.every((field, index) => field.type === first.type
            && field.typeInfo.kind === 'primitive'
            && field.offset === first.offset + index * first.size);
        if (homogeneous) {
          struct.positionalElement = first.typeInfo;
          struct.positionalStride = first.size;
          struct.positionalDataOffset = first.offset;
        }
      }
    }
    struct.layoutResolving = false;
    struct.layoutResolved = true;
    return struct;
  }

  resolveConstant(constant, stack = []) {
    if (constant.resolved) return { value: constant.value, type: constant.type };
    if (constant.resolving) {
      throw new CompileError(`circular constant reference: ${[...stack, `${constant.module.filePath}::${constant.name}`].join(' -> ')}`, constant.token);
    }
    constant.resolving = true;
    const result = this.evalConstantExpression(constant.expression, constant.module, [...stack, `${constant.module.filePath}::${constant.name}`]);
    constant.resolving = false;
    constant.resolved = true;
    constant.value = result.value;
    constant.type = result.type;
    return result;
  }

  evalConstantExpression(expr, module, stack = []) {
    if (expr.kind === 'literal') return { value: expr.value, type: expr.valueType };
    if (expr.kind === 'reference') {
      if (expr.path.length === 1) {
        const constant = module.constants.get(expr.path[0]);
        if (!constant) throw new CompileError(`unknown constant '${expr.path[0]}'`, expr.token);
        return this.resolveConstant(constant, stack);
      }
      if (expr.path.length === 2) {
        const localTable = module.tables.get(expr.path[0]);
        if (localTable) {
          const constant = localTable.staticValues.get(expr.path[1]);
          if (!constant) throw new CompileError(`closed table '${expr.path[0]}' has no constant '${expr.path[1]}'`, expr.token);
          return this.resolveConstant(constant, stack);
        }
        const use = module.uses.get(expr.path[0]);
        if (!use) throw new CompileError(`unknown module alias or closed table '${expr.path[0]}'`, expr.token);
        const constant = use.target.constants.get(expr.path[1]);
        if (!constant || !constant.exported) throw new CompileError(`module '${expr.path[0]}' does not export constant '${expr.path[1]}'`, expr.token);
        return this.resolveConstant(constant, stack);
      }
      if (expr.path.length === 3) {
        const use = module.uses.get(expr.path[0]);
        const table = use?.target.tables.get(expr.path[1]);
        if (!table || !table.exported) throw new CompileError(`module '${expr.path[0]}' does not export closed table '${expr.path[1]}'`, expr.token);
        const constant = table.staticValues.get(expr.path[2]);
        if (!constant) throw new CompileError(`closed table '${expr.path[1]}' has no constant '${expr.path[2]}'`, expr.token);
        return this.resolveConstant(constant, stack);
      }
      throw new CompileError('constant references may contain a module alias or closed-table member', expr.token);
    }
    if (expr.kind === 'unary') {
      const value = this.evalConstantExpression(expr.expression, module, stack);
      if (expr.operator === '-') {
        if (typeof value.value === 'bigint') return { value: -value.value, type: value.type };
        if (typeof value.value === 'number') return { value: Math.fround(-value.value), type: 'f32' };
      }
      if (expr.operator === 'not') {
        const truthy = typeof value.value === 'bigint' ? value.value !== 0n : Number(value.value) !== 0;
        return { value: truthy ? 0n : 1n, type: 'bool' };
      }
      throw new CompileError(`operator '${expr.operator}' requires a numeric constant`, expr.token);
    }
    if (expr.kind === 'binary') {
      const left = this.evalConstantExpression(expr.left, module, stack);
      const right = this.evalConstantExpression(expr.right, module, stack);
      const comparison = ['==', '~=', '<', '<=', '>', '>='].includes(expr.operator);
      const logical = expr.operator === 'and' || expr.operator === 'or';
      if (logical) {
        const aTruth = typeof left.value === 'bigint' ? left.value !== 0n : Number(left.value) !== 0;
        const bTruth = typeof right.value === 'bigint' ? right.value !== 0n : Number(right.value) !== 0;
        return { value: (expr.operator === 'and' ? (aTruth && bTruth) : (aTruth || bTruth)) ? 1n : 0n, type: 'bool' };
      }
      if (isFloatType(left.type) || isFloatType(right.type)) {
        const a = Number(left.value);
        const b = Number(right.value);
        if (expr.operator === '/' && b === 0) throw new CompileError('division by zero', expr.token);
        let value;
        switch (expr.operator) {
          case '+': value = Math.fround(a + b); break;
          case '-': value = Math.fround(a - b); break;
          case '*': value = Math.fround(a * b); break;
          case '/': value = Math.fround(a / b); break;
          case '==': value = a === b ? 1n : 0n; break;
          case '~=': value = a !== b ? 1n : 0n; break;
          case '<': value = a < b ? 1n : 0n; break;
          case '<=': value = a <= b ? 1n : 0n; break;
          case '>': value = a > b ? 1n : 0n; break;
          case '>=': value = a >= b ? 1n : 0n; break;
          default: throw new CompileError(`operator '${expr.operator}' is not valid for f32 constants`, expr.token);
        }
        return { value, type: comparison ? 'bool' : 'f32' };
      }
      if (typeof left.value !== 'bigint' || typeof right.value !== 'bigint') {
        if (expr.operator === '==' || expr.operator === '~=') {
          const equal = left.value === right.value;
          return { value: (expr.operator === '==' ? equal : !equal) ? 1n : 0n, type: 'bool' };
        }
        throw new CompileError(`operator '${expr.operator}' requires numeric constants`, expr.token);
      }
      const a = left.value;
      const b = right.value;
      const operations = {
        '+': () => a + b,
        '-': () => a - b,
        '*': () => a * b,
        '/': () => { if (b === 0n) throw new CompileError('division by zero', expr.token); return a / b; },
        '%': () => { if (b === 0n) throw new CompileError('division by zero', expr.token); return a % b; },
        '==': () => a === b ? 1n : 0n,
        '~=': () => a !== b ? 1n : 0n,
        '<': () => a < b ? 1n : 0n,
        '<=': () => a <= b ? 1n : 0n,
        '>': () => a > b ? 1n : 0n,
        '>=': () => a >= b ? 1n : 0n,
      };
      if (!operations[expr.operator]) throw new CompileError(`unsupported constant operator '${expr.operator}'`, expr.token);
      return { value: operations[expr.operator](), type: comparison ? 'bool' : left.type };
    }
    throw new CompileError('top-level constants must be compile-time expressions', expr.token);
  }

  resolveCallable(module, call, scope = null) {
    const pathParts = call.path;
    const makeSpecial = (kind, params, returnType, extra = {}) => ({
      kind,
      target: { name: pathParts.join('.'), params: params.map((type, index) => ({ name: `arg${index}`, type })), returnType },
      returnType,
      ...extra,
    });

    if (pathParts.length === 2 && pathParts[0] === 'base' && scope?.function?.methodOf) {
      const owner = scope.function.methodOf;
      const base = owner.baseType;
      if (!base) throw new CompileError(`object '${owner.name}' has no base object`, call.token);
      const method = base.methods.get(pathParts[1]);
      if (!method) throw new CompileError(`base object '${base.name}' has no function '${pathParts[1]}'`, call.token);
      if (method.isStatic) {
        call.effectiveArgs = [...call.args];
        return { kind: 'internal', target: method, returnType: this.externalizeType(method.returnType, method.module, module), baseCall: true };
      }
      if (!scope.variables.has('self')) throw new CompileError(`base function '${pathParts[1]}' requires an instance`, call.token);
      const receiver = { kind: 'reference', path: ['self'], token: call.token };
      call.effectiveArgs = [receiver, ...call.args];
      return { kind: 'internal', target: method, returnType: this.externalizeType(method.returnType, method.module, module), methodReceiver: receiver, baseCall: true };
    }


    // Any local/self field chain can be a method receiver. This keeps object code
    // natural: self.context.start(), object.transform.translate(), and so on.
    if (scope && pathParts.length >= 2 && (scope.variables.has(pathParts[0]) || pathParts[0] === 'self')) {
      const receiverPath = pathParts.slice(0, -1);
      const operation = pathParts[pathParts.length - 1];
      const receiver = { kind: 'reference', path: receiverPath, token: call.token };
      const resolvedReceiver = this.resolveReference(module, receiver, scope);
      const receiverType = resolvedReceiver.typeInfo || this.resolveType(module, resolvedReceiver.type, call.token);
      const receiverTypeName = resolvedReceiver.type;
      if (receiverType.kind === 'struct') {
        if (receiverType.struct.positional && operation === 'length') {
          const callable = makeSpecial('packed_length', [receiverTypeName], 'i64', { struct: receiverType.struct });
          call.effectiveArgs = [receiver];
          return callable;
        }
        if (receiverType.struct.positional && (operation === 'byte_length' || operation === 'bytes')) {
          const callable = makeSpecial('packed_byte_length', [receiverTypeName], 'i64', { struct: receiverType.struct });
          call.effectiveArgs = [receiver];
          return callable;
        }
        if (receiverType.struct.positional && operation === 'data') {
          const callable = makeSpecial('packed_data', [receiverTypeName], 'ptr', { struct: receiverType.struct });
          call.effectiveArgs = [receiver];
          return callable;
        }
        if (operation === 'destroy') {
          const callable = makeSpecial('struct_destroy', [receiverTypeName], 'bool', { struct: receiverType.struct });
          call.effectiveArgs = [receiver, ...call.args];
          return callable;
        }
        if (operation === 'clone') {
          const callable = makeSpecial('struct_clone', [receiverTypeName], receiverTypeName, { struct: receiverType.struct });
          call.effectiveArgs = [receiver, ...call.args];
          return callable;
        }
        const method = receiverType.struct.methods.get(operation);
        const label = receiverType.struct.tableModel ? 'table' : 'struct';
        if (!method) throw new CompileError(`${label} '${receiverType.struct.name}' has no function '${operation}'`, call.token);
        call.effectiveArgs = method.isStatic ? [...call.args] : [receiver, ...call.args];
        return { kind: 'internal', target: method, returnType: this.externalizeType(method.returnType, method.module, module), methodReceiver: method.isStatic ? null : receiver };
      }
      if (receiverType.kind === 'table') {
        const elementType = this.externalizeType(receiverType.element.name, receiverType.element.struct?.module || module, module);
        if (operation === 'push') {
          call.effectiveArgs = [receiver, ...call.args];
          return makeSpecial('table_push', [receiverTypeName, elementType], 'i64', { tableElement: receiverType.element });
        }
        if (operation === 'get') {
          call.effectiveArgs = [receiver, ...call.args];
          return makeSpecial('table_get', [receiverTypeName, 'i64'], elementType, { tableElement: receiverType.element });
        }
        const definitions = {
          length: { builtin: 'table.count', params: [receiverTypeName], returnType: 'i64' },
          count: { builtin: 'table.count', params: [receiverTypeName], returnType: 'i64' },
          capacity: { builtin: 'table.capacity', params: [receiverTypeName], returnType: 'i64' },
          byte_length: { builtin: 'table.byte_length', params: [receiverTypeName], returnType: 'i64' },
          bytes: { builtin: 'table.byte_length', params: [receiverTypeName], returnType: 'i64' },
          data: { builtin: 'table.data', params: [receiverTypeName], returnType: 'ptr' },
          data_at: { builtin: 'table.data_at', params: [receiverTypeName, 'i64'], returnType: 'ptr' },
          byte_data: { builtin: 'table.data', params: [receiverTypeName], returnType: 'ptr' },
          copy_from_ptr: { builtin: 'table.copy_from_ptr', params: [receiverTypeName, 'ptr', 'i64'], returnType: 'bool' },
          copy_bytes_from_ptr: { builtin: 'table.copy_from_ptr', params: [receiverTypeName, 'ptr', 'i64'], returnType: 'bool' },
          is_empty: { builtin: 'table.is_empty', params: [receiverTypeName], returnType: 'bool' },
          reserve: { builtin: 'table.reserve', params: [receiverTypeName, 'i64'], returnType: 'bool' },
          reserve_bytes: { builtin: 'table.reserve', params: [receiverTypeName, 'i64'], returnType: 'bool' },
          resize: { builtin: 'table.resize', params: [receiverTypeName, 'i64'], returnType: 'bool' },
          resize_bytes: { builtin: 'table.resize', params: [receiverTypeName, 'i64'], returnType: 'bool' },
          remove: { builtin: 'table.remove_at', params: [receiverTypeName, 'i64'], returnType: 'bool' },
          remove_fast: { builtin: 'table.remove_swap', params: [receiverTypeName, 'i64'], returnType: 'bool' },
          pop: { builtin: 'table.pop', params: [receiverTypeName], returnType: 'bool' },
          clear: { builtin: 'table.clear', params: [receiverTypeName], returnType: 'void' },
          destroy: { builtin: 'table.destroy', params: [receiverTypeName], returnType: 'void' },
          add: { builtin: 'table.add_zeroed', params: [receiverTypeName], returnType: elementType },
          add_copy: { builtin: 'table.add_copy', params: [receiverTypeName, elementType], returnType: elementType },
          at: { builtin: 'table.get_ptr', params: [receiverTypeName, 'i64'], returnType: elementType },
          first: { builtin: 'table.first_ptr', params: [receiverTypeName], returnType: elementType },
          last: { builtin: 'table.last_ptr', params: [receiverTypeName], returnType: elementType },
          remove_at: { builtin: 'table.remove_at', params: [receiverTypeName, 'i64'], returnType: 'bool' },
          remove_swap: { builtin: 'table.remove_swap', params: [receiverTypeName, 'i64'], returnType: 'bool' },
        };
        const definition = definitions[operation];
        if (!definition) throw new CompileError(`table has no function '${operation}'`, call.token);
        const builtinTarget = BUILTINS.get(definition.builtin);
        call.effectiveArgs = [receiver, ...call.args];
        return { kind: 'builtin', target: { ...builtinTarget, params: definition.params.map((type, index) => ({ name: `arg${index}`, type })), returnType: definition.returnType }, returnType: definition.returnType, tableElement: receiverType.element };
      }
    }

    const firstVariable = scope?.variables?.get(pathParts[0]);
    if (firstVariable && pathParts.length === 2) {
      const receiverType = this.resolveType(module, firstVariable.type, call.token);
      const receiver = { kind: 'reference', path: [pathParts[0]], token: call.token, inferredType: firstVariable.type };
      if (receiverType.kind === 'struct') {
        if (receiverType.struct.positional && pathParts[1] === 'length') {
          const callable = makeSpecial('packed_length', [firstVariable.type], 'i64', { struct: receiverType.struct });
          call.effectiveArgs = [receiver];
          return callable;
        }
        if (receiverType.struct.positional && (pathParts[1] === 'byte_length' || pathParts[1] === 'bytes')) {
          const callable = makeSpecial('packed_byte_length', [firstVariable.type], 'i64', { struct: receiverType.struct });
          call.effectiveArgs = [receiver];
          return callable;
        }
        if (receiverType.struct.positional && pathParts[1] === 'data') {
          const callable = makeSpecial('packed_data', [firstVariable.type], 'ptr', { struct: receiverType.struct });
          call.effectiveArgs = [receiver];
          return callable;
        }
        if (pathParts[1] === 'destroy') {
          const callable = makeSpecial('struct_destroy', [firstVariable.type], 'bool', { struct: receiverType.struct });
          call.effectiveArgs = [receiver, ...call.args];
          return callable;
        }
        if (pathParts[1] === 'clone') {
          const callable = makeSpecial('struct_clone', [firstVariable.type], firstVariable.type, { struct: receiverType.struct });
          call.effectiveArgs = [receiver, ...call.args];
          return callable;
        }
        const method = receiverType.struct.methods.get(pathParts[1]);
        const label = receiverType.struct.tableModel ? 'table' : 'struct';
        if (!method) throw new CompileError(`${label} '${receiverType.struct.name}' has no function '${pathParts[1]}'`, call.token);
        call.effectiveArgs = method.isStatic ? [...call.args] : [receiver, ...call.args];
        return { kind: 'internal', target: method, returnType: this.externalizeType(method.returnType, method.module, module), methodReceiver: method.isStatic ? null : receiver };
      }
      if (receiverType.kind === 'table') {
        const method = pathParts[1];
        const elementType = receiverType.element.name;
        if (method === 'push') {
          call.effectiveArgs = [receiver, ...call.args];
          return makeSpecial('table_push', [firstVariable.type, elementType], 'i64', { tableElement: receiverType.element });
        }
        if (method === 'get') {
          call.effectiveArgs = [receiver, ...call.args];
          return makeSpecial('table_get', [firstVariable.type, 'i64'], elementType, { tableElement: receiverType.element });
        }
        const definitions = {
          length: { builtin: 'table.count', params: [firstVariable.type], returnType: 'i64' },
          byte_length: { builtin: 'table.byte_length', params: [firstVariable.type], returnType: 'i64' },
          bytes: { builtin: 'table.byte_length', params: [firstVariable.type], returnType: 'i64' },
          data: { builtin: 'table.data', params: [firstVariable.type], returnType: 'ptr' },
          data_at: { builtin: 'table.data_at', params: [firstVariable.type, 'i64'], returnType: 'ptr' },
          byte_data: { builtin: 'table.data', params: [firstVariable.type], returnType: 'ptr' },
          copy_from_ptr: { builtin: 'table.copy_from_ptr', params: [firstVariable.type, 'ptr', 'i64'], returnType: 'bool' },
          copy_bytes_from_ptr: { builtin: 'table.copy_from_ptr', params: [firstVariable.type, 'ptr', 'i64'], returnType: 'bool' },
          is_empty: { builtin: 'table.is_empty', params: [firstVariable.type], returnType: 'bool' },
          reserve: { builtin: 'table.reserve', params: [firstVariable.type, 'i64'], returnType: 'bool' },
          reserve_bytes: { builtin: 'table.reserve', params: [firstVariable.type, 'i64'], returnType: 'bool' },
          resize: { builtin: 'table.resize', params: [firstVariable.type, 'i64'], returnType: 'bool' },
          resize_bytes: { builtin: 'table.resize', params: [firstVariable.type, 'i64'], returnType: 'bool' },
          remove: { builtin: 'table.remove_at', params: [firstVariable.type, 'i64'], returnType: 'bool' },
          remove_fast: { builtin: 'table.remove_swap', params: [firstVariable.type, 'i64'], returnType: 'bool' },
          pop: { builtin: 'table.pop', params: [firstVariable.type], returnType: 'bool' },
          clear: { builtin: 'table.clear', params: [firstVariable.type], returnType: 'void' },
          destroy: { builtin: 'table.destroy', params: [firstVariable.type], returnType: 'void' },
          // Compatibility aliases for older LSX projects. They are intentionally absent from docs/snippets.
          add: { builtin: 'table.add_zeroed', params: [firstVariable.type], returnType: elementType },
          add_copy: { builtin: 'table.add_copy', params: [firstVariable.type, elementType], returnType: elementType },
          at: { builtin: 'table.get_ptr', params: [firstVariable.type, 'i64'], returnType: elementType },
          first: { builtin: 'table.first_ptr', params: [firstVariable.type], returnType: elementType },
          last: { builtin: 'table.last_ptr', params: [firstVariable.type], returnType: elementType },
          count: { builtin: 'table.count', params: [firstVariable.type], returnType: 'i64' },
          capacity: { builtin: 'table.capacity', params: [firstVariable.type], returnType: 'i64' },
          remove_at: { builtin: 'table.remove_at', params: [firstVariable.type, 'i64'], returnType: 'bool' },
          remove_swap: { builtin: 'table.remove_swap', params: [firstVariable.type, 'i64'], returnType: 'bool' },
        };
        const definition = definitions[method];
        if (!definition) throw new CompileError(`table has no function '${method}'`, call.token);
        const builtinTarget = BUILTINS.get(definition.builtin);
        call.effectiveArgs = [receiver, ...call.args];
        return { kind: 'builtin', target: { ...builtinTarget, params: definition.params.map((type, index) => ({ name: `arg${index}`, type })), returnType: definition.returnType }, returnType: definition.returnType, tableElement: receiverType.element };
      }
    }


    // Local or imported packed-struct static operations.
    let staticStruct = null;
    let staticOperation = null;
    if (pathParts.length === 2) {
      staticStruct = this.resolveStructByPath(module, [pathParts[0]], call.token);
      staticOperation = pathParts[1];
    } else if (pathParts.length === 3) {
      staticStruct = this.resolveStructByPath(module, [pathParts[0], pathParts[1]], call.token);
      staticOperation = pathParts[2];
    }
    if (staticStruct) {
      this.resolveStructLayout(staticStruct);
      const typeName = pathParts.length === 2 ? staticStruct.name : `${pathParts[0]}.${staticStruct.name}`;
      const staticMethod = staticStruct.methods.get(staticOperation);
      if (staticMethod) {
        if (!staticMethod.isStatic) throw new CompileError(`table function '${staticStruct.name}.${staticOperation}' requires an instance`, call.token);
        return { kind: 'internal', target: staticMethod, returnType: this.externalizeType(staticMethod.returnType, staticMethod.module, module) };
      }
      if (staticOperation === 'new') {
        if (call.args.length === 0) return makeSpecial('struct_new', [], typeName, { struct: staticStruct });
        if (call.args.length === 1) return makeSpecial('struct_clone', [typeName], typeName, { struct: staticStruct });
        throw new CompileError(`${pathParts.join('.')} accepts zero arguments for defaults or one existing object to copy`, call.token);
      }
      if (staticOperation === 'size') return makeSpecial('struct_size', [], 'i64', { struct: staticStruct });
      // Legacy typed-container constructor retained for parser compatibility; normal LSX code uses local items = {}
      if (staticOperation === 'table') return makeSpecial('struct_table', ['i64'], `table<${typeName}>`, { struct: staticStruct, typeName });
      const label = staticStruct.tableModel ? 'closed table' : 'struct';
      throw new CompileError(`${label} '${staticStruct.name}' has no function or operation '${staticOperation}'`, call.token);
    }

    if (pathParts.length === 1) {
      const name = pathParts[0];
      if (module.functions.has(name)) return { kind: 'internal', target: module.functions.get(name), returnType: module.functions.get(name).returnType };
      if (module.externs.has(name)) return { kind: 'extern', target: module.externs.get(name), returnType: module.externs.get(name).returnType };
      throw new CompileError(`unknown function '${name}'`, call.token);
    }
    if (pathParts.length === 2) {
      const [head, name] = pathParts;
      if (BUILTINS.has(`${head}.${name}`)) {
        this.usesBuiltins.add(`${head}.${name}`);
        const target = BUILTINS.get(`${head}.${name}`);
        return { kind: 'builtin', target, returnType: target.returnType };
      }
      const use = module.uses.get(head);
      if (!use) throw new CompileError(`unknown module or API namespace '${head}'`, call.token);
      const fn = use.target.functions.get(name);
      if (fn && fn.exported) return { kind: 'internal', target: fn, returnType: this.externalizeType(fn.returnType, fn.module, module) };
      const ext = use.target.externs.get(name);
      if (ext && ext.exported) return { kind: 'extern', target: ext, returnType: this.externalizeType(ext.returnType, ext.module, module) };
      throw new CompileError(`module '${head}' does not export function '${name}'`, call.token);
    }
    throw new CompileError('function names may contain at most a module, struct, and operation', call.token);
  }

  resolveReference(module, expr, scope = null) {
    if (expr.path.length >= 1 && scope?.variables?.has(expr.path[0])) {
      const variable = scope.variables.get(expr.path[0]);
      if (expr.path.length === 1) return { kind: 'variable', variable, type: variable.type, typeInfo: variable.typeInfo || this.resolveType(module, variable.type, expr.token) };
      let currentType = variable.typeInfo || this.resolveType(module, variable.type, expr.token);
      const fields = [];
      for (let index = 1; index < expr.path.length; index += 1) {
        if (currentType.kind !== 'struct') throw new CompileError(`'${expr.path.slice(0, index).join('.')}' is not a table object`, expr.token);
        this.resolveStructLayout(currentType.struct);
        const requestedName = expr.path[index];
        let field = currentType.struct.fields.get(requestedName);
        if (!field && currentType.struct.positional) {
          const aliases = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 };
          const positionalIndex = aliases[requestedName];
          if (positionalIndex !== undefined) field = currentType.struct.fields.get(`__item${positionalIndex}`) || null;
        }
        if (!field) throw new CompileError(`${currentType.struct.tableModel ? 'table' : 'struct'} '${currentType.struct.name}' has no field '${requestedName}'`, expr.token);
        fields.push(field);
        currentType = field.typeInfo;
      }
      const finalField = fields[fields.length - 1];
      return {
        kind: 'field',
        variable,
        fields,
        field: finalField,
        type: this.externalizeType(finalField.type, finalField.struct?.module, module),
        typeInfo: currentType,
      };
    }
    if (expr.path.length === 1) {
      const name = expr.path[0];
      const constant = module.constants.get(name);
      if (constant) return { kind: 'constant', constant };
      const fn = module.functions.get(name);
      if (fn) return { kind: 'function', target: fn, type: 'fnptr', typeInfo: PRIMITIVE_TYPES.get('fnptr') };
      throw new CompileError(`unknown value '${name}'`, expr.token);
    }
    if (expr.path.length === 2) {
      const localTable = module.tables.get(expr.path[0]);
      if (localTable) {
        const constant = localTable.staticValues.get(expr.path[1]);
        if (!constant) throw new CompileError(`closed table '${expr.path[0]}' has no value '${expr.path[1]}'`, expr.token);
        return { kind: 'constant', constant };
      }
      const use = module.uses.get(expr.path[0]);
      if (!use) throw new CompileError(`unknown module alias or closed table '${expr.path[0]}'`, expr.token);
      const constant = use.target.constants.get(expr.path[1]);
      if (constant?.exported) return { kind: 'constant', constant };
      const fn = use.target.functions.get(expr.path[1]);
      if (fn?.exported) return { kind: 'function', target: fn, type: 'fnptr', typeInfo: PRIMITIVE_TYPES.get('fnptr') };
      throw new CompileError(`module '${expr.path[0]}' does not export value or function '${expr.path[1]}'`, expr.token);
    }
    if (expr.path.length === 3) {
      const use = module.uses.get(expr.path[0]);
      const table = use?.target.tables.get(expr.path[1]);
      if (!table || !table.exported) throw new CompileError(`module '${expr.path[0]}' does not export closed table '${expr.path[1]}'`, expr.token);
      const constant = table.staticValues.get(expr.path[2]);
      if (!constant) throw new CompileError(`closed table '${expr.path[1]}' has no value '${expr.path[2]}'`, expr.token);
      return { kind: 'constant', constant };
    }
    throw new CompileError('value references may contain table fields, a module alias, or a closed-table member', expr.token);
  }

  validateExpression(expr, module, scope) {
    if (expr.kind === 'literal') {
      expr.inferredType = expr.valueType;
      return expr.inferredType;
    }
    if (expr.kind === 'table_literal') {
      if (expr.expectedType && isTableTypeName(expr.expectedType)) {
        const typeInfo = this.resolveType(module, expr.expectedType, expr.token);
        if (expr.entries.length > 0 && !expr.positional) throw new CompileError('typed table literals use positional values, for example {1,2,3}', expr.token);
        for (const entry of expr.entries) {
          const actual = this.validateExpression(entry.expression, module, scope);
          if (!this.compatibleTypes(actual, module, typeInfo.element.name, typeInfo.element.struct?.module || module, entry.token)) {
            throw new CompileError(`typed table value expects ${typeInfo.element.name}, received ${actual}`, entry.token);
          }
        }
        expr.sequenceCreate = true;
        expr.tableElement = typeInfo.element;
        expr.inferredType = expr.expectedType;
        return expr.inferredType;
      }
      const packed = expr.tableStruct;
      if (!packed) throw new CompileError('table literal was not registered by the compiler', expr.token);
      this.resolveStructLayout(packed);
      for (const entry of expr.entries) {
        if (entry.expression.kind === 'function_expression') continue;
        const field = packed.fields.get(entry.name);
        const actual = this.validateExpression(entry.expression, module, scope);
        if (!this.compatibleTypes(actual, module, field.type, packed.module, entry.token)) {
          throw new CompileError(`table field '${entry.name}' expects ${field.type}, received ${actual}`, entry.token);
        }
      }
      expr.inferredType = packed.name;
      return expr.inferredType;
    }
    if (expr.kind === 'index') {
      const objectType = this.validateExpression(expr.object, module, scope);
      const objectInfo = this.resolveType(module, objectType, expr.token);
      const indexType = this.validateExpression(expr.index, module, scope);
      if (!isIntegerType(indexType)) throw new CompileError(`object index must be an integer, received ${indexType}`, expr.index.token || expr.token);
      if (objectInfo.kind === 'table') {
        expr.tableElement = objectInfo.element;
        expr.inferredType = objectInfo.element.name;
        return expr.inferredType;
      }
      if (objectInfo.kind === 'struct' && objectInfo.struct.positional) {
        this.resolveStructLayout(objectInfo.struct);
        const fields = objectInfo.struct.fieldOrder
          .filter((field) => field.positionalIndex !== null && field.positionalIndex !== undefined)
          .sort((left, right) => left.positionalIndex - right.positionalIndex);
        expr.packedStruct = objectInfo.struct;
        if (expr.index.kind === 'literal' && typeof expr.index.value === 'bigint') {
          const numericIndex = Number(expr.index.value);
          if (numericIndex < 0 || numericIndex >= fields.length) throw new CompileError(`object index ${numericIndex} is outside 0..${Math.max(0, fields.length - 1)}`, expr.index.token || expr.token);
          const field = fields[numericIndex];
          expr.packedField = field;
          expr.tableElement = field.typeInfo;
          expr.inferredType = field.type;
          return expr.inferredType;
        }
        if (!objectInfo.struct.positionalElement) throw new CompileError('dynamic indexing requires a positional object whose values all use the same native type', expr.token);
        expr.tableElement = objectInfo.struct.positionalElement;
        expr.inferredType = objectInfo.struct.positionalElement.name;
        return expr.inferredType;
      }
      throw new CompileError('index access requires a typed table or positional object', expr.token);
    }
    if (expr.kind === 'reference') {
      const resolved = this.resolveReference(module, expr, scope);
      expr.resolvedReference = resolved;
      if (resolved.kind === 'variable' || resolved.kind === 'field') expr.inferredType = resolved.type;
      else if (resolved.kind === 'function') expr.inferredType = 'fnptr';
      else expr.inferredType = this.resolveConstant(resolved.constant).type;
      return expr.inferredType;
    }
    if (expr.kind === 'unary') {
      const inner = this.validateExpression(expr.expression, module, scope);
      if (expr.operator === '-' && !isNumericType(inner)) throw new CompileError(`operator '-' requires a numeric value, received ${inner}`, expr.token);
      expr.inferredType = expr.operator === 'not' ? 'bool' : inner;
      return expr.inferredType;
    }
    if (expr.kind === 'binary') {
      const left = this.validateExpression(expr.left, module, scope);
      const right = this.validateExpression(expr.right, module, scope);
      if (expr.operator === 'and' || expr.operator === 'or') expr.inferredType = 'bool';
      else if (['==', '~=', '<', '<=', '>', '>='].includes(expr.operator)) {
        if (!(canAssignType(left, right) || canAssignType(right, left))) throw new CompileError(`cannot compare ${left} and ${right}`, expr.token);
        expr.inferredType = 'bool';
      } else {
        if (!isNumericType(left) || !isNumericType(right)) throw new CompileError(`operator '${expr.operator}' requires numeric values`, expr.token);
        if (expr.operator === '%' && (isFloatType(left) || isFloatType(right))) throw new CompileError("operator '%' is not available for f32", expr.token);
        expr.inferredType = isFloatType(left) || isFloatType(right) ? 'f32' : 'i64';
      }
      return expr.inferredType;
    }
    if (expr.kind === 'call') {
      const callable = this.resolveCallable(module, expr, scope);
      expr.resolvedCallable = callable;
      const signature = callable.target;
      const args = callArguments(expr);
      if (args.length !== signature.params.length) {
        throw new CompileError(`${expr.path.join('.')} expects ${signature.params.length} argument${signature.params.length === 1 ? '' : 's'}, received ${args.length}`, expr.token);
      }
      args.forEach((arg, index) => {
        const actual = this.validateExpression(arg, module, scope);
        const expected = canonicalTypeName(signature.params[index].type);
        const expectedModule = signature.module || module;
        if (!this.compatibleTypes(actual, module, expected, expectedModule, arg.token || expr.token)) {
          throw new CompileError(`argument ${index + 1} to ${expr.path.join('.')} expects ${expected}, received ${actual}`, arg.token || expr.token);
        }
      });
      if (callable.kind === 'builtin' && (callable.target.name === 'thread.start' || callable.target.name === 'thread.start_with_stack')) {
        const entry = args[0];
        const resolvedEntry = entry?.resolvedReference;
        if (entry?.kind === 'reference' && resolvedEntry?.kind === 'function') {
          const threadFunction = resolvedEntry.target;
          if (threadFunction.params.length !== 1) {
            throw new CompileError(`thread entry '${threadFunction.sourceName || threadFunction.name}' must accept exactly one context argument`, entry.token || expr.token);
          }
          const parameterType = canonicalTypeName(threadFunction.params[0].type);
          if (isFloatType(parameterType)) {
            throw new CompileError(`thread entry '${threadFunction.sourceName || threadFunction.name}' cannot receive an f32 context directly`, entry.token || expr.token);
          }
          const contextType = expressionType(args[1]);
          if (!this.compatibleTypes(contextType, module, parameterType, threadFunction.module, args[1]?.token || expr.token)) {
            throw new CompileError(`thread context expects ${parameterType}, received ${contextType}`, args[1]?.token || expr.token);
          }
          const returnType = canonicalTypeName(threadFunction.returnType);
          if (!['void', 'bool', 'i32', 'u32', 'i64', 'u64'].includes(returnType)) {
            throw new CompileError(`thread entry '${threadFunction.sourceName || threadFunction.name}' must return void or an integer status`, entry.token || expr.token);
          }
        }
      }
      expr.inferredType = callable.returnType || signature.returnType;
      return expr.inferredType;
    }
    throw new CompileError(`unsupported expression '${expr.kind}'`, expr.token);
  }

  validateFunction(fn) {
    fn.returnType = canonicalTypeName(fn.returnType || 'i64');
    fn.returnTypeInfo = this.resolveType(fn.module, fn.returnType, fn.token);
    const variables = new Map();
    fn.params.forEach((param, index) => {
      param.type = canonicalTypeName(param.type || 'i64');
      const typeInfo = this.resolveType(fn.module, param.type, param.token);
      if (variables.has(param.name)) throw new CompileError(`duplicate parameter '${param.name}'`, param.token);
      variables.set(param.name, { name: param.name, type: param.type, typeInfo, kind: 'param', index, token: param.token });
    });
    const scope = { variables, loopDepth: 0, function: fn };

    const validateStatements = (statements, localScope) => {
      for (const statement of statements) {
        if (statement.kind === 'local') {
          if (localScope.variables.has(statement.name)) throw new CompileError(`variable '${statement.name}' already exists in this function`, statement.token);
          const validationModulePath = String(fn.module.filePath || '').replaceAll('\\', '/').toLowerCase();
          const allowInferredLocalHint = !validationModulePath.includes('/bindings/');
          const declaredHint = statement.declaredType
            ? canonicalTypeName(statement.declaredType)
            : (allowInferredLocalHint && !isAutoType(statement.inferredType) ? canonicalTypeName(statement.inferredType) : null);
          if (statement.expression.kind === 'table_literal' && declaredHint && isTableTypeName(declaredHint)) {
            statement.expression.expectedType = declaredHint;
          }
          const inferred = this.validateExpression(statement.expression, fn.module, localScope);
          const declared = canonicalTypeName(declaredHint || inferred || 'i64');
          if (!this.compatibleTypes(inferred, fn.module, declared, fn.module, statement.token)) throw new CompileError(`cannot initialize ${statement.name}: ${declared} with ${inferred}`, statement.token);
          const typeInfo = this.resolveType(fn.module, declared, statement.token);
          const variable = { name: statement.name, type: declared, typeInfo, kind: 'local', immutable: Boolean(statement.immutable), token: statement.token };
          localScope.variables.set(statement.name, variable);
          statement.variable = variable;
        } else if (statement.kind === 'assign') {
          const variable = localScope.variables.get(statement.name);
          if (!variable) throw new CompileError(`cannot assign unknown local '${statement.name}'`, statement.token);
          if (variable.immutable) throw new CompileError(`cannot assign to const local '${statement.name}'`, statement.token);
          statement.variable = variable;
          if (statement.expression.kind === 'table_literal' && isTableTypeName(variable.type)) {
            statement.expression.expectedType = variable.type;
          }
          const actual = this.validateExpression(statement.expression, fn.module, localScope);
          if (!this.compatibleTypes(actual, fn.module, variable.type, fn.module, statement.token)) throw new CompileError(`cannot assign ${actual} to ${statement.name}: ${variable.type}`, statement.token);
        } else if (statement.kind === 'field_assign') {
          const targetExpr = { kind: 'reference', path: statement.targetPath, token: statement.token };
          const resolved = this.resolveReference(fn.module, targetExpr, localScope);
          if (resolved.kind !== 'field') throw new CompileError('field assignment requires a struct field', statement.token);
          statement.resolvedTarget = resolved;
          if (statement.expression.kind === 'table_literal' && isTableTypeName(resolved.type)) {
            statement.expression.expectedType = resolved.type;
          }
          const actual = this.validateExpression(statement.expression, fn.module, localScope);
          if (!this.compatibleTypes(actual, fn.module, resolved.type, fn.module, statement.token)) throw new CompileError(`cannot assign ${actual} to ${statement.targetPath.join('.')}: ${resolved.type}`, statement.token);
        } else if (statement.kind === 'index_assign') {
          const targetType = this.validateExpression(statement.target, fn.module, localScope);
          const actual = this.validateExpression(statement.expression, fn.module, localScope);
          if (!this.compatibleTypes(actual, fn.module, targetType, fn.module, statement.token)) {
            throw new CompileError(`cannot assign ${actual} to table element ${targetType}`, statement.token);
          }
        } else if (statement.kind === 'expr') {
          this.validateExpression(statement.expression, fn.module, localScope);
        } else if (statement.kind === 'return') {
          const actual = statement.expression ? this.validateExpression(statement.expression, fn.module, localScope) : 'void';
          if (!this.compatibleTypes(actual, fn.module, fn.returnType, fn.module, statement.token) && !(actual === 'void' && fn.returnType === 'void')) {
            throw new CompileError(`function ${fn.sourceName || fn.name} returns ${fn.returnType}, received ${actual}`, statement.token);
          }
        } else if (statement.kind === 'if') {
          for (const branch of statement.branches) {
            this.validateExpression(branch.condition, fn.module, localScope);
            validateStatements(branch.body, localScope);
          }
          validateStatements(statement.elseBody, localScope);
        } else if (statement.kind === 'while') {
          this.validateExpression(statement.condition, fn.module, localScope);
          localScope.loopDepth += 1;
          validateStatements(statement.body, localScope);
          localScope.loopDepth -= 1;
        } else if (statement.kind === 'break') {
          if (localScope.loopDepth <= 0) throw new CompileError('break may only be used inside a while loop', statement.token);
        }
      }
    };

    validateStatements(fn.body, scope);
    fn.variables = variables;
  }

  validate() {
    this.resolveInheritance();
    this.inferTypes();
    for (const module of this.moduleOrder) {
      for (const constant of module.constants.values()) this.resolveConstant(constant);
      for (const struct of module.structs.values()) this.resolveStructLayout(struct);
    }
    for (const module of this.moduleOrder) for (const fn of module.functions.values()) this.validateFunction(fn);
  }

  getEntryFunction(root) {
    const main = root.functions.get('main');
    if (main) {
      if (main.params.length !== 0) throw new CompileError('main must not declare parameters', main.token);
      return main;
    }
    if (root.legacyStatements.length > 0) {
      const synthetic = {
        kind: 'function',
        name: '__legacy_main',
        params: [],
        returnType: 'i32',
        body: [...root.legacyStatements, { kind: 'return', expression: { kind: 'literal', value: 0n, valueType: 'i64', token: root.legacyStatements[0].token }, token: root.legacyStatements[0].token }],
        exported: false,
        token: root.legacyStatements[0].token,
        module: root,
        label: `fn_${root.id}___legacy_main`,
      };
      root.functions.set(synthetic.name, synthetic);
      this.validateFunction(synthetic);
      return synthetic;
    }
    return null;
  }
}


function literalExpression(value, valueType, token) {
  return { kind: 'literal', value, valueType, token };
}

function expressionHasSideEffects(expr) {
  if (!expr) return false;
  if (expr.kind === 'call' || expr.kind === 'table_literal') return true;
  if (expr.kind === 'index') return expressionHasSideEffects(expr.object) || expressionHasSideEffects(expr.index);
  if (expr.kind === 'unary') return expressionHasSideEffects(expr.expression);
  if (expr.kind === 'binary') return expressionHasSideEffects(expr.left) || expressionHasSideEffects(expr.right);
  return false;
}

function literalTruthy(expr) {
  if (expr.kind !== 'literal') return null;
  if (typeof expr.value === 'bigint') return expr.value !== 0n;
  if (typeof expr.value === 'number') return expr.value !== 0;
  return null;
}

function isSimpleLoadExpression(expr) {
  return expr?.kind === 'literal' || expr?.kind === 'reference';
}

class Optimizer {
  constructor(program, level = 2, entryFunction = null) {
    this.program = program;
    this.entryFunction = entryFunction;
    this.level = Math.max(0, Math.min(6, Number(level) || 0));
    this.stats = {
      level: this.level,
      constantFolds: 0,
      constantReferences: 0,
      algebraicSimplifications: 0,
      branchesRemoved: 0,
      loopsRemoved: 0,
      deadStatementsRemoved: 0,
      localsPropagated: 0,
      deadStoresRemoved: 0,
      tailCallsOptimized: 0,
      fastBinaryOps: 0,
      constantTableStrides: 0,
      directBranches: 0,
      directSimpleCalls: 0,
      strippedRuntimeFamilies: 0,
      strippedExternImports: 0,
      copiesPropagated: 0,
      commonSubexpressions: 0,
      strengthReductions: 0,
      registerVariables: 0,
      functionsInlined: 0,
      functionsStripped: 0,
      stackSlotsReused: 0,
      stackObjects: 0,
      loopInvariantsHoisted: 0,
      boundsChecksEliminated: 0,
      loopTableCaches: 0,
      vectorizedLoops: 0,
      fusedVectorOps: 0,
      pgoFunctionsMatched: 0,
      pgoInstrumentedFunctions: 0,
      cfgBlocks: 0,
      ssaPhis: 0,
      ssaConstantsPropagated: 0,
    };
  }

  run() {
    if (this.level > 0) {
      for (const module of this.program.moduleOrder) {
        for (const fn of module.functions.values()) this.optimizeFunction(fn);
      }
    }
    if (this.level >= 4) {
      const wholeProgramPasses = this.level >= 6 ? 4 : (this.level >= 5 ? 2 : 1);
      for (let pass = 0; pass < wholeProgramPasses; pass += 1) {
        this.inlineSmallFunctions();
        for (const module of this.program.moduleOrder) {
          for (const fn of module.functions.values()) this.optimizeFunction(fn);
        }
      }
      this.markReachableFunctions();
    } else {
      for (const module of this.program.moduleOrder) for (const fn of module.functions.values()) fn.reachable = true;
    }
    this.collectRuntimeUsage();
    return this.stats;
  }

  optimizeFunction(fn) {
    fn.body = this.optimizeBlock(fn.body, fn.module, fn);
    if (this.level >= 2) {
      this.propagateImmutableLocals(fn);
      fn.body = this.optimizeBlock(fn.body, fn.module, fn);
      this.eliminateUnreadLocals(fn);
      fn.body = this.optimizeBlock(fn.body, fn.module, fn);
    }
    if (this.level >= 3) {
      this.propagateStraightLineValues(fn);
      this.eliminateCommonSubexpressions(fn);
      fn.body = this.optimizeBlock(fn.body, fn.module, fn);
      this.eliminateUnreadLocals(fn);
      fn.body = this.optimizeBlock(fn.body, fn.module, fn);
    }
    if (this.level >= 6) {
      this.runCfgSsa(fn);
      fn.body = this.optimizeBlock(fn.body, fn.module, fn);
    }
    if (this.level >= 5) {
      this.hoistLoopInvariants(fn);
      fn.body = this.optimizeBlock(fn.body, fn.module, fn);
    }
    if (this.level >= 6) {
      this.markLoopTableBounds(fn);
      this.markVectorizableLoops(fn);
      this.markStackAllocatableObjects(fn);
    }
  }

  foldLiteralBinary(operator, left, right, token) {
    const a = left.value;
    const b = right.value;
    const floatMode = typeof a === 'number' || typeof b === 'number' || left.valueType === 'f32' || right.valueType === 'f32';
    let value;
    let type = floatMode ? 'f32' : (left.valueType || 'i64');
    if (floatMode) {
      const fa = Number(a);
      const fb = Number(b);
      switch (operator) {
        case '+': value = Math.fround(fa + fb); break;
        case '-': value = Math.fround(fa - fb); break;
        case '*': value = Math.fround(fa * fb); break;
        case '/': if (fb === 0) return null; value = Math.fround(fa / fb); break;
        case '==': value = fa === fb ? 1n : 0n; type = 'bool'; break;
        case '~=': value = fa !== fb ? 1n : 0n; type = 'bool'; break;
        case '<': value = fa < fb ? 1n : 0n; type = 'bool'; break;
        case '<=': value = fa <= fb ? 1n : 0n; type = 'bool'; break;
        case '>': value = fa > fb ? 1n : 0n; type = 'bool'; break;
        case '>=': value = fa >= fb ? 1n : 0n; type = 'bool'; break;
        case 'and': value = (fa !== 0 && fb !== 0) ? 1n : 0n; type = 'bool'; break;
        case 'or': value = (fa !== 0 || fb !== 0) ? 1n : 0n; type = 'bool'; break;
        default: return null;
      }
    } else {
      if (typeof a !== 'bigint' || typeof b !== 'bigint') {
        if (operator === '==' || operator === '~=') {
          const equal = a === b;
          this.stats.constantFolds += 1;
          return literalExpression((operator === '==' ? equal : !equal) ? 1n : 0n, 'bool', token);
        }
        return null;
      }
      switch (operator) {
        case '+': value = a + b; break;
        case '-': value = a - b; break;
        case '*': value = a * b; break;
        case '/': if (b === 0n) return null; value = a / b; break;
        case '%': if (b === 0n) return null; value = a % b; break;
        case '==': value = a === b ? 1n : 0n; type = 'bool'; break;
        case '~=': value = a !== b ? 1n : 0n; type = 'bool'; break;
        case '<': value = a < b ? 1n : 0n; type = 'bool'; break;
        case '<=': value = a <= b ? 1n : 0n; type = 'bool'; break;
        case '>': value = a > b ? 1n : 0n; type = 'bool'; break;
        case '>=': value = a >= b ? 1n : 0n; type = 'bool'; break;
        case 'and': value = (a !== 0n && b !== 0n) ? 1n : 0n; type = 'bool'; break;
        case 'or': value = (a !== 0n || b !== 0n) ? 1n : 0n; type = 'bool'; break;
        default: return null;
      }
    }
    this.stats.constantFolds += 1;
    const folded = literalExpression(value, type, token);
    folded.inferredType = type;
    return folded;
  }

  optimizeExpression(expr, module, fn = null) {
    if (!expr) return expr;
    if (expr.kind === 'literal') return expr;
    if (expr.kind === 'table_literal') {
      expr.entries = expr.entries.map((entry) => entry.expression.kind === 'function_expression'
        ? entry
        : { ...entry, expression: this.optimizeExpression(entry.expression, module, fn) });
      return expr;
    }
    if (expr.kind === 'index') {
      expr.object = this.optimizeExpression(expr.object, module, fn);
      expr.index = this.optimizeExpression(expr.index, module, fn);
      return expr;
    }
    if (expr.kind === 'reference') {
      if (expr.path.length === 1 && fn?.variables?.has(expr.path[0])) return expr;
      try {
        const resolved = this.program.resolveReference(module, expr, null);
        if (resolved.kind === 'constant') {
          const constant = this.program.resolveConstant(resolved.constant);
          this.stats.constantReferences += 1;
          return literalExpression(constant.value, constant.type, expr.token);
        }
      } catch {
        // Variable references require a function scope and are intentionally left alone.
      }
      return expr;
    }
    if (expr.kind === 'call') {
      expr.args = expr.args.map((arg) => this.optimizeExpression(arg, module, fn));
      if (expr.effectiveArgs) expr.effectiveArgs = expr.effectiveArgs.map((arg, index) => index < expr.effectiveArgs.length - expr.args.length ? this.optimizeExpression(arg, module, fn) : expr.args[index - (expr.effectiveArgs.length - expr.args.length)]);
      return expr;
    }
    if (expr.kind === 'unary') {
      expr.expression = this.optimizeExpression(expr.expression, module, fn);
      if (expr.expression.kind === 'literal' && (typeof expr.expression.value === 'bigint' || typeof expr.expression.value === 'number')) {
        this.stats.constantFolds += 1;
        if (expr.operator === '-') return literalExpression(typeof expr.expression.value === 'number' ? Math.fround(-expr.expression.value) : -expr.expression.value, expr.expression.valueType, expr.token);
        if (expr.operator === 'not') return literalExpression((typeof expr.expression.value === 'number' ? expr.expression.value === 0 : expr.expression.value === 0n) ? 1n : 0n, 'bool', expr.token);
      }
      if (expr.operator === 'not' && expr.expression.kind === 'unary' && expr.expression.operator === 'not') {
        // Keep boolean normalization semantics by not replacing `not not x` with raw x.
        return expr;
      }
      return expr;
    }
    if (expr.kind === 'binary') {
      expr.left = this.optimizeExpression(expr.left, module, fn);
      const leftTruth = literalTruthy(expr.left);
      if (expr.operator === 'and' && leftTruth === false) {
        this.stats.constantFolds += 1;
        return literalExpression(0n, 'bool', expr.token);
      }
      if (expr.operator === 'or' && leftTruth === true) {
        this.stats.constantFolds += 1;
        return literalExpression(1n, 'bool', expr.token);
      }
      expr.right = this.optimizeExpression(expr.right, module, fn);
      if (expr.left.kind === 'literal' && expr.right.kind === 'literal') {
        const folded = this.foldLiteralBinary(expr.operator, expr.left, expr.right, expr.token);
        if (folded) return folded;
      }

      const leftZero = expr.left.kind === 'literal' && (expr.left.value === 0n || expr.left.value === 0);
      const rightZero = expr.right.kind === 'literal' && (expr.right.value === 0n || expr.right.value === 0);
      const leftOne = expr.left.kind === 'literal' && (expr.left.value === 1n || expr.left.value === 1);
      const rightOne = expr.right.kind === 'literal' && (expr.right.value === 1n || expr.right.value === 1);
      if (expr.operator === '+' && rightZero) { this.stats.algebraicSimplifications += 1; return expr.left; }
      if (expr.operator === '+' && leftZero) { this.stats.algebraicSimplifications += 1; return expr.right; }
      if (expr.operator === '-' && rightZero) { this.stats.algebraicSimplifications += 1; return expr.left; }
      if (expr.operator === '*' && rightOne) { this.stats.algebraicSimplifications += 1; return expr.left; }
      if (expr.operator === '*' && leftOne) { this.stats.algebraicSimplifications += 1; return expr.right; }
      if (expr.operator === '/' && rightOne) { this.stats.algebraicSimplifications += 1; return expr.left; }
      if (expr.operator === '*' && rightZero && !expressionHasSideEffects(expr.left)) {
        this.stats.algebraicSimplifications += 1;
        return literalExpression(isFloatType(expressionType(expr.left)) ? 0.0 : 0n, expressionType(expr.left), expr.token);
      }
      if (expr.operator === '*' && leftZero && !expressionHasSideEffects(expr.right)) {
        this.stats.algebraicSimplifications += 1;
        return literalExpression(isFloatType(expressionType(expr.right)) ? 0.0 : 0n, expressionType(expr.right), expr.token);
      }
      if (expr.operator === '%' && rightOne && !expressionHasSideEffects(expr.left)) {
        this.stats.algebraicSimplifications += 1;
        return literalExpression(0n, 'i64', expr.token);
      }
      return expr;
    }
    return expr;
  }

  optimizeStatement(statement, module, fn = null) {
    if (statement.kind === 'local' || statement.kind === 'assign' || statement.kind === 'field_assign' || statement.kind === 'index_assign' || statement.kind === 'expr' || statement.kind === 'return') {
      if (statement.expression) statement.expression = this.optimizeExpression(statement.expression, module, fn);
      if (statement.kind === 'index_assign') {
        statement.target.object = this.optimizeExpression(statement.target.object, module, fn);
        statement.target.index = this.optimizeExpression(statement.target.index, module, fn);
      }
      if (this.level >= 2 && statement.kind === 'return' && statement.expression?.kind === 'call') {
        const callable = statement.expression.resolvedCallable;
        statement.tailSelfCall = callable?.kind === 'internal' && callable.target === fn;
      }
      if (statement.kind === 'assign' && statement.expression?.kind === 'reference' && statement.expression.path.length === 1 && statement.expression.path[0] === statement.name) {
        this.stats.deadStoresRemoved += 1;
        return [];
      }
      return [statement];
    }
    if (statement.kind === 'break') return [statement];
    if (statement.kind === 'while') {
      statement.condition = this.optimizeExpression(statement.condition, module, fn);
      statement.body = this.optimizeBlock(statement.body, module, fn);
      const truth = literalTruthy(statement.condition);
      if (truth === false) {
        this.stats.loopsRemoved += 1;
        return [];
      }
      statement.conditionAlwaysTrue = truth === true;
      return [statement];
    }
    if (statement.kind === 'if') {
      const kept = [];
      let elseBody = this.optimizeBlock(statement.elseBody, module, fn);
      for (const branch of statement.branches) {
        branch.condition = this.optimizeExpression(branch.condition, module, fn);
        branch.body = this.optimizeBlock(branch.body, module, fn);
        const truth = literalTruthy(branch.condition);
        if (truth === false) {
          this.stats.branchesRemoved += 1;
          continue;
        }
        if (truth === true) {
          this.stats.branchesRemoved += 1;
          if (kept.length === 0) return branch.body;
          elseBody = branch.body;
          break;
        }
        kept.push(branch);
      }
      if (kept.length === 0) return elseBody;
      statement.branches = kept;
      statement.elseBody = elseBody;
      return [statement];
    }
    return [statement];
  }

  optimizeBlock(statements, module, fn = null) {
    const result = [];
    let terminated = false;
    for (const statement of statements) {
      if (terminated) {
        this.stats.deadStatementsRemoved += 1;
        continue;
      }
      const replacements = this.optimizeStatement(statement, module, fn);
      for (const replacement of replacements) {
        result.push(replacement);
        if (replacement.kind === 'return' || replacement.kind === 'break') terminated = true;
      }
    }
    return result;
  }

  visitExpressionsInStatements(statements, visitor) {
    const visitExpression = (expr) => {
      if (!expr) return;
      visitor(expr);
      if (expr.kind === 'binary') { visitExpression(expr.left); visitExpression(expr.right); }
      else if (expr.kind === 'unary') visitExpression(expr.expression);
      else if (expr.kind === 'call') callArguments(expr).forEach(visitExpression);
      else if (expr.kind === 'index') { visitExpression(expr.object); visitExpression(expr.index); }
      else if (expr.kind === 'table_literal') expr.entries.forEach((entry) => { if (entry.expression.kind !== 'function_expression') visitExpression(entry.expression); });
    };
    for (const statement of statements) {
      if (statement.expression) visitExpression(statement.expression);
      if (statement.kind === 'index_assign') { visitExpression(statement.target.object); visitExpression(statement.target.index); }
      if (statement.kind === 'if') {
        for (const branch of statement.branches) {
          visitExpression(branch.condition);
          this.visitExpressionsInStatements(branch.body, visitor);
        }
        this.visitExpressionsInStatements(statement.elseBody, visitor);
      } else if (statement.kind === 'while') {
        visitExpression(statement.condition);
        this.visitExpressionsInStatements(statement.body, visitor);
      }
    }
  }

  visitStatements(statements, visitor) {
    for (const statement of statements) {
      visitor(statement);
      if (statement.kind === 'if') {
        statement.branches.forEach((branch) => this.visitStatements(branch.body, visitor));
        this.visitStatements(statement.elseBody, visitor);
      } else if (statement.kind === 'while') this.visitStatements(statement.body, visitor);
    }
  }

  replaceReferences(expr, replacements) {
    if (!expr) return expr;
    if (expr.kind === 'reference' && expr.path.length === 1 && replacements.has(expr.path[0])) {
      const replacement = replacements.get(expr.path[0]);
      return literalExpression(replacement.value, replacement.valueType, expr.token);
    }
    if (expr.kind === 'unary') expr.expression = this.replaceReferences(expr.expression, replacements);
    else if (expr.kind === 'binary') {
      expr.left = this.replaceReferences(expr.left, replacements);
      expr.right = this.replaceReferences(expr.right, replacements);
    } else if (expr.kind === 'call') {
      expr.args = expr.args.map((arg) => this.replaceReferences(arg, replacements));
      if (expr.effectiveArgs) expr.effectiveArgs = expr.effectiveArgs.map((arg) => this.replaceReferences(arg, replacements));
    } else if (expr.kind === 'index') {
      expr.object = this.replaceReferences(expr.object, replacements);
      expr.index = this.replaceReferences(expr.index, replacements);
    } else if (expr.kind === 'table_literal') {
      expr.entries = expr.entries.map((entry) => entry.expression.kind === 'function_expression' ? entry : { ...entry, expression: this.replaceReferences(entry.expression, replacements) });
    }
    return expr;
  }

  rewriteStatementExpressions(statements, replacements) {
    for (const statement of statements) {
      if (statement.expression) statement.expression = this.replaceReferences(statement.expression, replacements);
      if (statement.kind === 'index_assign') {
        statement.target.object = this.replaceReferences(statement.target.object, replacements);
        statement.target.index = this.replaceReferences(statement.target.index, replacements);
      }
      if (statement.kind === 'if') {
        for (const branch of statement.branches) {
          branch.condition = this.replaceReferences(branch.condition, replacements);
          this.rewriteStatementExpressions(branch.body, replacements);
        }
        this.rewriteStatementExpressions(statement.elseBody, replacements);
      } else if (statement.kind === 'while') {
        statement.condition = this.replaceReferences(statement.condition, replacements);
        this.rewriteStatementExpressions(statement.body, replacements);
      }
    }
  }

  propagateImmutableLocals(fn) {
    const declarations = new Map();
    const assigned = new Set();
    const loopReferenced = new Set();
    const scanReferences = (expr) => {
      if (!expr) return;
      if (expr.kind === 'reference' && expr.path.length === 1) loopReferenced.add(expr.path[0]);
      else if (expr.kind === 'binary') { scanReferences(expr.left); scanReferences(expr.right); }
      else if (expr.kind === 'unary') scanReferences(expr.expression);
      else if (expr.kind === 'call') callArguments(expr).forEach(scanReferences);
      else if (expr.kind === 'index') { scanReferences(expr.object); scanReferences(expr.index); }
      else if (expr.kind === 'table_literal') expr.entries.forEach((entry) => {
        if (entry.expression.kind !== 'function_expression') scanReferences(entry.expression);
      });
    };
    const scanLoopBodies = (statements, insideLoop = false) => {
      for (const statement of statements) {
        const nowInside = insideLoop || statement.kind === 'while';
        if (nowInside) {
          if (statement.expression) scanReferences(statement.expression);
          if (statement.kind === 'index_assign') {
            scanReferences(statement.target.object); scanReferences(statement.target.index);
          }
        }
        if (statement.kind === 'if') {
          if (nowInside) statement.branches.forEach((branch) => scanReferences(branch.condition));
          statement.branches.forEach((branch) => scanLoopBodies(branch.body, nowInside));
          scanLoopBodies(statement.elseBody, nowInside);
        } else if (statement.kind === 'while') {
          scanReferences(statement.condition);
          scanLoopBodies(statement.body, true);
        }
      }
    };
    scanLoopBodies(fn.body);
    // Only unconditional top-level declarations are propagated. A local created
    // inside a branch or loop may not execute on every path.
    for (const statement of fn.body) if (statement.kind === 'local') declarations.set(statement.name, statement);
    this.visitStatements(fn.body, (statement) => {
      if (statement.kind === 'assign') assigned.add(statement.name);
    });
    const replacements = new Map();
    for (const [name, statement] of declarations) {
      const hotFloatLiteral = this.level >= 6 && statement.expression.valueType === 'f32' && loopReferenced.has(name);
      const targetType = canonicalTypeName(statement.variable?.type || fn.variables.get(name)?.type || 'auto');
      const sourceType = canonicalTypeName(expressionType(statement.expression));
      if (!assigned.has(name) && statement.expression.kind === 'literal' && !hotFloatLiteral && targetType === sourceType) {
        // Propagating through an assignment that performs a numeric conversion
        // changes the program. For example, `local sector:i64 = sectorValue`
        // must keep the f32->i64 truncation instead of replacing every sector
        // use with the original f32 value.
        replacements.set(name, statement.expression);
        this.stats.localsPropagated += 1;
      }
    }
    if (replacements.size === 0) return;
    this.rewriteStatementExpressions(fn.body, replacements);
    const removeDeclarations = (statements) => {
      const output = [];
      for (const statement of statements) {
        if (statement.kind === 'local' && replacements.has(statement.name)) continue;
        if (statement.kind === 'if') {
          statement.branches.forEach((branch) => { branch.body = removeDeclarations(branch.body); });
          statement.elseBody = removeDeclarations(statement.elseBody);
        } else if (statement.kind === 'while') statement.body = removeDeclarations(statement.body);
        output.push(statement);
      }
      return output;
    };
    fn.body = removeDeclarations(fn.body);
  }

  eliminateUnreadLocals(fn) {
    const reads = new Map();
    this.visitExpressionsInStatements(fn.body, (expr) => {
      if (expr.kind === 'reference' && expr.path.length >= 1 && fn.variables.has(expr.path[0])) {
        reads.set(expr.path[0], (reads.get(expr.path[0]) || 0) + 1);
      }
    });
    this.visitStatements(fn.body, (statement) => {
      if (statement.kind === 'field_assign' && fn.variables.has(statement.targetPath[0])) {
        reads.set(statement.targetPath[0], (reads.get(statement.targetPath[0]) || 0) + 1);
      }
    });
    const rewrite = (statements) => {
      const output = [];
      for (const statement of statements) {
        if ((statement.kind === 'local' || statement.kind === 'assign') && !reads.get(statement.name)) {
          this.stats.deadStoresRemoved += 1;
          if (expressionHasSideEffects(statement.expression)) output.push({ kind: 'expr', expression: statement.expression, token: statement.token });
          continue;
        }
        if (statement.kind === 'if') {
          statement.branches.forEach((branch) => { branch.body = rewrite(branch.body); });
          statement.elseBody = rewrite(statement.elseBody);
        } else if (statement.kind === 'while') statement.body = rewrite(statement.body);
        output.push(statement);
      }
      return output;
    };
    fn.body = rewrite(fn.body);
  }

  cloneExpression(expr) {
    if (!expr) return expr;
    if (expr.kind === 'literal') return { ...expr };
    if (expr.kind === 'reference') return { ...expr, path: [...expr.path] };
    if (expr.kind === 'unary') return { ...expr, expression: this.cloneExpression(expr.expression) };
    if (expr.kind === 'binary') return { ...expr, left: this.cloneExpression(expr.left), right: this.cloneExpression(expr.right) };
    if (expr.kind === 'call') { const clone = { ...expr, path: [...expr.path], args: expr.args.map((arg) => this.cloneExpression(arg)) }; if (expr.effectiveArgs) clone.effectiveArgs = expr.effectiveArgs.map((arg) => this.cloneExpression(arg)); return clone; }
    if (expr.kind === 'index') return { ...expr, object: this.cloneExpression(expr.object), index: this.cloneExpression(expr.index) };
    if (expr.kind === 'table_literal') return { ...expr, entries: expr.entries.map((entry) => entry.expression.kind === 'function_expression' ? entry : { ...entry, expression: this.cloneExpression(entry.expression) }) };
    return { ...expr };
  }

  expressionDependencies(expr, output = new Set()) {
    if (!expr) return output;
    if (expr.kind === 'reference' && expr.path.length >= 1) output.add(expr.path[0]);
    else if (expr.kind === 'unary') this.expressionDependencies(expr.expression, output);
    else if (expr.kind === 'binary') {
      this.expressionDependencies(expr.left, output);
      this.expressionDependencies(expr.right, output);
    } else if (expr.kind === 'call') callArguments(expr).forEach((arg) => this.expressionDependencies(arg, output));
    else if (expr.kind === 'index') { this.expressionDependencies(expr.object, output); this.expressionDependencies(expr.index, output); }
    else if (expr.kind === 'table_literal') expr.entries.forEach((entry) => { if (entry.expression.kind !== 'function_expression') this.expressionDependencies(entry.expression, output); });
    return output;
  }

  replaceKnownValues(expr, environment, active = new Set()) {
    if (!expr) return expr;
    if (expr.kind === 'reference' && expr.path.length === 1 && environment.has(expr.path[0]) && !active.has(expr.path[0])) {
      const name = expr.path[0];
      active.add(name);
      const replacement = this.replaceKnownValues(this.cloneExpression(environment.get(name)), environment, active);
      active.delete(name);
      this.stats.copiesPropagated += 1;
      return replacement;
    }
    if (expr.kind === 'unary') expr.expression = this.replaceKnownValues(expr.expression, environment, active);
    else if (expr.kind === 'binary') {
      expr.left = this.replaceKnownValues(expr.left, environment, active);
      expr.right = this.replaceKnownValues(expr.right, environment, active);
    } else if (expr.kind === 'call') { expr.args = expr.args.map((arg) => this.replaceKnownValues(arg, environment, active)); if (expr.effectiveArgs) expr.effectiveArgs = expr.effectiveArgs.map((arg) => this.replaceKnownValues(arg, environment, active)); }
    else if (expr.kind === 'index') { expr.object = this.replaceKnownValues(expr.object, environment, active); expr.index = this.replaceKnownValues(expr.index, environment, active); }
    else if (expr.kind === 'table_literal') expr.entries = expr.entries.map((entry) => entry.expression.kind === 'function_expression' ? entry : { ...entry, expression: this.replaceKnownValues(entry.expression, environment, active) });
    return expr;
  }

  assignedNamesInStatements(statements, output = new Set()) {
    for (const statement of statements) {
      if (statement.kind === 'assign') output.add(statement.name);
      if (statement.kind === 'if') {
        statement.branches.forEach((branch) => this.assignedNamesInStatements(branch.body, output));
        this.assignedNamesInStatements(statement.elseBody, output);
      } else if (statement.kind === 'while') this.assignedNamesInStatements(statement.body, output);
    }
    return output;
  }

  propagateStraightLineValues(fn) {
    const processBlock = (statements, inherited = new Map()) => {
      const environment = new Map(inherited);
      for (const statement of statements) {
        if (statement.expression) statement.expression = this.replaceKnownValues(statement.expression, environment);
        if (statement.kind === 'if') {
          for (const branch of statement.branches) {
            branch.condition = this.replaceKnownValues(branch.condition, environment);
            processBlock(branch.body, new Map(environment));
          }
          processBlock(statement.elseBody, new Map(environment));
          environment.clear();
          continue;
        }
        if (statement.kind === 'while') {
          const assignedInLoop = this.assignedNamesInStatements(statement.body);
          const loopEnvironment = new Map(environment);
          for (const [name, value] of [...loopEnvironment]) {
            const dependencies = this.expressionDependencies(value);
            // Integer literals fold into compact immediate arithmetic. f32
            // literals require a GPR load plus MOVD every use, so O6 keeps an
            // immutable loop constant as an XMM register local instead.
            const hotFloatLiteral = this.level >= 6 && value.kind === 'literal' && value.valueType === 'f32';
            if (hotFloatLiteral || assignedInLoop.has(name)
                || [...dependencies].some((dependency) => assignedInLoop.has(dependency))) loopEnvironment.delete(name);
          }
          statement.condition = this.replaceKnownValues(statement.condition, loopEnvironment);
          processBlock(statement.body, new Map(loopEnvironment));
          environment.clear();
          continue;
        }
        // A call or mutation can invalidate values read through an object field.
        // Never keep field/index snapshots in the copy-propagation environment,
        // and conservatively clear aliases across side-effecting statements.
        if (statement.kind === 'field_assign' || statement.kind === 'index_assign') {
          environment.clear();
          continue;
        }
        if (statement.kind !== 'local' && statement.kind !== 'assign') {
          if (statement.expression && expressionHasSideEffects(statement.expression)) environment.clear();
          continue;
        }
        const changed = statement.name;
        const hasSideEffects = statement.expression && expressionHasSideEffects(statement.expression);
        if (hasSideEffects) environment.clear();
        for (const [name, value] of [...environment]) {
          if (name === changed || this.expressionDependencies(value).has(changed)) environment.delete(name);
        }
        const targetType = canonicalTypeName(statement.variable?.type || fn.variables.get(changed)?.type || 'auto');
        const sourceType = canonicalTypeName(expressionType(statement.expression));
        if (targetType === sourceType && (statement.expression?.kind === 'literal'
            || (statement.expression?.kind === 'reference' && statement.expression.path.length === 1))) {
          // Straight-line copy propagation is only valid when no assignment
          // conversion is being removed. This protects narrowing/widening casts
          // while still eliminating true same-type copies.
          environment.set(changed, this.cloneExpression(statement.expression));
        }
      }
    };
    processBlock(fn.body);
  }

  expressionKey(expr) {
    if (!expr || expressionHasSideEffects(expr)) return null;
    if (expr.kind === 'literal') return `L:${expr.valueType}:${String(expr.value)}`;
    if (expr.kind === 'reference') return `R:${expr.path.join('.')}`;
    if (expr.kind === 'unary') {
      const inner = this.expressionKey(expr.expression);
      return inner ? `U:${expr.operator}:${inner}` : null;
    }
    if (expr.kind === 'binary') {
      const left = this.expressionKey(expr.left);
      const right = this.expressionKey(expr.right);
      if (!left || !right) return null;
      return `B:${expr.operator}:${left}:${right}`;
    }
    return null;
  }

  eliminateCommonSubexpressions(fn) {
    const processBlock = (statements) => {
      const available = new Map();
      for (const statement of statements) {
        if (statement.kind === 'if') {
          statement.branches.forEach((branch) => processBlock(branch.body));
          processBlock(statement.elseBody);
          available.clear();
          continue;
        }
        if (statement.kind === 'while') {
          processBlock(statement.body);
          available.clear();
          continue;
        }
        if (statement.kind === 'expr' || statement.kind === 'return') {
          if (expressionHasSideEffects(statement.expression)) available.clear();
          continue;
        }
        if (statement.kind !== 'local' && statement.kind !== 'assign') continue;
        const changed = statement.name;
        for (const [key, item] of [...available]) {
          if (item.name === changed || item.dependencies.has(changed)) available.delete(key);
        }
        const key = this.expressionKey(statement.expression);
        if (!key) {
          if (expressionHasSideEffects(statement.expression)) available.clear();
          continue;
        }
        const resultType = canonicalTypeName(statement.variable?.type || fn.variables.get(changed)?.type || expressionType(statement.expression));
        const prior = available.get(key);
        if (prior && prior.name !== changed && prior.resultType === resultType) {
          statement.expression = { kind: 'reference', path: [prior.name], token: statement.expression.token, inferredType: resultType };
          this.stats.commonSubexpressions += 1;
        } else if (statement.expression.kind === 'binary' || statement.expression.kind === 'unary') {
          available.set(key, { name: changed, resultType, dependencies: this.expressionDependencies(statement.expression) });
        }
      }
    };
    processBlock(fn.body);
  }

  collectLocalUses(expr, fn, uses = new Set()) {
    if (!expr) return uses;
    if (expr.kind === 'reference') {
      if (expr.path.length >= 1 && fn.variables.has(expr.path[0])) uses.add(expr.path[0]);
    } else if (expr.kind === 'binary') {
      this.collectLocalUses(expr.left, fn, uses); this.collectLocalUses(expr.right, fn, uses);
    } else if (expr.kind === 'unary') this.collectLocalUses(expr.expression, fn, uses);
    else if (expr.kind === 'call') callArguments(expr).forEach((arg) => this.collectLocalUses(arg, fn, uses));
    else if (expr.kind === 'index') { this.collectLocalUses(expr.object, fn, uses); this.collectLocalUses(expr.index, fn, uses); }
    else if (expr.kind === 'table_literal') (expr.entries || []).forEach((entry) => this.collectLocalUses(entry.expression, fn, uses));
    return uses;
  }

  buildControlFlowGraph(fn) {
    const blocks = [];
    const makeBlock = (kind, statement = null, expression = null, container = null) => {
      const block = { id: blocks.length, kind, statement, expression, container, successors: [], predecessors: [], uses: new Set(), defs: new Set(), phis: [] };
      blocks.push(block);
      return block;
    };
    const connect = (from, to) => {
      if (!from || !to || from.successors.includes(to)) return;
      from.successors.push(to); to.predecessors.push(from);
    };
    const entry = makeBlock('entry');
    const exit = makeBlock('exit');
    const buildSequence = (statements, incoming, loopExit = null) => {
      let tails = [...incoming];
      for (const statement of statements || []) {
        if (statement.kind === 'if') {
          const join = makeBlock('join');
          let falseTails = tails;
          for (const branch of statement.branches) {
            const condition = makeBlock('if_condition', statement, branch.condition);
            falseTails.forEach((tail) => connect(tail, condition));
            const branchEntry = makeBlock('branch_entry');
            connect(condition, branchEntry);
            const branchTails = buildSequence(branch.body, [branchEntry], loopExit);
            branchTails.forEach((tail) => connect(tail, join));
            falseTails = [condition];
          }
          if (statement.elseBody?.length) {
            const elseEntry = makeBlock('else_entry');
            falseTails.forEach((tail) => connect(tail, elseEntry));
            const elseTails = buildSequence(statement.elseBody, [elseEntry], loopExit);
            elseTails.forEach((tail) => connect(tail, join));
          } else falseTails.forEach((tail) => connect(tail, join));
          tails = [join];
          continue;
        }
        if (statement.kind === 'while') {
          const condition = makeBlock('while_condition', statement, statement.condition);
          tails.forEach((tail) => connect(tail, condition));
          const after = makeBlock('while_after');
          const bodyEntry = makeBlock('while_body');
          connect(condition, bodyEntry); connect(condition, after);
          const bodyTails = buildSequence(statement.body, [bodyEntry], after);
          bodyTails.forEach((tail) => connect(tail, condition));
          tails = [after];
          continue;
        }
        const block = makeBlock(statement.kind, statement, statement.expression || null, statements);
        tails.forEach((tail) => connect(tail, block));
        if (statement.kind === 'break') {
          if (loopExit) connect(block, loopExit);
          tails = [];
        } else if (statement.kind === 'return') {
          connect(block, exit);
          tails = [];
        } else tails = [block];
      }
      return tails;
    };
    buildSequence(fn.body, [entry]).forEach((tail) => connect(tail, exit));
    for (const block of blocks) {
      const statement = block.statement;
      if (block.expression) this.collectLocalUses(block.expression, fn, block.uses);
      if (statement?.kind === 'index_assign') {
        this.collectLocalUses(statement.target.object, fn, block.uses);
        this.collectLocalUses(statement.target.index, fn, block.uses);
        this.collectLocalUses(statement.expression, fn, block.uses);
      } else if (statement?.kind === 'field_assign') {
        if (statement.targetPath?.[0] && fn.variables.has(statement.targetPath[0])) block.uses.add(statement.targetPath[0]);
      }
      if ((statement?.kind === 'local' || statement?.kind === 'assign') && fn.variables.has(statement.name)) block.defs.add(statement.name);
      // A local's initializer is evaluated before its definition. Assignment
      // expressions follow the same rule, so any same-name reference remains a use.
    }
    return { blocks, entry, exit };
  }

  literalLattice(expr, values) {
    if (!expr) return null;
    if (expr.kind === 'literal') return { value: expr.value, valueType: expr.valueType || expr.inferredType };
    if (expr.kind === 'reference' && expr.path.length === 1) return values.get(expr.path[0]) || null;
    if (expr.kind === 'unary') {
      const inner = this.literalLattice(expr.expression, values);
      if (!inner) return null;
      if (expr.operator === '-') {
        return { value: typeof inner.value === 'bigint' ? -inner.value : Math.fround(-Number(inner.value)), valueType: inner.valueType };
      }
      if (expr.operator === 'not') {
        const truthy = typeof inner.value === 'bigint' ? inner.value !== 0n : Number(inner.value) !== 0;
        return { value: truthy ? 0n : 1n, valueType: 'bool' };
      }
      return null;
    }
    if (expr.kind === 'binary') {
      const left = this.literalLattice(expr.left, values);
      const right = this.literalLattice(expr.right, values);
      if (!left || !right) return null;
      const folded = this.foldLiteralBinary(expr.operator,
        literalExpression(left.value, left.valueType, expr.token),
        literalExpression(right.value, right.valueType, expr.token), expr.token);
      return folded ? { value: folded.value, valueType: folded.valueType } : null;
    }
    return null;
  }

  sameLattice(left, right) {
    return left && right && left.valueType === right.valueType && Object.is(left.value, right.value);
  }

  mergeConstantMaps(predecessors) {
    if (predecessors.length === 0) return new Map();
    const result = new Map(predecessors[0].constantOut || []);
    for (const [name, value] of [...result]) {
      for (let index = 1; index < predecessors.length; index += 1) {
        const other = predecessors[index].constantOut?.get(name);
        if (!this.sameLattice(value, other)) { result.delete(name); break; }
      }
    }
    return result;
  }

  rewriteConstantsFromMap(expr, values, fn) {
    if (!expr) return expr;
    if (expr.kind === 'reference' && expr.path.length === 1 && fn.variables.has(expr.path[0])) {
      const value = values.get(expr.path[0]);
      const variable = fn.variables.get(expr.path[0]);
      if (value && variable && (isNumericType(variable.type) || variable.type === 'bool')) {
        this.stats.ssaConstantsPropagated += 1;
        const replacement = literalExpression(value.value, value.valueType, expr.token);
        replacement.inferredType = value.valueType;
        return replacement;
      }
      return expr;
    }
    if (expr.kind === 'unary') expr.expression = this.rewriteConstantsFromMap(expr.expression, values, fn);
    else if (expr.kind === 'binary') {
      expr.left = this.rewriteConstantsFromMap(expr.left, values, fn);
      expr.right = this.rewriteConstantsFromMap(expr.right, values, fn);
    } else if (expr.kind === 'call') {
      expr.args = expr.args.map((arg) => this.rewriteConstantsFromMap(arg, values, fn));
      if (expr.effectiveArgs) {
        const receiverCount = Math.max(0, expr.effectiveArgs.length - expr.args.length);
        const receivers = expr.effectiveArgs.slice(0, receiverCount).map((arg) => this.rewriteConstantsFromMap(arg, values, fn));
        expr.effectiveArgs = [...receivers, ...expr.args];
      }
    } else if (expr.kind === 'index') {
      expr.object = this.rewriteConstantsFromMap(expr.object, values, fn);
      expr.index = this.rewriteConstantsFromMap(expr.index, values, fn);
    }
    return expr;
  }

  runCfgSsa(fn) {
    const cfg = this.buildControlFlowGraph(fn);
    this.stats.cfgBlocks = Math.max(this.stats.cfgBlocks, cfg.blocks.length);
    // Reaching definitions create explicit analysis phi nodes at joins. The AST
    // remains structured, but every reference is annotated with the possible SSA
    // definition versions used by constant propagation and liveness.
    let nextDefinition = 1;
    const definitionsByVariable = new Map();
    for (const block of cfg.blocks) {
      block.definitionIds = new Map();
      for (const name of block.defs) {
        const id = nextDefinition++;
        block.definitionIds.set(name, id);
        if (!definitionsByVariable.has(name)) definitionsByVariable.set(name, new Set());
        definitionsByVariable.get(name).add(id);
        if (block.statement) block.statement.ssaVersion = id;
      }
      block.reachingIn = new Map(); block.reachingOut = new Map();
    }
    const mapsEqual = (left, right) => {
      if (left.size !== right.size) return false;
      for (const [name, values] of left) {
        const other = right.get(name);
        if (!other || values.size !== other.size || [...values].some((value) => !other.has(value))) return false;
      }
      return true;
    };
    for (let iteration = 0; iteration < cfg.blocks.length * 4 + 4; iteration += 1) {
      let changed = false;
      for (const block of cfg.blocks) {
        const incoming = new Map();
        for (const predecessor of block.predecessors) for (const [name, values] of predecessor.reachingOut) {
          if (!incoming.has(name)) incoming.set(name, new Set());
          values.forEach((value) => incoming.get(name).add(value));
        }
        const outgoing = new Map([...incoming].map(([name, values]) => [name, new Set(values)]));
        for (const [name, id] of block.definitionIds) outgoing.set(name, new Set([id]));
        if (!mapsEqual(incoming, block.reachingIn) || !mapsEqual(outgoing, block.reachingOut)) changed = true;
        block.reachingIn = incoming; block.reachingOut = outgoing;
      }
      if (!changed) break;
    }
    for (const block of cfg.blocks) {
      block.phis = [];
      if (block.predecessors.length > 1) for (const [name, values] of block.reachingIn) {
        if (values.size > 1) block.phis.push({ variable: name, sources: [...values] });
      }
    }
    const phiCount = cfg.blocks.reduce((sum, block) => sum + block.phis.length, 0);
    fn.ssa = { blocks: cfg.blocks, phiCount };
    fn.cfg = cfg;
    fn.ssaPhiCount = phiCount;
    this.stats.ssaPhis = Math.max(this.stats.ssaPhis, phiCount);

    for (const block of cfg.blocks) { block.constantIn = new Map(); block.constantOut = new Map(); }
    for (let iteration = 0; iteration < cfg.blocks.length * 4 + 4; iteration += 1) {
      let changed = false;
      for (const block of cfg.blocks) {
        const incoming = this.mergeConstantMaps(block.predecessors);
        const outgoing = new Map(incoming);
        const statement = block.statement;
        if (statement && (statement.kind === 'local' || statement.kind === 'assign')) {
          const variable = fn.variables.get(statement.name);
          const value = variable && (isNumericType(variable.type) || variable.type === 'bool')
            ? this.literalLattice(statement.expression, incoming) : null;
          if (value) outgoing.set(statement.name, value); else outgoing.delete(statement.name);
        }
        const signature = (map) => [...map].map(([name, value]) => `${name}:${value.valueType}:${String(value.value)}`).sort().join('|');
        if (signature(incoming) !== signature(block.constantIn) || signature(outgoing) !== signature(block.constantOut)) changed = true;
        block.constantIn = incoming; block.constantOut = outgoing;
      }
      if (!changed) break;
    }

    for (const block of cfg.blocks) {
      const statement = block.statement;
      if (block.kind === 'if_condition' || block.kind === 'while_condition') {
        block.expression = this.rewriteConstantsFromMap(block.expression, block.constantIn, fn);
        if (block.kind === 'while_condition') statement.condition = block.expression;
        else {
          const branch = statement.branches.find((candidate) => candidate.condition === block.expression || candidate.condition?.token === block.expression?.token);
          if (branch) branch.condition = block.expression;
        }
      } else if (statement) {
        if (statement.expression) statement.expression = this.rewriteConstantsFromMap(statement.expression, block.constantIn, fn);
        if (statement.kind === 'index_assign') {
          statement.target.object = this.rewriteConstantsFromMap(statement.target.object, block.constantIn, fn);
          statement.target.index = this.rewriteConstantsFromMap(statement.target.index, block.constantIn, fn);
        }
      }
    }

    // CFG liveness removes stores proven dead across branches and loop backedges.
    for (const block of cfg.blocks) { block.liveIn = new Set(); block.liveOut = new Set(); }
    for (let iteration = 0; iteration < cfg.blocks.length * 4 + 4; iteration += 1) {
      let changed = false;
      for (let index = cfg.blocks.length - 1; index >= 0; index -= 1) {
        const block = cfg.blocks[index];
        const out = new Set();
        block.successors.forEach((successor) => successor.liveIn.forEach((name) => out.add(name)));
        const incoming = new Set(block.uses);
        out.forEach((name) => { if (!block.defs.has(name)) incoming.add(name); });
        const signature = (set) => [...set].sort().join('|');
        if (signature(out) !== signature(block.liveOut) || signature(incoming) !== signature(block.liveIn)) changed = true;
        block.liveOut = out; block.liveIn = incoming;
      }
      if (!changed) break;
    }
    const removals = new Map();
    for (const block of cfg.blocks) {
      const statement = block.statement;
      if (!statement || statement.kind !== 'assign') continue;
      if (block.liveOut.has(statement.name) || expressionHasSideEffects(statement.expression)) continue;
      if (!removals.has(block.container)) removals.set(block.container, new Set());
      removals.get(block.container).add(statement);
    }
    for (const [container, statements] of removals) {
      if (!container) continue;
      const before = container.length;
      for (let index = container.length - 1; index >= 0; index -= 1) if (statements.has(container[index])) container.splice(index, 1);
      const removed = before - container.length;
      this.stats.deadStoresRemoved += removed;
      this.stats.deadStatementsRemoved += removed;
    }
  }

  pureInvariantExpression(expr) {
    if (!expr) return false;
    if (expr.kind === 'literal' || expr.kind === 'reference') return true;
    if (expr.kind === 'unary') return this.pureInvariantExpression(expr.expression);
    if (expr.kind === 'binary') return this.pureInvariantExpression(expr.left) && this.pureInvariantExpression(expr.right);
    return false;
  }

  collectAssignedNames(statements, result = new Set()) {
    for (const statement of statements || []) {
      if (statement.kind === 'local' || statement.kind === 'assign') result.add(statement.name);
      else if (statement.kind === 'field_assign') result.add(statement.targetPath?.[0]);
      if (statement.kind === 'if') {
        statement.branches.forEach((branch) => this.collectAssignedNames(branch.body, result));
        this.collectAssignedNames(statement.elseBody, result);
      } else if (statement.kind === 'while') this.collectAssignedNames(statement.body, result);
    }
    return result;
  }

  hoistLoopInvariants(fn) {
    const process = (statements) => {
      for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];
        if (statement.kind === 'if') {
          statement.branches.forEach((branch) => process(branch.body));
          process(statement.elseBody);
          continue;
        }
        if (statement.kind !== 'while') continue;
        process(statement.body);
        const assigned = this.collectAssignedNames(statement.body);
        const hoisted = [];
        // Only move the loop's straight-line invariant prefix. This is a
        // conservative LICM form: every moved expression is primitive, pure,
        // and independent of every value assigned anywhere in the loop.
        while (statement.body.length > 0) {
          const candidate = statement.body[0];
          if (candidate.kind !== 'local' || !this.pureInvariantExpression(candidate.expression)) break;
          const dependencies = this.expressionDependencies(candidate.expression);
          if ([...dependencies].some((name) => assigned.has(name))) break;
          hoisted.push(statement.body.shift());
        }
        if (hoisted.length > 0) {
          statements.splice(index, 0, ...hoisted);
          index += hoisted.length;
          this.stats.loopInvariantsHoisted += hoisted.length;
        }
      }
    };
    process(fn.body);
  }

  referenceKey(expr) {
    return expr?.kind === 'reference' ? expr.path.join('.') : null;
  }

  markLoopTableBounds(fn) {
    const sameVariable = (expr, name) => expr?.kind === 'reference' && expr.path.length === 1 && expr.path[0] === name;
    const countSource = (expr) => {
      if (expr?.kind !== 'call') return null;
      let callable = expr.resolvedCallable;
      if (!callable) {
        try { callable = this.program.resolveCallable(fn.module, expr, { variables: fn.variables }); } catch { return null; }
      }
      if (callable?.kind === 'packed_length') return callArguments(expr)[0] || null;
      if (callable?.kind !== 'builtin' || !['table.count', 'table.length'].includes(callable.target.name)) return null;
      return callArguments(expr)[0] || null;
    };
    const hasCall = (expr) => {
      if (!expr) return false;
      if (expr.kind === 'call') return true;
      if (expr.kind === 'binary') return hasCall(expr.left) || hasCall(expr.right);
      if (expr.kind === 'unary') return hasCall(expr.expression);
      if (expr.kind === 'index') return hasCall(expr.object) || hasCall(expr.index);
      if (expr.kind === 'table_literal') return (expr.entries || []).some((entry) => hasCall(entry.expression));
      return false;
    };
    const tableMayChange = (statements, tableKey) => {
      const rootName = tableKey.split('.')[0];
      for (const statement of statements) {
        if ((statement.kind === 'assign' || statement.kind === 'local') && statement.name === rootName) return true;
        if (statement.kind === 'field_assign' && statement.targetPath?.join('.') === tableKey) return true;
        if (statement.expression && hasCall(statement.expression)) return true;
        if (statement.kind === 'index_assign' && (hasCall(statement.target.object) || hasCall(statement.target.index) || hasCall(statement.expression))) return true;
        if (statement.kind === 'if') {
          for (const branch of statement.branches) {
            if (hasCall(branch.condition) || tableMayChange(branch.body, tableKey)) return true;
          }
          if (tableMayChange(statement.elseBody, tableKey)) return true;
        } else if (statement.kind === 'while') {
          if (hasCall(statement.condition) || tableMayChange(statement.body, tableKey)) return true;
        }
      }
      return false;
    };
    const markExpression = (expr, indexName, tableKey, plan) => {
      if (!expr) return;
      if (expr.kind === 'index') {
        if (this.referenceKey(expr.object) === tableKey && sameVariable(expr.index, indexName)) {
          if (!expr.boundsCheckElided) {
            expr.boundsCheckElided = true;
            this.stats.boundsChecksEliminated += 1;
          }
          expr.loopTablePlan = plan;
          if (!plan.stride && expr.tableElement) plan.stride = tableElementStorageSize(expr.tableElement);
        }
        markExpression(expr.object, indexName, tableKey, plan); markExpression(expr.index, indexName, tableKey, plan);
      } else if (expr.kind === 'binary') {
        markExpression(expr.left, indexName, tableKey, plan); markExpression(expr.right, indexName, tableKey, plan);
      } else if (expr.kind === 'unary') markExpression(expr.expression, indexName, tableKey, plan);
      else if (expr.kind === 'call') callArguments(expr).forEach((arg) => markExpression(arg, indexName, tableKey, plan));
    };
    const markStatements = (statements, indexName, tableKey, plan) => {
      for (const statement of statements) {
        if (statement.expression) markExpression(statement.expression, indexName, tableKey, plan);
        if (statement.kind === 'index_assign') {
          markExpression(statement.target, indexName, tableKey, plan);
          markExpression(statement.expression, indexName, tableKey, plan);
        } else if (statement.kind === 'if') {
          statement.branches.forEach((branch) => { markExpression(branch.condition, indexName, tableKey, plan); markStatements(branch.body, indexName, tableKey, plan); });
          markStatements(statement.elseBody, indexName, tableKey, plan);
        }
      }
    };
    const process = (statements) => {
      for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];
        statement.tableLoopPlan = null;
        if (statement.kind === 'if') {
          statement.branches.forEach((branch) => process(branch.body));
          process(statement.elseBody);
          continue;
        }
        if (statement.kind !== 'while') continue;
        process(statement.body);
        const condition = statement.condition;
        if (condition?.kind !== 'binary' || condition.operator !== '<' || condition.left?.kind !== 'reference' || condition.left.path.length !== 1) continue;
        const indexName = condition.left.path[0];
        const source = countSource(condition.right);
        const tableKey = this.referenceKey(source);
        if (!tableKey || index === 0) continue;
        let initializer = null;
        for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
          const previous = statements[previousIndex];
          if ((previous.kind === 'local' || previous.kind === 'assign') && previous.name === indexName) { initializer = previous; break; }
          if (previous.kind === 'if' || previous.kind === 'while' || previous.kind === 'return') break;
        }
        if (!initializer || initializer.expression?.kind !== 'literal' || typeof initializer.expression.value !== 'bigint'
            || initializer.expression.value < 0n) continue;
        if (statement.body.length === 0) continue;
        const latch = statement.body[statement.body.length - 1];
        if (latch.kind !== 'assign' || latch.name !== indexName || latch.expression?.kind !== 'binary'
            || latch.expression.operator !== '+' || !sameVariable(latch.expression.left, indexName)
            || latch.expression.right?.kind !== 'literal' || latch.expression.right.value !== 1n) continue;
        let unsafeIndexWrite = false;
        for (let bodyIndex = 0; bodyIndex < statement.body.length - 1; bodyIndex += 1) {
          const child = statement.body[bodyIndex];
          if ((child.kind === 'assign' || child.kind === 'local') && child.name === indexName) unsafeIndexWrite = true;
        }
        if (unsafeIndexWrite) continue;
        const plan = {
          tableKey,
          tableObject: source,
          indexName,
          indexVariable: condition.left.resolvedReference?.variable || fn.variables.get(indexName),
          stride: 0,
          cacheDataRegister: null,
          cacheCountRegister: null,
          cacheDataOffset: null,
          cacheCountOffset: null,
        };
        markStatements(statement.body.slice(0, -1), indexName, tableKey, plan);
        // A stable, call-free loop may keep the table header in nonvolatile
        // registers. Other canonical loops still receive bounds-check removal.
        if (!source.packedStruct && plan.stride > 0 && !tableMayChange(statement.body.slice(0, -1), tableKey)) {
          statement.tableLoopPlan = plan;
          this.stats.loopTableCaches += 1;
        }
      }
    };
    process(fn.body);
  }

  vectorRegisterNeed(expr) {
    if (!expr) return 99;
    if (expr.kind === 'index' || expr.kind === 'literal' || expr.kind === 'reference') return 1;
    if (expr.kind !== 'binary' || !['+', '-', '*', '/'].includes(expr.operator)) return 99;
    const left = this.vectorRegisterNeed(expr.left);
    const right = this.vectorRegisterNeed(expr.right);
    if (left >= 99 || right >= 99) return 99;
    return left === right ? left + 1 : Math.max(left, right);
  }

  markVectorizableLoops(fn) {
    const sameVariable = (expr, name) => expr?.kind === 'reference' && expr.path.length === 1 && expr.path[0] === name;
    const referenceKey = (expr) => expr?.kind === 'reference' ? expr.path.join('.') : null;
    const countSource = (expr) => {
      if (expr?.kind !== 'call') return null;
      let callable = expr.resolvedCallable;
      if (!callable) {
        try { callable = this.program.resolveCallable(fn.module, expr, { variables: fn.variables }); } catch { return null; }
      }
      if (callable?.kind === 'packed_length') return callArguments(expr)[0] || null;
      if (callable?.kind !== 'builtin' || !['table.count', 'table.length'].includes(callable.target.name)) return null;
      return callArguments(expr)[0] || null;
    };
    const collectVectorTables = (expr, indexName, out) => {
      if (!expr) return false;
      if (expr.kind === 'index') {
        if (!sameVariable(expr.index, indexName) || expressionType(expr) !== 'f32') return false;
        const key = referenceKey(expr.object);
        if (!key) return false;
        if (!out.some((entry) => entry.key === key)) out.push({ key, object: expr.object, index: expr, packed: expr.packedStruct || null });
        return true;
      }
      if (expr.kind === 'literal') return expr.valueType === 'f32';
      if (expr.kind === 'reference') {
        if (expr.path.length !== 1 || expr.path[0] === indexName || expressionType(expr) !== 'f32') return false;
        return true;
      }
      if (expr.kind !== 'binary' || !['+', '-', '*', '/'].includes(expr.operator) || expressionType(expr) !== 'f32') return false;
      return collectVectorTables(expr.left, indexName, out) && collectVectorTables(expr.right, indexName, out);
    };
    const process = (statements) => {
      for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];
        if (statement.kind === 'if') {
          statement.branches.forEach((branch) => process(branch.body));
          process(statement.elseBody);
          continue;
        }
        if (statement.kind !== 'while') continue;
        process(statement.body);
        const previouslyVectorized = Boolean(statement.vectorPlan);
        statement.vectorPlan = null;
        const condition = statement.condition;
        if (condition?.kind !== 'binary' || condition.operator !== '<' || condition.left?.kind !== 'reference' || condition.left.path.length !== 1) continue;
        const indexName = condition.left.path[0];
        const countObject = countSource(condition.right);
        if (!countObject || statement.body.length !== 2) continue;
        const operation = statement.body[0];
        const latch = statement.body[1];
        if (operation.kind !== 'index_assign' || expressionType(operation.target) !== 'f32') continue;
        if (!sameVariable(operation.target.index, indexName)) continue;
        if (latch.kind !== 'assign' || latch.name !== indexName || latch.expression?.kind !== 'binary'
            || latch.expression.operator !== '+' || !sameVariable(latch.expression.left, indexName)
            || latch.expression.right?.kind !== 'literal' || latch.expression.right.value !== 1n) continue;
        const targetKey = referenceKey(operation.target.object);
        const countKey = referenceKey(countObject);
        if (!targetKey || targetKey !== countKey) continue;
        const tables = [];
        if (!collectVectorTables(operation.expression, indexName, tables)) continue;
        if (!tables.some((entry) => entry.key === targetKey)) tables.push({ key: targetKey, object: operation.target.object, index: operation.target, packed: operation.target.packedStruct || null });
        const registers = this.vectorRegisterNeed(operation.expression);
        if (registers > 6) continue;
        operation.target.boundsCheckElided = true;
        for (const table of tables) table.index.boundsCheckElided = true;
        statement.vectorPlan = {
          indexName,
          indexVariable: condition.left.resolvedReference?.variable || fn.variables.get(indexName),
          operation,
          tables,
          registerNeed: registers,
        };
        if (!previouslyVectorized) this.stats.vectorizedLoops += 1;
      }
    };
    process(fn.body);
  }

  markStackAllocatableObjects(fn) {
    for (const statement of fn.body) {
      if (statement.kind === 'local') {
        statement.stackAllocateStruct = null;
        if (statement.variable) { statement.variable.stackObjectSize = 0; statement.variable.stackObjectOffset = null; }
      }
    }
    const candidates = [];
    const findCandidates = (statements) => {
      for (const statement of statements) {
        if (statement.kind === 'local' && statement.expression?.kind === 'call') {
          let callable = statement.expression.resolvedCallable;
          if (!callable) {
            try { callable = this.program.resolveCallable(fn.module, statement.expression, { variables: fn.variables }); } catch { callable = null; }
          }
          if (callable?.kind === 'struct_new' && callable.struct.size > 0 && callable.struct.size <= 4096) candidates.push({ statement, variable: statement.variable, struct: callable.struct });
        }
        if (statement.kind === 'if') {
          statement.branches.forEach((branch) => findCandidates(branch.body));
          findCandidates(statement.elseBody);
        } else if (statement.kind === 'while') findCandidates(statement.body);
      }
    };
    findCandidates(fn.body);
    const expressionEscapes = (expr, variableName, allowBareDestroy = false) => {
      if (!expr) return false;
      if (expr.kind === 'reference') {
        if (expr.path[0] !== variableName) return false;
        if (expr.path.length > 1) return false;
        return !allowBareDestroy;
      }
      if (expr.kind === 'unary') return expressionEscapes(expr.expression, variableName, false);
      if (expr.kind === 'binary') return expressionEscapes(expr.left, variableName, false) || expressionEscapes(expr.right, variableName, false);
      if (expr.kind === 'index') return expressionEscapes(expr.object, variableName, false) || expressionEscapes(expr.index, variableName, false);
      if (expr.kind === 'call') {
        let callable = expr.resolvedCallable;
        if (!callable) {
          try { callable = this.program.resolveCallable(fn.module, expr, { variables: fn.variables }); } catch { callable = null; }
        }
        const args = callArguments(expr);
        for (let index = 0; index < args.length; index += 1) {
          const safeDestroy = callable?.kind === 'struct_destroy' && index === 0;
          if (expressionEscapes(args[index], variableName, safeDestroy)) return true;
        }
        return false;
      }
      if (expr.kind === 'table_literal') return (expr.entries || []).some((entry) => expressionEscapes(entry.expression, variableName, false));
      return false;
    };
    const statementsEscape = (statements, candidateStatement, variableName) => {
      for (const statement of statements) {
        if (statement === candidateStatement) continue;
        if ((statement.kind === 'local' || statement.kind === 'assign') && statement.name === variableName) return true;
        if (statement.kind === 'field_assign') {
          if (statement.targetPath?.[0] !== variableName && expressionEscapes(statement.expression, variableName, false)) return true;
        } else if (statement.kind === 'index_assign') {
          if (expressionEscapes(statement.target.object, variableName, false) || expressionEscapes(statement.target.index, variableName, false)
              || expressionEscapes(statement.expression, variableName, false)) return true;
        } else if (statement.expression && expressionEscapes(statement.expression, variableName, false)) return true;
        if (statement.kind === 'if') {
          for (const branch of statement.branches) {
            if (expressionEscapes(branch.condition, variableName, false) || statementsEscape(branch.body, candidateStatement, variableName)) return true;
          }
          if (statementsEscape(statement.elseBody, candidateStatement, variableName)) return true;
        } else if (statement.kind === 'while') {
          if (expressionEscapes(statement.condition, variableName, false) || statementsEscape(statement.body, candidateStatement, variableName)) return true;
        }
      }
      return false;
    };
    for (const candidate of candidates) {
      if (!candidate.variable || statementsEscape(fn.body, candidate.statement, candidate.variable.name)) continue;
      candidate.statement.stackAllocateStruct = candidate.struct;
      candidate.variable.stackObjectSize = candidate.struct.size;
      if (!candidate.statement.stackAllocationCounted) {
        candidate.statement.stackAllocationCounted = true;
        this.stats.stackObjects += 1;
      }
    }
  }

  countExpressionNodes(expr) {
    if (!expr) return 0;
    if (expr.kind === 'literal' || expr.kind === 'reference') return 1;
    if (expr.kind === 'unary') return 1 + this.countExpressionNodes(expr.expression);
    if (expr.kind === 'binary') return 1 + this.countExpressionNodes(expr.left) + this.countExpressionNodes(expr.right);
    if (expr.kind === 'call') return 1 + callArguments(expr).reduce((sum, arg) => sum + this.countExpressionNodes(arg), 0);
    return 1;
  }

  expressionReferencesOnly(expr, allowed) {
    if (!expr) return true;
    if (expr.kind === 'reference') return expr.path.length >= 1 && allowed.has(expr.path[0]);
    if (expr.kind === 'literal') return true;
    if (expr.kind === 'unary') return this.expressionReferencesOnly(expr.expression, allowed);
    if (expr.kind === 'binary') return this.expressionReferencesOnly(expr.left, allowed) && this.expressionReferencesOnly(expr.right, allowed);
    return false;
  }

  substituteInlineExpression(expr, replacements) {
    if (expr.kind === 'reference' && expr.path.length >= 1 && replacements.has(expr.path[0])) {
      const replacement = this.cloneExpression(replacements.get(expr.path[0]));
      if (expr.path.length === 1) return replacement;
      if (replacement.kind !== 'reference') return this.cloneExpression(expr);
      return {
        ...this.cloneExpression(expr),
        path: [...replacement.path, ...expr.path.slice(1)],
        resolvedReference: null,
      };
    }
    const result = this.cloneExpression(expr);
    if (result.kind === 'unary') result.expression = this.substituteInlineExpression(result.expression, replacements);
    else if (result.kind === 'binary') {
      result.left = this.substituteInlineExpression(result.left, replacements);
      result.right = this.substituteInlineExpression(result.right, replacements);
    }
    return result;
  }

  inlineSmallFunctions() {
    const candidates = new Map();
    const inlineNodeLimit = this.level >= 6 ? 72 : (this.level >= 5 ? 40 : 20);
    for (const module of this.program.moduleOrder) {
      for (const fn of module.functions.values()) {
        if (fn === this.entryFunction || fn.body.length === 0) continue;
        if (this.level < 6 && fn.body.length !== 1) continue;
        const final = fn.body[fn.body.length - 1];
        if (final.kind !== 'return' || !final.expression) continue;
        const replacements = new Map();
        const allowed = new Set(fn.params.map((param) => param.name));
        let valid = true;
        for (let index = 0; index < fn.body.length - 1; index += 1) {
          const statement = fn.body[index];
          if (!['local', 'assign'].includes(statement.kind) || !this.pureInvariantExpression(statement.expression)
              || !this.expressionReferencesOnly(statement.expression, allowed)) { valid = false; break; }
          const expanded = this.substituteInlineExpression(statement.expression, replacements);
          replacements.set(statement.name, expanded);
          allowed.add(statement.name);
        }
        if (!valid || !this.expressionReferencesOnly(final.expression, allowed)) continue;
        const expression = this.substituteInlineExpression(final.expression, replacements);
        const candidateLimit = Number(fn.profileCount || 0) > 0 && this.level >= 6 ? 256 : inlineNodeLimit;
        if (this.countExpressionNodes(expression) > candidateLimit) continue;
        candidates.set(fn, expression);
      }
    }
    const rewriteExpression = (expr, caller) => {
      if (!expr) return expr;
      if (expr.kind === 'unary') expr.expression = rewriteExpression(expr.expression, caller);
      else if (expr.kind === 'binary') {
        expr.left = rewriteExpression(expr.left, caller);
        expr.right = rewriteExpression(expr.right, caller);
      } else if (expr.kind === 'call') {
        expr.args = expr.args.map((arg) => rewriteExpression(arg, caller));
        if (expr.effectiveArgs) {
          const receiverCount = Math.max(0, expr.effectiveArgs.length - expr.args.length);
          const receivers = expr.effectiveArgs.slice(0, receiverCount).map((arg) => rewriteExpression(arg, caller));
          expr.effectiveArgs = [...receivers, ...expr.args];
        }
        const callable = expr.resolvedCallable;
        const target = callable?.kind === 'internal' ? callable.target : null;
        const template = target ? candidates.get(target) : null;
        const actualArgs = callArguments(expr);
        const conversionFreeArgs = template && actualArgs.length === target.params.length
          && actualArgs.every((arg, index) => canonicalTypeName(expressionType(arg)) === canonicalTypeName(target.params[index].type));
        const hotTarget = Number(target?.profileCount || 0) > 0;
        const simpleArguments = actualArgs.every(isSimpleLoadExpression);
        if (template && target !== caller && conversionFreeArgs && simpleArguments
            && (hotTarget || this.countExpressionNodes(template) <= inlineNodeLimit)) {
          const replacements = new Map();
          target.params.forEach((param, index) => replacements.set(param.name, actualArgs[index]));
          this.stats.functionsInlined += 1;
          return this.substituteInlineExpression(template, replacements);
        }
      }
      return expr;
    };
    const rewriteStatements = (statements, fn) => {
      for (const statement of statements) {
        if (statement.expression) statement.expression = rewriteExpression(statement.expression, fn);
        if (statement.kind === 'index_assign') {
          statement.target.object = rewriteExpression(statement.target.object, fn);
          statement.target.index = rewriteExpression(statement.target.index, fn);
        }
        if (statement.kind === 'if') {
          for (const branch of statement.branches) {
            branch.condition = rewriteExpression(branch.condition, fn);
            rewriteStatements(branch.body, fn);
          }
          rewriteStatements(statement.elseBody, fn);
        } else if (statement.kind === 'while') {
          statement.condition = rewriteExpression(statement.condition, fn);
          rewriteStatements(statement.body, fn);
        }
      }
    };
    const inlinePassLimit = this.level >= 6 ? 16 : (this.level >= 5 ? 8 : 4);
    for (let pass = 0; pass < inlinePassLimit; pass += 1) {
      const before = this.stats.functionsInlined;
      for (const module of this.program.moduleOrder) for (const fn of module.functions.values()) rewriteStatements(fn.body, fn);
      if (this.stats.functionsInlined === before) break;
    }
  }

  markReachableFunctions() {
    for (const module of this.program.moduleOrder) for (const fn of module.functions.values()) fn.reachable = false;
    const destroyWalked = new Set();
    const queueDestroyImplementation = (struct, queue) => {
      if (!struct || destroyWalked.has(struct)) return;
      destroyWalked.add(struct);
      this.program.resolveStructLayout(struct);
      const customDestroy = struct.methods.get('destroy');
      if (customDestroy && !customDestroy.isStatic) {
        if (!customDestroy.reachable) queue.push(customDestroy);
        return;
      }
      for (const field of struct.fieldOrder) {
        if (field.typeInfo.kind === 'struct') queueDestroyImplementation(field.typeInfo.struct, queue);
      }
    };
    const visitExpression = (expr, queue) => {
      if (!expr) return;
      if (expr.kind === 'reference') {
        const resolved = expr.resolvedReference;
        if (resolved?.kind === 'function' && !resolved.target.reachable) queue.push(resolved.target);
      } else if (expr.kind === 'call') {
        const callable = expr.resolvedCallable;
        if (callable?.kind === 'internal' && !callable.target.reachable) queue.push(callable.target);
        else if (callable?.kind === 'struct_destroy') queueDestroyImplementation(callable.struct, queue);
        callArguments(expr).forEach((arg) => visitExpression(arg, queue));
      } else if (expr.kind === 'binary') {
        visitExpression(expr.left, queue); visitExpression(expr.right, queue);
      } else if (expr.kind === 'unary') visitExpression(expr.expression, queue);
      else if (expr.kind === 'index') { visitExpression(expr.object, queue); visitExpression(expr.index, queue); }
      else if (expr.kind === 'table_literal') expr.entries.forEach((entry) => { if (entry.expression.kind !== 'function_expression') visitExpression(entry.expression, queue); });
    };
    const visitStatements = (statements, queue) => {
      for (const statement of statements) {
        if (statement.expression) visitExpression(statement.expression, queue);
        if (statement.kind === 'index_assign') { visitExpression(statement.target.object, queue); visitExpression(statement.target.index, queue); }
        if (statement.kind === 'if') {
          for (const branch of statement.branches) {
            visitExpression(branch.condition, queue);
            visitStatements(branch.body, queue);
          }
          visitStatements(statement.elseBody, queue);
        } else if (statement.kind === 'while') {
          visitExpression(statement.condition, queue);
          visitStatements(statement.body, queue);
        }
      }
    };
    const queue = this.entryFunction ? [this.entryFunction] : [];
    // Struct destructors are emitted as runtime entry points for every packed
    // type, so every explicit destroy implementation they reference must also
    // survive dead-function stripping. Their bodies are then traversed normally
    // to retain helper functions and imports used during cleanup.
    for (const module of this.program.moduleOrder) for (const struct of module.structs.values()) {
      const customDestroy = struct.methods.get('destroy');
      if (customDestroy && !customDestroy.isStatic) queue.push(customDestroy);
    }
    while (queue.length > 0) {
      const fn = queue.pop();
      if (fn.reachable) continue;
      fn.reachable = true;
      visitStatements(fn.body, queue);
    }
    let total = 0;
    let reachable = 0;
    for (const module of this.program.moduleOrder) for (const fn of module.functions.values()) {
      total += 1;
      if (fn.reachable) reachable += 1;
    }
    this.stats.functionsStripped = total - reachable;
  }

  collectRuntimeUsage() {
    const priorExternCount = this.program.imports.size;
    this.program.usesBuiltins = new Set();
    this.program.usedExternImports = new Set();
    const scanExpression = (expr) => {
      if (!expr) return;
      if (expr.kind === 'call') {
        const callable = expr.resolvedCallable;
        if (callable?.kind === 'builtin') this.program.usesBuiltins.add(callable.target.name);
        else if (callable?.kind === 'extern') this.program.usedExternImports.add(callable.target.importKey);
        else if (callable?.kind === 'struct_new' || callable?.kind === 'struct_clone') this.program.usesBuiltins.add('memory.alloc');
        else if (callable?.kind === 'struct_destroy') this.program.usesBuiltins.add('memory.free');
        else if (callable?.kind === 'struct_table') this.program.usesBuiltins.add('table.create');
        else if (callable?.kind === 'table_get' || callable?.kind === 'table_push') this.program.usesBuiltins.add('table.create');
        callArguments(expr).forEach(scanExpression);
      } else if (expr.kind === 'binary') { scanExpression(expr.left); scanExpression(expr.right); }
      else if (expr.kind === 'unary') scanExpression(expr.expression);
      else if (expr.kind === 'index') { this.program.usesBuiltins.add('table.create'); scanExpression(expr.object); scanExpression(expr.index); }
      else if (expr.kind === 'table_literal') {
        if (expr.sequenceCreate) this.program.usesBuiltins.add('table.create');
        else this.program.usesBuiltins.add('memory.alloc');
        expr.entries.forEach((entry) => { if (entry.expression.kind !== 'function_expression') scanExpression(entry.expression); });
      }
    };
    const scanStatements = (statements) => {
      for (const statement of statements) {
        if (statement.expression) scanExpression(statement.expression);
        if (statement.kind === 'index_assign') { this.program.usesBuiltins.add('table.create'); scanExpression(statement.target.object); scanExpression(statement.target.index); }
        if (statement.kind === 'if') {
          statement.branches.forEach((branch) => { scanExpression(branch.condition); scanStatements(branch.body); });
          scanStatements(statement.elseBody);
        } else if (statement.kind === 'while') { scanExpression(statement.condition); scanStatements(statement.body); }
      }
    };
    for (const module of this.program.moduleOrder) for (const fn of module.functions.values()) {
      if (fn.reachable !== false) scanStatements(fn.body);
    }
    this.stats.strippedExternImports = Math.max(0, priorExternCount - this.program.usedExternImports.size);
    const families = ['window', 'memory', 'table', 'simd', 'debug', 'console', 'system', 'string', 'thread', 'ffi'];
    const usedFamilies = new Set([...this.program.usesBuiltins].map((name) => name.split('.')[0]));
    this.stats.strippedRuntimeFamilies = families.length - usedFamilies.size;
  }
}

const BUILTINS = new Map();
function builtin(name, params, returnType, label) {
  BUILTINS.set(name, { name, params: params.map((type, i) => ({ name: `arg${i}`, type })), returnType, label });
}

builtin('window.create', ['string', 'i64', 'i64'], 'handle', '__lsx_window_create');
builtin('window.poll', [], 'bool', '__lsx_window_poll');
builtin('window.is_open', [], 'bool', '__lsx_window_is_open');
builtin('window.handle', [], 'handle', '__lsx_window_handle');
builtin('window.hinstance', [], 'handle', '__lsx_window_hinstance');
builtin('window.destroy', [], 'void', '__lsx_window_destroy');
builtin('memory.alloc', ['i64'], 'ptr', '__lsx_memory_alloc');
builtin('memory.free', ['ptr'], 'bool', '__lsx_memory_free');
builtin('memory.release_object', ['ptr'], 'bool', '__lsx_object_free');
builtin('memory.ptr', ['ptr', 'i64'], 'ptr', '__lsx_memory_ptr');
builtin('memory.write_u8', ['ptr', 'i64', 'i64'], 'void', '__lsx_memory_write_u8');
builtin('memory.write_u16', ['ptr', 'i64', 'i64'], 'void', '__lsx_memory_write_u16');
builtin('memory.write_u32', ['ptr', 'i64', 'i64'], 'void', '__lsx_memory_write_u32');
builtin('memory.write_u64', ['ptr', 'i64', 'i64'], 'void', '__lsx_memory_write_u64');
builtin('memory.write_f32', ['ptr', 'i64', 'f32'], 'void', '__lsx_memory_write_f32');
builtin('memory.read_u8', ['ptr', 'i64'], 'u64', '__lsx_memory_read_u8');
builtin('memory.read_u16', ['ptr', 'i64'], 'u64', '__lsx_memory_read_u16');
builtin('memory.read_u32', ['ptr', 'i64'], 'u64', '__lsx_memory_read_u32');
builtin('memory.read_u64', ['ptr', 'i64'], 'u64', '__lsx_memory_read_u64');
builtin('memory.read_f32', ['ptr', 'i64'], 'f32', '__lsx_memory_read_f32');
builtin('memory.embed_binary', ['string'], 'ptr', '__lsx_compile_time_embed_binary');
builtin('table.create', ['i64', 'i64'], 'ptr', '__lsx_table_create');
builtin('table.destroy', ['ptr'], 'void', '__lsx_table_destroy');
builtin('table.count', ['ptr'], 'i64', '__lsx_table_count');
builtin('table.capacity', ['ptr'], 'i64', '__lsx_table_capacity');
builtin('table.byte_length', ['ptr'], 'i64', '__lsx_table_byte_length');
builtin('table.data', ['ptr'], 'ptr', '__lsx_table_data');
builtin('table.data_at', ['ptr', 'i64'], 'ptr', '__lsx_table_get_ptr');
builtin('table.copy_from_ptr', ['ptr', 'ptr', 'i64'], 'bool', '__lsx_table_copy_from_ptr');
builtin('table.reserve', ['ptr', 'i64'], 'bool', '__lsx_table_reserve');
builtin('table.resize', ['ptr', 'i64'], 'bool', '__lsx_table_resize');
builtin('table.add_zeroed', ['ptr'], 'ptr', '__lsx_table_add_zeroed');
builtin('table.add_copy', ['ptr', 'ptr'], 'ptr', '__lsx_table_add_copy');
builtin('table.get_ptr', ['ptr', 'i64'], 'ptr', '__lsx_table_get_ptr');
builtin('table.first_ptr', ['ptr'], 'ptr', '__lsx_table_first_ptr');
builtin('table.last_ptr', ['ptr'], 'ptr', '__lsx_table_last_ptr');
builtin('table.is_empty', ['ptr'], 'bool', '__lsx_table_is_empty');
builtin('table.remove_at', ['ptr', 'i64'], 'bool', '__lsx_table_remove_at');
builtin('table.remove_swap', ['ptr', 'i64'], 'bool', '__lsx_table_remove_swap');
builtin('table.pop', ['ptr'], 'bool', '__lsx_table_pop');
builtin('table.clear', ['ptr'], 'void', '__lsx_table_clear');
builtin('simd.copy_f32x4', ['ptr', 'ptr'], 'void', '__lsx_simd_copy_f32x4');
builtin('simd.add_f32x4', ['ptr', 'ptr', 'ptr'], 'void', '__lsx_simd_add_f32x4');
builtin('simd.sub_f32x4', ['ptr', 'ptr', 'ptr'], 'void', '__lsx_simd_sub_f32x4');
builtin('simd.mul_f32x4', ['ptr', 'ptr', 'ptr'], 'void', '__lsx_simd_mul_f32x4');
builtin('simd.madd_f32x4', ['ptr', 'ptr', 'ptr', 'ptr'], 'void', '__lsx_simd_madd_f32x4');
builtin('simd.scale_f32x4', ['ptr', 'ptr', 'f32'], 'void', '__lsx_simd_scale_f32x4');
builtin('simd.dot_f32x4', ['ptr', 'ptr'], 'f32', '__lsx_simd_dot_f32x4');
builtin('debug.message', ['string', 'string'], 'i32', '__lsx_debug_message');
builtin('debug.output', ['string'], 'void', '__lsx_debug_output');
builtin('console.open', ['string'], 'bool', '__lsx_console_open');
builtin('console.write', ['string'], 'void', '__lsx_console_write');
builtin('console.write_line', ['string'], 'void', '__lsx_console_write_line');
builtin('console.error', ['string'], 'void', '__lsx_console_error');
builtin('console.error_line', ['string'], 'void', '__lsx_console_error_line');
builtin('console.wait', [], 'void', '__lsx_console_wait');
builtin('console.close', [], 'void', '__lsx_console_close');
builtin('system.sleep', ['i64'], 'void', '__lsx_system_sleep');
builtin('system.exit', ['i64'], 'void', '__lsx_system_exit');
builtin('string.length', ['string'], 'i64', '__lsx_string_length');
builtin('string.byte_at', ['string', 'i64'], 'u8', '__lsx_string_byte_at');
builtin('string.data_at', ['string', 'i64'], 'ptr', '__lsx_string_data_at');
builtin('string.equals', ['string', 'string'], 'bool', '__lsx_string_equals');
builtin('string.compare', ['string', 'string'], 'i32', '__lsx_string_compare');
builtin('string.from_utf8', ['ptr'], 'string', '__lsx_string_from_utf8');
builtin('thread.start', ['fnptr', 'ptr'], 'handle', '__lsx_thread_start');
builtin('thread.start_with_stack', ['fnptr', 'ptr', 'i64'], 'handle', '__lsx_thread_start_with_stack');
builtin('thread.join', ['handle'], 'bool', '__lsx_thread_join');
builtin('thread.wait', ['handle', 'i64'], 'u32', '__lsx_thread_wait');
builtin('thread.is_finished', ['handle'], 'bool', '__lsx_thread_is_finished');
builtin('thread.exit_code', ['handle'], 'i64', '__lsx_thread_exit_code');
builtin('thread.close', ['handle'], 'bool', '__lsx_thread_close');
builtin('thread.current_id', [], 'u32', '__lsx_thread_current_id');
builtin('thread.id', ['handle'], 'u32', '__lsx_thread_id');
builtin('thread.current_handle', [], 'handle', '__lsx_thread_current_handle');
builtin('thread.yield', [], 'bool', '__lsx_thread_yield');
builtin('thread.cpu_count', [], 'u32', '__lsx_thread_cpu_count');
builtin('thread.set_priority', ['handle', 'i32'], 'bool', '__lsx_thread_set_priority');
builtin('thread.exit', ['u32'], 'void', '__lsx_thread_exit');

// Native lock-prefixed atomics. These are emitted directly as x64 instructions
// instead of importing the Windows Interlocked macros as DLL entry points.
builtin('atomic.i32_load', ['ptr'], 'i32', '__lsx_atomic_i32_load');
builtin('atomic.i32_store', ['ptr', 'i32'], 'void', '__lsx_atomic_i32_store');
builtin('atomic.i32_exchange', ['ptr', 'i32'], 'i32', '__lsx_atomic_i32_exchange');
builtin('atomic.i32_add', ['ptr', 'i32'], 'i32', '__lsx_atomic_i32_add');
builtin('atomic.i32_increment', ['ptr'], 'i32', '__lsx_atomic_i32_increment');
builtin('atomic.i32_decrement', ['ptr'], 'i32', '__lsx_atomic_i32_decrement');
builtin('atomic.i32_compare_exchange', ['ptr', 'i32', 'i32'], 'i32', '__lsx_atomic_i32_compare_exchange');
builtin('atomic.i64_load', ['ptr'], 'i64', '__lsx_atomic_i64_load');
builtin('atomic.i64_store', ['ptr', 'i64'], 'void', '__lsx_atomic_i64_store');
builtin('atomic.i64_exchange', ['ptr', 'i64'], 'i64', '__lsx_atomic_i64_exchange');
builtin('atomic.i64_add', ['ptr', 'i64'], 'i64', '__lsx_atomic_i64_add');
builtin('atomic.i64_increment', ['ptr'], 'i64', '__lsx_atomic_i64_increment');
builtin('atomic.i64_decrement', ['ptr'], 'i64', '__lsx_atomic_i64_decrement');
builtin('atomic.i64_compare_exchange', ['ptr', 'i64', 'i64'], 'i64', '__lsx_atomic_i64_compare_exchange');
for (let count = 0; count <= 8; count += 1) {
  builtin(`ffi.call${count}`, ['ptr', ...Array(count).fill('i64')], 'i64', `__lsx_ffi_call${count}`);
}

class BinaryBuilder {
  constructor() {
    this.parts = [];
    this.length = 0;
    this.symbols = new Map();
    this.fixups = [];
  }
  mark(name) {
    if (this.symbols.has(name)) throw new Error(`duplicate binary symbol ${name}`);
    this.symbols.set(name, this.length);
    return this.length;
  }
  bytes(data) {
    const buffer = Buffer.from(data);
    const offset = this.length;
    this.parts.push(buffer);
    this.length += buffer.length;
    return offset;
  }
  zeros(size) { return this.bytes(Buffer.alloc(size)); }
  u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(Number(value) & 0xFFFF); return this.bytes(b); }
  u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(Number(BigInt.asUintN(32, BigInt(value)))); return this.bytes(b); }
  u64(value) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt.asUintN(64, BigInt(value))); return this.bytes(b); }
  ascii(text, nul = true) { return this.bytes(Buffer.from(nul ? `${text}\0` : text, 'ascii')); }
  align(alignment, fill = 0) {
    const target = align(this.length, alignment);
    if (target > this.length) this.bytes(Buffer.alloc(target - this.length, fill));
  }
  addFixup(offset, size, symbol, addend = 0) { this.fixups.push({ offset, size, symbol, addend }); }
  build() { return Buffer.concat(this.parts); }
}

const REG = { rax: 0, rcx: 1, rdx: 2, rbx: 3, rsp: 4, rbp: 5, rsi: 6, rdi: 7, r8: 8, r9: 9, r10: 10, r11: 11, r12: 12, r13: 13, r14: 14, r15: 15 };
const XMM = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`xmm${index}`, index]));

class Assembler {
  constructor() {
    this.bytes = [];
    this.labels = new Map();
    this.fixups = [];
    this.uniqueCounter = 0;
  }
  get offset() { return this.bytes.length; }
  unique(prefix = 'L') { return `${prefix}_${this.uniqueCounter++}`; }
  emit(...values) { this.bytes.push(...values.map((v) => Number(v) & 0xFF)); }
  emitU32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(Number(BigInt.asUintN(32, BigInt(value)))); this.emit(...b); }
  emitI32(value) { const b = Buffer.alloc(4); b.writeInt32LE(Number(value)); this.emit(...b); }
  emitU64(value) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt.asUintN(64, BigInt(value))); this.emit(...b); }
  label(name) { if (this.labels.has(name)) throw new Error(`duplicate label ${name}`); this.labels.set(name, this.offset); }
  rel32(target, extraAfter = 0) { const at = this.offset; this.emitU32(0); this.fixups.push({ kind: 'rel32', at, target, extraAfter }); }
  rip32(symbol, extraAfter = 0) { const at = this.offset; this.emitU32(0); this.fixups.push({ kind: 'rip32', at, target: symbol, extraAfter }); }

  rex(w, r = 0, x = 0, b = 0) { this.emit(0x40 | (w ? 8 : 0) | ((r >> 3) ? 4 : 0) | ((x >> 3) ? 2 : 0) | ((b >> 3) ? 1 : 0)); }
  modrm(mod, reg, rm) { this.emit(((mod & 3) << 6) | ((reg & 7) << 3) | (rm & 7)); }
  sib(scale, index, base) { this.emit(((scale & 3) << 6) | ((index & 7) << 3) | (base & 7)); }

  subRsp(value) { this.emit(0x48, 0x81, 0xEC); this.emitU32(value); }
  addRsp(value) { this.emit(0x48, 0x81, 0xC4); this.emitU32(value); }
  ret() { this.emit(0xC3); }
  int3() { this.emit(0xCC); }
  nop() { this.emit(0x90); }
  callLabel(label) { this.emit(0xE8); this.rel32(label); }
  callIat(symbol) { this.emit(0xFF, 0x15); this.rip32(symbol); }
  callReg(regName) { const r = REG[regName]; if (r >= 8) this.rex(false, 0, 0, r); this.emit(0xFF); this.modrm(3, 2, r); }
  jmp(label) { this.emit(0xE9); this.rel32(label); }
  jcc(opcode, label) { this.emit(0x0F, opcode); this.rel32(label); }
  jz(label) { this.jcc(0x84, label); }
  jnz(label) { this.jcc(0x85, label); }
  jl(label) { this.jcc(0x8C, label); }
  jle(label) { this.jcc(0x8E, label); }
  jg(label) { this.jcc(0x8F, label); }
  jge(label) { this.jcc(0x8D, label); }
  jb(label) { this.jcc(0x82, label); }
  jae(label) { this.jcc(0x83, label); }
  jbe(label) { this.jcc(0x86, label); }
  ja(label) { this.jcc(0x87, label); }
  jp(label) { this.jcc(0x8A, label); }

  movRegImm64(regName, value) {
    const r = REG[regName]; this.rex(true, 0, 0, r); this.emit(0xB8 + (r & 7)); this.emitU64(value);
  }
  movRegImm32(regName, value) {
    const r = REG[regName]; if (r >= 8) this.rex(false, 0, 0, r); this.emit(0xB8 + (r & 7)); this.emitU32(value);
  }
  movRegImmSigned32(regName, value) {
    const r = REG[regName]; this.rex(true, 0, 0, r); this.emit(0xC7); this.modrm(3, 0, r); this.emitU32(value);
  }
  movRegImmSmart(regName, value) {
    const v = BigInt(value);
    if (v === 0n) { this.xorRegReg(regName); return; }
    if (v >= 0n && v <= 0xFFFFFFFFn) { this.movRegImm32(regName, v); return; }
    if (v >= -0x80000000n && v <= 0x7FFFFFFFn) { this.movRegImmSigned32(regName, v); return; }
    this.movRegImm64(regName, v);
  }
  movRegReg(destName, srcName) {
    const d = REG[destName], s = REG[srcName]; this.rex(true, s, 0, d); this.emit(0x89); this.modrm(3, s, d);
  }
  xorRegReg(destName, srcName = destName) {
    const d = REG[destName], s = REG[srcName]; this.rex(true, s, 0, d); this.emit(0x31); this.modrm(3, s, d);
  }
  addRegReg(destName, srcName) {
    const d = REG[destName], s = REG[srcName]; this.rex(true, s, 0, d); this.emit(0x01); this.modrm(3, s, d);
  }
  movRegReg32(destName, srcName) {
    const d = REG[destName], s = REG[srcName]; this.emitRexIfNeeded(false, s, d); this.emit(0x89); this.modrm(3, s, d);
  }
  movsxdRegReg32(destName, srcName) {
    const d = REG[destName], s = REG[srcName]; this.rex(true, d, 0, s); this.emit(0x63); this.modrm(3, d, s);
  }
  addRegReg32(destName, srcName) {
    const d = REG[destName], s = REG[srcName]; this.emitRexIfNeeded(false, s, d); this.emit(0x01); this.modrm(3, s, d);
  }
  subRegReg(destName, srcName) {
    const d = REG[destName], s = REG[srcName]; this.rex(true, s, 0, d); this.emit(0x29); this.modrm(3, s, d);
  }
  imulRegReg(destName, srcName) {
    const d = REG[destName], s = REG[srcName]; this.rex(true, d, 0, s); this.emit(0x0F, 0xAF); this.modrm(3, d, s);
  }
  cmpRegReg(leftName, rightName) {
    const l = REG[leftName], r = REG[rightName]; this.rex(true, r, 0, l); this.emit(0x39); this.modrm(3, r, l);
  }
  testRegReg(leftName, rightName = leftName) {
    const l = REG[leftName], r = REG[rightName]; this.rex(true, r, 0, l); this.emit(0x85); this.modrm(3, r, l);
  }
  emitRegImmArithmetic(regName, extension, value) {
    const r = REG[regName];
    const v = BigInt(value);
    this.rex(true, extension, 0, r);
    if (v >= -128n && v <= 127n) {
      this.emit(0x83); this.modrm(3, extension, r); this.emit(Number(BigInt.asUintN(8, v)));
    } else {
      this.emit(0x81); this.modrm(3, extension, r); this.emitU32(v);
    }
  }
  addRegImm32(regName, value) { this.emitRegImmArithmetic(regName, 0, value); }
  addRegImmDword(regName, value) {
    const r = REG[regName];
    const v = BigInt(value);
    if (r >= 8) this.rex(false, 0, 0, r);
    if (v >= -128n && v <= 127n) {
      this.emit(0x83); this.modrm(3, 0, r); this.emit(Number(BigInt.asUintN(8, v)));
    } else {
      this.emit(0x81); this.modrm(3, 0, r); this.emitU32(v);
    }
  }
  subRegImm32(regName, value) { this.emitRegImmArithmetic(regName, 5, value); }
  cmpRegImm32(regName, value) { this.emitRegImmArithmetic(regName, 7, value); }
  imulRegImm32(regName, value) {
    const r = REG[regName];
    const v = BigInt(value);
    this.rex(true, r, 0, r);
    if (v >= -128n && v <= 127n) {
      this.emit(0x6B); this.modrm(3, r, r); this.emit(Number(BigInt.asUintN(8, v)));
    } else {
      this.emit(0x69); this.modrm(3, r, r); this.emitU32(v);
    }
  }
  shlRegImm8(regName, value) { const r = REG[regName]; this.rex(true, 4, 0, r); this.emit(0xC1); this.modrm(3, 4, r); this.emit(value & 0x3F); }
  sarRegImm8(regName, value) { const r = REG[regName]; this.rex(true, 7, 0, r); this.emit(0xC1); this.modrm(3, 7, r); this.emit(value & 0x3F); }
  andRegImm32(regName, value) { this.emitRegImmArithmetic(regName, 4, value); }
  negReg(regName) { const r = REG[regName]; this.rex(true, 3, 0, r); this.emit(0xF7); this.modrm(3, 3, r); }
  cqo() { this.emit(0x48, 0x99); }
  idivReg(regName) { const r = REG[regName]; this.rex(true, 7, 0, r); this.emit(0xF7); this.modrm(3, 7, r); }
  setcc(code) { this.emit(0x0F, code, 0xC0); }
  movzxRaxAl() { this.emit(0x48, 0x0F, 0xB6, 0xC0); }
  movsxdRaxEax() { this.emit(0x48, 0x63, 0xC0); }

  movMemRspReg(offset, srcName) {
    const s = REG[srcName]; this.rex(true, s, 0, REG.rsp); this.emit(0x89); this.modrm(2, s, 4); this.sib(0, 4, 4); this.emitU32(offset);
  }
  movRegMemRsp(destName, offset) {
    const d = REG[destName]; this.rex(true, d, 0, REG.rsp); this.emit(0x8B); this.modrm(2, d, 4); this.sib(0, 4, 4); this.emitU32(offset);
  }
  movMemRspImm32(offset, value) {
    this.emit(0x48, 0xC7, 0x84, 0x24); this.emitU32(offset); this.emitU32(value);
  }
  leaRip(regName, symbolOrLabel) {
    const r = REG[regName]; this.rex(true, r, 0, 0); this.emit(0x8D); this.modrm(0, r, 5); this.rip32(symbolOrLabel);
  }
  movRegRip(regName, symbol) {
    const r = REG[regName]; this.rex(true, r, 0, 0); this.emit(0x8B); this.modrm(0, r, 5); this.rip32(symbol);
  }
  movRipReg(symbol, regName) {
    const r = REG[regName]; this.rex(true, r, 0, 0); this.emit(0x89); this.modrm(0, r, 5); this.rip32(symbol);
  }
  movDwordRipImm(symbol, value) {
    this.emit(0xC7, 0x05); this.rip32(symbol, 4); this.emitU32(value);
  }
  movQwordRipImm32(symbol, value) {
    this.emit(0x48, 0xC7, 0x05); this.rip32(symbol, 4); this.emitU32(value);
  }
  lockIncQwordRip(symbol) {
    this.emit(0xF0, 0x48, 0xFF, 0x05); this.rip32(symbol);
  }
  movEaxRipDword(symbol) { this.emit(0x8B, 0x05); this.rip32(symbol); }
  movDwordRipEax(symbol) { this.emit(0x89, 0x05); this.rip32(symbol); }

  leaRaxRcxPlusRdx() { this.emit(0x48, 0x8D, 0x04, 0x11); }
  storeR8AtRax(size) {
    if (size === 1) this.emit(0x44, 0x88, 0x00);
    else if (size === 2) this.emit(0x66, 0x44, 0x89, 0x00);
    else if (size === 4) this.emit(0x44, 0x89, 0x00);
    else if (size === 8) this.emit(0x4C, 0x89, 0x00);
    else throw new Error(`unsupported store size ${size}`);
  }
  loadRaxAtRax(size) {
    if (size === 1) this.emit(0x0F, 0xB6, 0x00);
    else if (size === 2) this.emit(0x0F, 0xB7, 0x00);
    else if (size === 4) this.emit(0x8B, 0x00);
    else if (size === 8) this.emit(0x48, 0x8B, 0x00);
    else throw new Error(`unsupported load size ${size}`);
  }

  emitRexIfNeeded(w, r, b) {
    if (w || r >= 8 || b >= 8) this.rex(w, r, 0, b);
  }
  emitBaseAddress(mod, regField, base, displacement = 0) {
    this.modrm(mod, regField, base === REG.rsp || base === REG.r12 ? 4 : base);
    if (base === REG.rsp || base === REG.r12) this.sib(0, 4, base);
    if (mod === 1) this.emit(Number(BigInt.asUintN(8, BigInt(displacement))));
    else if (mod === 2) this.emitU32(displacement);
  }
  addressMode(displacement) {
    return displacement >= -128 && displacement <= 127 ? 1 : 2;
  }
  movRegMemBase(destName, baseName, displacement = 0, size = 8) {
    const d = REG[destName], b = REG[baseName];
    if (size === 1 || size === 2) {
      if (size === 2) this.emit(0x66);
      this.emitRexIfNeeded(false, d, b);
      this.emit(0x0F, size === 1 ? 0xB6 : 0xB7);
    } else {
      this.emitRexIfNeeded(size === 8, d, b);
      this.emit(0x8B);
    }
    this.emitBaseAddress(this.addressMode(displacement), d, b, displacement);
  }
  movMemBaseReg(baseName, displacement, srcName, size = 8) {
    const s = REG[srcName], b = REG[baseName];
    if (size === 2) this.emit(0x66);
    this.emitRexIfNeeded(size === 8, s, b);
    this.emit(size === 1 ? 0x88 : 0x89);
    this.emitBaseAddress(this.addressMode(displacement), s, b, displacement);
  }
  leaRegMemBase(destName, baseName, displacement = 0) {
    const d = REG[destName], b = REG[baseName];
    this.emitRexIfNeeded(true, d, b);
    this.emit(0x8D);
    this.emitBaseAddress(this.addressMode(displacement), d, b, displacement);
  }
  atomicXchgMemReg(baseName, regName, size = 8) {
    const b = REG[baseName], r = REG[regName];
    this.emitRexIfNeeded(size === 8, r, b);
    this.emit(0x87);
    this.emitBaseAddress(0, r, b, 0);
  }
  atomicXaddMemReg(baseName, regName, size = 8) {
    const b = REG[baseName], r = REG[regName];
    this.emit(0xF0);
    this.emitRexIfNeeded(size === 8, r, b);
    this.emit(0x0F, 0xC1);
    this.emitBaseAddress(0, r, b, 0);
  }
  atomicCmpxchgMemReg(baseName, regName, size = 8) {
    const b = REG[baseName], r = REG[regName];
    this.emit(0xF0);
    this.emitRexIfNeeded(size === 8, r, b);
    this.emit(0x0F, 0xB1);
    this.emitBaseAddress(0, r, b, 0);
  }

  movdXmmReg32(xmmName, regName) {
    const x = XMM[xmmName], r = REG[regName];
    this.emit(0x66); this.emitRexIfNeeded(false, x, r); this.emit(0x0F, 0x6E); this.modrm(3, x, r);
  }
  movdReg32Xmm(regName, xmmName) {
    const r = REG[regName], x = XMM[xmmName];
    this.emit(0x66); this.emitRexIfNeeded(false, x, r); this.emit(0x0F, 0x7E); this.modrm(3, x, r);
  }
  movssXmmImm(xmmName, value) {
    const bits = Buffer.alloc(4); bits.writeFloatLE(Math.fround(Number(value)), 0);
    this.movRegImm32('rax', bits.readUInt32LE(0));
    this.movdXmmReg32(xmmName, 'rax');
  }
  movssXmmXmm(destName, srcName) {
    const d = XMM[destName], s = XMM[srcName];
    this.emit(0xF3); this.emitRexIfNeeded(false, d, s); this.emit(0x0F, 0x10); this.modrm(3, d, s);
  }
  movssXmmMemRsp(destName, offset) {
    const d = XMM[destName]; this.emit(0xF3); this.emitRexIfNeeded(false, d, REG.rsp); this.emit(0x0F, 0x10);
    this.modrm(2, d, 4); this.sib(0, 4, 4); this.emitU32(offset);
  }
  movssMemRspXmm(offset, srcName) {
    const s = XMM[srcName]; this.emit(0xF3); this.emitRexIfNeeded(false, s, REG.rsp); this.emit(0x0F, 0x11);
    this.modrm(2, s, 4); this.sib(0, 4, 4); this.emitU32(offset);
  }
  movssXmmMemBase(destName, baseName, displacement = 0) {
    const d = XMM[destName], b = REG[baseName]; this.emit(0xF3); this.emitRexIfNeeded(false, d, b); this.emit(0x0F, 0x10);
    this.emitBaseAddress(this.addressMode(displacement), d, b, displacement);
  }
  movssMemBaseXmm(baseName, displacement, srcName) {
    const s = XMM[srcName], b = REG[baseName]; this.emit(0xF3); this.emitRexIfNeeded(false, s, b); this.emit(0x0F, 0x11);
    this.emitBaseAddress(this.addressMode(displacement), s, b, displacement);
  }
  scalarFloatOp(opcode, destName, srcName) {
    const d = XMM[destName], s = XMM[srcName]; this.emit(0xF3); this.emitRexIfNeeded(false, d, s); this.emit(0x0F, opcode); this.modrm(3, d, s);
  }
  addss(dest, src) { this.scalarFloatOp(0x58, dest, src); }
  subss(dest, src) { this.scalarFloatOp(0x5C, dest, src); }
  mulss(dest, src) { this.scalarFloatOp(0x59, dest, src); }
  divss(dest, src) { this.scalarFloatOp(0x5E, dest, src); }
  xorps(destName, srcName = destName) {
    const d = XMM[destName], s = XMM[srcName]; this.emitRexIfNeeded(false, d, s); this.emit(0x0F, 0x57); this.modrm(3, d, s);
  }
  ucomiss(leftName, rightName) {
    const l = XMM[leftName], r = XMM[rightName]; this.emitRexIfNeeded(false, l, r); this.emit(0x0F, 0x2E); this.modrm(3, l, r);
  }
  cvtsi2ss(xmmName, regName) {
    const x = XMM[xmmName], r = REG[regName]; this.emit(0xF3); this.emitRexIfNeeded(true, x, r); this.emit(0x0F, 0x2A); this.modrm(3, x, r);
  }
  cvttss2si(regName, xmmName) {
    const r = REG[regName], x = XMM[xmmName]; this.emit(0xF3); this.emitRexIfNeeded(true, r, x); this.emit(0x0F, 0x2C); this.modrm(3, r, x);
  }
  movdquXmmMemRsp(destName, offset) {
    const d = XMM[destName]; this.emit(0xF3); this.emitRexIfNeeded(false, d, REG.rsp); this.emit(0x0F, 0x6F);
    this.modrm(2, d, 4); this.sib(0, 4, 4); this.emitU32(offset);
  }
  movdquMemRspXmm(offset, srcName) {
    const s = XMM[srcName]; this.emit(0xF3); this.emitRexIfNeeded(false, s, REG.rsp); this.emit(0x0F, 0x7F);
    this.modrm(2, s, 4); this.sib(0, 4, 4); this.emitU32(offset);
  }
  movupsXmmMemBase(destName, baseName, displacement = 0) {
    const d = XMM[destName], b = REG[baseName]; this.emitRexIfNeeded(false, d, b); this.emit(0x0F, 0x10);
    this.emitBaseAddress(this.addressMode(displacement), d, b, displacement);
  }
  movupsMemBaseXmm(baseName, displacement, srcName) {
    const s = XMM[srcName], b = REG[baseName]; this.emitRexIfNeeded(false, s, b); this.emit(0x0F, 0x11);
    this.emitBaseAddress(this.addressMode(displacement), s, b, displacement);
  }
  packedFloatOp(opcode, destName, srcName) {
    const d = XMM[destName], s = XMM[srcName]; this.emitRexIfNeeded(false, d, s); this.emit(0x0F, opcode); this.modrm(3, d, s);
  }
  addps(dest, src) { this.packedFloatOp(0x58, dest, src); }
  subps(dest, src) { this.packedFloatOp(0x5C, dest, src); }
  mulps(dest, src) { this.packedFloatOp(0x59, dest, src); }
  divps(dest, src) { this.packedFloatOp(0x5E, dest, src); }
  movaps(dest, src) { const d = XMM[dest], s = XMM[src]; this.emitRexIfNeeded(false, d, s); this.emit(0x0F, 0x28); this.modrm(3, d, s); }
  shufps(dest, src, immediate) { const d = XMM[dest], s = XMM[src]; this.emitRexIfNeeded(false, d, s); this.emit(0x0F, 0xC6); this.modrm(3, d, s); this.emit(immediate); }

  // Three-byte VEX prefix. Register values use the same numeric mapping as XMM;
  // setting L=1 selects the 256-bit YMM form. vvvv is passed in normal (not
  // inverted) form and is inverted here as required by the encoding.
  vex3(map, pp, w, l, regField, indexField, baseField, vvvv = 0) {
    const r = (regField >> 3) & 1;
    const x = (indexField >> 3) & 1;
    const b = (baseField >> 3) & 1;
    this.emit(0xC4, ((r ^ 1) << 7) | ((x ^ 1) << 6) | ((b ^ 1) << 5) | (map & 0x1F),
      ((w ? 1 : 0) << 7) | (((vvvv ^ 0xF) & 0xF) << 3) | ((l ? 1 : 0) << 2) | (pp & 3));
  }
  vmovupsYmmMemBase(destName, baseName, displacement = 0) {
    const d = XMM[destName.replace('ymm', 'xmm')], b = REG[baseName];
    this.vex3(1, 0, 0, 1, d, 0, b, 0); this.emit(0x10);
    this.emitBaseAddress(this.addressMode(displacement), d, b, displacement);
  }
  vmovupsMemBaseYmm(baseName, displacement, srcName) {
    const s = XMM[srcName.replace('ymm', 'xmm')], b = REG[baseName];
    this.vex3(1, 0, 0, 1, s, 0, b, 0); this.emit(0x11);
    this.emitBaseAddress(this.addressMode(displacement), s, b, displacement);
  }
  vbroadcastssYmmXmm(destName, srcName) {
    const d = XMM[destName.replace('ymm', 'xmm')], src = XMM[srcName.replace('ymm', 'xmm')];
    this.vex3(2, 1, 0, 1, d, 0, src, 0); this.emit(0x18); this.modrm(3, d, src);
  }
  avxPackedFloatOp(opcode, destName, leftName, rightName) {
    const d = XMM[destName.replace('ymm', 'xmm')];
    const l = XMM[leftName.replace('ymm', 'xmm')];
    const r = XMM[rightName.replace('ymm', 'xmm')];
    this.vex3(1, 0, 0, 1, d, 0, r, l); this.emit(opcode); this.modrm(3, d, r);
  }
  vaddps(dest, left, right) { this.avxPackedFloatOp(0x58, dest, left, right); }
  vsubps(dest, left, right) { this.avxPackedFloatOp(0x5C, dest, left, right); }
  vmulps(dest, left, right) { this.avxPackedFloatOp(0x59, dest, left, right); }
  vdivps(dest, left, right) { this.avxPackedFloatOp(0x5E, dest, left, right); }
  vfmadd231ps(destName, leftName, rightName) {
    const d = XMM[destName.replace('ymm', 'xmm')];
    const l = XMM[leftName.replace('ymm', 'xmm')];
    const r = XMM[rightName.replace('ymm', 'xmm')];
    this.vex3(2, 1, 0, 1, d, 0, r, l); this.emit(0xB8); this.modrm(3, d, r);
  }
  vzeroupper() { this.emit(0xC5, 0xF8, 0x77); }

  build(textRva, symbolRvas) {
    const buffer = Buffer.from(this.bytes);
    const resolve = (target) => {
      if (this.labels.has(target)) return textRva + this.labels.get(target);
      if (symbolRvas.has(target)) return symbolRvas.get(target);
      throw new Error(`unresolved code symbol '${target}'`);
    };
    for (const fixup of this.fixups) {
      const targetRva = resolve(fixup.target);
      const next = textRva + fixup.at + 4 + (fixup.extraAfter || 0);
      buffer.writeInt32LE(targetRva - next, fixup.at);
    }
    return buffer;
  }
}

function estimateExpressionTemps(expr, optimizationLevel = 0) {
  if (!expr) return 0;
  if (expr.kind === 'literal' || expr.kind === 'reference') return 0;
  if (expr.kind === 'unary') return estimateExpressionTemps(expr.expression, optimizationLevel);
  if (expr.kind === 'binary') {
    const leftTemps = estimateExpressionTemps(expr.left, optimizationLevel);
    const rightTemps = estimateExpressionTemps(expr.right, optimizationLevel);
    if (expr.operator === 'and' || expr.operator === 'or') return Math.max(leftTemps, rightTemps);

    const usesFloatPath = isFloatType(expressionType(expr))
      || isFloatType(expressionType(expr.left))
      || isFloatType(expressionType(expr.right));
    // O1+ evaluates a simple right operand directly into a scratch register. The
    // old estimator always reserved a float stack slot and, conversely, skipped
    // an integer slot at O0 even though O0 still used one. Keep frame sizing tied
    // to the code path actually emitted.
    if (optimizationLevel >= 1 && isSimpleLoadExpression(expr.right)) return Math.max(leftTemps, rightTemps);
    if (usesFloatPath) return 1 + Math.max(leftTemps, rightTemps);
    return 1 + Math.max(leftTemps, rightTemps);
  }
  if (expr.kind === 'call') {
    const args = callArguments(expr);
    const nested = args.reduce((max, arg) => Math.max(max, estimateExpressionTemps(arg, optimizationLevel)), 0);
    return args.length + nested;
  }
  // Non-simple indexed access keeps the object in slot zero and starts nested
  // object/index evaluation at slot two.
  if (expr.kind === 'index') return 2 + Math.max(
    estimateExpressionTemps(expr.object, optimizationLevel),
    estimateExpressionTemps(expr.index, optimizationLevel),
  );
  if (expr.kind === 'table_literal') {
    const nested = (expr.entries || []).reduce((maximum, entry) => entry.expression?.kind === 'function_expression'
      ? maximum : Math.max(maximum, estimateExpressionTemps(entry.expression, optimizationLevel)), 0);
    return 2 + nested;
  }
  return 0;
}

function isCheapLoopCondition(expr) {
  if (!expr) return false;
  if (expr.kind === 'reference' || expr.kind === 'literal') return true;
  if (expr.kind === 'unary' && expr.operator === 'not') return isCheapLoopCondition(expr.expression);
  return expr.kind === 'binary'
    && ['==', '~=', '<', '<=', '>', '>='].includes(expr.operator)
    && isSimpleLoadExpression(expr.left)
    && isSimpleLoadExpression(expr.right);
}

function statementAlwaysTerminates(statement) {
  if (!statement) return false;
  if (statement.kind === 'return' || statement.kind === 'break') return true;
  if (statement.kind === 'if') {
    if (!statement.elseBody || statement.elseBody.length === 0) return false;
    return statement.branches.every((branch) => blockAlwaysTerminates(branch.body)) && blockAlwaysTerminates(statement.elseBody);
  }
  return false;
}

function blockAlwaysTerminates(statements) {
  return statements.length > 0 && statementAlwaysTerminates(statements[statements.length - 1]);
}

function analyzeFunction(fn, optimizationLevel = 2, optimizationStats = null) {
  const locals = [];
  const referencedVariables = new Set();
  const accessScores = new Map();
  const liveIntervals = new Map();
  let sequence = 0;
  let maxArgs = 0;
  let maxTemps = 0;
  let hasCalls = false;
  let hasLoop = false;
  const loopStack = [];
  const tableLoopPlans = [];
  const score = (name, amount) => accessScores.set(name, (accessScores.get(name) || 0) + amount);
  const touch = (name, isDeclaration = false) => {
    const interval = liveIntervals.get(name) || { start: isDeclaration ? sequence : 0, end: sequence };
    if (isDeclaration && !liveIntervals.has(name)) interval.start = sequence;
    interval.end = Math.max(interval.end, sequence);
    liveIntervals.set(name, interval);
    for (const loop of loopStack) loop.touched.add(name);
  };
  fn.params.forEach((param) => liveIntervals.set(param.name, { start: 0, end: 0 }));
  const scanExpression = (expr, loopDepth = 0) => {
    if (!expr) return;
    maxTemps = Math.max(maxTemps, estimateExpressionTemps(expr, optimizationLevel));
    if (expr.kind === 'reference' && expr.path.length >= 1 && fn.variables.has(expr.path[0])) {
      referencedVariables.add(expr.path[0]);
      score(expr.path[0], 2 + loopDepth * 4);
      touch(expr.path[0]);
    } else if (expr.kind === 'call') {
      hasCalls = true;
      const args = callArguments(expr);
      maxArgs = Math.max(maxArgs, args.length);
      args.forEach((arg) => scanExpression(arg, loopDepth));
    } else if (expr.kind === 'binary') {
      scanExpression(expr.left, loopDepth); scanExpression(expr.right, loopDepth);
    } else if (expr.kind === 'unary') scanExpression(expr.expression, loopDepth);
    else if (expr.kind === 'index') { hasCalls = true; scanExpression(expr.object, loopDepth); scanExpression(expr.index, loopDepth); }
    else if (expr.kind === 'table_literal') { hasCalls = true; expr.entries.forEach((entry) => { if (entry.expression.kind !== 'function_expression') scanExpression(entry.expression, loopDepth); }); }
  };
  const scanStatements = (statements, loopDepth = 0) => {
    for (const statement of statements) {
      sequence += 1;
      if (statement.kind === 'local') {
        locals.push(statement.variable); referencedVariables.add(statement.name); score(statement.name, 1 + loopDepth * 2); touch(statement.name, true); scanExpression(statement.expression, loopDepth);
      } else if (statement.kind === 'assign') {
        referencedVariables.add(statement.name); score(statement.name, 1 + loopDepth * 3); touch(statement.name); scanExpression(statement.expression, loopDepth);
      } else if (statement.kind === 'field_assign') {
        const base = statement.targetPath[0];
        referencedVariables.add(base); score(base, 2 + loopDepth * 4); touch(base); scanExpression(statement.expression, loopDepth);
      } else if (statement.kind === 'index_assign') {
        // Index assignment reserves a pointer slot and evaluates both the lookup
        // and assigned expression starting at temporary slot two.
        maxTemps = Math.max(
          maxTemps,
          3, // destination pointer slot zero plus the indexed lookup object slot at two
          4 + estimateExpressionTemps(statement.target.object, optimizationLevel),
          4 + estimateExpressionTemps(statement.target.index, optimizationLevel),
          2 + estimateExpressionTemps(statement.expression, optimizationLevel),
        );
        scanExpression(statement.target.object, loopDepth); scanExpression(statement.target.index, loopDepth); scanExpression(statement.expression, loopDepth);
      } else if (statement.kind === 'expr') scanExpression(statement.expression, loopDepth);
      else if (statement.kind === 'return' && statement.expression) {
        if (statement.tailSelfCall && statement.expression.kind === 'call') {
          const args = callArguments(statement.expression);
          const nested = args.reduce((max, arg) => Math.max(max, estimateExpressionTemps(arg, optimizationLevel)), 0);
          maxTemps = Math.max(maxTemps, args.length + nested);
          args.forEach((arg) => scanExpression(arg, loopDepth));
        } else scanExpression(statement.expression, loopDepth);
      } else if (statement.kind === 'if') {
        statement.branches.forEach((branch) => { scanExpression(branch.condition, loopDepth); scanStatements(branch.body, loopDepth); });
        scanStatements(statement.elseBody, loopDepth);
      } else if (statement.kind === 'while') {
        if (statement.vectorPlan) maxTemps = Math.max(maxTemps, 16);
        if (statement.tableLoopPlan && !tableLoopPlans.includes(statement.tableLoopPlan)) {
          statement.tableLoopPlan.loopDepth = loopDepth;
          tableLoopPlans.push(statement.tableLoopPlan);
        }
        hasLoop = true;
        const loop = { start: sequence, touched: new Set() };
        loopStack.push(loop);
        scanExpression(statement.condition, loopDepth + 1);
        scanStatements(statement.body, loopDepth + 1);
        loopStack.pop();
        const loopEnd = sequence + 1;
        for (const name of loop.touched) {
          const interval = liveIntervals.get(name) || { start: loop.start, end: loopEnd };
          interval.start = Math.min(interval.start, loop.start);
          interval.end = Math.max(interval.end, loopEnd);
          liveIntervals.set(name, interval);
        }
      }
    }
  };
  scanStatements(fn.body);
  const registerCachedTableLoops = tableLoopPlans.filter((plan) => (plan.loopDepth || 0) === 0);
  for (const plan of registerCachedTableLoops) {
    plan.cacheDataRegister = 'rsi';
    plan.cacheCountRegister = 'rdi';
  }
  const params = fn.params.map((param) => fn.variables.get(param.name)).filter((variable) => referencedVariables.has(variable.name));
  const variables = [...params, ...locals];
  // Keep O6's first nonvolatile choices identical to O4 so merely enabling O6
  // cannot perturb otherwise identical hot code. Extra O6 registers are only
  // used for variables hot enough to repay their ABI save/restore cost.
  const integerRegisters = optimizationLevel >= 6
    ? (registerCachedTableLoops.length > 0 ? ['r12', 'r13', 'r14', 'r15', 'rbx'] : ['r12', 'r13', 'r14', 'r15', 'rbx', 'rsi', 'rdi'])
    : ['r12', 'r13', 'r14', 'r15'];
  const floatRegisters = optimizationLevel >= 6
    ? ['xmm6', 'xmm7', 'xmm8', 'xmm9', 'xmm10', 'xmm11', 'xmm12', 'xmm13', 'xmm14', 'xmm15']
    : ['xmm6', 'xmm7', 'xmm8', 'xmm9'];
  const ranked = [...variables].filter((variable) => (accessScores.get(variable.name) || 0) > 1)
    .sort((a, b) => (accessScores.get(b.name) || 0) - (accessScores.get(a.name) || 0));
  const paramsSet = new Set(params);
  const allocateRegisters = (candidates, nonvolatile, volatileLeaf, registerClass) => {
    if (optimizationLevel < 3) return [];
    const assigned = [];
    const availableLeaf = optimizationLevel >= 6 && !hasCalls ? [...volatileLeaf] : [];
    let nonvolatileIndex = 0;
    for (const variable of candidates) {
      const scoreValue = accessScores.get(variable.name) || 0;
      // Leaf locals may live in volatile registers for free. Parameters remain
      // nonvolatile to avoid destructive ABI argument-register shuffles.
      let register = null;
      if (!paramsSet.has(variable) && availableLeaf.length > 0) register = availableLeaf.shift();
      else if (nonvolatileIndex < nonvolatile.length) {
        // The first O4-sized bank preserves existing behavior. O6's expanded
        // bank is reserved for genuinely hot values instead of every candidate.
        if (nonvolatileIndex < 4 || scoreValue >= 6) register = nonvolatile[nonvolatileIndex];
        if (register) nonvolatileIndex += 1;
        else continue;
      }
      if (!register) continue;
      variable.register = register;
      variable.registerClass = registerClass;
      assigned.push(variable);
    }
    return assigned;
  };
  const integerRegisterVariables = allocateRegisters(
    ranked.filter((variable) => !isFloatType(variable.type)), integerRegisters, ['r8', 'r9'], 'gpr',
  );
  const floatRegisterVariables = allocateRegisters(
    ranked.filter((variable) => isFloatType(variable.type)), floatRegisters, ['xmm2', 'xmm3', 'xmm4', 'xmm5'], 'xmm',
  );
  for (const variable of variables) {
    if (!integerRegisterVariables.includes(variable) && !floatRegisterVariables.includes(variable)) { variable.register = null; variable.registerClass = null; }
  }
  const registerVariables = [...integerRegisterVariables, ...floatRegisterVariables];
  if (optimizationStats) optimizationStats.registerVariables = (optimizationStats.registerVariables || 0) + registerVariables.length;

  const extraArgs = Math.max(0, maxArgs - 4);
  const callArea = hasCalls ? 32 + extraArgs * 8 : 0;
  let cursor = callArea;
  const gprSaveOffsets = new Map();
  const volatileGprs = new Set(['rax', 'rcx', 'rdx', 'r8', 'r9', 'r10', 'r11']);
  for (const variable of integerRegisterVariables) {
    if (volatileGprs.has(variable.register)) continue;
    gprSaveOffsets.set(variable.register, cursor);
    cursor += 8;
  }
  if (registerCachedTableLoops.length > 0) {
    for (const register of ['rsi', 'rdi']) {
      if (!gprSaveOffsets.has(register)) { gprSaveOffsets.set(register, cursor); cursor += 8; }
    }
  }
  cursor = align(cursor, 16);
  const xmmSaveOffsets = new Map();
  for (const variable of floatRegisterVariables) {
    const xmmIndex = Number(variable.register.slice(3));
    if (xmmIndex <= 5) continue;
    xmmSaveOffsets.set(variable.register, cursor);
    cursor += 16;
  }
  const stackVariables = variables.filter((variable) => !variable.register);
  const variableBase = align(cursor, 8);
  let stackSlotCount = stackVariables.length;
  // Loop touches were extended across every back-edge above, so spilled
  // values can now share slots safely in both straight-line and loop-heavy code.
  if (optimizationLevel >= 4) {
    const active = [];
    const freeSlots = [];
    let nextSlot = 0;
    const ordered = [...stackVariables].sort((a, b) => (liveIntervals.get(a.name)?.start || 0) - (liveIntervals.get(b.name)?.start || 0));
    for (const variable of ordered) {
      const interval = liveIntervals.get(variable.name) || { start: 0, end: Number.MAX_SAFE_INTEGER };
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index].end < interval.start) {
          freeSlots.push(active[index].slot);
          active.splice(index, 1);
        }
      }
      const slot = freeSlots.length > 0 ? freeSlots.pop() : nextSlot++;
      variable.stackOffset = variableBase + slot * 8;
      active.push({ end: interval.end, slot });
    }
    stackSlotCount = nextSlot;
    if (optimizationStats) optimizationStats.stackSlotsReused = (optimizationStats.stackSlotsReused || 0) + Math.max(0, stackVariables.length - stackSlotCount);
  } else stackVariables.forEach((variable, index) => { variable.stackOffset = variableBase + index * 8; });
  registerVariables.forEach((variable) => { variable.stackOffset = null; });
  let objectCursor = align(variableBase + stackSlotCount * 8, 16);
  for (const variable of variables) {
    if (!variable.stackObjectSize) continue;
    variable.stackObjectOffset = objectCursor;
    objectCursor += align(variable.stackObjectSize, 16);
  }
  for (const param of fn.params) {
    const variable = fn.variables.get(param.name);
    if (!referencedVariables.has(param.name)) { variable.stackOffset = null; variable.register = null; variable.registerClass = null; }
  }
  for (const plan of tableLoopPlans) {
    if (plan.cacheDataRegister) continue;
    plan.cacheDataOffset = objectCursor; objectCursor += 8;
    plan.cacheCountOffset = objectCursor; objectCursor += 8;
  }
  const tempBase = objectCursor;
  // The emitter may start a nested expression at the slot immediately after
  // the deepest estimated temporary. Keep one guarded spill slot so optimized
  // fast paths can safely fall back after final type/reference resolution.
  // Functions with no temporaries keep their zero-sized leaf frame.
  const total = tempBase + (maxTemps + (maxTemps > 0 ? 1 : 0)) * 8;
  const frameSize = hasCalls ? frameSizeFor(total) : (total === 0 ? 0 : align(total, 8));
  return {
    maxArgs, maxTemps, callArea, gprSaveOffsets, xmmSaveOffsets,
    registerVariables, integerRegisterVariables, floatRegisterVariables,
    tempBase, frameSize, variables, hasCalls, hasLoop, tableLoopPlans,
  };
}

class CodeGenerator {
  constructor(program, root, entryFunction, optimizationLevel = 6, optimizationStats = null, options = {}) {
    this.program = program;
    this.root = root;
    this.entryFunction = entryFunction;
    this.optimizationLevel = optimizationLevel;
    this.optimizationStats = optimizationStats || {};
    this.asm = new Assembler();
    this.stringValues = new Map();
    this.binaryValues = new Map();
    this.runtimeImports = new Map();
    this.functionInfo = new Map();
    this.breakLabels = [];
    this.currentFunction = null;
    this.epilogueLabel = null;
    this.functionBodyLabel = null;
    this.activeTableLoopPlans = [];
    this.targetCpu = options.targetCpu || 'baseline';
    this.vectorWidth = this.targetCpu === 'avx2' || this.targetCpu === 'avx2-fma' ? 8 : 4;
    this.useFma = this.targetCpu === 'avx2-fma';
    this.optimizationStats.targetCpu = this.targetCpu;
    this.optimizationStats.vectorWidth = this.vectorWidth;
    this.pgoGeneratePath = options.pgoGeneratePath || null;
    this.pgoRecords = [];
    if (this.pgoGeneratePath) {
      for (const module of this.program.moduleOrder) for (const fn of module.functions.values()) {
        if (fn.reachable === false) continue;
        this.pgoRecords.push({ fn, id: functionProfileId(fn), symbol: `data_pgo_count_${stableId(functionProfileKey(fn))}` });
      }
      this.optimizationStats.pgoInstrumentedFunctions = this.pgoRecords.length;
    }
    this.pgoRecordByFunction = new Map(this.pgoRecords.map((record) => [record.fn, record]));
    this.pgoBlobSize = this.pgoRecords.length ? 16 + this.pgoRecords.length * 16 : 0;
  }

  requireImport(dll, name, returnType = 'i64') {
    const key = `${dll.toLowerCase()}::${name}`;
    if (!this.runtimeImports.has(key)) this.runtimeImports.set(key, { dll, name, returnType, importKey: key });
    return `iat_${stableId(key)}`;
  }

  iatForExtern(ext) { return `iat_${stableId(ext.importKey)}`; }

  tempOffset(info, tempIndex, width = 8) {
    const offset = info.tempBase + tempIndex * 8;
    if (offset < 0 || offset + width > info.frameSize) {
      const functionName = this.currentFunction?.name || '<unknown>';
      throw new CompileError(
        `internal compiler stack-frame overflow in '${functionName}' (temporary ${tempIndex}, offset ${offset}, frame ${info.frameSize})`,
        this.currentFunction?.token,
        this.currentFunction?.module?.filePath,
      );
    }
    return offset;
  }

  internString(value) {
    if (!this.stringValues.has(value)) this.stringValues.set(value, `str_${stableId(value)}_${this.stringValues.size}`);
    return this.stringValues.get(value);
  }

  internBinary(sourcePath, token = null) {
    const absolute = path.resolve(sourcePath);
    let buffer;
    try { buffer = fs.readFileSync(absolute); }
    catch (error) { throw new CompileError(`could not embed binary '${absolute}': ${error.message}`, token); }
    if (buffer.length === 0) throw new CompileError(`cannot embed empty binary '${absolute}'`, token);
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    const key = `${absolute}::${digest}`;
    if (!this.binaryValues.has(key)) {
      this.binaryValues.set(key, {
        symbol: `blob_${stableId(key)}_${this.binaryValues.size}`,
        buffer,
        sourcePath: absolute,
      });
    }
    return this.binaryValues.get(key);
  }

  emitEntry() {
    const a = this.asm;
    const exitIat = this.requireImport('KERNEL32.dll', 'ExitProcess', 'void');
    const setUnhandled = this.requireImport('KERNEL32.dll', 'SetUnhandledExceptionFilter');
    const showCrashMessage = true;
    const messageBox = showCrashMessage ? this.requireImport('USER32.dll', 'MessageBoxA') : null;
    const createFile = this.requireImport('KERNEL32.dll', 'CreateFileA');
    const writeFile = this.requireImport('KERNEL32.dll', 'WriteFile');
    const flushFile = this.requireImport('KERNEL32.dll', 'FlushFileBuffers');
    const closeHandle = this.requireImport('KERNEL32.dll', 'CloseHandle');
    const setFilePointer = this.requireImport('KERNEL32.dll', 'SetFilePointerEx');
    const stringLength = this.requireImport('KERNEL32.dll', 'lstrlenA');
    const runtimePath = this.internString('LazyScriptEX-runtime.log');
    const runtimeStart = this.internString('[START] Native program entered main.\r\n');
    const runtimeExit = this.internString('[EXIT] main returned normally.\r\n');
    const runtimeCrash = this.internString('[CRASH] Unhandled native exception before normal exit.\r\n');
    const crashText = showCrashMessage ? this.internString('LazyScriptEX encountered a native crash. Check LazyScriptEX-runtime.log and the application log beside the launched build.') : null;
    const crashTitle = showCrashMessage ? this.internString('LazyScriptEX Native Crash') : null;
    const pgoPath = this.pgoGeneratePath ? this.internString(this.pgoGeneratePath) : null;

    a.label('__lsx_entry');
    a.subRsp(0x38);
    a.leaRip('rcx', '__lsx_unhandled_exception');
    a.callIat(setUnhandled);
    a.leaRip('rcx', runtimeStart);
    a.callLabel('__lsx_runtime_log_append');
    a.callLabel(this.entryFunction.label);
    a.movMemRspReg(40, 'rax');
    a.leaRip('rcx', runtimeExit);
    a.callLabel('__lsx_runtime_log_append');
    if (this.pgoGeneratePath) a.callLabel('__lsx_pgo_write');
    a.movRegMemRsp('rcx', 40);
    a.callIat(exitIat);
    a.int3();

    // rcx = zero-terminated text. This intentionally uses only KERNEL32 so every
    // native LSX executable gets a persistent lifecycle/crash record without a VM,
    // managed runtime, or application-side memory code.
    a.label('__lsx_runtime_log_append');
    a.subRsp(0x68);
    a.movMemRspReg(80, 'rcx');
    a.leaRip('rcx', runtimePath);
    a.movRegImm32('rdx', 0x40000000); // GENERIC_WRITE
    a.movRegImm32('r8', 3);           // FILE_SHARE_READ | FILE_SHARE_WRITE
    a.xorRegReg('r9');
    a.movMemRspImm32(32, 4);          // OPEN_ALWAYS
    a.movMemRspImm32(40, 0x80);       // FILE_ATTRIBUTE_NORMAL
    a.movMemRspImm32(48, 0);
    a.callIat(createFile);
    const runtimeLogDone = a.unique('runtime_log_done');
    a.cmpRegImm32('rax', -1);
    a.jz(runtimeLogDone);
    a.movMemRspReg(88, 'rax');

    a.movRegReg('rcx', 'rax');
    a.xorRegReg('rdx');
    a.xorRegReg('r8');
    a.movRegImm32('r9', 2);           // FILE_END
    a.callIat(setFilePointer);

    a.movRegMemRsp('rcx', 80);
    a.callIat(stringLength);
    a.movRegReg('r8', 'rax');
    a.movRegMemRsp('rcx', 88);
    a.movRegMemRsp('rdx', 80);
    a.leaRip('r9', 'data_runtime_written');
    a.movMemRspImm32(32, 0);
    a.callIat(writeFile);

    a.movRegMemRsp('rcx', 88);
    a.callIat(flushFile);
    a.movRegMemRsp('rcx', 88);
    a.callIat(closeHandle);
    a.label(runtimeLogDone);
    a.xorRegReg('rax');
    a.addRsp(0x68);
    a.ret();

    if (this.pgoGeneratePath) {
      a.label('__lsx_pgo_write');
      a.subRsp(0x68);
      a.leaRip('rcx', pgoPath);
      a.movRegImm32('rdx', 0x40000000); // GENERIC_WRITE
      a.movRegImm32('r8', 1);           // FILE_SHARE_READ
      a.xorRegReg('r9');
      a.movMemRspImm32(32, 2);          // CREATE_ALWAYS
      a.movMemRspImm32(40, 0x80);       // FILE_ATTRIBUTE_NORMAL
      a.movMemRspImm32(48, 0);
      a.callIat(createFile);
      const pgoDone = a.unique('pgo_write_done');
      a.cmpRegImm32('rax', -1); a.jz(pgoDone);
      a.movMemRspReg(80, 'rax');
      a.movRegReg('rcx', 'rax');
      a.leaRip('rdx', 'data_pgo_blob');
      a.movRegImm32('r8', this.pgoBlobSize);
      a.leaRip('r9', 'data_runtime_written');
      a.movMemRspImm32(32, 0);
      a.callIat(writeFile);
      a.movRegMemRsp('rcx', 80); a.callIat(flushFile);
      a.movRegMemRsp('rcx', 80); a.callIat(closeHandle);
      a.label(pgoDone);
      a.xorRegReg('rax');
      a.addRsp(0x68);
      a.ret();
    }

    // LONG WINAPI exception_filter(EXCEPTION_POINTERS*).
    a.label('__lsx_unhandled_exception');
    a.subRsp(0x28);
    a.leaRip('rcx', runtimeCrash);
    a.callLabel('__lsx_runtime_log_append');
    if (showCrashMessage) {
      a.xorRegReg('rcx');
      a.leaRip('rdx', crashText);
      a.leaRip('r8', crashTitle);
      a.movRegImm32('r9', 0x10);
      a.callIat(messageBox);
    }
    a.movRegImm32('rax', 1);
    a.addRsp(0x28);
    a.ret();
  }

  canonicalResolvedReference(resolved) {
    if (!resolved || !this.currentFunction?.variables) return resolved;
    if ((resolved.kind === 'variable' || resolved.kind === 'field') && resolved.variable?.name) {
      const current = this.currentFunction.variables.get(resolved.variable.name);
      // Optimizer/inheritance clones may retain semantic links to the source
      // function's variable records. Register assignment belongs to the
      // currently emitted function, so always rebind those references here.
      if (current && current !== resolved.variable) return { ...resolved, variable: current };
    }
    return resolved;
  }

  resolvedReference(expr, module) {
    const resolved = expr.resolvedReference || this.program.resolveReference(module, expr, { variables: this.currentFunction.variables });
    return this.canonicalResolvedReference(resolved);
  }

  isDirectVariableReference(expr, module, variable) {
    if (expr?.kind !== 'reference') return false;
    const resolved = this.resolvedReference(expr, module);
    return resolved.kind === 'variable' && resolved.variable === variable;
  }

  emitScalarFloatBinary(operator, destination, source) {
    const a = this.asm;
    if (operator === '+') a.addss(destination, source);
    else if (operator === '-') a.subss(destination, source);
    else if (operator === '*') a.mulss(destination, source);
    else if (operator === '/') a.divss(destination, source);
    else return false;
    return true;
  }

  directVariableRegister(expr, module, registerClass) {
    if (expr?.kind !== 'reference') return null;
    const resolved = this.resolvedReference(expr, module);
    if (resolved.kind !== 'variable' || resolved.variable.registerClass !== registerClass) return null;
    return resolved.variable.register || null;
  }

  tryCompileDirectSimpleVariableStore(statement, module) {
    if (this.optimizationLevel < 6 || (statement.kind !== 'local' && statement.kind !== 'assign')) return false;
    const variable = statement.variable;
    const expr = statement.expression;
    if (!variable?.register) return false;
    const a = this.asm;
    if (expr.kind === 'literal') {
      if (isFloatType(variable.type)) {
        if (expr.valueType === 'f32') a.movssXmmImm(variable.register, expr.value);
        else if (typeof expr.value === 'bigint') {
          a.movRegImmSmart('rax', expr.value); a.cvtsi2ss(variable.register, 'rax');
        } else return false;
      } else {
        if (typeof expr.value !== 'bigint') return false;
        a.movRegImmSmart(variable.register, expr.value);
      }
      return true;
    }
    if (expr.kind === 'reference') {
      const source = this.directVariableRegister(expr, module, isFloatType(variable.type) ? 'xmm' : 'gpr');
      if (!source) return false;
      if (source !== variable.register) {
        if (isFloatType(variable.type)) a.movssXmmXmm(variable.register, source);
        else a.movRegReg(variable.register, source);
      }
      return true;
    }
    return false;
  }

  tryCompileDirectVariableAssignment(statement, module) {
    if (this.optimizationLevel < 6 || statement.kind !== 'assign') return false;
    const variable = statement.variable;
    const expr = statement.expression;
    if (!variable?.register) return false;
    if (this.isDirectVariableReference(expr, module, variable)) return true;
    if (expr?.kind !== 'binary' || !this.isDirectVariableReference(expr.left, module, variable)) return false;

    const a = this.asm;
    if (isFloatType(variable.type)) {
      if (!['+', '-', '*', '/'].includes(expr.operator)) return false;
      const directSource = this.directVariableRegister(expr.right, module, 'xmm');
      if (directSource) this.emitScalarFloatBinary(expr.operator, variable.register, directSource);
      else {
        if (!this.emitFloatValueToXmm(expr.right, module, 'xmm0')) return false;
        this.emitScalarFloatBinary(expr.operator, variable.register, 'xmm0');
      }
      this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
      return true;
    }

    if (!['+', '-', '*'].includes(expr.operator)) return false;
    if (expr.right.kind === 'literal' && typeof expr.right.value === 'bigint'
        && expr.right.value >= -0x80000000n && expr.right.value <= 0x7FFFFFFFn) {
      if (expr.operator === '+') a.addRegImm32(variable.register, expr.right.value);
      else if (expr.operator === '-') a.subRegImm32(variable.register, expr.right.value);
      else a.imulRegImm32(variable.register, expr.right.value);
      this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
      return true;
    }
    const directSource = this.directVariableRegister(expr.right, module, 'gpr');
    const sourceRegister = directSource || 'rax';
    if (!directSource && !this.emitValueToReg(expr.right, module, sourceRegister)) return false;
    if (expr.operator === '+') a.addRegReg(variable.register, sourceRegister);
    else if (expr.operator === '-') a.subRegReg(variable.register, sourceRegister);
    else a.imulRegReg(variable.register, sourceRegister);
    this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
    return true;
  }

  loadVariableToReg(variable, regName) {
    const a = this.asm;
    if (variable.register) {
      if (variable.registerClass === 'xmm') return false;
      if (variable.register !== regName) a.movRegReg(regName, variable.register);
    } else {
      if (variable.stackOffset === null || variable.stackOffset === undefined) throw new Error(`variable '${variable.name}' has no storage`);
      a.movRegMemRsp(regName, variable.stackOffset);
    }
    return true;
  }

  loadVariableToXmm(variable, xmmName) {
    const a = this.asm;
    if (isFloatType(variable.type)) {
      if (variable.register) {
        if (variable.registerClass !== 'xmm') throw new Error(`float variable '${variable.name}' allocated to non-XMM register`);
        if (variable.register !== xmmName) a.movssXmmXmm(xmmName, variable.register);
      } else {
        if (variable.stackOffset === null || variable.stackOffset === undefined) throw new Error(`variable '${variable.name}' has no storage`);
        a.movssXmmMemRsp(xmmName, variable.stackOffset);
      }
      return true;
    }
    this.loadVariableToReg(variable, 'rax');
    a.cvtsi2ss(xmmName, 'rax');
    return true;
  }

  emitFieldBase(resolved, regName = 'r11') {
    const a = this.asm;
    resolved = this.canonicalResolvedReference(resolved);
    this.loadVariableToReg(resolved.variable, regName);
    for (let index = 0; index < resolved.fields.length - 1; index += 1) {
      const field = resolved.fields[index];
      a.movRegMemBase(regName, regName, field.offset, 8);
    }
    return { base: regName, field: resolved.fields[resolved.fields.length - 1] };
  }

  storeTableLoopCache(plan, dataRegister, countRegister) {
    const a = this.asm;
    if (plan.cacheDataRegister) {
      if (plan.cacheDataRegister !== dataRegister) a.movRegReg(plan.cacheDataRegister, dataRegister);
      if (plan.cacheCountRegister !== countRegister) a.movRegReg(plan.cacheCountRegister, countRegister);
    } else {
      a.movMemRspReg(plan.cacheDataOffset, dataRegister);
      a.movMemRspReg(plan.cacheCountOffset, countRegister);
    }
  }

  setupTableLoopCache(plan, module, info) {
    const a = this.asm;
    if (!this.emitValueToReg(plan.tableObject, module, 'rax')) this.compileAsInteger(plan.tableObject, module, info, 0);
    const empty = a.unique('table_loop_cache_empty');
    const done = a.unique('table_loop_cache_done');
    a.testRegReg('rax'); a.jz(empty);
    a.movRegMemBase('r10', 'rax', 0, 8);
    a.movRegMemBase('r11', 'rax', 8, 8);
    a.jmp(done);
    a.label(empty); a.xorRegReg('r10'); a.xorRegReg('r11');
    a.label(done);
    this.storeTableLoopCache(plan, 'r10', 'r11');
  }

  loadTableLoopData(plan, destination = 'rax') {
    const a = this.asm;
    if (plan.cacheDataRegister) {
      if (destination !== plan.cacheDataRegister) a.movRegReg(destination, plan.cacheDataRegister);
    } else a.movRegMemRsp(destination, plan.cacheDataOffset);
  }

  loadTableLoopCount(plan, destination = 'r11') {
    const a = this.asm;
    if (plan.cacheCountRegister) {
      if (destination !== plan.cacheCountRegister) a.movRegReg(destination, plan.cacheCountRegister);
    } else a.movRegMemRsp(destination, plan.cacheCountOffset);
  }

  compileCachedTableLoopBranch(plan, label, branchWhenTrue) {
    const a = this.asm;
    this.loadVariableToReg(plan.indexVariable, 'rax');
    this.loadTableLoopCount(plan, 'r11');
    a.cmpRegReg('rax', 'r11');
    if (branchWhenTrue) a.jl(label); else a.jge(label);
  }

  emitTableElementPointer(objectExpr, indexExpr, module, info, tempBaseIndex = 0, boundsCheckElided = false, knownStride = 0) {
    const a = this.asm;
    const directObject = this.emitValueToReg(objectExpr, module, 'rcx');
    const directIndex = this.emitValueToReg(indexExpr, module, 'rdx');
    if (!directObject || !directIndex) {
      const objectSlot = this.tempOffset(info, tempBaseIndex);
      this.compileAsInteger(objectExpr, module, info, tempBaseIndex + 2);
      a.movMemRspReg(objectSlot, 'rax');
      this.compileAsInteger(indexExpr, module, info, tempBaseIndex + 2);
      a.movRegReg('rdx', 'rax');
      a.movRegMemRsp('rcx', objectSlot);
    }
    if (this.optimizationLevel >= 6) {
      const invalid = a.unique('table_index_invalid');
      const done = a.unique('table_index_done');
      a.testRegReg('rcx'); a.jz(invalid);
      if (!boundsCheckElided) {
        a.cmpRegImm32('rdx', 0); a.jl(invalid);
        a.movRegMemBase('r8', 'rcx', 8, 8);
        a.cmpRegReg('rdx', 'r8'); a.jge(invalid);
      }
      if (Number.isInteger(knownStride) && knownStride > 0) {
        if (knownStride === 1) a.movRegReg('rax', 'rdx');
        else { a.movRegReg('rax', 'rdx'); a.imulRegImm32('rax', knownStride); }
        this.optimizationStats.constantTableStrides = (this.optimizationStats.constantTableStrides || 0) + 1;
      } else {
        a.movRegMemBase('rax', 'rcx', 24, 8);
        a.imulRegReg('rax', 'rdx');
      }
      a.movRegMemBase('r8', 'rcx', 0, 8);
      a.addRegReg('rax', 'r8');
      a.jmp(done);
      a.label(invalid); a.xorRegReg('rax');
      a.label(done);
      this.optimizationStats.inlineTableOps = (this.optimizationStats.inlineTableOps || 0) + 1;
    } else a.callLabel('__lsx_table_get_ptr');
  }

  emitIndexElementPointer(indexExpr, module, info, tempBaseIndex = 0) {
    const cachedPlan = indexExpr.loopTablePlan;
    if (!indexExpr.packedStruct && cachedPlan && this.activeTableLoopPlans.includes(cachedPlan)) {
      const a = this.asm;
      if (!this.emitValueToReg(indexExpr.index, module, 'rdx')) {
        this.compileAsInteger(indexExpr.index, module, info, tempBaseIndex);
        a.movRegReg('rdx', 'rax');
      }
      this.loadTableLoopData(cachedPlan, 'rax');
      if (cachedPlan.stride !== 1) a.imulRegImm32('rdx', cachedPlan.stride);
      a.addRegReg('rax', 'rdx');
      return;
    }
    if (!indexExpr.packedStruct) {
      this.emitTableElementPointer(indexExpr.object, indexExpr.index, module, info, tempBaseIndex, Boolean(indexExpr.boundsCheckElided), tableElementStorageSize(indexExpr.tableElement));
      return;
    }
    const a = this.asm;
    if (indexExpr.packedField) {
      this.compileAsInteger(indexExpr.object, module, info, tempBaseIndex);
      if (indexExpr.packedField.offset) a.addRegImm32('rax', indexExpr.packedField.offset);
      return;
    }
    const objectSlot = this.tempOffset(info, tempBaseIndex);
    this.compileAsInteger(indexExpr.object, module, info, tempBaseIndex + 2);
    a.movMemRspReg(objectSlot, 'rax');
    this.compileAsInteger(indexExpr.index, module, info, tempBaseIndex + 2);
    const invalid = a.unique('packed_index_invalid');
    const done = a.unique('packed_index_done');
    a.cmpRegImm32('rax', 0); a.jl(invalid);
    a.cmpRegImm32('rax', indexExpr.packedStruct.positionalCount || 0); a.jge(invalid);
    if (indexExpr.packedStruct.positionalStride !== 1) a.imulRegImm32('rax', indexExpr.packedStruct.positionalStride);
    if (indexExpr.packedStruct.positionalDataOffset) a.addRegImm32('rax', indexExpr.packedStruct.positionalDataOffset);
    a.movRegMemRsp('rcx', objectSlot);
    a.addRegReg('rax', 'rcx');
    a.jmp(done);
    a.label(invalid); a.xorRegReg('rax');
    a.label(done);
  }

  emitLoadElementFromPointer(element, resultType = null) {
    const a = this.asm;
    const type = resultType || element.name;
    const missing = a.unique('table_get_missing');
    const done = a.unique('table_get_done');
    a.testRegReg('rax');
    a.jz(missing);
    if (isFloatType(type)) {
      a.movssXmmMemBase('xmm0', 'rax', 0);
      a.jmp(done);
      a.label(missing);
      a.xorps('xmm0');
    } else {
      // Plain scalar records live directly in contiguous table storage and the
      // slot address is the record reference. Object-like records keep stable
      // identity by storing one native pointer per slot.
      if (element.kind !== 'struct' || tableElementUsesReferenceStorage(element)) {
        a.movRegMemBase('rax', 'rax', 0, element.kind === 'struct' ? 8 : (element.size || 8));
      }
      a.jmp(done);
      a.label(missing);
      a.xorRegReg('rax');
    }
    a.label(done);
    return type;
  }

  emitValueToReg(expr, module, regName) {
    const a = this.asm;
    if (expr.kind === 'literal') {
      if (expr.valueType === 'string') a.leaRip(regName, this.internString(expr.value));
      else if (expr.valueType === 'f32') return false;
      else a.movRegImmSmart(regName, expr.value);
      return true;
    }
    if (expr.kind === 'reference') {
      const resolved = this.resolvedReference(expr, module);
      if (resolved.kind === 'function') {
        a.leaRip(regName, resolved.target.label);
        return true;
      }
      if (resolved.kind === 'variable') return this.loadVariableToReg(resolved.variable, regName);
      if (resolved.kind === 'field') {
        if (isFloatType(resolved.type)) return false;
        const address = this.emitFieldBase(resolved, regName === 'r11' ? 'r10' : 'r11');
        a.movRegMemBase(regName, address.base, address.field.offset, address.field.size === 0 ? 8 : address.field.size);
        return true;
      }
      const constant = this.program.resolveConstant(resolved.constant);
      if (constant.type === 'string') a.leaRip(regName, this.internString(constant.value));
      else if (constant.type === 'f32') return false;
      else a.movRegImmSmart(regName, constant.value);
      return true;
    }
    return false;
  }

  emitFloatValueToXmm(expr, module, xmmName) {
    const a = this.asm;
    if (expr.kind === 'literal') {
      if (expr.valueType === 'f32') a.movssXmmImm(xmmName, expr.value);
      else if (typeof expr.value === 'bigint') { a.movRegImmSmart('rax', expr.value); a.cvtsi2ss(xmmName, 'rax'); }
      else return false;
      return true;
    }
    if (expr.kind === 'reference') {
      const resolved = this.resolvedReference(expr, module);
      if (resolved.kind === 'variable') return this.loadVariableToXmm(resolved.variable, xmmName);
      if (resolved.kind === 'field') {
        const address = this.emitFieldBase(resolved, 'r11');
        if (isFloatType(resolved.type)) a.movssXmmMemBase(xmmName, address.base, address.field.offset);
        else { a.movRegMemBase('rax', address.base, address.field.offset, address.field.size); a.cvtsi2ss(xmmName, 'rax'); }
        return true;
      }
      const constant = this.program.resolveConstant(resolved.constant);
      if (constant.type === 'f32') a.movssXmmImm(xmmName, constant.value);
      else if (typeof constant.value === 'bigint') { a.movRegImmSmart('rax', constant.value); a.cvtsi2ss(xmmName, 'rax'); }
      else return false;
      return true;
    }
    return false;
  }

  compileComparisonOperands(left, right, module, info, tempBaseIndex = 0) {
    const a = this.asm;
    if (isFloatType(expressionType(left)) || isFloatType(expressionType(right))) {
      this.compileAsFloat(left, module, info, tempBaseIndex + 1);
      if (this.optimizationLevel >= 1 && this.emitFloatValueToXmm(right, module, 'xmm1')) {
        a.ucomiss('xmm0', 'xmm1');
        this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
        return 'float';
      }
      a.movssMemRspXmm(this.tempOffset(info, tempBaseIndex, 4), 'xmm0');
      this.compileAsFloat(right, module, info, tempBaseIndex + 1);
      a.movssXmmMemRsp('xmm1', this.tempOffset(info, tempBaseIndex, 4));
      a.ucomiss('xmm1', 'xmm0');
      return 'float';
    }
    if (this.optimizationLevel >= 6 && left.kind === 'reference') {
      const resolvedLeft = this.resolvedReference(left, module);
      if (resolvedLeft.kind === 'variable' && resolvedLeft.variable.register && resolvedLeft.variable.registerClass === 'gpr') {
        const leftRegister = resolvedLeft.variable.register;
        if (right.kind === 'literal' && typeof right.value === 'bigint'
            && right.value >= -0x80000000n && right.value <= 0x7FFFFFFFn) {
          if (right.value === 0n) a.testRegReg(leftRegister);
          else a.cmpRegImm32(leftRegister, right.value);
          this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
          return 'integer';
        }
        if (this.emitValueToReg(right, module, 'rax')) {
          a.cmpRegReg(leftRegister, 'rax');
          this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
          return 'integer';
        }
      }
    }
    this.compileAsInteger(left, module, info, tempBaseIndex);
    if (this.optimizationLevel >= 1 && right.kind === 'literal' && typeof right.value === 'bigint'
        && right.value >= -0x80000000n && right.value <= 0x7FFFFFFFn) {
      if (right.value === 0n) a.testRegReg('rax');
      else a.cmpRegImm32('rax', right.value);
      this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
      return 'integer';
    }
    if (this.optimizationLevel >= 1 && this.emitValueToReg(right, module, 'rcx')) {
      a.cmpRegReg('rax', 'rcx');
      this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
      return 'integer';
    }
    const leftSlot = this.tempOffset(info, tempBaseIndex);
    a.movMemRspReg(leftSlot, 'rax');
    this.compileAsInteger(right, module, info, tempBaseIndex + 1);
    a.movRegMemRsp('rcx', leftSlot);
    a.cmpRegReg('rcx', 'rax');
    return 'integer';
  }

  emitFloatComparisonResult(operator) {
    const a = this.asm;
    const makeTrue = a.unique('float_cmp_true');
    const done = a.unique('float_cmp_done');
    a.xorRegReg('rax');
    if (operator === '==') { a.jp(done); a.jz(makeTrue); }
    else if (operator === '~=') { a.jp(makeTrue); a.jnz(makeTrue); }
    else if (operator === '<') { a.jp(done); a.jb(makeTrue); }
    else if (operator === '<=') { a.jp(done); a.jbe(makeTrue); }
    else if (operator === '>') a.ja(makeTrue);
    else if (operator === '>=') a.jae(makeTrue);
    else throw new Error(`unsupported f32 comparison ${operator}`);
    a.jmp(done);
    a.label(makeTrue);
    a.movRegImmSmart('rax', 1n);
    a.label(done);
  }

  emitFloatComparisonJump(operator, whenTrue, label) {
    const a = this.asm;
    const orderedSkip = a.unique('float_cmp_ordered_skip');
    if (whenTrue) {
      if (operator === '==') { a.jp(orderedSkip); a.jz(label); a.label(orderedSkip); }
      else if (operator === '~=') { a.jp(label); a.jnz(label); }
      else if (operator === '<') { a.jp(orderedSkip); a.jb(label); a.label(orderedSkip); }
      else if (operator === '<=') { a.jp(orderedSkip); a.jbe(label); a.label(orderedSkip); }
      else if (operator === '>') a.ja(label);
      else if (operator === '>=') a.jae(label);
      else throw new Error(`unsupported f32 comparison ${operator}`);
      return;
    }
    if (operator === '==') { a.jp(label); a.jnz(label); }
    else if (operator === '~=') { a.jp(orderedSkip); a.jz(label); a.label(orderedSkip); }
    else if (operator === '<') { a.jp(label); a.jae(label); }
    else if (operator === '<=') { a.jp(label); a.ja(label); }
    else if (operator === '>') a.jbe(label);
    else if (operator === '>=') a.jb(label);
    else throw new Error(`unsupported f32 comparison ${operator}`);
  }

  compileJumpIfFalse(expr, label, module, info, tempBaseIndex = 0) {
    const a = this.asm;
    const truth = literalTruthy(expr);
    if (truth === false) { a.jmp(label); return; }
    if (truth === true) return;
    if (expr.kind === 'unary' && expr.operator === 'not') {
      this.compileJumpIfTrue(expr.expression, label, module, info, tempBaseIndex);
      return;
    }
    if (expr.kind === 'binary' && expr.operator === 'and') {
      this.compileJumpIfFalse(expr.left, label, module, info, tempBaseIndex);
      this.compileJumpIfFalse(expr.right, label, module, info, tempBaseIndex);
      return;
    }
    if (expr.kind === 'binary' && expr.operator === 'or') {
      const pass = a.unique('or_pass');
      this.compileJumpIfTrue(expr.left, pass, module, info, tempBaseIndex);
      this.compileJumpIfFalse(expr.right, label, module, info, tempBaseIndex);
      a.label(pass);
      return;
    }
    if (expr.kind === 'binary' && ['==', '~=', '<', '<=', '>', '>='].includes(expr.operator)) {
      const comparisonClass = this.compileComparisonOperands(expr.left, expr.right, module, info, tempBaseIndex);
      if (comparisonClass === 'float') this.emitFloatComparisonJump(expr.operator, false, label);
      else {
        const jumps = { '==': 'jnz', '~=': 'jz', '<': 'jge', '<=': 'jg', '>': 'jle', '>=': 'jl' };
        a[jumps[expr.operator]](label);
      }
      this.optimizationStats.directBranches = (this.optimizationStats.directBranches || 0) + 1;
      return;
    }
    if (isFloatType(expressionType(expr))) {
      this.compileAsFloat(expr, module, info, tempBaseIndex);
      a.xorps('xmm1'); a.ucomiss('xmm0', 'xmm1');
      const nonZero = a.unique('float_truthy_nonzero');
      a.jp(nonZero); a.jz(label); a.label(nonZero);
    } else {
      if (this.optimizationLevel >= 6 && expr.kind === 'reference') {
        const resolved = this.resolvedReference(expr, module);
        if (resolved.kind === 'variable' && resolved.variable.register && resolved.variable.registerClass === 'gpr') {
          a.testRegReg(resolved.variable.register); a.jz(label);
          this.optimizationStats.directBranches = (this.optimizationStats.directBranches || 0) + 1;
          return;
        }
      }
      this.compileAsInteger(expr, module, info, tempBaseIndex);
      a.testRegReg('rax'); a.jz(label);
    }
  }

  compileJumpIfTrue(expr, label, module, info, tempBaseIndex = 0) {
    const a = this.asm;
    const truth = literalTruthy(expr);
    if (truth === true) { a.jmp(label); return; }
    if (truth === false) return;
    if (expr.kind === 'unary' && expr.operator === 'not') {
      this.compileJumpIfFalse(expr.expression, label, module, info, tempBaseIndex);
      return;
    }
    if (expr.kind === 'binary' && expr.operator === 'or') {
      this.compileJumpIfTrue(expr.left, label, module, info, tempBaseIndex);
      this.compileJumpIfTrue(expr.right, label, module, info, tempBaseIndex);
      return;
    }
    if (expr.kind === 'binary' && expr.operator === 'and') {
      const fail = a.unique('and_fail');
      this.compileJumpIfFalse(expr.left, fail, module, info, tempBaseIndex);
      this.compileJumpIfTrue(expr.right, label, module, info, tempBaseIndex);
      a.label(fail);
      return;
    }
    if (expr.kind === 'binary' && ['==', '~=', '<', '<=', '>', '>='].includes(expr.operator)) {
      const comparisonClass = this.compileComparisonOperands(expr.left, expr.right, module, info, tempBaseIndex);
      if (comparisonClass === 'float') this.emitFloatComparisonJump(expr.operator, true, label);
      else {
        const jumps = { '==': 'jz', '~=': 'jnz', '<': 'jl', '<=': 'jle', '>': 'jg', '>=': 'jge' };
        a[jumps[expr.operator]](label);
      }
      this.optimizationStats.directBranches = (this.optimizationStats.directBranches || 0) + 1;
      return;
    }
    if (isFloatType(expressionType(expr))) {
      this.compileAsFloat(expr, module, info, tempBaseIndex);
      a.xorps('xmm1'); a.ucomiss('xmm0', 'xmm1'); a.jp(label); a.jnz(label);
    } else {
      if (this.optimizationLevel >= 6 && expr.kind === 'reference') {
        const resolved = this.resolvedReference(expr, module);
        if (resolved.kind === 'variable' && resolved.variable.register && resolved.variable.registerClass === 'gpr') {
          a.testRegReg(resolved.variable.register); a.jnz(label);
          this.optimizationStats.directBranches = (this.optimizationStats.directBranches || 0) + 1;
          return;
        }
      }
      this.compileAsInteger(expr, module, info, tempBaseIndex);
      a.testRegReg('rax'); a.jnz(label);
    }
  }

  emitResolvedCall(callable) {
    const a = this.asm;
    if (callable.kind === 'internal') a.callLabel(callable.target.label);
    else if (callable.kind === 'extern') {
      a.callIat(this.iatForExtern(callable.target));
      if (callable.target.returnType === 'i32') a.movsxdRaxEax();
      else if (callable.target.returnType === 'void') a.xorRegReg('rax');
    } else if (callable.kind === 'builtin') {
      a.callLabel(callable.target.label);
      if (callable.target.returnType === 'void') a.xorRegReg('rax');
    } else throw new Error(`cannot directly emit special callable ${callable.kind}`);
  }

  compileCall(expr, module, info, tempBaseIndex = 0) {
    const a = this.asm;
    const callable = expr.resolvedCallable || this.program.resolveCallable(module, expr, { variables: this.currentFunction.variables });
    if (callable.kind === 'builtin' && callable.target.name === 'memory.embed_binary') {
      const args = callArguments(expr);
      const source = args[0];
      if (!source || source.kind !== 'literal' || source.valueType !== 'string') {
        throw new CompileError('memory.embed_binary requires a string-literal path', expr.token, module.filePath);
      }
      const blobPath = path.resolve(path.dirname(module.filePath), source.value);
      const blob = this.internBinary(blobPath, source.token || expr.token);
      const copyDone = a.unique('embed_binary_done');
      a.movRegImmSmart('rcx', BigInt(blob.buffer.length));
      a.callLabel('__lsx_memory_alloc');
      a.testRegReg('rax');
      a.jz(copyDone);
      a.movRegReg('rcx', 'rax');
      a.leaRip('rdx', blob.symbol);
      a.movRegImmSmart('r8', BigInt(blob.buffer.length));
      a.callIat(this.requireImport('msvcrt.dll', 'memcpy'));
      a.label(copyDone);
      return 'ptr';
    }
    if (callable.kind === 'struct_size') { a.movRegImmSmart('rax', BigInt(callable.struct.size)); return 'i64'; }
    if (callable.kind === 'packed_length') { a.movRegImmSmart('rax', BigInt(callable.struct.positionalCount || 0)); return 'i64'; }
    if (callable.kind === 'packed_byte_length') { a.movRegImmSmart('rax', BigInt(callable.struct.size || 0)); return 'i64'; }
    if (callable.kind === 'packed_data') {
      this.compileAsInteger(callArguments(expr)[0], module, info, tempBaseIndex);
      if (callable.struct.positionalDataOffset) a.addRegImm32('rax', callable.struct.positionalDataOffset);
      return 'ptr';
    }
    if (callable.kind === 'struct_new') { a.callLabel(callable.struct.newLabel); return callable.returnType; }
    if (callable.kind === 'struct_clone') {
      const source = callArguments(expr)[0];
      this.compileAsInteger(source, module, info, tempBaseIndex);
      a.movRegReg('rcx', 'rax');
      a.callLabel(callable.struct.cloneLabel);
      return callable.returnType;
    }
    if (callable.kind === 'struct_destroy') {
      const receiver = callArguments(expr)[0];
      this.compileAsInteger(receiver, module, info, tempBaseIndex);
      a.movRegReg('rcx', 'rax');
      a.callLabel(callable.struct.destroyLabel);
      return 'bool';
    }
    if (callable.kind === 'struct_table') {
      const capacity = expr.args[0];
      this.compileAsInteger(capacity, module, info, tempBaseIndex);
      a.movRegReg('rdx', 'rax');
      // Tables of closed objects hold native object pointers. Packed structs retain
      // their separate inline-storage path; Struct.table() is pointer storage.
      a.movRegImmSmart('rcx', BigInt(tableElementStorageSize({ kind: 'struct', struct: callable.struct })));
      a.callLabel('__lsx_table_create');
      return callable.returnType;
    }

    if (callable.kind === 'table_get') {
      const args = callArguments(expr);
      this.emitTableElementPointer(args[0], args[1], module, info, tempBaseIndex, false, tableElementStorageSize(callable.tableElement));
      return this.emitLoadElementFromPointer(callable.tableElement, callable.returnType);
    }
    if (this.optimizationLevel >= 6 && callable.kind === 'builtin') {
      const name = callable.target.name;
      const fastHeaderBuiltins = new Set([
        'table.count', 'table.capacity', 'table.byte_length', 'table.data',
        'table.first_ptr', 'table.last_ptr', 'table.is_empty',
      ]);
      if (name === 'table.data_at' || name === 'table.get_ptr') {
        const args = callArguments(expr);
        this.emitTableElementPointer(args[0], args[1], module, info, tempBaseIndex, false, tableElementStorageSize(callable.tableElement));
        if (name === 'table.get_ptr' && callable.tableElement?.kind === 'struct') {
          return this.emitLoadElementFromPointer(callable.tableElement, callable.returnType);
        }
        return callable.returnType;
      }
      if (fastHeaderBuiltins.has(name)) {
        const args = callArguments(expr);
        this.compileAsInteger(args[0], module, info, tempBaseIndex);
        const fail = a.unique('inline_table_header_fail');
        const done = a.unique('inline_table_header_done');
        if (name === 'table.is_empty') {
          const empty = a.unique('inline_table_empty_true');
          a.testRegReg('rax'); a.jz(empty);
          a.movRegMemBase('rax', 'rax', 8, 8);
          a.testRegReg('rax'); a.jz(empty);
          a.xorRegReg('rax'); a.jmp(done);
          a.label(empty); a.movRegImmSmart('rax', 1n);
          a.label(done);
        } else {
          a.testRegReg('rax'); a.jz(fail);
          if (name === 'table.count') a.movRegMemBase('rax', 'rax', 8, 8);
          else if (name === 'table.capacity') a.movRegMemBase('rax', 'rax', 16, 8);
          else if (name === 'table.data') a.movRegMemBase('rax', 'rax', 0, 8);
          else if (name === 'table.byte_length') {
            a.movRegReg('r10', 'rax');
            a.movRegMemBase('rax', 'r10', 8, 8);
            a.movRegMemBase('rdx', 'r10', 24, 8);
            a.imulRegReg('rax', 'rdx');
          } else if (name === 'table.first_ptr') {
            a.movRegMemBase('rdx', 'rax', 8, 8);
            a.testRegReg('rdx'); a.jz(fail);
            a.movRegMemBase('rax', 'rax', 0, 8);
          } else if (name === 'table.last_ptr') {
            a.movRegReg('r10', 'rax');
            a.movRegMemBase('rdx', 'r10', 8, 8);
            a.testRegReg('rdx'); a.jz(fail);
            a.subRegImm32('rdx', 1);
            a.movRegMemBase('rax', 'r10', 24, 8);
            a.imulRegReg('rax', 'rdx');
            a.movRegMemBase('r8', 'r10', 0, 8);
            a.addRegReg('rax', 'r8');
          }
          a.jmp(done);
          a.label(fail); a.xorRegReg('rax');
          a.label(done);
        }
        this.optimizationStats.inlineTableOps = (this.optimizationStats.inlineTableOps || 0) + 1;
        if (callable.tableElement?.kind === 'struct'
            && (name === 'table.first_ptr' || name === 'table.last_ptr')) {
          return this.emitLoadElementFromPointer(callable.tableElement, callable.returnType);
        }
        return callable.returnType;
      }
    }

    if (callable.kind === 'builtin' && callable.tableElement?.kind === 'struct'
        && tableElementUsesReferenceStorage(callable.tableElement)
        && (callable.target.name === 'table.add_zeroed' || callable.target.name === 'table.add_copy')) {
      const args = callArguments(expr);
      const tableSlot = this.tempOffset(info, tempBaseIndex);
      const objectSlot = this.tempOffset(info, tempBaseIndex + 1);
      this.compileAsInteger(args[0], module, info, tempBaseIndex + 2);
      a.movMemRspReg(tableSlot, 'rax');
      if (callable.target.name === 'table.add_zeroed') {
        a.callLabel(callable.tableElement.struct.newLabel);
      } else {
        this.compileAsInteger(args[1], module, info, tempBaseIndex + 2);
      }
      a.movMemRspReg(objectSlot, 'rax');
      a.movRegMemRsp('rcx', tableSlot);
      a.callLabel('__lsx_table_add_zeroed');
      const failed = a.unique('object_table_add_failed');
      const done = a.unique('object_table_add_done');
      a.testRegReg('rax'); a.jz(failed);
      a.movRegMemRsp('r10', objectSlot);
      a.movMemBaseReg('rax', 0, 'r10', 8);
      a.movRegReg('rax', 'r10');
      a.jmp(done);
      a.label(failed);
      if (callable.target.name === 'table.add_zeroed') {
        a.movRegMemRsp('rcx', objectSlot);
        a.callLabel(callable.tableElement.struct.destroyLabel);
      }
      a.xorRegReg('rax');
      a.label(done);
      return callable.returnType;
    }

    if (callable.kind === 'table_push') {
      const args = callArguments(expr);
      const tableSlot = this.tempOffset(info, tempBaseIndex);
      const valueSlot = this.tempOffset(info, tempBaseIndex + 1);
      this.compileAsInteger(args[0], module, info, tempBaseIndex + 2);
      a.movMemRspReg(tableSlot, 'rax');

      if (callable.tableElement.kind === 'struct' && !tableElementUsesReferenceStorage(callable.tableElement)) {
        // Inline scalar records preserve the original value-table contract:
        // push copies the complete record body before the temporary is freed.
        this.compileAsInteger(args[1], module, info, tempBaseIndex + 2);
        a.movRegReg('rdx', 'rax');
        a.movRegMemRsp('rcx', tableSlot);
        a.callLabel('__lsx_table_add_copy');
      } else {
        if (isFloatType(callable.tableElement.name)) {
          this.compileAsFloat(args[1], module, info, tempBaseIndex + 2);
          a.movssMemRspXmm(valueSlot, 'xmm0');
        } else {
          this.compileAsInteger(args[1], module, info, tempBaseIndex + 2);
          a.movMemRspReg(valueSlot, 'rax');
        }
        a.movRegMemRsp('rcx', tableSlot);
        a.callLabel('__lsx_table_add_zeroed');
        const noElement = a.unique('table_push_no_element');
        a.testRegReg('rax');
        a.jz(noElement);
        if (isFloatType(callable.tableElement.name)) {
          a.movssXmmMemRsp('xmm0', valueSlot);
          a.movssMemBaseXmm('rax', 0, 'xmm0');
        } else {
          a.movRegMemRsp('r10', valueSlot);
          a.movMemBaseReg('rax', 0, 'r10', tableElementStorageSize(callable.tableElement));
        }
        a.label(noElement);
      }
      a.movRegMemRsp('rcx', tableSlot);
      a.callLabel('__lsx_table_count');
      return 'i64';
    }

    const args = callArguments(expr);
    const signature = callable.target;
    // The direct-call fast path may only load arguments straight into their
    // ABI register when the source and destination register classes agree.
    // Previously a simple f32 variable passed to an integer/u32/ptr parameter
    // entered this path, emitValueToReg() returned false, and the stale GPR was
    // still used. That corrupted native integer fields such as buffer sizes and image extents.
    const direct = this.optimizationLevel >= 1 && args.every((arg, index) => {
      if (!isSimpleLoadExpression(arg)) return false;
      const expected = canonicalTypeName(signature.params[index].type);
      if (expected === 'ptr' && isTableTypeName(expressionType(arg))) return false;
      return isFloatType(expected) || !isFloatType(expressionType(arg));
    });
    const gprArgs = ['rcx', 'rdx', 'r8', 'r9'];
    if (direct) {
      args.forEach((arg, index) => {
        const expected = canonicalTypeName(signature.params[index].type);
        if (index < 4) {
          if (isFloatType(expected)) this.emitFloatValueToXmm(arg, module, `xmm${index}`);
          else this.emitValueToReg(arg, module, gprArgs[index]);
        } else {
          if (isFloatType(expected)) {
            this.emitFloatValueToXmm(arg, module, 'xmm0');
            a.movssMemRspXmm(32 + (index - 4) * 8, 'xmm0');
          } else {
            this.emitValueToReg(arg, module, 'rax');
            a.movMemRspReg(32 + (index - 4) * 8, 'rax');
          }
        }
      });
      this.optimizationStats.directSimpleCalls = (this.optimizationStats.directSimpleCalls || 0) + 1;
    } else {
      const argBase = tempBaseIndex;
      const nestedBase = argBase + args.length;
      args.forEach((arg, index) => {
        const expected = canonicalTypeName(signature.params[index].type);
        const slot = this.tempOffset(info, argBase + index);
        if (isFloatType(expected)) { this.compileAsFloat(arg, module, info, nestedBase); a.movssMemRspXmm(slot, 'xmm0'); }
        else {
          this.compileAsInteger(arg, module, info, nestedBase);
          if (expected === 'ptr' && isTableTypeName(expressionType(arg))) {
            a.movRegReg('rcx', 'rax');
            a.callLabel('__lsx_table_data');
          }
          a.movMemRspReg(slot, 'rax');
        }
      });
      args.forEach((arg, index) => {
        const expected = canonicalTypeName(signature.params[index].type);
        const slot = this.tempOffset(info, argBase + index);
        if (index < 4) {
          if (isFloatType(expected)) a.movssXmmMemRsp(`xmm${index}`, slot);
          else a.movRegMemRsp(gprArgs[index], slot);
        } else if (isFloatType(expected)) {
          a.movssXmmMemRsp('xmm0', slot); a.movssMemRspXmm(32 + (index - 4) * 8, 'xmm0');
        } else {
          a.movRegMemRsp('rax', slot); a.movMemRspReg(32 + (index - 4) * 8, 'rax');
        }
      });
    }
    this.emitResolvedCall(callable);
    if (callable.kind === 'builtin' && callable.tableElement?.kind === 'struct'
        && (callable.target.name === 'table.get_ptr'
          || callable.target.name === 'table.first_ptr'
          || callable.target.name === 'table.last_ptr')) {
      return this.emitLoadElementFromPointer(callable.tableElement, callable.returnType);
    }
    return callable.returnType || signature.returnType;
  }

  compileAsFloat(expr, module, info, tempBaseIndex = 0) {
    const a = this.asm;
    if (this.emitFloatValueToXmm(expr, module, 'xmm0')) return;
    if (!isFloatType(expressionType(expr))) {
      this.compileAsInteger(expr, module, info, tempBaseIndex);
      a.cvtsi2ss('xmm0', 'rax');
      return;
    }
    if (expr.kind === 'index') {
      this.emitIndexElementPointer(expr, module, info, tempBaseIndex);
      this.emitLoadElementFromPointer(expr.tableElement, expr.inferredType);
      return;
    }
    if (expr.kind === 'unary') {
      this.compileAsFloat(expr.expression, module, info, tempBaseIndex);
      if (expr.operator === '-') { a.xorps('xmm1'); a.subss('xmm1', 'xmm0'); a.movssXmmXmm('xmm0', 'xmm1'); }
      else if (expr.operator === 'not') { a.xorps('xmm1'); a.ucomiss('xmm0', 'xmm1'); a.setcc(0x94); a.movzxRaxAl(); a.cvtsi2ss('xmm0', 'rax'); }
      return;
    }
    if (expr.kind === 'binary') {
      // Keep the left value in XMM0 and materialize a simple right operand in
      // XMM1. This turns the common `a + b` path into two loads plus one scalar
      // operation, with no stack traffic and no final register copy.
      this.compileAsFloat(expr.left, module, info, tempBaseIndex + 1);
      const directSource = this.optimizationLevel >= 6 ? this.directVariableRegister(expr.right, module, 'xmm') : null;
      if (directSource || (this.optimizationLevel >= 1 && this.emitFloatValueToXmm(expr.right, module, 'xmm1'))) {
        if (!this.emitScalarFloatBinary(expr.operator, 'xmm0', directSource || 'xmm1')) {
          throw new Error(`unsupported f32 operator ${expr.operator}`);
        }
        this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
        return;
      }
      const slot = this.tempOffset(info, tempBaseIndex);
      a.movssMemRspXmm(slot, 'xmm0');
      this.compileAsFloat(expr.right, module, info, tempBaseIndex + 1);
      a.movssXmmMemRsp('xmm1', slot);
      if (!this.emitScalarFloatBinary(expr.operator, 'xmm1', 'xmm0')) {
        throw new Error(`unsupported f32 operator ${expr.operator}`);
      }
      a.movssXmmXmm('xmm0', 'xmm1');
      return;
    }
    if (expr.kind === 'call') {
      const returned = this.compileCall(expr, module, info, tempBaseIndex);
      if (!isFloatType(returned)) a.cvtsi2ss('xmm0', 'rax');
      return;
    }
    throw new Error(`unsupported f32 expression ${expr.kind}`);
  }

  compileAsInteger(expr, module, info, tempBaseIndex = 0) {
    const a = this.asm;
    if (isFloatType(expressionType(expr))) {
      this.compileAsFloat(expr, module, info, tempBaseIndex);
      a.cvttss2si('rax', 'xmm0');
      return;
    }
    if (expr.kind === 'table_literal') {
      if (expr.sequenceCreate) {
        const elementSize = tableElementStorageSize(expr.tableElement);
        a.movRegImmSmart('rcx', BigInt(elementSize));
        a.movRegImmSmart('rdx', BigInt(expr.entries.length));
        a.callLabel('__lsx_table_create');
        if (expr.entries.length > 0) {
          const tableSlot = this.tempOffset(info, tempBaseIndex);
          const elementSlot = this.tempOffset(info, tempBaseIndex + 1);
          a.movMemRspReg(tableSlot, 'rax');
          for (const entry of expr.entries) {
            if (expr.tableElement.kind === 'struct' && !tableElementUsesReferenceStorage(expr.tableElement)) {
              this.compileAsInteger(entry.expression, module, info, tempBaseIndex + 2);
              a.movRegReg('rdx', 'rax');
              a.movRegMemRsp('rcx', tableSlot);
              a.callLabel('__lsx_table_add_copy');
            } else {
              a.movRegMemRsp('rcx', tableSlot);
              a.callLabel('__lsx_table_add_zeroed');
              a.movMemRspReg(elementSlot, 'rax');
              if (isFloatType(expr.tableElement.name)) {
                this.compileAsFloat(entry.expression, module, info, tempBaseIndex + 2);
                a.movRegMemRsp('r11', elementSlot);
                const skipStore = a.unique('typed_literal_store_missing');
                a.testRegReg('r11'); a.jz(skipStore);
                a.movssMemBaseXmm('r11', 0, 'xmm0');
                a.label(skipStore);
              } else {
                this.compileAsInteger(entry.expression, module, info, tempBaseIndex + 2);
                a.movRegReg('r10', 'rax');
                a.movRegMemRsp('r11', elementSlot);
                const skipStore = a.unique('typed_literal_store_missing');
                a.testRegReg('r11'); a.jz(skipStore);
                a.movMemBaseReg('r11', 0, 'r10', tableElementStorageSize(expr.tableElement));
                a.label(skipStore);
              }
            }
          }
          a.movRegMemRsp('rax', tableSlot);
        }
      } else {
        a.callLabel(expr.tableStruct.newLabel);
        if (expr.tableStruct.runtimeLiteral && expr.entries.length > 0) {
          const objectSlot = this.tempOffset(info, tempBaseIndex);
          a.movMemRspReg(objectSlot, 'rax');
          for (const entry of expr.entries) {
            if (entry.expression.kind === 'function_expression') continue;
            const field = expr.tableStruct.fields.get(entry.name);
            if (!field) continue;
            if (isFloatType(field.type)) {
              this.compileAsFloat(entry.expression, module, info, tempBaseIndex + 1);
              a.movRegMemRsp('r11', objectSlot);
              a.movssMemBaseXmm('r11', field.offset, 'xmm0');
            } else {
              this.compileAsInteger(entry.expression, module, info, tempBaseIndex + 1);
              a.movRegReg('r10', 'rax');
              a.movRegMemRsp('r11', objectSlot);
              a.movMemBaseReg('r11', field.offset, 'r10', field.size || 8);
            }
          }
          a.movRegMemRsp('rax', objectSlot);
        }
      }
      return;
    }
    if (expr.kind === 'index') {
      this.emitIndexElementPointer(expr, module, info, tempBaseIndex);
      this.emitLoadElementFromPointer(expr.tableElement, expr.inferredType);
      return;
    }
    if (expr.kind === 'binary' && (expr.operator === 'and' || expr.operator === 'or')) {
      this.compileBooleanExpression(expr, module, info, tempBaseIndex);
      return;
    }
    if (this.emitValueToReg(expr, module, 'rax')) return;
    if (expr.kind === 'unary') {
      this.compileAsInteger(expr.expression, module, info, tempBaseIndex);
      if (expr.operator === '-') a.negReg('rax');
      else if (expr.operator === 'not') { a.testRegReg('rax'); a.setcc(0x94); a.movzxRaxAl(); }
      return;
    }
    if (expr.kind === 'binary') {
      if (['==', '~=', '<', '<=', '>', '>='].includes(expr.operator)
          && (isFloatType(expressionType(expr.left)) || isFloatType(expressionType(expr.right)))) {
        this.compileComparisonOperands(expr.left, expr.right, module, info, tempBaseIndex);
        this.emitFloatComparisonResult(expr.operator);
        return;
      }
      if (this.optimizationLevel >= 3 && expr.operator === '*' && expr.right.kind === 'literal' && typeof expr.right.value === 'bigint') {
        const multiplier = expr.right.value;
        const absolute = multiplier < 0n ? -multiplier : multiplier;
        if (absolute > 1n && (absolute & (absolute - 1n)) === 0n) {
          let shift = 0;
          for (let value = absolute; value > 1n; value >>= 1n) shift += 1;
          this.compileAsInteger(expr.left, module, info, tempBaseIndex);
          a.shlRegImm8('rax', shift);
          if (multiplier < 0n) a.negReg('rax');
          this.optimizationStats.strengthReductions = (this.optimizationStats.strengthReductions || 0) + 1;
          return;
        }
      }
      if (this.optimizationLevel >= 6 && (expr.operator === '/' || expr.operator === '%')
          && expr.right.kind === 'literal' && typeof expr.right.value === 'bigint' && expr.right.value > 1n
          && (expr.right.value & (expr.right.value - 1n)) === 0n && expr.right.value <= 0x40000000n) {
        const divisor = expr.right.value;
        let shift = 0;
        for (let value = divisor; value > 1n; value >>= 1n) shift += 1;
        this.compileAsInteger(expr.left, module, info, tempBaseIndex);
        if (expr.operator === '%') a.movRegReg('rcx', 'rax');
        // Signed division by 2^n with truncation toward zero:
        // (x + ((x >> 63) & (d - 1))) >> n.
        a.movRegReg('rdx', 'rax');
        a.sarRegImm8('rdx', 63);
        a.andRegImm32('rdx', divisor - 1n);
        a.addRegReg('rax', 'rdx');
        a.sarRegImm8('rax', shift);
        if (expr.operator === '%') {
          a.shlRegImm8('rax', shift);
          a.subRegReg('rcx', 'rax');
          a.movRegReg('rax', 'rcx');
        }
        this.optimizationStats.strengthReductions = (this.optimizationStats.strengthReductions || 0) + 1;
        return;
      }
      if (this.optimizationLevel >= 1 && expr.right.kind === 'literal' && typeof expr.right.value === 'bigint'
          && expr.right.value >= -0x80000000n && expr.right.value <= 0x7FFFFFFFn && ['+', '-', '*'].includes(expr.operator)) {
        this.compileAsInteger(expr.left, module, info, tempBaseIndex);
        if (expr.operator === '+') a.addRegImm32('rax', expr.right.value);
        else if (expr.operator === '-') a.subRegImm32('rax', expr.right.value);
        else a.imulRegImm32('rax', expr.right.value);
        this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
        return;
      }
      if (this.optimizationLevel >= 1 && ['==', '~=', '<', '<=', '>', '>='].includes(expr.operator)
          && expr.right.kind === 'literal' && typeof expr.right.value === 'bigint'
          && expr.right.value >= -0x80000000n && expr.right.value <= 0x7FFFFFFFn) {
        this.compileAsInteger(expr.left, module, info, tempBaseIndex);
        if (expr.right.value === 0n) a.testRegReg('rax'); else a.cmpRegImm32('rax', expr.right.value);
        const setCodes = { '==': 0x94, '~=': 0x95, '<': 0x9C, '<=': 0x9E, '>': 0x9F, '>=': 0x9D };
        a.setcc(setCodes[expr.operator]); a.movzxRaxAl();
        this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
        return;
      }
      if (this.optimizationLevel >= 1 && isSimpleLoadExpression(expr.right)) {
        this.compileAsInteger(expr.left, module, info, tempBaseIndex);
        this.emitValueToReg(expr.right, module, 'rcx');
        if (expr.operator === '+') a.addRegReg('rax', 'rcx');
        else if (expr.operator === '-') a.subRegReg('rax', 'rcx');
        else if (expr.operator === '*') a.imulRegReg('rax', 'rcx');
        else if (expr.operator === '/' || expr.operator === '%') {
          a.movRegReg('r10', 'rcx'); a.cqo(); a.idivReg('r10'); if (expr.operator === '%') a.movRegReg('rax', 'rdx');
        } else if (['==', '~=', '<', '<=', '>', '>='].includes(expr.operator)) {
          a.cmpRegReg('rax', 'rcx');
          const setCodes = { '==': 0x94, '~=': 0x95, '<': 0x9C, '<=': 0x9E, '>': 0x9F, '>=': 0x9D };
          a.setcc(setCodes[expr.operator]); a.movzxRaxAl();
        } else throw new Error(`unsupported binary operator ${expr.operator}`);
        this.optimizationStats.fastBinaryOps = (this.optimizationStats.fastBinaryOps || 0) + 1;
        return;
      }
      const leftSlot = this.tempOffset(info, tempBaseIndex);
      this.compileAsInteger(expr.left, module, info, tempBaseIndex + 1);
      a.movMemRspReg(leftSlot, 'rax');
      this.compileAsInteger(expr.right, module, info, tempBaseIndex + 1);
      a.movRegMemRsp('rcx', leftSlot);
      if (expr.operator === '+') { a.addRegReg('rcx', 'rax'); a.movRegReg('rax', 'rcx'); }
      else if (expr.operator === '-') { a.subRegReg('rcx', 'rax'); a.movRegReg('rax', 'rcx'); }
      else if (expr.operator === '*') { a.imulRegReg('rcx', 'rax'); a.movRegReg('rax', 'rcx'); }
      else if (expr.operator === '/' || expr.operator === '%') {
        a.movRegReg('r10', 'rax'); a.movRegReg('rax', 'rcx'); a.cqo(); a.idivReg('r10'); if (expr.operator === '%') a.movRegReg('rax', 'rdx');
      } else if (['==', '~=', '<', '<=', '>', '>='].includes(expr.operator)) {
        a.cmpRegReg('rcx', 'rax');
        const setCodes = { '==': 0x94, '~=': 0x95, '<': 0x9C, '<=': 0x9E, '>': 0x9F, '>=': 0x9D };
        a.setcc(setCodes[expr.operator]); a.movzxRaxAl();
      }
      return;
    }
    if (expr.kind === 'call') {
      const returned = this.compileCall(expr, module, info, tempBaseIndex);
      if (isFloatType(returned)) a.cvttss2si('rax', 'xmm0');
      return;
    }
    throw new Error(`unsupported integer expression in code generator: ${expr.kind}`);
  }

  compileExpression(expr, module, info, tempBaseIndex = 0) {
    if (isFloatType(expressionType(expr))) this.compileAsFloat(expr, module, info, tempBaseIndex);
    else this.compileAsInteger(expr, module, info, tempBaseIndex);
  }

  compileBooleanExpression(expr, module, info, tempBaseIndex = 0) {
    if (expr.kind === 'binary' && (expr.operator === 'and' || expr.operator === 'or')) {
      const a = this.asm;
      const done = a.unique('bool_done');
      const short = a.unique('bool_short');
      this.compileBooleanExpression(expr.left, module, info, tempBaseIndex);
      a.testRegReg('rax');
      if (expr.operator === 'and') a.jz(short); else a.jnz(short);
      this.compileBooleanExpression(expr.right, module, info, tempBaseIndex);
      a.testRegReg('rax'); a.setcc(0x95); a.movzxRaxAl();
      a.jmp(done);
      a.label(short);
      a.movRegImmSmart('rax', expr.operator === 'and' ? 0n : 1n);
      a.label(done);
      return;
    }
    if (isFloatType(expressionType(expr))) {
      const a = this.asm;
      this.compileAsFloat(expr, module, info, tempBaseIndex);
      a.xorps('xmm1'); a.ucomiss('xmm0', 'xmm1'); a.setcc(0x95); a.movzxRaxAl();
    } else this.compileAsInteger(expr, module, info, tempBaseIndex);
  }

  emitVectorTableCount(table, module, info, destination = 'rax') {
    const a = this.asm;
    if (table.packed) {
      a.movRegImmSmart(destination, BigInt(table.packed.positionalCount || 0));
      return true;
    }
    if (!this.emitValueToReg(table.object, module, 'rcx')) {
      this.compileAsInteger(table.object, module, info, 0);
      a.movRegReg('rcx', 'rax');
    }
    const empty = a.unique('vector_table_empty');
    const done = a.unique('vector_table_count_done');
    a.testRegReg('rcx'); a.jz(empty);
    a.movRegMemBase(destination, 'rcx', 8, 8);
    a.jmp(done);
    a.label(empty); a.xorRegReg(destination);
    a.label(done);
    return true;
  }

  emitVectorExpression(expr, module, info, destination, scratch, tempBaseIndex = 0) {
    const a = this.asm;
    if (expr.kind === 'index') {
      this.emitIndexElementPointer(expr, module, info, tempBaseIndex);
      const invalid = a.unique('vector_load_invalid');
      const done = a.unique('vector_load_done');
      a.testRegReg('rax'); a.jz(invalid);
      a.movupsXmmMemBase(destination, 'rax', 0);
      a.jmp(done);
      a.label(invalid); a.xorps(destination);
      a.label(done);
      return true;
    }
    if (expr.kind === 'literal' && expr.valueType === 'f32') {
      a.movssXmmImm(destination, expr.value);
      a.shufps(destination, destination, 0x00);
      return true;
    }
    if (expr.kind === 'reference' && expressionType(expr) === 'f32') {
      if (!this.emitFloatValueToXmm(expr, module, destination)) return false;
      a.shufps(destination, destination, 0x00);
      return true;
    }
    if (expr.kind !== 'binary' || !['+', '-', '*', '/'].includes(expr.operator) || scratch.length === 0) return false;
    const rightRegister = scratch[0];
    const remaining = scratch.slice(1);
    const leftNeed = this.vectorExpressionRegisterNeed(expr.left);
    const rightNeed = this.vectorExpressionRegisterNeed(expr.right);
    if (rightNeed > leftNeed) {
      if (!this.emitVectorExpression(expr.right, module, info, rightRegister, [destination, ...remaining], tempBaseIndex + 2)) return false;
      if (!this.emitVectorExpression(expr.left, module, info, destination, remaining, tempBaseIndex + 4)) return false;
    } else {
      if (!this.emitVectorExpression(expr.left, module, info, destination, remaining, tempBaseIndex + 2)) return false;
      if (!this.emitVectorExpression(expr.right, module, info, rightRegister, remaining, tempBaseIndex + 4)) return false;
    }
    if (expr.operator === '+') a.addps(destination, rightRegister);
    else if (expr.operator === '-') a.subps(destination, rightRegister);
    else if (expr.operator === '*') a.mulps(destination, rightRegister);
    else a.divps(destination, rightRegister);
    return true;
  }

  isVectorLeaf(expr) {
    return expr?.kind === 'index'
      || (expr?.kind === 'literal' && expr.valueType === 'f32')
      || (expr?.kind === 'reference' && expressionType(expr) === 'f32');
  }

  emitAvxVectorLeaf(expr, module, info, destination, tempBaseIndex = 0) {
    const a = this.asm;
    const xmmDestination = destination.replace('ymm', 'xmm');
    if (expr.kind === 'index') {
      this.emitIndexElementPointer(expr, module, info, tempBaseIndex);
      const invalid = a.unique('avx_vector_load_invalid');
      const done = a.unique('avx_vector_load_done');
      a.testRegReg('rax'); a.jz(invalid);
      a.vmovupsYmmMemBase(destination, 'rax', 0);
      a.jmp(done);
      a.label(invalid);
      a.xorps(xmmDestination);
      a.vbroadcastssYmmXmm(destination, xmmDestination);
      a.label(done);
      return true;
    }
    if (expr.kind === 'literal' && expr.valueType === 'f32') {
      a.movssXmmImm(xmmDestination, expr.value);
      a.vbroadcastssYmmXmm(destination, xmmDestination);
      return true;
    }
    if (expr.kind === 'reference' && expressionType(expr) === 'f32') {
      if (!this.emitFloatValueToXmm(expr, module, xmmDestination)) return false;
      a.vbroadcastssYmmXmm(destination, xmmDestination);
      return true;
    }
    return false;
  }

  emitAvxVectorExpression(expr, module, info, destination, scratch, tempBaseIndex = 0) {
    const a = this.asm;
    if (this.isVectorLeaf(expr)) return this.emitAvxVectorLeaf(expr, module, info, destination, tempBaseIndex);
    if (expr?.kind !== 'binary' || !['+', '-', '*', '/'].includes(expr.operator) || scratch.length === 0) return false;

    // Fuse the common a*b+c form when the target explicitly enables FMA.
    // Restrict the multiplicands to leaves so register pressure and evaluation
    // order remain deterministic; larger expressions still use normal AVX2.
    if (this.useFma && expr.operator === '+') {
      const multiply = expr.left?.kind === 'binary' && expr.left.operator === '*' ? expr.left
        : (expr.right?.kind === 'binary' && expr.right.operator === '*' ? expr.right : null);
      const addend = multiply === expr.left ? expr.right : expr.left;
      if (multiply && this.isVectorLeaf(multiply.left) && this.isVectorLeaf(multiply.right) && scratch.length >= 2) {
        if (!this.emitAvxVectorExpression(addend, module, info, destination, scratch.slice(2), tempBaseIndex + 2)) return false;
        if (!this.emitAvxVectorLeaf(multiply.left, module, info, scratch[0], tempBaseIndex + 4)) return false;
        if (!this.emitAvxVectorLeaf(multiply.right, module, info, scratch[1], tempBaseIndex + 6)) return false;
        a.vfmadd231ps(destination, scratch[0], scratch[1]);
        this.optimizationStats.fusedVectorOps = (this.optimizationStats.fusedVectorOps || 0) + 1;
        return true;
      }
    }

    const rightRegister = scratch[0];
    const remaining = scratch.slice(1);
    const leftNeed = this.vectorExpressionRegisterNeed(expr.left);
    const rightNeed = this.vectorExpressionRegisterNeed(expr.right);
    if (rightNeed > leftNeed) {
      if (!this.emitAvxVectorExpression(expr.right, module, info, rightRegister, [destination, ...remaining], tempBaseIndex + 2)) return false;
      if (!this.emitAvxVectorExpression(expr.left, module, info, destination, remaining, tempBaseIndex + 4)) return false;
    } else {
      if (!this.emitAvxVectorExpression(expr.left, module, info, destination, remaining, tempBaseIndex + 2)) return false;
      if (!this.emitAvxVectorExpression(expr.right, module, info, rightRegister, remaining, tempBaseIndex + 4)) return false;
    }
    if (expr.operator === '+') a.vaddps(destination, destination, rightRegister);
    else if (expr.operator === '-') a.vsubps(destination, destination, rightRegister);
    else if (expr.operator === '*') a.vmulps(destination, destination, rightRegister);
    else a.vdivps(destination, destination, rightRegister);
    return true;
  }

  vectorExpressionRegisterNeed(expr) {
    if (!expr) return 99;
    if (expr.kind === 'index' || expr.kind === 'literal' || expr.kind === 'reference') return 1;
    if (expr.kind !== 'binary' || !['+', '-', '*', '/'].includes(expr.operator)) return 99;
    const left = this.vectorExpressionRegisterNeed(expr.left);
    const right = this.vectorExpressionRegisterNeed(expr.right);
    return left === right ? left + 1 : Math.max(left, right);
  }

  storeIntegerVariable(variable, register = 'rax') {
    const a = this.asm;
    if (variable.register) {
      if (variable.register !== register) a.movRegReg(variable.register, register);
    } else a.movMemRspReg(variable.stackOffset, register);
  }

  compileVectorizedLoopPrefix(statement, module, info) {
    const plan = statement.vectorPlan;
    if (!plan?.indexVariable) return false;
    const a = this.asm;
    const width = this.vectorWidth;
    const vectorStart = a.unique('vector_loop_start');
    const vectorDone = a.unique('vector_loop_done');
    a.label(vectorStart);
    for (const table of plan.tables) {
      this.emitVectorTableCount(table, module, info, 'r11');
      this.loadVariableToReg(plan.indexVariable, 'r10');
      a.subRegReg('r11', 'r10');
      a.cmpRegImm32('r11', width);
      a.jl(vectorDone);
    }
    if (width === 8) {
      if (!this.emitAvxVectorExpression(plan.operation.expression, module, info, 'ymm0', ['ymm1', 'ymm2', 'ymm3', 'ymm4', 'ymm5'], 0)) return false;
    } else if (!this.emitVectorExpression(plan.operation.expression, module, info, 'xmm0', ['xmm1', 'xmm2', 'xmm3', 'xmm4', 'xmm5'], 0)) return false;
    this.emitIndexElementPointer(plan.operation.target, module, info, 8);
    const skipStore = a.unique('vector_store_invalid');
    a.testRegReg('rax'); a.jz(skipStore);
    if (width === 8) a.vmovupsMemBaseYmm('rax', 0, 'ymm0');
    else a.movupsMemBaseXmm('rax', 0, 'xmm0');
    a.label(skipStore);
    this.loadVariableToReg(plan.indexVariable, 'rax');
    a.addRegImm32('rax', width);
    this.storeIntegerVariable(plan.indexVariable, 'rax');
    a.jmp(vectorStart);
    a.label(vectorDone);
    if (width === 8) a.vzeroupper();
    return true;
  }

  countedLoopLatch(statement, module) {
    if (this.optimizationLevel < 6 || statement.conditionAlwaysTrue || statement.body.length === 0) return null;
    const condition = statement.condition;
    if (condition?.kind !== 'binary' || condition.operator !== '>'
        || condition.right?.kind !== 'literal' || condition.right.value !== 0n
        || condition.left?.kind !== 'reference') return null;
    const last = statement.body[statement.body.length - 1];
    if (last?.kind !== 'assign' || last.expression?.kind !== 'binary'
        || last.expression.operator !== '-' || last.expression.right?.kind !== 'literal'
        || last.expression.right.value !== 1n) return null;
    const resolved = this.resolvedReference(condition.left, module);
    if (resolved.kind !== 'variable' || resolved.variable !== last.variable
        || !this.isDirectVariableReference(last.expression.left, module, last.variable)
        || isFloatType(last.variable.type)) return null;
    return { branch: 'jg' };
  }

  compileStatement(statement, module, info, functionTail = false) {
    const a = this.asm;
    if (statement.kind === 'local' || statement.kind === 'assign') {
      const variable = statement.variable;
      if (statement.stackAllocateStruct && variable.stackObjectOffset !== null && variable.stackObjectOffset !== undefined) {
        a.leaRegMemBase('r11', 'rsp', variable.stackObjectOffset);
        a.xorRegReg('r10');
        for (let offset = 0; offset < statement.stackAllocateStruct.size;) {
          const remaining = statement.stackAllocateStruct.size - offset;
          const size = remaining >= 8 ? 8 : (remaining >= 4 ? 4 : (remaining >= 2 ? 2 : 1));
          a.movMemBaseReg('r11', offset, 'r10', size);
          offset += size;
        }
        a.movRegReg('rcx', 'r11');
        a.callLabel(statement.stackAllocateStruct.initLabel);
        if (variable.register) { if (variable.register !== 'rax') a.movRegReg(variable.register, 'rax'); }
        else a.movMemRspReg(variable.stackOffset, 'rax');
        return;
      }
      if (this.tryCompileDirectSimpleVariableStore(statement, module)) return;
      if (this.tryCompileDirectVariableAssignment(statement, module)) return;
      if (isFloatType(variable.type)) {
        this.compileAsFloat(statement.expression, module, info, 0);
        if (variable.register) { if (variable.register !== 'xmm0') a.movssXmmXmm(variable.register, 'xmm0'); }
        else a.movssMemRspXmm(variable.stackOffset, 'xmm0');
      } else {
        this.compileAsInteger(statement.expression, module, info, 0);
        if (variable.register) { if (variable.register !== 'rax') a.movRegReg(variable.register, 'rax'); }
        else a.movMemRspReg(variable.stackOffset, 'rax');
      }
      return;
    }
    if (statement.kind === 'field_assign') {
      const target = statement.resolvedTarget;
      if (isFloatType(target.type)) {
        this.compileAsFloat(statement.expression, module, info, 0);
        const address = this.emitFieldBase(target, 'r11');
        a.movssMemBaseXmm(address.base, address.field.offset, 'xmm0');
      } else {
        this.compileAsInteger(statement.expression, module, info, 0);
        const address = this.emitFieldBase(target, 'r11');
        a.movMemBaseReg(address.base, address.field.offset, 'rax', address.field.size);
      }
      return;
    }
    if (statement.kind === 'index_assign') {
      const element = statement.target.tableElement;
      const pointerSlot = this.tempOffset(info, 0);
      this.emitIndexElementPointer(statement.target, module, info, 2);
      a.movMemRspReg(pointerSlot, 'rax');
      if (element.kind === 'struct') {
        this.compileAsInteger(statement.expression, module, info, 2);
        a.movRegReg('r10', 'rax');
        a.movRegMemRsp('r11', pointerSlot);
        const skip = a.unique('table_index_store_missing');
        a.testRegReg('r11');
        a.jz(skip);
        if (tableElementUsesReferenceStorage(element)) {
          a.movMemBaseReg('r11', 0, 'r10', 8);
        } else {
          for (let offset = 0; offset < element.struct.size;) {
            const remaining = element.struct.size - offset;
            const size = remaining >= 8 ? 8 : (remaining >= 4 ? 4 : 1);
            a.movRegMemBase('rax', 'r10', offset, size);
            a.movMemBaseReg('r11', offset, 'rax', size);
            offset += size;
          }
        }
        a.label(skip);
      } else if (isFloatType(element.name)) {
        this.compileAsFloat(statement.expression, module, info, 2);
        a.movRegMemRsp('r11', pointerSlot);
        const skip = a.unique('table_index_store_missing');
        a.testRegReg('r11'); a.jz(skip);
        a.movssMemBaseXmm('r11', 0, 'xmm0');
        a.label(skip);
      } else {
        this.compileAsInteger(statement.expression, module, info, 2);
        a.movRegReg('r10', 'rax');
        a.movRegMemRsp('r11', pointerSlot);
        const skip = a.unique('table_index_store_missing');
        a.testRegReg('r11'); a.jz(skip);
        a.movMemBaseReg('r11', 0, 'r10', element.size || 8);
        a.label(skip);
      }
      return;
    }
    if (statement.kind === 'expr') { this.compileExpression(statement.expression, module, info, 0); return; }
    if (statement.kind === 'return') {
      const call = statement.expression;
      const callable = call?.kind === 'call' ? (call.resolvedCallable || this.program.resolveCallable(module, call, { variables: this.currentFunction.variables })) : null;
      const tailEligible = this.optimizationLevel >= 2 && statement.tailSelfCall && callable?.kind === 'internal' && callable.target === this.currentFunction
        && this.currentFunction.params.every((param) => !isFloatType(param.type));
      if (tailEligible) {
        const args = callArguments(call);
        const nestedBase = args.length;
        args.forEach((arg, index) => { this.compileAsInteger(arg, module, info, nestedBase); a.movMemRspReg(this.tempOffset(info, index), 'rax'); });
        args.forEach((arg, index) => {
          const param = this.currentFunction.params[index];
          const variable = param ? this.currentFunction.variables.get(param.name) : null;
          if (variable?.register) a.movRegMemRsp(variable.register, this.tempOffset(info, index));
          else if (variable?.stackOffset !== null && variable?.stackOffset !== undefined) { a.movRegMemRsp('rax', this.tempOffset(info, index)); a.movMemRspReg(variable.stackOffset, 'rax'); }
        });
        a.jmp(this.functionBodyLabel);
        this.optimizationStats.tailCallsOptimized = (this.optimizationStats.tailCallsOptimized || 0) + 1;
        return;
      }
      if (statement.expression) {
        if (isFloatType(this.currentFunction.returnType)) this.compileAsFloat(statement.expression, module, info, 0);
        else this.compileAsInteger(statement.expression, module, info, 0);
      } else if (isFloatType(this.currentFunction.returnType)) a.xorps('xmm0');
      else a.xorRegReg('rax');
      if (!functionTail) a.jmp(this.epilogueLabel);
      return;
    }
    if (statement.kind === 'break') {
      if (this.breakLabels.length === 0) throw new Error('internal break outside loop');
      a.jmp(this.breakLabels[this.breakLabels.length - 1]);
      return;
    }
    if (statement.kind === 'if') {
      const endLabel = a.unique('if_end');
      for (const branch of statement.branches) {
        const nextLabel = a.unique('if_next');
        this.compileJumpIfFalse(branch.condition, nextLabel, module, info, 0);
        branch.body.forEach((child) => this.compileStatement(child, module, info));
        if (!blockAlwaysTerminates(branch.body)) a.jmp(endLabel);
        a.label(nextLabel);
      }
      statement.elseBody.forEach((child) => this.compileStatement(child, module, info));
      a.label(endLabel);
      return;
    }
    if (statement.kind === 'while') {
      const tableLoopPlan = this.optimizationLevel >= 6 ? statement.tableLoopPlan : null;
      if (tableLoopPlan) {
        this.setupTableLoopCache(tableLoopPlan, module, info);
        this.activeTableLoopPlans.push(tableLoopPlan);
        if (statement.vectorPlan) this.compileVectorizedLoopPrefix(statement, module, info);
        const bodyLabel = a.unique('table_while_body');
        const endLabel = a.unique('table_while_end');
        this.compileCachedTableLoopBranch(tableLoopPlan, endLabel, false);
        a.label(bodyLabel);
        this.breakLabels.push(endLabel);
        statement.body.forEach((child) => this.compileStatement(child, module, info));
        this.breakLabels.pop();
        this.compileCachedTableLoopBranch(tableLoopPlan, bodyLabel, true);
        a.label(endLabel);
        this.activeTableLoopPlans.pop();
        this.optimizationStats.cachedTableLoopsEmitted = (this.optimizationStats.cachedTableLoopsEmitted || 0) + 1;
        return;
      }
      if (this.optimizationLevel >= 6 && statement.vectorPlan) this.compileVectorizedLoopPrefix(statement, module, info);
      const startLabel = a.unique('while_start');
      const endLabel = a.unique('while_end');
      if (this.optimizationLevel >= 6 && !statement.conditionAlwaysTrue && isCheapLoopCondition(statement.condition)) {
        const bodyLabel = a.unique('while_body');
        const countedLatch = this.countedLoopLatch(statement, module);
        this.compileJumpIfFalse(statement.condition, endLabel, module, info, 0);
        a.label(bodyLabel);
        this.breakLabels.push(endLabel);
        statement.body.forEach((child) => this.compileStatement(child, module, info));
        this.breakLabels.pop();
        if (countedLatch) {
          a[countedLatch.branch](bodyLabel);
          this.optimizationStats.directBranches = (this.optimizationStats.directBranches || 0) + 1;
        } else this.compileJumpIfTrue(statement.condition, bodyLabel, module, info, 0);
        a.label(endLabel);
        return;
      }
      a.label(startLabel);
      if (!statement.conditionAlwaysTrue) this.compileJumpIfFalse(statement.condition, endLabel, module, info, 0);
      this.breakLabels.push(endLabel);
      statement.body.forEach((child) => this.compileStatement(child, module, info));
      this.breakLabels.pop();
      a.jmp(startLabel);
      a.label(endLabel);
      return;
    }
    throw new Error(`unsupported statement ${statement.kind}`);
  }

  compileFunction(fn) {
    const a = this.asm;
    const info = analyzeFunction(fn, this.optimizationLevel, this.optimizationStats);
    this.functionInfo.set(fn.label, info);
    this.currentFunction = fn;
    this.epilogueLabel = a.unique(`${fn.label}_epilogue`);
    this.functionBodyLabel = a.unique(`${fn.label}_body`);
    a.label(fn.label);
    const pgoRecord = this.pgoRecordByFunction.get(fn);
    if (pgoRecord) a.lockIncQwordRip(pgoRecord.symbol);
    if (info.frameSize > 0) a.subRsp(info.frameSize);
    for (const [register, offset] of info.gprSaveOffsets) a.movMemRspReg(offset, register);
    for (const [register, offset] of info.xmmSaveOffsets) a.movdquMemRspXmm(offset, register);
    const paramRegs = ['rcx', 'rdx', 'r8', 'r9'];
    fn.params.forEach((param, index) => {
      const variable = fn.variables.get(param.name);
      if (!variable.register && (variable.stackOffset === null || variable.stackOffset === undefined)) return;
      if (isFloatType(variable.type)) {
        if (index < 4) {
          if (variable.register) a.movssXmmXmm(variable.register, `xmm${index}`);
          else a.movssMemRspXmm(variable.stackOffset, `xmm${index}`);
        } else {
          if (variable.register) a.movssXmmMemRsp(variable.register, info.frameSize + 40 + (index - 4) * 8);
          else { a.movssXmmMemRsp('xmm0', info.frameSize + 40 + (index - 4) * 8); a.movssMemRspXmm(variable.stackOffset, 'xmm0'); }
        }
      } else if (index < 4) {
        if (variable.register) a.movRegReg(variable.register, paramRegs[index]);
        else a.movMemRspReg(variable.stackOffset, paramRegs[index]);
      } else {
        const destination = variable.register || 'rax';
        a.movRegMemRsp(destination, info.frameSize + 40 + (index - 4) * 8);
        if (!variable.register) a.movMemRspReg(variable.stackOffset, 'rax');
      }
    });
    a.label(this.functionBodyLabel);
    fn.body.forEach((statement, index) => this.compileStatement(statement, fn.module, info, index === fn.body.length - 1));
    if (!blockAlwaysTerminates(fn.body)) {
      if (isFloatType(fn.returnType)) a.xorps('xmm0'); else a.xorRegReg('rax');
    }
    a.label(this.epilogueLabel);
    for (const [register, offset] of [...info.xmmSaveOffsets].reverse()) a.movdquXmmMemRsp(register, offset);
    for (const [register, offset] of [...info.gprSaveOffsets].reverse()) a.movRegMemRsp(register, offset);
    if (info.frameSize > 0) a.addRsp(info.frameSize);
    a.ret();
    this.currentFunction = null;
    this.epilogueLabel = null;
    this.functionBodyLabel = null;
  }

  emitStructConstructors() {
    const a = this.asm;
    for (const module of this.program.moduleOrder) for (const struct of module.structs.values()) {
      this.program.resolveStructLayout(struct);

      // Initialize an existing closed-object body. Struct.new(), escape-based
      // stack allocation, and object-table add() use this initializer before the
      // resulting native object pointer is exposed. Empty table fields own
      // independent native table headers rather than null pointers.
      const ownsDefaultTables = struct.fieldOrder.some((field) => field.defaultConstructTable);
      a.label(struct.initLabel);
      const initDone = a.unique(`${struct.name}_init_done`);
      const initNull = a.unique(`${struct.name}_init_null`);
      if (ownsDefaultTables) {
        a.subRsp(0x38);
        a.movMemRspReg(40, 'rcx');
        a.testRegReg('rcx'); a.jz(initNull);
      } else {
        a.testRegReg('rcx'); a.jz(initDone);
        a.movRegReg('r11', 'rcx');
      }
      for (const field of struct.fieldOrder) {
        if (field.defaultConstructTable) {
          const element = field.typeInfo.element;
          const elementSize = tableElementStorageSize(element);
          a.movRegImmSmart('rcx', BigInt(elementSize));
          a.xorRegReg('rdx');
          a.callLabel('__lsx_table_create');
          a.movRegMemRsp('r11', 40);
          a.movMemBaseReg('r11', field.offset, 'rax', 8);
        } else if (isFloatType(field.type)) {
          a.movssXmmImm('xmm0', Number(field.defaultValue || 0));
          if (ownsDefaultTables) a.movRegMemRsp('r11', 40);
          a.movssMemBaseXmm('r11', field.offset, 'xmm0');
        } else if (field.type === 'string' && field.defaultValue) {
          a.leaRip('r10', this.internString(field.defaultValue));
          if (ownsDefaultTables) a.movRegMemRsp('r11', 40);
          a.movMemBaseReg('r11', field.offset, 'r10', 8);
        } else if (typeof field.defaultValue === 'bigint' && field.defaultValue !== 0n) {
          a.movRegImmSmart('r10', field.defaultValue);
          if (ownsDefaultTables) a.movRegMemRsp('r11', 40);
          a.movMemBaseReg('r11', field.offset, 'r10', field.size);
        }
      }
      if (ownsDefaultTables) {
        a.movRegMemRsp('rax', 40);
        a.jmp(initDone);
        a.label(initNull); a.xorRegReg('rax');
        a.label(initDone); a.addRsp(0x38); a.ret();
      } else {
        a.movRegReg('rax', 'r11');
        a.label(initDone);
        a.ret();
      }

      a.label(struct.newLabel);
      a.subRsp(0x28);
      a.movRegImmSmart('rcx', BigInt(struct.size));
      a.callLabel('__lsx_object_alloc');
      const newDone = a.unique(`${struct.name}_new_done`);
      a.testRegReg('rax'); a.jz(newDone);
      a.movRegReg('rcx', 'rax');
      a.callLabel(struct.initLabel);
      a.label(newDone);
      a.addRsp(0x28);
      a.ret();

      // Clone an existing table object into independent native storage. Primitive
      // fields are copied directly. Nested closed-table objects are recursively
      // cloned; opaque handles, strings, and typed collection handles retain
      // reference semantics.
      a.label(struct.cloneLabel);
      a.subRsp(0x38);
      a.movMemRspReg(40, 'rcx');
      const cloneFail = a.unique(`${struct.name}_clone_fail`);
      const cloneDone = a.unique(`${struct.name}_clone_done`);
      a.testRegReg('rcx'); a.jz(cloneFail);
      a.movRegImmSmart('rcx', BigInt(struct.size));
      a.callLabel('__lsx_object_alloc');
      a.testRegReg('rax'); a.jz(cloneFail);
      a.movMemRspReg(48, 'rax');
      for (const field of struct.fieldOrder) {
        if (field.typeInfo.kind === 'struct') {
          const nestedNull = a.unique(`${struct.name}_${field.name}_clone_null`);
          const nestedStored = a.unique(`${struct.name}_${field.name}_clone_stored`);
          a.movRegMemRsp('r10', 40);
          a.movRegMemBase('rcx', 'r10', field.offset, 8);
          a.testRegReg('rcx'); a.jz(nestedNull);
          a.callLabel(field.typeInfo.struct.cloneLabel);
          a.jmp(nestedStored);
          a.label(nestedNull); a.xorRegReg('rax');
          a.label(nestedStored);
          a.movRegMemRsp('r11', 48);
          a.movMemBaseReg('r11', field.offset, 'rax', 8);
        } else {
          a.movRegMemRsp('r10', 40);
          a.movRegMemRsp('r11', 48);
          a.movRegMemBase('rax', 'r10', field.offset, field.size || 8);
          a.movMemBaseReg('r11', field.offset, 'rax', field.size || 8);
        }
      }
      a.movRegMemRsp('rax', 48);
      a.jmp(cloneDone);
      a.label(cloneFail); a.xorRegReg('rax');
      a.label(cloneDone); a.addRsp(0x38); a.ret();

      // A user-defined destroy method is the ownership boundary for a packed
      // object. It can release native buffers/tables and null borrowed aliases
      // before the object's storage is freed. Structs without an explicit
      // destroy method retain automatic recursive destruction for nested owned
      // objects. Previously the compiler silently ignored custom destroy methods
      // and recursively freed every struct-typed field, including parent/root
      // aliases; that caused UI graphs to free live elements before launch.
      a.label(struct.destroyLabel);
      a.subRsp(0x38);
      a.movMemRspReg(40, 'rcx');
      const destroyDone = a.unique(`${struct.name}_destroy_done`);
      a.xorRegReg('rax');
      a.testRegReg('rcx'); a.jz(destroyDone);
      const customDestroy = struct.methods.get('destroy');
      if (customDestroy && !customDestroy.isStatic) {
        a.callLabel(customDestroy.label);
      } else {
        for (const field of struct.fieldOrder) {
          if (field.typeInfo.kind === 'struct') {
            a.movRegMemRsp('r10', 40);
            a.movRegMemBase('rcx', 'r10', field.offset, 8);
            a.testRegReg('rcx');
            const nestedDestroySkip = a.unique(`${struct.name}_${field.name}_destroy_skip`);
            a.jz(nestedDestroySkip);
            a.callLabel(field.typeInfo.struct.destroyLabel);
            a.label(nestedDestroySkip);
          }
        }
      }
      a.movRegMemRsp('rcx', 40);
      a.callLabel('__lsx_object_free');
      a.label(destroyDone);
      a.addRsp(0x38);
      a.ret();
    }
  }

  emitRuntime() {
    const used = this.program.usesBuiltins;
    const hasFamily = (name) => [...used].some((builtinName) => builtinName.startsWith(`${name}.`));
    const hasStructs = this.program.moduleOrder.some((module) => module.structs.size > 0);
    const hasOwnedTableDefaults = this.program.moduleOrder.some((module) => [...module.structs.values()].some((struct) => {
      this.program.resolveStructLayout(struct);
      return struct.fieldOrder.some((field) => field.defaultConstructTable);
    }));
    if (hasFamily('window')) this.emitWindowRuntime();
    if (hasFamily('memory') || hasFamily('table') || hasStructs || hasOwnedTableDefaults) this.emitMemoryRuntime();
    if (hasFamily('table') || hasOwnedTableDefaults) this.emitTableRuntime();
    if (hasFamily('simd')) this.emitSimdRuntime();
    if (hasFamily('debug')) this.emitDebugRuntime();
    if (hasFamily('console')) this.emitConsoleRuntime();
    if (hasFamily('system')) this.emitSystemRuntime();
    if (hasFamily('string')) this.emitStringRuntime();
    if (hasFamily('thread')) this.emitThreadRuntime();
    if (hasFamily('atomic')) this.emitAtomicRuntime();
    if (hasFamily('ffi')) this.emitFfiRuntime();
  }

  emitWindowRuntime() {
    const a = this.asm;
    const getModule = this.requireImport('KERNEL32.dll', 'GetModuleHandleA');
    const registerClass = this.requireImport('USER32.dll', 'RegisterClassExA');
    const createWindow = this.requireImport('USER32.dll', 'CreateWindowExA');
    const showWindow = this.requireImport('USER32.dll', 'ShowWindow');
    const updateWindow = this.requireImport('USER32.dll', 'UpdateWindow');
    const loadCursor = this.requireImport('USER32.dll', 'LoadCursorA');
    const peekMessage = this.requireImport('USER32.dll', 'PeekMessageA');
    const translateMessage = this.requireImport('USER32.dll', 'TranslateMessage');
    const dispatchMessage = this.requireImport('USER32.dll', 'DispatchMessageA');
    const defWindowProc = this.requireImport('USER32.dll', 'DefWindowProcA');
    const destroyWindow = this.requireImport('USER32.dll', 'DestroyWindow');
    const postQuit = this.requireImport('USER32.dll', 'PostQuitMessage');

    a.label('__lsx_window_create');
    a.subRsp(0x78);
    a.movMemRspReg(96, 'rcx');
    a.movMemRspReg(104, 'rdx');
    a.movMemRspReg(112, 'r8');
    a.movRegRip('rax', 'data_window_class_registered');
    a.testRegReg('rax');
    const classReady = a.unique('window_class_ready');
    a.jnz(classReady);
    a.xorRegReg('rcx');
    a.callIat(getModule);
    a.movRipReg('data_window_hinstance', 'rax');
    a.movDwordRipImm('data_wndclass', 80);
    a.movDwordRipImm('data_wndclass_style', 3);
    a.leaRip('rax', '__lsx_wndproc');
    a.movRipReg('data_wndclass_wndproc', 'rax');
    a.movRegRip('rax', 'data_window_hinstance');
    a.movRipReg('data_wndclass_hinstance', 'rax');
    a.xorRegReg('rcx');
    a.movRegImm32('rdx', 32512);
    a.callIat(loadCursor);
    a.movRipReg('data_wndclass_hcursor', 'rax');
    a.movQwordRipImm32('data_wndclass_hbackground', 6);
    a.leaRip('rax', 'str_window_class');
    a.movRipReg('data_wndclass_classname', 'rax');
    a.leaRip('rcx', 'data_wndclass');
    a.callIat(registerClass);
    a.movQwordRipImm32('data_window_class_registered', 1);
    a.label(classReady);

    a.movMemRspImm32(32, 0x80000000);
    a.movMemRspImm32(40, 0x80000000);
    a.movRegMemRsp('rax', 104); a.movMemRspReg(48, 'rax');
    a.movRegMemRsp('rax', 112); a.movMemRspReg(56, 'rax');
    a.movMemRspImm32(64, 0);
    a.movMemRspImm32(72, 0);
    a.movRegRip('rax', 'data_window_hinstance'); a.movMemRspReg(80, 'rax');
    a.movMemRspImm32(88, 0);
    a.xorRegReg('rcx');
    a.leaRip('rdx', 'str_window_class');
    a.movRegMemRsp('r8', 96);
    a.movRegImm32('r9', 0x00CF0000);
    a.callIat(createWindow);
    const createFail = a.unique('window_create_fail');
    const createDone = a.unique('window_create_done');
    a.testRegReg('rax'); a.jz(createFail);
    a.movRipReg('data_window_hwnd', 'rax');
    a.movQwordRipImm32('data_window_open', 1);
    a.movRegReg('rcx', 'rax'); a.movRegImm32('rdx', 5); a.callIat(showWindow);
    a.movRegRip('rcx', 'data_window_hwnd'); a.callIat(updateWindow);
    a.movRegRip('rax', 'data_window_hwnd'); a.jmp(createDone);
    a.label(createFail); a.xorRegReg('rax');
    a.label(createDone); a.addRsp(0x78); a.ret();

    a.label('__lsx_window_poll');
    a.subRsp(0x28);
    const pollLoop = a.unique('poll_loop');
    const pollDone = a.unique('poll_done');
    const pollQuit = a.unique('poll_quit');
    a.label(pollLoop);
    a.leaRip('rcx', 'data_msg');
    a.xorRegReg('rdx'); a.xorRegReg('r8'); a.xorRegReg('r9');
    a.movMemRspImm32(32, 1);
    a.callIat(peekMessage);
    a.testRegReg('rax'); a.jz(pollDone);
    a.movEaxRipDword('data_msg_message');
    a.cmpRegImm32('rax', 0x12); a.jz(pollQuit);
    a.leaRip('rcx', 'data_msg'); a.callIat(translateMessage);
    a.leaRip('rcx', 'data_msg'); a.callIat(dispatchMessage);
    a.jmp(pollLoop);
    a.label(pollQuit); a.movQwordRipImm32('data_window_open', 0);
    a.label(pollDone); a.movRegRip('rax', 'data_window_open'); a.addRsp(0x28); a.ret();

    a.label('__lsx_window_is_open'); a.movRegRip('rax', 'data_window_open'); a.ret();
    a.label('__lsx_window_handle'); a.movRegRip('rax', 'data_window_hwnd'); a.ret();
    a.label('__lsx_window_hinstance'); a.movRegRip('rax', 'data_window_hinstance'); a.ret();

    a.label('__lsx_window_destroy');
    a.subRsp(0x28);
    a.movRegRip('rcx', 'data_window_hwnd');
    const noWindow = a.unique('no_window');
    a.testRegReg('rcx'); a.jz(noWindow);
    a.callIat(destroyWindow);
    a.movQwordRipImm32('data_window_hwnd', 0);
    a.movQwordRipImm32('data_window_open', 0);
    a.label(noWindow); a.xorRegReg('rax'); a.addRsp(0x28); a.ret();

    a.label('__lsx_wndproc');
    a.subRsp(0x28);
    const wndDestroy = a.unique('wnd_destroy');
    const wndClose = a.unique('wnd_close');
    a.cmpRegImm32('rdx', 2); a.jz(wndDestroy);
    a.cmpRegImm32('rdx', 0x10); a.jz(wndClose);
    a.callIat(defWindowProc); a.addRsp(0x28); a.ret();
    a.label(wndClose); a.callIat(destroyWindow); a.xorRegReg('rax'); a.addRsp(0x28); a.ret();
    a.label(wndDestroy);
    a.movQwordRipImm32('data_window_open', 0);
    a.xorRegReg('rcx'); a.callIat(postQuit); a.xorRegReg('rax'); a.addRsp(0x28); a.ret();
  }

  emitMemoryRuntime() {
    const a = this.asm;
    const getProcessHeap = this.requireImport('KERNEL32.dll', 'GetProcessHeap');
    const heapAlloc = this.requireImport('KERNEL32.dll', 'HeapAlloc');
    const heapFree = this.requireImport('KERNEL32.dll', 'HeapFree');
    const memset = this.requireImport('msvcrt.dll', 'memset');
    const allocationMagic = 0x4C53584D454D3031n; // "LSXMEM01"
    const objectMagic = 0x4C53584F424A3031n;     // "LSXOBJ01"
    const slabClasses = [64, 128, 256, 512, 1024, 2048, 4096];
    const slabPageSize = 65536;

    const acquireSlabLock = () => {
      const wait = a.unique('slab_lock_wait');
      const acquired = a.unique('slab_lock_acquired');
      a.leaRip('r10', 'data_slab_lock');
      a.label(wait);
      a.movRegImm32('rax', 1);
      a.atomicXchgMemReg('r10', 'rax', 8);
      a.testRegReg('rax'); a.jz(acquired);
      a.nop(); a.jmp(wait);
      a.label(acquired);
    };
    const releaseSlabLock = () => {
      a.leaRip('r10', 'data_slab_lock');
      a.xorRegReg('rax');
      a.movMemBaseReg('r10', 0, 'rax', 8);
    };
    const ensureProcessHeap = (failLabel) => {
      const ready = a.unique('process_heap_ready');
      a.movRegRip('rax', 'data_process_heap');
      a.testRegReg('rax'); a.jnz(ready);
      a.callIat(getProcessHeap);
      a.testRegReg('rax'); a.jz(failLabel);
      a.movRipReg('data_process_heap', 'rax');
      a.label(ready);
    };
    const initializeHeaderAndReturn = (doneLabel) => {
      a.movRegMemRsp('rax', 64); // block base
      a.movRegMemRsp('r10', 48); // magic
      a.movMemBaseReg('rax', 0, 'r10', 8);
      a.movRegReg('r11', 'rax');
      a.movMemBaseReg('rax', 8, 'r11', 8);
      a.movRegMemRsp('r9', 40); // requested payload
      a.movMemBaseReg('rax', 16, 'r9', 8);
      a.movRegMemRsp('r8', 56); // zero for large, class size for slabs
      a.movMemBaseReg('rax', 24, 'r8', 8);
      a.addRegImm32('rax', 32);
      a.jmp(doneLabel);
    };

    // Small allocations come from 64 KiB segregated slabs. Recycled blocks are
    // returned to a per-size free list, so ordinary LSX objects/tables avoid a
    // Windows heap call after the first page for their size class. Large blocks
    // retain the process-heap fallback. A compact 32-byte validation header keeps
    // standalone objects distinguishable from borrowed subobject/storage addresses.
    a.label('__lsx_memory_alloc');
    a.movRegImmSmart('rdx', allocationMagic);
    a.jmp('__lsx_alloc_with_magic');
    a.label('__lsx_object_alloc');
    a.movRegImmSmart('rdx', objectMagic);
    a.label('__lsx_alloc_with_magic');
    a.subRsp(0x78);
    a.movMemRspReg(40, 'rcx');
    a.movMemRspReg(48, 'rdx');
    a.movMemRspImm32(56, 0);
    a.movMemRspImm32(64, 0);
    const allocFail = a.unique('memory_alloc_fail');
    const allocDone = a.unique('memory_alloc_done');
    const largeAlloc = a.unique('memory_alloc_large');
    const classLabels = slabClasses.map((size) => a.unique(`memory_alloc_class_${size}`));
    a.cmpRegImm32('rcx', 0); a.jl(allocFail);
    a.movRegReg('r11', 'rcx'); a.addRegImm32('r11', 32);
    slabClasses.forEach((size, index) => { a.cmpRegImm32('r11', size); a.jle(classLabels[index]); });
    a.jmp(largeAlloc);

    slabClasses.forEach((size, index) => {
      const freeSymbol = `data_slab_free_${size}`;
      const bumpSymbol = `data_slab_bump_${size}`;
      const endSymbol = `data_slab_end_${size}`;
      const noFree = a.unique(`slab_${size}_no_free`);
      const needPage = a.unique(`slab_${size}_need_page`);
      const haveBlock = a.unique(`slab_${size}_have_block`);
      const pageFail = a.unique(`slab_${size}_page_fail`);
      a.label(classLabels[index]);
      a.movMemRspImm32(56, size);
      acquireSlabLock();
      a.movRegRip('rax', freeSymbol);
      a.testRegReg('rax'); a.jz(noFree);
      a.movRegMemBase('r11', 'rax', 0, 8);
      a.movRipReg(freeSymbol, 'r11');
      a.movMemRspReg(64, 'rax');
      a.jmp(haveBlock);
      a.label(noFree);
      a.movRegRip('rax', bumpSymbol);
      a.testRegReg('rax'); a.jz(needPage);
      a.movRegReg('r11', 'rax'); a.addRegImm32('r11', size);
      a.movRegRip('r9', endSymbol);
      a.cmpRegReg('r11', 'r9'); a.ja(needPage);
      a.movMemRspReg(64, 'rax');
      a.movRipReg(bumpSymbol, 'r11');
      a.jmp(haveBlock);
      a.label(needPage);
      // The lock remains held while a page is acquired; allocation itself does
      // not re-enter LSX, and this prevents two threads from publishing the same
      // bump page.
      ensureProcessHeap(pageFail);
      a.movRegReg('rcx', 'rax');
      a.movRegImm32('rdx', 0x00000008); // HEAP_ZERO_MEMORY
      a.movRegImm32('r8', slabPageSize);
      a.callIat(heapAlloc);
      a.testRegReg('rax'); a.jz(pageFail);
      a.movMemRspReg(64, 'rax');
      a.movRegReg('r11', 'rax'); a.addRegImm32('r11', size); a.movRipReg(bumpSymbol, 'r11');
      a.movRegReg('r11', 'rax'); a.addRegImm32('r11', slabPageSize); a.movRipReg(endSymbol, 'r11');
      a.label(haveBlock);
      releaseSlabLock();
      // A recycled block must have C-like zero-initialized object semantics.
      a.movRegMemRsp('rcx', 64);
      a.xorRegReg('rdx');
      a.movRegImm32('r8', size);
      a.callIat(memset);
      initializeHeaderAndReturn(allocDone);
      a.label(pageFail);
      releaseSlabLock();
      a.jmp(allocFail);
    });

    a.label(largeAlloc);
    ensureProcessHeap(allocFail);
    a.movRegReg('rcx', 'rax');
    a.movRegImm32('rdx', 0x00000008);
    a.movRegMemRsp('r8', 40); a.addRegImm32('r8', 32);
    a.callIat(heapAlloc);
    a.testRegReg('rax'); a.jz(allocFail);
    a.movMemRspReg(64, 'rax');
    a.movMemRspImm32(56, 0);
    initializeHeaderAndReturn(allocDone);
    a.label(allocFail); a.xorRegReg('rax');
    a.label(allocDone); a.addRsp(0x78); a.ret();

    a.label('__lsx_memory_free');
    a.xorRegReg('rdx');
    a.jmp('__lsx_free_with_expected_magic');
    a.label('__lsx_object_free');
    a.movRegImmSmart('rdx', objectMagic);
    a.label('__lsx_free_with_expected_magic');
    a.subRsp(0x68);
    a.movMemRspReg(40, 'rcx');
    a.movMemRspReg(48, 'rdx');
    const freeFail = a.unique('memory_free_fail');
    const freeMagicValid = a.unique('memory_free_magic_valid');
    const freeLarge = a.unique('memory_free_large');
    const freeDone = a.unique('memory_free_done');
    const freeClassLabels = slabClasses.map((size) => a.unique(`memory_free_class_${size}`));
    a.testRegReg('rcx'); a.jz(freeFail);
    a.movRegReg('r10', 'rcx'); a.subRegImm32('r10', 32);
    a.movMemRspReg(56, 'r10');
    a.movRegMemBase('r11', 'r10', 8, 8);
    a.cmpRegReg('r11', 'r10'); a.jnz(freeFail);
    a.movRegMemBase('r11', 'r10', 0, 8);
    a.movRegMemRsp('rax', 48);
    a.testRegReg('rax');
    const freeAcceptEither = a.unique('memory_free_accept_either');
    a.jz(freeAcceptEither);
    a.cmpRegReg('r11', 'rax'); a.jz(freeMagicValid);
    a.jmp(freeFail);
    a.label(freeAcceptEither);
    a.movRegImmSmart('rax', allocationMagic); a.cmpRegReg('r11', 'rax'); a.jz(freeMagicValid);
    a.movRegImmSmart('rax', objectMagic); a.cmpRegReg('r11', 'rax'); a.jnz(freeFail);
    a.label(freeMagicValid);
    a.movRegMemBase('r9', 'r10', 24, 8);
    slabClasses.forEach((size, index) => { a.cmpRegImm32('r9', size); a.jz(freeClassLabels[index]); });
    a.testRegReg('r9'); a.jz(freeLarge);
    // Unknown class metadata is rejected rather than corrupting a free list.
    a.jmp(freeFail);

    slabClasses.forEach((size, index) => {
      const freeSymbol = `data_slab_free_${size}`;
      a.label(freeClassLabels[index]);
      acquireSlabLock();
      a.movRegMemRsp('r10', 56);
      a.movRegRip('r11', freeSymbol);
      a.movMemBaseReg('r10', 0, 'r11', 8);
      a.movRipReg(freeSymbol, 'r10');
      releaseSlabLock();
      a.movRegImm32('rax', 1);
      a.jmp(freeDone);
    });

    a.label(freeLarge);
    ensureProcessHeap(freeFail);
    a.movRegReg('rcx', 'rax');
    a.xorRegReg('rdx');
    a.movRegMemRsp('r8', 56);
    a.callIat(heapFree);
    a.jmp(freeDone);
    a.label(freeFail); a.xorRegReg('rax');
    a.label(freeDone); a.addRsp(0x68); a.ret();

    a.label('__lsx_memory_ptr'); a.movRegReg('rax', 'rcx'); a.addRegReg('rax', 'rdx'); a.ret();
    for (const [name, size] of [['u8', 1], ['u16', 2], ['u32', 4], ['u64', 8]]) {
      a.label(`__lsx_memory_write_${name}`); a.leaRaxRcxPlusRdx(); a.storeR8AtRax(size); a.xorRegReg('rax'); a.ret();
      a.label(`__lsx_memory_read_${name}`); a.leaRaxRcxPlusRdx(); a.loadRaxAtRax(size); a.ret();
    }
    a.label('__lsx_memory_write_f32'); a.leaRaxRcxPlusRdx(); a.movssMemBaseXmm('rax', 0, 'xmm2'); a.xorRegReg('rax'); a.ret();
    a.label('__lsx_memory_read_f32'); a.leaRaxRcxPlusRdx(); a.movssXmmMemBase('xmm0', 'rax', 0); a.ret();
  }

  emitTableRuntime() {
    const a = this.asm;

    // Header: data ptr, count, capacity, stride (four qwords).
    a.label('__lsx_table_create');
    a.subRsp(0x58);
    a.movMemRspReg(40, 'rcx');
    a.movMemRspReg(48, 'rdx');
    a.movRegImmSmart('rcx', 32n);
    a.callLabel('__lsx_memory_alloc');
    a.movMemRspReg(56, 'rax');
    const createFail = a.unique('table_create_fail');
    const createNoData = a.unique('table_create_no_data');
    const createInit = a.unique('table_create_init');
    const createDone = a.unique('table_create_done');
    a.testRegReg('rax'); a.jz(createFail);
    a.movRegMemRsp('rcx', 48); a.testRegReg('rcx'); a.jz(createNoData);
    a.movRegMemRsp('rax', 40); a.imulRegReg('rax', 'rcx');
    a.movRegReg('rcx', 'rax'); a.callLabel('__lsx_memory_alloc');
    a.testRegReg('rax'); a.jz(createFail);
    a.jmp(createInit);
    a.label(createNoData); a.xorRegReg('rax');
    a.label(createInit);
    a.movRegMemRsp('r10', 56);
    a.movMemBaseReg('r10', 0, 'rax', 8);
    a.xorRegReg('r11'); a.movMemBaseReg('r10', 8, 'r11', 8);
    a.movRegMemRsp('r11', 48); a.movMemBaseReg('r10', 16, 'r11', 8);
    a.movRegMemRsp('r11', 40); a.movMemBaseReg('r10', 24, 'r11', 8);
    a.movRegReg('rax', 'r10'); a.jmp(createDone);
    a.label(createFail);
    a.movRegMemRsp('rcx', 56); a.testRegReg('rcx');
    const createReturnFail = a.unique('table_create_return_fail');
    a.jz(createReturnFail); a.callLabel('__lsx_memory_free');
    a.label(createReturnFail); a.xorRegReg('rax');
    a.label(createDone); a.addRsp(0x58); a.ret();

    a.label('__lsx_table_destroy');
    a.subRsp(0x38); a.movMemRspReg(40, 'rcx');
    const destroyDone = a.unique('table_destroy_done');
    a.testRegReg('rcx'); a.jz(destroyDone);
    a.movRegMemBase('rcx', 'rcx', 0, 8); a.testRegReg('rcx');
    const destroyHeader = a.unique('table_destroy_header');
    a.jz(destroyHeader); a.callLabel('__lsx_memory_free');
    a.label(destroyHeader); a.movRegMemRsp('rcx', 40); a.callLabel('__lsx_memory_free');
    a.label(destroyDone); a.xorRegReg('rax'); a.addRsp(0x38); a.ret();

    a.label('__lsx_table_count');
    a.testRegReg('rcx'); const countZero = a.unique('table_count_zero'); const countDone = a.unique('table_count_done');
    a.jz(countZero); a.movRegMemBase('rax', 'rcx', 8, 8); a.jmp(countDone);
    a.label(countZero); a.xorRegReg('rax'); a.label(countDone); a.ret();

    a.label('__lsx_table_capacity');
    a.testRegReg('rcx'); const capZero = a.unique('table_cap_zero'); const capDone = a.unique('table_cap_done');
    a.jz(capZero); a.movRegMemBase('rax', 'rcx', 16, 8); a.jmp(capDone);
    a.label(capZero); a.xorRegReg('rax'); a.label(capDone); a.ret();

    a.label('__lsx_table_data');
    a.testRegReg('rcx'); const dataFail = a.unique('table_data_fail'); const dataDone = a.unique('table_data_done');
    a.jz(dataFail); a.movRegMemBase('rax', 'rcx', 0, 8); a.jmp(dataDone);
    a.label(dataFail); a.xorRegReg('rax'); a.label(dataDone); a.ret();

    a.label('__lsx_table_byte_length');
    a.testRegReg('rcx'); const byteLengthFail = a.unique('table_byte_length_fail'); const byteLengthDone = a.unique('table_byte_length_done');
    a.jz(byteLengthFail); a.movRegMemBase('rax', 'rcx', 8, 8); a.movRegMemBase('rdx', 'rcx', 24, 8); a.imulRegReg('rax', 'rdx'); a.jmp(byteLengthDone);
    a.label(byteLengthFail); a.xorRegReg('rax'); a.label(byteLengthDone); a.ret();

    a.label('__lsx_table_copy_from_ptr');
    const copyFromPtrFail = a.unique('table_copy_from_ptr_fail');
    const copyFromPtrDone = a.unique('table_copy_from_ptr_done');
    a.testRegReg('rcx'); a.jz(copyFromPtrFail);
    a.testRegReg('rdx'); a.jz(copyFromPtrFail);
    a.cmpRegImm32('r8', 0); a.jl(copyFromPtrFail);
    a.movRegMemBase('r9', 'rcx', 8, 8);
    a.movRegMemBase('rax', 'rcx', 24, 8); a.imulRegReg('r9', 'rax');
    a.cmpRegReg('r8', 'r9'); a.jg(copyFromPtrFail);
    a.movRegMemBase('rcx', 'rcx', 0, 8); a.testRegReg('rcx'); a.jz(copyFromPtrFail);
    a.subRsp(0x28); a.callIat(this.requireImport('msvcrt.dll', 'memcpy')); a.addRsp(0x28);
    a.movRegImmSmart('rax', 1n); a.jmp(copyFromPtrDone);
    a.label(copyFromPtrFail); a.xorRegReg('rax');
    a.label(copyFromPtrDone); a.ret();

    a.label('__lsx_table_first_ptr');
    a.testRegReg('rcx'); const firstFail = a.unique('table_first_fail'); const firstDone = a.unique('table_first_done');
    a.jz(firstFail); a.movRegMemBase('rdx', 'rcx', 8, 8); a.testRegReg('rdx'); a.jz(firstFail);
    a.movRegMemBase('rax', 'rcx', 0, 8); a.jmp(firstDone);
    a.label(firstFail); a.xorRegReg('rax'); a.label(firstDone); a.ret();

    a.label('__lsx_table_last_ptr');
    a.testRegReg('rcx'); const lastFail = a.unique('table_last_fail'); const lastDone = a.unique('table_last_done');
    a.jz(lastFail); a.movRegMemBase('rdx', 'rcx', 8, 8); a.testRegReg('rdx'); a.jz(lastFail); a.subRegImm32('rdx', 1);
    a.movRegMemBase('rax', 'rcx', 24, 8); a.imulRegReg('rax', 'rdx'); a.movRegMemBase('r8', 'rcx', 0, 8); a.addRegReg('rax', 'r8'); a.jmp(lastDone);
    a.label(lastFail); a.xorRegReg('rax'); a.label(lastDone); a.ret();

    a.label('__lsx_table_is_empty');
    const emptyTrue = a.unique('table_empty_true'); const emptyDone = a.unique('table_empty_done');
    a.testRegReg('rcx'); a.jz(emptyTrue); a.movRegMemBase('rax', 'rcx', 8, 8); a.testRegReg('rax'); a.jz(emptyTrue);
    a.xorRegReg('rax'); a.jmp(emptyDone); a.label(emptyTrue); a.movRegImmSmart('rax', 1n); a.label(emptyDone); a.ret();

    a.label('__lsx_table_reserve');
    a.subRsp(0x68); a.movMemRspReg(40, 'rcx'); a.movMemRspReg(48, 'rdx');
    const reserveFail = a.unique('table_reserve_fail');
    const reserveTrue = a.unique('table_reserve_true');
    const reserveCopy = a.unique('table_reserve_copy');
    const reserveCopyDone = a.unique('table_reserve_copy_done');
    a.testRegReg('rcx'); a.jz(reserveFail);
    a.movRegMemBase('rax', 'rcx', 16, 8); a.cmpRegReg('rdx', 'rax'); a.jle(reserveTrue);
    a.movRegMemBase('rax', 'rcx', 24, 8); a.imulRegReg('rax', 'rdx');
    a.movRegReg('rcx', 'rax'); a.callLabel('__lsx_memory_alloc');
    a.testRegReg('rax'); a.jz(reserveFail);
    a.movMemRspReg(56, 'rax');
    a.movRegMemRsp('r10', 40); a.movRegMemBase('r11', 'r10', 0, 8); a.movMemRspReg(64, 'r11');
    a.movRegMemBase('r8', 'r10', 8, 8); a.movRegMemBase('r9', 'r10', 24, 8); a.imulRegReg('r8', 'r9');
    a.movRegMemRsp('r10', 64); a.movRegMemRsp('r11', 56);
    a.label(reserveCopy); a.testRegReg('r8'); a.jz(reserveCopyDone);
    a.movRegMemBase('rax', 'r10', 0, 1); a.movMemBaseReg('r11', 0, 'rax', 1);
    a.addRegImm32('r10', 1); a.addRegImm32('r11', 1); a.subRegImm32('r8', 1); a.jmp(reserveCopy);
    a.label(reserveCopyDone);
    a.movRegMemRsp('r10', 40); a.movRegMemRsp('rax', 56); a.movMemBaseReg('r10', 0, 'rax', 8);
    a.movRegMemRsp('rax', 48); a.movMemBaseReg('r10', 16, 'rax', 8);
    a.movRegMemRsp('rcx', 64); a.testRegReg('rcx'); a.jz(reserveTrue); a.callLabel('__lsx_memory_free');
    a.label(reserveTrue); a.movRegImmSmart('rax', 1n); a.addRsp(0x68); a.ret();
    a.label(reserveFail); a.xorRegReg('rax'); a.addRsp(0x68); a.ret();

    a.label('__lsx_table_resize');
    a.subRsp(0x78); a.movMemRspReg(40, 'rcx'); a.movMemRspReg(48, 'rdx');
    const resizeFail = a.unique('table_resize_fail');
    const resizeStore = a.unique('table_resize_store');
    const resizeZero = a.unique('table_resize_zero');
    const resizeZeroDone = a.unique('table_resize_zero_done');
    const resizeDone = a.unique('table_resize_done');
    a.testRegReg('rcx'); a.jz(resizeFail);
    a.cmpRegImm32('rdx', 0); a.jl(resizeFail);
    a.movRegMemBase('rax', 'rcx', 8, 8); a.movMemRspReg(56, 'rax');
    a.cmpRegReg('rdx', 'rax'); a.jle(resizeStore);
    a.movRegMemRsp('rcx', 40); a.movRegMemRsp('rdx', 48); a.callLabel('__lsx_table_reserve');
    a.testRegReg('rax'); a.jz(resizeFail);
    a.movRegMemRsp('r10', 40);
    a.movRegMemBase('r11', 'r10', 0, 8);
    a.movRegMemBase('rax', 'r10', 24, 8);
    a.movRegMemRsp('rdx', 56); a.imulRegReg('rdx', 'rax'); a.addRegReg('r11', 'rdx');
    a.movRegMemRsp('r8', 48); a.movRegMemRsp('rdx', 56); a.subRegReg('r8', 'rdx'); a.imulRegReg('r8', 'rax');
    a.xorRegReg('rax');
    a.label(resizeZero); a.testRegReg('r8'); a.jz(resizeZeroDone);
    a.movMemBaseReg('r11', 0, 'rax', 1); a.addRegImm32('r11', 1); a.subRegImm32('r8', 1); a.jmp(resizeZero);
    a.label(resizeZeroDone);
    a.label(resizeStore);
    a.movRegMemRsp('r10', 40); a.movRegMemRsp('rax', 48); a.movMemBaseReg('r10', 8, 'rax', 8);
    a.movRegImmSmart('rax', 1n); a.jmp(resizeDone);
    a.label(resizeFail); a.xorRegReg('rax');
    a.label(resizeDone); a.addRsp(0x78); a.ret();

    a.label('__lsx_table_get_ptr');
    a.testRegReg('rcx'); const getFail = a.unique('table_get_fail'); const getDone = a.unique('table_get_done');
    a.jz(getFail); a.cmpRegImm32('rdx', 0); a.jl(getFail);
    a.movRegMemBase('r8', 'rcx', 8, 8); a.cmpRegReg('rdx', 'r8'); a.jge(getFail);
    a.movRegMemBase('rax', 'rcx', 24, 8); a.imulRegReg('rax', 'rdx');
    a.movRegMemBase('r8', 'rcx', 0, 8); a.addRegReg('rax', 'r8'); a.jmp(getDone);
    a.label(getFail); a.xorRegReg('rax'); a.label(getDone); a.ret();

    a.label('__lsx_table_add_zeroed');
    a.subRsp(0x58); a.movMemRspReg(40, 'rcx');
    const addFail = a.unique('table_add_fail'); const addCapacityReady = a.unique('table_add_capacity_ready');
    const addZeroLoop = a.unique('table_add_zero_loop'); const addZeroDone = a.unique('table_add_zero_done');
    a.testRegReg('rcx'); a.jz(addFail);
    a.movRegMemBase('rax', 'rcx', 8, 8); a.movRegMemBase('rdx', 'rcx', 16, 8); a.cmpRegReg('rax', 'rdx'); a.jl(addCapacityReady);
    a.testRegReg('rdx'); const addDouble = a.unique('table_add_double'); a.jnz(addDouble); a.movRegImmSmart('rdx', 4n); const addReserve = a.unique('table_add_reserve'); a.jmp(addReserve);
    a.label(addDouble); a.addRegReg('rdx', 'rdx');
    a.label(addReserve); a.callLabel('__lsx_table_reserve'); a.testRegReg('rax'); a.jz(addFail);
    a.movRegMemRsp('rcx', 40);
    a.label(addCapacityReady);
    a.movRegMemBase('rdx', 'rcx', 8, 8); a.movRegMemBase('rax', 'rcx', 24, 8); a.imulRegReg('rax', 'rdx');
    a.movRegMemBase('r10', 'rcx', 0, 8); a.addRegReg('r10', 'rax'); a.movMemRspReg(48, 'r10');
    a.addRegImm32('rdx', 1); a.movMemBaseReg('rcx', 8, 'rdx', 8);
    a.movRegMemBase('r8', 'rcx', 24, 8); a.xorRegReg('rax');
    a.label(addZeroLoop); a.testRegReg('r8'); a.jz(addZeroDone); a.movMemBaseReg('r10', 0, 'rax', 1); a.addRegImm32('r10', 1); a.subRegImm32('r8', 1); a.jmp(addZeroLoop);
    a.label(addZeroDone); a.movRegMemRsp('rax', 48); a.addRsp(0x58); a.ret();
    a.label(addFail); a.xorRegReg('rax'); a.addRsp(0x58); a.ret();

    a.label('__lsx_table_add_copy');
    a.subRsp(0x48); a.movMemRspReg(40, 'rcx'); a.movMemRspReg(48, 'rdx'); a.xorRegReg('rax'); a.movMemRspReg(56, 'rax');
    const addCopyDone = a.unique('table_add_copy_done');
    a.testRegReg('rdx'); a.jz(addCopyDone);
    a.callLabel('__lsx_table_add_zeroed');
    a.testRegReg('rax'); a.jz(addCopyDone); a.movMemRspReg(56, 'rax');
    a.movRegMemRsp('r10', 48); a.movRegReg('r11', 'rax'); a.movRegMemRsp('rcx', 40); a.movRegMemBase('r8', 'rcx', 24, 8);
    const addCopyLoop = a.unique('table_add_copy_loop'); a.label(addCopyLoop); a.testRegReg('r8'); a.jz(addCopyDone);
    a.movRegMemBase('rax', 'r10', 0, 1); a.movMemBaseReg('r11', 0, 'rax', 1); a.addRegImm32('r10', 1); a.addRegImm32('r11', 1); a.subRegImm32('r8', 1); a.jmp(addCopyLoop);
    a.label(addCopyDone); a.movRegMemRsp('rax', 56); a.addRsp(0x48); a.ret();

    a.label('__lsx_table_clear');
    a.testRegReg('rcx'); const clearDone = a.unique('table_clear_done'); a.jz(clearDone);
    a.movRegMemBase('r8', 'rcx', 8, 8); a.movRegMemBase('r9', 'rcx', 24, 8); a.imulRegReg('r8', 'r9');
    a.movRegMemBase('r10', 'rcx', 0, 8); a.xorRegReg('rax');
    const clearLoop = a.unique('table_clear_loop'); a.label(clearLoop); a.testRegReg('r8'); a.jz(clearDone);
    a.movMemBaseReg('r10', 0, 'rax', 1); a.addRegImm32('r10', 1); a.subRegImm32('r8', 1); a.jmp(clearLoop);
    a.label(clearDone); a.testRegReg('rcx'); const clearReturn = a.unique('table_clear_return'); a.jz(clearReturn); a.xorRegReg('rax'); a.movMemBaseReg('rcx', 8, 'rax', 8);
    a.label(clearReturn); a.xorRegReg('rax'); a.ret();

    a.label('__lsx_table_remove_at');
    a.subRsp(0x48); a.movMemRspReg(40, 'rcx'); a.movMemRspReg(48, 'rdx');
    const removeFail = a.unique('table_remove_fail'); const removeCopy = a.unique('table_remove_copy'); const removeCopyDone = a.unique('table_remove_copy_done'); const removeZero = a.unique('table_remove_zero'); const removeDone = a.unique('table_remove_done');
    a.testRegReg('rcx'); a.jz(removeFail); a.cmpRegImm32('rdx', 0); a.jl(removeFail);
    a.movRegMemBase('r8', 'rcx', 8, 8); a.cmpRegReg('rdx', 'r8'); a.jge(removeFail);
    a.movRegMemBase('r9', 'rcx', 24, 8); a.movRegReg('rax', 'rdx'); a.imulRegReg('rax', 'r9');
    a.movRegMemBase('r10', 'rcx', 0, 8); a.addRegReg('r10', 'rax'); a.movRegReg('r11', 'r10'); a.addRegReg('r11', 'r9');
    a.subRegReg('r8', 'rdx'); a.subRegImm32('r8', 1); a.imulRegReg('r8', 'r9');
    a.label(removeCopy); a.testRegReg('r8'); a.jz(removeCopyDone); a.movRegMemBase('rax', 'r11', 0, 1); a.movMemBaseReg('r10', 0, 'rax', 1); a.addRegImm32('r10', 1); a.addRegImm32('r11', 1); a.subRegImm32('r8', 1); a.jmp(removeCopy);
    a.label(removeCopyDone);
    a.movRegMemRsp('rcx', 40); a.movRegMemBase('r8', 'rcx', 8, 8); a.subRegImm32('r8', 1); a.movMemBaseReg('rcx', 8, 'r8', 8);
    a.movRegMemBase('r9', 'rcx', 24, 8); a.movRegReg('rax', 'r8'); a.imulRegReg('rax', 'r9'); a.movRegMemBase('r10', 'rcx', 0, 8); a.addRegReg('r10', 'rax'); a.xorRegReg('rax');
    a.label(removeZero); a.testRegReg('r9'); a.jz(removeDone); a.movMemBaseReg('r10', 0, 'rax', 1); a.addRegImm32('r10', 1); a.subRegImm32('r9', 1); a.jmp(removeZero);
    a.label(removeDone); a.movRegImmSmart('rax', 1n); a.addRsp(0x48); a.ret();
    a.label(removeFail); a.xorRegReg('rax'); a.addRsp(0x48); a.ret();
    a.label('__lsx_table_remove_swap');
    a.subRsp(0x48); a.movMemRspReg(40, 'rcx'); a.movMemRspReg(48, 'rdx');
    const swapFail = a.unique('table_remove_swap_fail'); const swapSkipCopy = a.unique('table_remove_swap_skip_copy'); const swapCopy = a.unique('table_remove_swap_copy'); const swapZero = a.unique('table_remove_swap_zero'); const swapDone = a.unique('table_remove_swap_done');
    a.testRegReg('rcx'); a.jz(swapFail); a.cmpRegImm32('rdx', 0); a.jl(swapFail);
    a.movRegMemBase('r8', 'rcx', 8, 8); a.cmpRegReg('rdx', 'r8'); a.jge(swapFail); a.subRegImm32('r8', 1); a.movMemBaseReg('rcx', 8, 'r8', 8);
    a.movRegMemBase('r9', 'rcx', 24, 8); a.movRegMemBase('r10', 'rcx', 0, 8);
    a.movRegReg('rax', 'r8'); a.imulRegReg('rax', 'r9'); a.movRegReg('r11', 'r10'); a.addRegReg('r11', 'rax'); a.movMemRspReg(56, 'r11');
    a.cmpRegReg('rdx', 'r8'); a.jz(swapSkipCopy);
    a.movRegReg('rax', 'rdx'); a.imulRegReg('rax', 'r9'); a.addRegReg('r10', 'rax'); a.movRegReg('rax', 'r9');
    a.label(swapCopy); a.testRegReg('rax'); a.jz(swapSkipCopy); a.movRegMemBase('rcx', 'r11', 0, 1); a.movMemBaseReg('r10', 0, 'rcx', 1); a.addRegImm32('r11', 1); a.addRegImm32('r10', 1); a.subRegImm32('rax', 1); a.jmp(swapCopy);
    a.label(swapSkipCopy); a.movRegMemRsp('r11', 56); a.xorRegReg('rax');
    a.label(swapZero); a.testRegReg('r9'); a.jz(swapDone); a.movMemBaseReg('r11', 0, 'rax', 1); a.addRegImm32('r11', 1); a.subRegImm32('r9', 1); a.jmp(swapZero);
    a.label(swapDone); a.movRegImmSmart('rax', 1n); a.addRsp(0x48); a.ret();
    a.label(swapFail); a.xorRegReg('rax'); a.addRsp(0x48); a.ret();

    a.label('__lsx_table_pop');
    a.subRsp(0x28); const popFail = a.unique('table_pop_fail'); const popZero = a.unique('table_pop_zero'); const popDone = a.unique('table_pop_done');
    a.testRegReg('rcx'); a.jz(popFail); a.movRegMemBase('rdx', 'rcx', 8, 8); a.testRegReg('rdx'); a.jz(popFail); a.subRegImm32('rdx', 1); a.movMemBaseReg('rcx', 8, 'rdx', 8);
    a.movRegMemBase('r8', 'rcx', 24, 8); a.movRegReg('rax', 'rdx'); a.imulRegReg('rax', 'r8'); a.movRegMemBase('r10', 'rcx', 0, 8); a.addRegReg('r10', 'rax'); a.xorRegReg('rax');
    a.label(popZero); a.testRegReg('r8'); a.jz(popDone); a.movMemBaseReg('r10', 0, 'rax', 1); a.addRegImm32('r10', 1); a.subRegImm32('r8', 1); a.jmp(popZero);
    a.label(popDone); a.movRegImmSmart('rax', 1n); a.addRsp(0x28); a.ret();
    a.label(popFail); a.xorRegReg('rax'); a.addRsp(0x28); a.ret();
  }

  emitSimdRuntime() {
    const a = this.asm;
    a.label('__lsx_simd_copy_f32x4'); a.movupsXmmMemBase('xmm0', 'rdx'); a.movupsMemBaseXmm('rcx', 0, 'xmm0'); a.xorRegReg('rax'); a.ret();
    a.label('__lsx_simd_add_f32x4'); a.movupsXmmMemBase('xmm0', 'rdx'); a.movupsXmmMemBase('xmm1', 'r8'); a.addps('xmm0', 'xmm1'); a.movupsMemBaseXmm('rcx', 0, 'xmm0'); a.xorRegReg('rax'); a.ret();
    a.label('__lsx_simd_sub_f32x4'); a.movupsXmmMemBase('xmm0', 'rdx'); a.movupsXmmMemBase('xmm1', 'r8'); a.subps('xmm0', 'xmm1'); a.movupsMemBaseXmm('rcx', 0, 'xmm0'); a.xorRegReg('rax'); a.ret();
    a.label('__lsx_simd_mul_f32x4'); a.movupsXmmMemBase('xmm0', 'rdx'); a.movupsXmmMemBase('xmm1', 'r8'); a.mulps('xmm0', 'xmm1'); a.movupsMemBaseXmm('rcx', 0, 'xmm0'); a.xorRegReg('rax'); a.ret();
    a.label('__lsx_simd_madd_f32x4'); a.movupsXmmMemBase('xmm0', 'rdx'); a.movupsXmmMemBase('xmm1', 'r8'); a.mulps('xmm0', 'xmm1'); a.movupsXmmMemBase('xmm1', 'r9'); a.addps('xmm0', 'xmm1'); a.movupsMemBaseXmm('rcx', 0, 'xmm0'); a.xorRegReg('rax'); a.ret();
    a.label('__lsx_simd_scale_f32x4'); a.movupsXmmMemBase('xmm0', 'rdx'); a.shufps('xmm2', 'xmm2', 0x00); a.mulps('xmm0', 'xmm2'); a.movupsMemBaseXmm('rcx', 0, 'xmm0'); a.xorRegReg('rax'); a.ret();
    a.label('__lsx_simd_dot_f32x4'); a.movupsXmmMemBase('xmm0', 'rcx'); a.movupsXmmMemBase('xmm1', 'rdx'); a.mulps('xmm0', 'xmm1'); a.movaps('xmm1', 'xmm0'); a.shufps('xmm1', 'xmm1', 0x4E); a.addps('xmm0', 'xmm1'); a.movaps('xmm1', 'xmm0'); a.shufps('xmm1', 'xmm1', 0xB1); a.addss('xmm0', 'xmm1'); a.ret();
  }

  emitDebugRuntime() {
    const a = this.asm;
    const messageBox = this.requireImport('USER32.dll', 'MessageBoxA');
    const outputDebug = this.requireImport('KERNEL32.dll', 'OutputDebugStringA');
    a.label('__lsx_debug_message');
    a.subRsp(0x28); a.movRegReg('r8', 'rcx'); a.xorRegReg('rcx'); a.xorRegReg('r9'); a.callIat(messageBox); a.addRsp(0x28); a.ret();
    a.label('__lsx_debug_output');
    a.subRsp(0x28); a.callIat(outputDebug); a.xorRegReg('rax'); a.addRsp(0x28); a.ret();
  }

  emitConsoleRuntime() {
    const a = this.asm;
    const allocConsole = this.requireImport('KERNEL32.dll', 'AllocConsole');
    const freeConsole = this.requireImport('KERNEL32.dll', 'FreeConsole');
    const getStdHandle = this.requireImport('KERNEL32.dll', 'GetStdHandle');
    const setConsoleTitle = this.requireImport('KERNEL32.dll', 'SetConsoleTitleA');
    const writeFile = this.requireImport('KERNEL32.dll', 'WriteFile');
    const readFile = this.requireImport('KERNEL32.dll', 'ReadFile');
    const stringLength = this.requireImport('KERNEL32.dll', 'lstrlenA');

    // Internal helper: rcx = output handle, rdx = zero-terminated ASCII text.
    a.label('__lsx_console_write_handle');
    a.subRsp(0x38);
    a.movMemRspReg(40, 'rcx');
    a.movMemRspReg(48, 'rdx');
    a.movRegReg('rcx', 'rdx');
    a.callIat(stringLength);
    a.movRegReg('r8', 'rax');
    a.movRegMemRsp('rcx', 40);
    a.movRegMemRsp('rdx', 48);
    a.leaRip('r9', 'data_console_written');
    a.movMemRspImm32(32, 0);
    a.callIat(writeFile);
    a.addRsp(0x38);
    a.ret();

    a.label('__lsx_console_open');
    a.subRsp(0x38);
    a.movMemRspReg(40, 'rcx');
    const consoleNeedAlloc = a.unique('console_need_alloc');
    const consoleReady = a.unique('console_ready');
    const consoleNoTitle = a.unique('console_no_title');
    const consoleFail = a.unique('console_fail');
    const consoleDone = a.unique('console_done');

    // A VS Code terminal may provide valid standard handles without a visible
    // GetConsoleWindow result. Prefer those handles before allocating a console.
    a.movRegImm32('rcx', 0xFFFFFFF5); // STD_OUTPUT_HANDLE
    a.callIat(getStdHandle);
    a.testRegReg('rax'); a.jz(consoleNeedAlloc);
    a.cmpRegImm32('rax', -1); a.jz(consoleNeedAlloc);
    a.jmp(consoleReady);

    a.label(consoleNeedAlloc);
    a.callIat(allocConsole);
    a.testRegReg('rax'); a.jz(consoleFail);

    a.label(consoleReady);
    a.movRegMemRsp('rcx', 40);
    a.testRegReg('rcx'); a.jz(consoleNoTitle);
    a.callIat(setConsoleTitle);
    a.label(consoleNoTitle);

    a.movRegImm32('rcx', 0xFFFFFFF5); // STD_OUTPUT_HANDLE
    a.callIat(getStdHandle);
    a.movRipReg('data_console_stdout', 'rax');
    a.movRegImm32('rcx', 0xFFFFFFF4); // STD_ERROR_HANDLE
    a.callIat(getStdHandle);
    a.movRipReg('data_console_stderr', 'rax');
    a.movRegImm32('rcx', 0xFFFFFFF6); // STD_INPUT_HANDLE
    a.callIat(getStdHandle);
    a.movRipReg('data_console_stdin', 'rax');

    a.movRegRip('rax', 'data_console_stdout');
    a.testRegReg('rax'); a.jz(consoleFail);
    a.cmpRegImm32('rax', -1); a.jz(consoleFail);
    a.movRegRip('rax', 'data_console_stdin');
    a.testRegReg('rax'); a.jz(consoleFail);
    a.cmpRegImm32('rax', -1); a.jz(consoleFail);
    a.movRegImm64('rax', 1);
    a.jmp(consoleDone);

    a.label(consoleFail); a.xorRegReg('rax');
    a.label(consoleDone);
    a.addRsp(0x38);
    a.ret();

    a.label('__lsx_console_write');
    a.subRsp(0x28);
    a.movRegReg('rdx', 'rcx');
    a.movRegRip('rcx', 'data_console_stdout');
    a.callLabel('__lsx_console_write_handle');
    a.xorRegReg('rax');
    a.addRsp(0x28);
    a.ret();

    a.label('__lsx_console_write_line');
    a.subRsp(0x28);
    a.movRegReg('rdx', 'rcx');
    a.movRegRip('rcx', 'data_console_stdout');
    a.callLabel('__lsx_console_write_handle');
    a.movRegRip('rcx', 'data_console_stdout');
    a.leaRip('rdx', 'str_console_newline');
    a.callLabel('__lsx_console_write_handle');
    a.xorRegReg('rax');
    a.addRsp(0x28);
    a.ret();

    a.label('__lsx_console_error');
    a.subRsp(0x28);
    a.movRegReg('rdx', 'rcx');
    a.movRegRip('rcx', 'data_console_stderr');
    a.callLabel('__lsx_console_write_handle');
    a.xorRegReg('rax');
    a.addRsp(0x28);
    a.ret();

    a.label('__lsx_console_error_line');
    a.subRsp(0x28);
    a.movRegReg('rdx', 'rcx');
    a.movRegRip('rcx', 'data_console_stderr');
    a.callLabel('__lsx_console_write_handle');
    a.movRegRip('rcx', 'data_console_stderr');
    a.leaRip('rdx', 'str_console_newline');
    a.callLabel('__lsx_console_write_handle');
    a.xorRegReg('rax');
    a.addRsp(0x28);
    a.ret();

    a.label('__lsx_console_wait');
    a.subRsp(0x38);
    a.movRegRip('rcx', 'data_console_stdout');
    a.leaRip('rdx', 'str_console_wait');
    a.callLabel('__lsx_console_write_handle');
    a.movRegRip('rcx', 'data_console_stdin');
    a.leaRip('rdx', 'data_console_input');
    a.movRegImm32('r8', 2);
    a.leaRip('r9', 'data_console_read');
    a.movMemRspImm32(32, 0);
    a.callIat(readFile);
    a.xorRegReg('rax');
    a.addRsp(0x38);
    a.ret();

    a.label('__lsx_console_close');
    a.subRsp(0x28);
    a.callIat(freeConsole);
    a.xorRegReg('rax');
    a.addRsp(0x28);
    a.ret();
  }

  emitSystemRuntime() {
    const a = this.asm;
    const sleep = this.requireImport('KERNEL32.dll', 'Sleep');
    const exit = this.requireImport('KERNEL32.dll', 'ExitProcess');
    a.label('__lsx_system_sleep'); a.subRsp(0x28); a.callIat(sleep); a.xorRegReg('rax'); a.addRsp(0x28); a.ret();
    a.label('__lsx_system_exit'); a.subRsp(0x28); a.callIat(exit); a.int3();
  }

  emitStringRuntime() {
    const a = this.asm;
    const stringLength = this.requireImport('KERNEL32.dll', 'lstrlenA');
    const stringCompare = this.requireImport('KERNEL32.dll', 'lstrcmpA');

    a.label('__lsx_string_length');
    a.subRsp(0x28);
    const empty = a.unique('string_length_empty');
    const done = a.unique('string_length_done');
    a.testRegReg('rcx'); a.jz(empty);
    a.callIat(stringLength); a.movsxdRaxEax(); a.jmp(done);
    a.label(empty); a.xorRegReg('rax');
    a.label(done); a.addRsp(0x28); a.ret();

    // Returns one unsigned UTF-8 byte. The caller may use string.length first
    // when it needs checked indexing; this stays a direct native load.
    a.label('__lsx_string_byte_at');
    const byteEmpty = a.unique('string_byte_empty');
    a.testRegReg('rcx'); a.jz(byteEmpty);
    a.cmpRegImm32('rdx', 0); a.jl(byteEmpty);
    a.leaRaxRcxPlusRdx(); a.loadRaxAtRax(1); a.ret();
    a.label(byteEmpty); a.xorRegReg('rax'); a.ret();

    a.label('__lsx_string_data_at');
    const dataEmpty = a.unique('string_data_empty');
    a.testRegReg('rcx'); a.jz(dataEmpty);
    a.cmpRegImm32('rdx', 0); a.jl(dataEmpty);
    a.leaRaxRcxPlusRdx(); a.ret();
    a.label(dataEmpty); a.xorRegReg('rax'); a.ret();

    a.label('__lsx_string_equals');
    const equalsTrue = a.unique('string_equals_true');
    const equalsFalse = a.unique('string_equals_false');
    const equalsDone = a.unique('string_equals_done');
    a.cmpRegReg('rcx', 'rdx'); a.jz(equalsTrue);
    a.testRegReg('rcx'); a.jz(equalsFalse);
    a.testRegReg('rdx'); a.jz(equalsFalse);
    a.subRsp(0x28); a.callIat(stringCompare); a.addRsp(0x28);
    a.testRegReg('rax'); a.setcc(0x94); a.movzxRaxAl(); a.jmp(equalsDone);
    a.label(equalsTrue); a.movRegImm32('rax', 1); a.jmp(equalsDone);
    a.label(equalsFalse); a.xorRegReg('rax');
    a.label(equalsDone); a.ret();

    a.label('__lsx_string_compare');
    const compareLeftEmpty = a.unique('string_compare_left_empty');
    const compareRightEmpty = a.unique('string_compare_right_empty');
    const compareSame = a.unique('string_compare_same');
    a.cmpRegReg('rcx', 'rdx'); a.jz(compareSame);
    a.testRegReg('rcx'); a.jz(compareLeftEmpty);
    a.testRegReg('rdx'); a.jz(compareRightEmpty);
    a.subRsp(0x28); a.callIat(stringCompare); a.movsxdRaxEax(); a.addRsp(0x28); a.ret();
    a.label(compareLeftEmpty); a.movRegImmSigned32('rax', -1); a.ret();
    a.label(compareRightEmpty); a.movRegImm32('rax', 1); a.ret();
    a.label(compareSame); a.xorRegReg('rax'); a.ret();

    // A string is a UTF-8 pointer in the native ABI. This conversion gives
    // owned byte buffers and file/JSON views a clean typed string surface.
    a.label('__lsx_string_from_utf8');
    a.movRegReg('rax', 'rcx'); a.ret();
  }

  emitThreadRuntime() {
    const a = this.asm;
    const createThread = this.requireImport('KERNEL32.dll', 'CreateThread');
    const waitForSingleObject = this.requireImport('KERNEL32.dll', 'WaitForSingleObject');
    const getExitCodeThread = this.requireImport('KERNEL32.dll', 'GetExitCodeThread');
    const closeHandle = this.requireImport('KERNEL32.dll', 'CloseHandle');
    const getCurrentThreadId = this.requireImport('KERNEL32.dll', 'GetCurrentThreadId');
    const getThreadId = this.requireImport('KERNEL32.dll', 'GetThreadId');
    const getCurrentThread = this.requireImport('KERNEL32.dll', 'GetCurrentThread');
    const switchToThread = this.requireImport('KERNEL32.dll', 'SwitchToThread');
    const getActiveProcessorCount = this.requireImport('KERNEL32.dll', 'GetActiveProcessorCount');
    const setThreadPriority = this.requireImport('KERNEL32.dll', 'SetThreadPriority');
    const exitThread = this.requireImport('KERNEL32.dll', 'ExitThread');

    // rcx = LSX entry function, rdx = context pointer/value.
    a.label('__lsx_thread_start');
    a.subRsp(0x48);
    a.movMemRspReg(48, 'rcx');
    a.movMemRspReg(56, 'rdx');
    a.xorRegReg('rcx');
    a.xorRegReg('rdx');
    a.movRegMemRsp('r8', 48);
    a.movRegMemRsp('r9', 56);
    a.movMemRspImm32(32, 0);
    a.movMemRspImm32(40, 0);
    a.callIat(createThread);
    a.addRsp(0x48);
    a.ret();

    // rcx = LSX entry function, rdx = context, r8 = requested stack size.
    a.label('__lsx_thread_start_with_stack');
    a.subRsp(0x48);
    a.movMemRspReg(48, 'rcx');
    a.movMemRspReg(56, 'rdx');
    a.movMemRspReg(64, 'r8');
    a.xorRegReg('rcx');
    a.movRegMemRsp('rdx', 64);
    a.movRegMemRsp('r8', 48);
    a.movRegMemRsp('r9', 56);
    a.movMemRspImm32(32, 0);
    a.movMemRspImm32(40, 0);
    a.callIat(createThread);
    a.addRsp(0x48);
    a.ret();

    a.label('__lsx_thread_join');
    a.subRsp(0x28);
    a.movRegImm32('rdx', 0xFFFFFFFF);
    a.callIat(waitForSingleObject);
    a.testRegReg('rax');
    a.setcc(0x94);
    a.movzxRaxAl();
    a.addRsp(0x28);
    a.ret();

    a.label('__lsx_thread_wait');
    a.subRsp(0x28);
    a.callIat(waitForSingleObject);
    a.addRsp(0x28);
    a.ret();

    a.label('__lsx_thread_is_finished');
    a.subRsp(0x28);
    a.xorRegReg('rdx');
    a.callIat(waitForSingleObject);
    a.testRegReg('rax');
    a.setcc(0x94);
    a.movzxRaxAl();
    a.addRsp(0x28);
    a.ret();

    a.label('__lsx_thread_exit_code');
    a.subRsp(0x38);
    a.movMemRspReg(40, 'rcx');
    a.movMemRspImm32(48, 0);
    a.leaRegMemBase('rdx', 'rsp', 48);
    a.callIat(getExitCodeThread);
    const exitCodeFail = a.unique('thread_exit_code_fail');
    const exitCodeDone = a.unique('thread_exit_code_done');
    a.testRegReg('rax'); a.jz(exitCodeFail);
    a.leaRegMemBase('rax', 'rsp', 48); a.loadRaxAtRax(4); a.jmp(exitCodeDone);
    a.label(exitCodeFail); a.movRegImmSmart('rax', -1n);
    a.label(exitCodeDone); a.addRsp(0x38); a.ret();

    a.label('__lsx_thread_close');
    a.subRsp(0x28);
    a.callIat(closeHandle);
    a.movsxdRaxEax();
    a.addRsp(0x28);
    a.ret();

    a.label('__lsx_thread_current_id');
    a.subRsp(0x28); a.callIat(getCurrentThreadId); a.addRsp(0x28); a.ret();

    a.label('__lsx_thread_id');
    a.subRsp(0x28); a.callIat(getThreadId); a.addRsp(0x28); a.ret();

    a.label('__lsx_thread_current_handle');
    a.subRsp(0x28); a.callIat(getCurrentThread); a.addRsp(0x28); a.ret();

    a.label('__lsx_thread_yield');
    a.subRsp(0x28); a.callIat(switchToThread); a.movsxdRaxEax(); a.addRsp(0x28); a.ret();

    a.label('__lsx_thread_cpu_count');
    a.subRsp(0x28); a.movRegImm32('rcx', 0xFFFF); a.callIat(getActiveProcessorCount); a.addRsp(0x28); a.ret();

    a.label('__lsx_thread_set_priority');
    a.subRsp(0x28); a.callIat(setThreadPriority); a.movsxdRaxEax(); a.addRsp(0x28); a.ret();

    a.label('__lsx_thread_exit');
    a.subRsp(0x28); a.callIat(exitThread); a.int3();
  }

  emitAtomicRuntime() {
    const a = this.asm;
    const used = this.program.usesBuiltins;

    if (used.has('atomic.i32_load')) {
      a.label('__lsx_atomic_i32_load');
      a.xorRegReg('rax');
      a.xorRegReg('rdx');
      a.atomicCmpxchgMemReg('rcx', 'rdx', 4);
      a.movsxdRaxEax();
      a.ret();
    }
    if (used.has('atomic.i32_store')) {
      a.label('__lsx_atomic_i32_store');
      a.atomicXchgMemReg('rcx', 'rdx', 4);
      a.xorRegReg('rax');
      a.ret();
    }
    if (used.has('atomic.i32_exchange')) {
      a.label('__lsx_atomic_i32_exchange');
      a.atomicXchgMemReg('rcx', 'rdx', 4);
      a.movsxdRegReg32('rax', 'rdx');
      a.ret();
    }
    if (used.has('atomic.i32_add')) {
      a.label('__lsx_atomic_i32_add');
      a.movRegReg32('r8', 'rdx');
      a.atomicXaddMemReg('rcx', 'rdx', 4);
      a.addRegReg32('rdx', 'r8');
      a.movsxdRegReg32('rax', 'rdx');
      a.ret();
    }
    if (used.has('atomic.i32_increment')) {
      a.label('__lsx_atomic_i32_increment');
      a.movRegImm32('rdx', 1);
      a.atomicXaddMemReg('rcx', 'rdx', 4);
      a.addRegImmDword('rdx', 1);
      a.movsxdRegReg32('rax', 'rdx');
      a.ret();
    }
    if (used.has('atomic.i32_decrement')) {
      a.label('__lsx_atomic_i32_decrement');
      a.movRegImm32('rdx', 0xFFFFFFFF);
      a.atomicXaddMemReg('rcx', 'rdx', 4);
      a.addRegImmDword('rdx', -1);
      a.movsxdRegReg32('rax', 'rdx');
      a.ret();
    }
    if (used.has('atomic.i32_compare_exchange')) {
      a.label('__lsx_atomic_i32_compare_exchange');
      a.movRegReg32('rax', 'r8');
      a.atomicCmpxchgMemReg('rcx', 'rdx', 4);
      a.movsxdRaxEax();
      a.ret();
    }

    if (used.has('atomic.i64_load')) {
      a.label('__lsx_atomic_i64_load');
      a.xorRegReg('rax');
      a.xorRegReg('rdx');
      a.atomicCmpxchgMemReg('rcx', 'rdx', 8);
      a.ret();
    }
    if (used.has('atomic.i64_store')) {
      a.label('__lsx_atomic_i64_store');
      a.atomicXchgMemReg('rcx', 'rdx', 8);
      a.xorRegReg('rax');
      a.ret();
    }
    if (used.has('atomic.i64_exchange')) {
      a.label('__lsx_atomic_i64_exchange');
      a.atomicXchgMemReg('rcx', 'rdx', 8);
      a.movRegReg('rax', 'rdx');
      a.ret();
    }
    if (used.has('atomic.i64_add')) {
      a.label('__lsx_atomic_i64_add');
      a.movRegReg('r8', 'rdx');
      a.atomicXaddMemReg('rcx', 'rdx', 8);
      a.addRegReg('rdx', 'r8');
      a.movRegReg('rax', 'rdx');
      a.ret();
    }
    if (used.has('atomic.i64_increment')) {
      a.label('__lsx_atomic_i64_increment');
      a.movRegImm32('rdx', 1);
      a.atomicXaddMemReg('rcx', 'rdx', 8);
      a.addRegImm32('rdx', 1);
      a.movRegReg('rax', 'rdx');
      a.ret();
    }
    if (used.has('atomic.i64_decrement')) {
      a.label('__lsx_atomic_i64_decrement');
      a.movRegImmSigned32('rdx', -1);
      a.atomicXaddMemReg('rcx', 'rdx', 8);
      a.addRegImm32('rdx', -1);
      a.movRegReg('rax', 'rdx');
      a.ret();
    }
    if (used.has('atomic.i64_compare_exchange')) {
      a.label('__lsx_atomic_i64_compare_exchange');
      a.movRegReg('rax', 'r8');
      a.atomicCmpxchgMemReg('rcx', 'rdx', 8);
      a.ret();
    }
  }

  emitFfiRuntime() {
    const a = this.asm;
    const used = this.program.usesBuiltins;
    if (used.has('ffi.call0')) {
      a.label('__lsx_ffi_call0'); a.subRsp(0x28); a.movRegReg('rax', 'rcx'); a.callReg('rax'); a.addRsp(0x28); a.ret();
    }
    if (used.has('ffi.call1')) {
      a.label('__lsx_ffi_call1'); a.subRsp(0x28); a.movRegReg('rax', 'rcx'); a.movRegReg('rcx', 'rdx'); a.callReg('rax'); a.addRsp(0x28); a.ret();
    }
    if (used.has('ffi.call2')) {
      a.label('__lsx_ffi_call2'); a.subRsp(0x28); a.movRegReg('rax', 'rcx'); a.movRegReg('rcx', 'rdx'); a.movRegReg('rdx', 'r8'); a.callReg('rax'); a.addRsp(0x28); a.ret();
    }
    if (used.has('ffi.call3')) {
      a.label('__lsx_ffi_call3'); a.subRsp(0x28); a.movRegReg('rax', 'rcx'); a.movRegReg('rcx', 'rdx'); a.movRegReg('rdx', 'r8'); a.movRegReg('r8', 'r9'); a.callReg('rax'); a.addRsp(0x28); a.ret();
    }
    if (used.has('ffi.call4')) {
      a.label('__lsx_ffi_call4');
      a.subRsp(0x38);
      a.movMemRspReg(32, 'rcx');
      a.movRegReg('rcx', 'rdx'); a.movRegReg('rdx', 'r8'); a.movRegReg('r8', 'r9');
      a.movRegMemRsp('r9', 0x38 + 40);
      a.movRegMemRsp('rax', 32);
      a.callReg('rax'); a.addRsp(0x38); a.ret();
    }
    if (used.has('ffi.call5')) {
      a.label('__lsx_ffi_call5');
      a.subRsp(0x38);
      a.movMemRspReg(48, 'rcx');
      a.movRegMemRsp('rax', 0x38 + 48); a.movMemRspReg(32, 'rax');
      a.movRegReg('rcx', 'rdx'); a.movRegReg('rdx', 'r8'); a.movRegReg('r8', 'r9');
      a.movRegMemRsp('r9', 0x38 + 40);
      a.movRegMemRsp('rax', 48);
      a.callReg('rax'); a.addRsp(0x38); a.ret();
    }
    if (used.has('ffi.call6')) {
      a.label('__lsx_ffi_call6');
      a.subRsp(0x48);
      a.movMemRspReg(64, 'rcx');
      a.movRegMemRsp('rax', 0x48 + 48); a.movMemRspReg(32, 'rax');
      a.movRegMemRsp('rax', 0x48 + 56); a.movMemRspReg(40, 'rax');
      a.movRegReg('rcx', 'rdx'); a.movRegReg('rdx', 'r8'); a.movRegReg('r8', 'r9');
      a.movRegMemRsp('r9', 0x48 + 40);
      a.movRegMemRsp('rax', 64);
      a.callReg('rax'); a.addRsp(0x48); a.ret();
    }
    if (used.has('ffi.call7')) {
      a.label('__lsx_ffi_call7');
      a.subRsp(0x48);
      a.movMemRspReg(64, 'rcx');
      a.movRegMemRsp('rax', 0x48 + 48); a.movMemRspReg(32, 'rax');
      a.movRegMemRsp('rax', 0x48 + 56); a.movMemRspReg(40, 'rax');
      a.movRegMemRsp('rax', 0x48 + 64); a.movMemRspReg(48, 'rax');
      a.movRegReg('rcx', 'rdx'); a.movRegReg('rdx', 'r8'); a.movRegReg('r8', 'r9');
      a.movRegMemRsp('r9', 0x48 + 40);
      a.movRegMemRsp('rax', 64);
      a.callReg('rax'); a.addRsp(0x48); a.ret();
    }
    if (used.has('ffi.call8')) {
      a.label('__lsx_ffi_call8');
      a.subRsp(0x48);
      a.movMemRspReg(64, 'rcx');
      a.movRegMemRsp('rax', 0x48 + 48); a.movMemRspReg(32, 'rax');
      a.movRegMemRsp('rax', 0x48 + 56); a.movMemRspReg(40, 'rax');
      a.movRegMemRsp('rax', 0x48 + 64); a.movMemRspReg(48, 'rax');
      a.movRegMemRsp('rax', 0x48 + 72); a.movMemRspReg(56, 'rax');
      a.movRegReg('rcx', 'rdx'); a.movRegReg('rdx', 'r8'); a.movRegReg('r8', 'r9');
      a.movRegMemRsp('r9', 0x48 + 40);
      a.movRegMemRsp('rax', 64);
      a.callReg('rax'); a.addRsp(0x48); a.ret();
    }
  }

  generate() {
    this.emitEntry();
    this.emitRuntime();
    this.emitStructConstructors();
    const functions = [];
    for (const module of this.program.moduleOrder) for (const fn of module.functions.values()) if (fn.reachable !== false) functions.push(fn);
    functions.sort((left, right) => {
      if (left === this.entryFunction) return -1;
      if (right === this.entryFunction) return 1;
      return Number(right.profileCount || 0) - Number(left.profileCount || 0);
    });
    for (const fn of functions) this.compileFunction(fn);
    return { asm: this.asm, stringValues: this.stringValues, binaryValues: this.binaryValues, runtimeImports: this.runtimeImports, pgoRecords: this.pgoRecords, pgoBlobSize: this.pgoBlobSize };
  }
}

function buildSections(program, root, entryFunction, optimizationLevel = 6, optimizationStats = null, options = {}) {
  const codegen = new CodeGenerator(program, root, entryFunction, optimizationLevel, optimizationStats, options);
  const generated = codegen.generate();

  const allImports = new Map(codegen.runtimeImports);
  for (const ext of program.imports.values()) {
    if (!program.usedExternImports || program.usedExternImports.has(ext.importKey)) allImports.set(ext.importKey, ext);
  }
  const groups = new Map();
  for (const imp of allImports.values()) {
    const key = imp.dll.toLowerCase();
    if (!groups.has(key)) groups.set(key, { dll: imp.dll, functions: new Map() });
    groups.get(key).functions.set(imp.name, imp);
  }
  const dllGroups = [...groups.values()].sort((a, b) => a.dll.localeCompare(b.dll));

  const rdata = new BinaryBuilder();
  rdata.mark('str_window_class'); rdata.ascii('LazyScriptEXWindowClass');
  rdata.mark('str_console_newline'); rdata.ascii('\r\n');
  rdata.mark('str_console_wait'); rdata.ascii('Press Enter to close...');
  for (const blob of codegen.binaryValues.values()) {
    rdata.align(4);
    rdata.mark(blob.symbol);
    rdata.bytes(blob.buffer);
  }
  for (const [value, symbol] of codegen.stringValues) {
    rdata.mark(symbol);
    if (!/^[\x00-\x7F]*$/.test(value)) throw new CompileError(`version ${VERSION} currently supports ASCII runtime strings`);
    rdata.ascii(value);
  }
  for (const group of dllGroups) {
    group.dllSymbol = `dll_${stableId(group.dll.toLowerCase())}`;
    rdata.mark(group.dllSymbol); rdata.ascii(group.dll);
    for (const imp of group.functions.values()) {
      rdata.align(2);
      imp.nameSymbol = `impname_${stableId(imp.importKey || `${group.dll.toLowerCase()}::${imp.name}`)}`;
      rdata.mark(imp.nameSymbol); rdata.u16(0); rdata.ascii(imp.name);
    }
  }
  rdata.align(8);

  const data = new BinaryBuilder();
  data.align(16); data.mark('data_wndclass'); data.zeros(80);
  data.symbols.set('data_wndclass_style', data.symbols.get('data_wndclass') + 4);
  data.symbols.set('data_wndclass_wndproc', data.symbols.get('data_wndclass') + 8);
  data.symbols.set('data_wndclass_hinstance', data.symbols.get('data_wndclass') + 24);
  data.symbols.set('data_wndclass_hcursor', data.symbols.get('data_wndclass') + 40);
  data.symbols.set('data_wndclass_hbackground', data.symbols.get('data_wndclass') + 48);
  data.symbols.set('data_wndclass_classname', data.symbols.get('data_wndclass') + 64);
  data.align(16); data.mark('data_msg'); data.zeros(48);
  data.symbols.set('data_msg_message', data.symbols.get('data_msg') + 8);
  data.align(16); data.mark('data_window_rect'); data.zeros(16);
  data.symbols.set('data_window_rect_left', data.symbols.get('data_window_rect') + 0);
  data.symbols.set('data_window_rect_top', data.symbols.get('data_window_rect') + 4);
  data.symbols.set('data_window_rect_right', data.symbols.get('data_window_rect') + 8);
  data.symbols.set('data_window_rect_bottom', data.symbols.get('data_window_rect') + 12);
  data.align(8); data.mark('data_window_hinstance'); data.zeros(8);
  data.mark('data_window_hwnd'); data.zeros(8);
  data.mark('data_window_open'); data.zeros(8);
  data.mark('data_window_class_registered'); data.zeros(8);
  data.mark('data_console_stdout'); data.zeros(8);
  data.mark('data_console_stderr'); data.zeros(8);
  data.mark('data_console_stdin'); data.zeros(8);
  data.mark('data_console_written'); data.zeros(8);
  data.mark('data_console_read'); data.zeros(8);
  data.mark('data_console_input'); data.zeros(8);
  data.mark('data_runtime_written'); data.zeros(8);
  data.mark('data_process_heap'); data.zeros(8);
  data.mark('data_slab_lock'); data.zeros(8);
  data.mark('data_slab_free_64'); data.zeros(8);
  data.mark('data_slab_bump_64'); data.zeros(8);
  data.mark('data_slab_end_64'); data.zeros(8);
  data.mark('data_slab_free_128'); data.zeros(8);
  data.mark('data_slab_bump_128'); data.zeros(8);
  data.mark('data_slab_end_128'); data.zeros(8);
  data.mark('data_slab_free_256'); data.zeros(8);
  data.mark('data_slab_bump_256'); data.zeros(8);
  data.mark('data_slab_end_256'); data.zeros(8);
  data.mark('data_slab_free_512'); data.zeros(8);
  data.mark('data_slab_bump_512'); data.zeros(8);
  data.mark('data_slab_end_512'); data.zeros(8);
  data.mark('data_slab_free_1024'); data.zeros(8);
  data.mark('data_slab_bump_1024'); data.zeros(8);
  data.mark('data_slab_end_1024'); data.zeros(8);
  data.mark('data_slab_free_2048'); data.zeros(8);
  data.mark('data_slab_bump_2048'); data.zeros(8);
  data.mark('data_slab_end_2048'); data.zeros(8);
  data.mark('data_slab_free_4096'); data.zeros(8);
  data.mark('data_slab_bump_4096'); data.zeros(8);
  data.mark('data_slab_end_4096'); data.zeros(8);
  if (generated.pgoRecords.length > 0) {
    data.align(8);
    data.mark('data_pgo_blob');
    data.bytes(Buffer.from('LSXPGO1\0', 'ascii'));
    data.u64(BigInt(generated.pgoRecords.length));
    for (const record of generated.pgoRecords) {
      data.u64(record.id);
      data.mark(record.symbol);
      data.zeros(8);
    }
  }
  data.align(8);
  data.mark('import_descriptors');
  const descriptorOffset = data.length;
  data.zeros((dllGroups.length + 1) * 20);
  for (const group of dllGroups) {
    data.align(8);
    group.iltSymbol = `ilt_${stableId(group.dll.toLowerCase())}`;
    data.mark(group.iltSymbol);
    for (const imp of group.functions.values()) {
      const offset = data.u64(0);
      data.addFixup(offset, 8, imp.nameSymbol);
    }
    data.u64(0);
    data.align(8);
    group.iatSymbol = `iat_table_${stableId(group.dll.toLowerCase())}`;
    data.mark(group.iatSymbol);
    let index = 0;
    for (const imp of group.functions.values()) {
      const entrySymbol = `iat_${stableId(imp.importKey || `${group.dll.toLowerCase()}::${imp.name}`)}`;
      data.mark(entrySymbol);
      const offset = data.u64(0);
      data.addFixup(offset, 8, imp.nameSymbol);
      imp.iatSymbol = entrySymbol;
      index += 1;
    }
    data.u64(0);
  }
  dllGroups.forEach((group, index) => {
    const base = descriptorOffset + index * 20;
    data.addFixup(base + 0, 4, group.iltSymbol);
    data.addFixup(base + 12, 4, group.dllSymbol);
    data.addFixup(base + 16, 4, group.iatSymbol);
  });

  const textRva = 0x1000;
  const textSize = generated.asm.bytes.length;
  const rdataRva = align(textRva + textSize, 0x1000);
  const rdataBuffer = rdata.build();
  const dataRva = align(rdataRva + rdataBuffer.length, 0x1000);
  let dataBuffer = data.build();

  const symbols = new Map();
  for (const [name, offset] of rdata.symbols) symbols.set(name, rdataRva + offset);
  for (const [name, offset] of data.symbols) symbols.set(name, dataRva + offset);
  for (const fixup of data.fixups) {
    const target = symbols.get(fixup.symbol);
    if (target === undefined) throw new Error(`unresolved data symbol ${fixup.symbol}`);
    if (fixup.size === 4) dataBuffer.writeUInt32LE((target + fixup.addend) >>> 0, fixup.offset);
    else dataBuffer.writeBigUInt64LE(BigInt(target + fixup.addend), fixup.offset);
  }
  const textBuffer = generated.asm.build(textRva, symbols);

  const firstIat = dllGroups.length ? symbols.get(dllGroups[0].iatSymbol) : 0;
  const lastGroup = dllGroups[dllGroups.length - 1];
  const lastIatEnd = lastGroup ? symbols.get(lastGroup.iatSymbol) + (lastGroup.functions.size + 1) * 8 : 0;

  return {
    entryRva: textRva + generated.asm.labels.get('__lsx_entry'),
    sections: [
      { name: '.text', data: textBuffer, rva: textRva, characteristics: 0x60000020 },
      { name: '.rdata', data: rdataBuffer, rva: rdataRva, characteristics: 0x40000040 },
      { name: '.data', data: dataBuffer, rva: dataRva, characteristics: 0xC0000040 },
    ],
    importDirectoryRva: symbols.get('import_descriptors'),
    importDirectorySize: (dllGroups.length + 1) * 20,
    iatDirectoryRva: firstIat,
    iatDirectorySize: lastIatEnd - firstIat,
    importGroups: dllGroups,
  };
}

function makePe(sectionInfo, options = {}) {
  const fileAlignment = 0x200;
  const sectionAlignment = 0x1000;
  const imageBase = 0x140000000n;
  const sections = sectionInfo.sections;
  const peOffset = 0x80;
  const optionalHeaderSize = 0xF0;
  const headersUnaligned = peOffset + 4 + 20 + optionalHeaderSize + sections.length * 40;
  const sizeOfHeaders = align(headersUnaligned, fileAlignment);
  let rawPointer = sizeOfHeaders;
  for (const section of sections) {
    section.rawSize = align(section.data.length, fileAlignment);
    section.rawPointer = rawPointer;
    rawPointer += section.rawSize;
  }
  const last = sections[sections.length - 1];
  const sizeOfImage = align(last.rva + last.data.length, sectionAlignment);
  const file = Buffer.alloc(rawPointer);
  file.writeUInt16LE(0x5A4D, 0x00);
  file.writeUInt32LE(peOffset, 0x3C);
  Buffer.from('This program cannot be run in DOS mode.\r\n$', 'ascii').copy(file, 0x40);
  let o = peOffset;
  file.write('PE\0\0', o, 'ascii'); o += 4;
  file.writeUInt16LE(0x8664, o); o += 2;
  file.writeUInt16LE(sections.length, o); o += 2;
  file.writeUInt32LE(0, o); o += 4;
  file.writeUInt32LE(0, o); o += 4;
  file.writeUInt32LE(0, o); o += 4;
  file.writeUInt16LE(optionalHeaderSize, o); o += 2;
  file.writeUInt16LE(0x0023, o); o += 2;
  const optionalStart = o;
  file.writeUInt16LE(0x020B, o); o += 2;
  file.writeUInt8(1, o++); file.writeUInt8(0, o++);
  file.writeUInt32LE(sections[0].rawSize, o); o += 4;
  file.writeUInt32LE(sections.slice(1).reduce((sum, s) => sum + s.rawSize, 0), o); o += 4;
  file.writeUInt32LE(0, o); o += 4;
  file.writeUInt32LE(sectionInfo.entryRva, o); o += 4;
  file.writeUInt32LE(sections[0].rva, o); o += 4;
  file.writeBigUInt64LE(imageBase, o); o += 8;
  file.writeUInt32LE(sectionAlignment, o); o += 4;
  file.writeUInt32LE(fileAlignment, o); o += 4;
  file.writeUInt16LE(6, o); o += 2; file.writeUInt16LE(0, o); o += 2;
  file.writeUInt16LE(0, o); o += 2; file.writeUInt16LE(0, o); o += 2;
  file.writeUInt16LE(6, o); o += 2; file.writeUInt16LE(0, o); o += 2;
  file.writeUInt32LE(0, o); o += 4;
  file.writeUInt32LE(sizeOfImage, o); o += 4;
  file.writeUInt32LE(sizeOfHeaders, o); o += 4;
  file.writeUInt32LE(0, o); o += 4;
  const subsystem = options.subsystem === 'console' ? 3 : 2;
  file.writeUInt16LE(subsystem, o); o += 2;
  file.writeUInt16LE(0x8100, o); o += 2;
  file.writeBigUInt64LE(0x100000n, o); o += 8;
  file.writeBigUInt64LE(0x1000n, o); o += 8;
  file.writeBigUInt64LE(0x100000n, o); o += 8;
  file.writeBigUInt64LE(0x1000n, o); o += 8;
  file.writeUInt32LE(0, o); o += 4;
  file.writeUInt32LE(16, o); o += 4;
  const directories = o; o += 16 * 8;
  file.writeUInt32LE(sectionInfo.importDirectoryRva, directories + 8);
  file.writeUInt32LE(sectionInfo.importDirectorySize, directories + 12);
  file.writeUInt32LE(sectionInfo.iatDirectoryRva, directories + 12 * 8);
  file.writeUInt32LE(sectionInfo.iatDirectorySize, directories + 12 * 8 + 4);
  if (o !== optionalStart + optionalHeaderSize) throw new Error(`optional header mismatch: ${o - optionalStart}`);
  for (const section of sections) {
    const name = Buffer.alloc(8); name.write(section.name, 'ascii'); name.copy(file, o); o += 8;
    file.writeUInt32LE(section.data.length, o); o += 4;
    file.writeUInt32LE(section.rva, o); o += 4;
    file.writeUInt32LE(section.rawSize, o); o += 4;
    file.writeUInt32LE(section.rawPointer, o); o += 4;
    file.writeUInt32LE(0, o); o += 4; file.writeUInt32LE(0, o); o += 4;
    file.writeUInt16LE(0, o); o += 2; file.writeUInt16LE(0, o); o += 2;
    file.writeUInt32LE(section.characteristics >>> 0, o); o += 4;
    section.data.copy(file, section.rawPointer);
  }
  return file;
}

function loadProjectConfig(input) {
  const absolute = path.resolve(input || process.cwd());
  let configPath = absolute;
  if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) configPath = path.join(absolute, 'lazyscriptex.json');
  if (path.extname(configPath).toLowerCase() === '.lsx') {
    return {
      configPath: null,
      root: path.dirname(configPath),
      entry: configPath,
      output: path.join(path.dirname(configPath), `${path.basename(configPath, '.lsx')}.exe`),
      subsystem: 'windows',
      optimization: 6,
      nativeBindings: [],
      runtimeFiles: [],
      moduleRoots: {},
      pgoGenerate: null,
      pgoUse: null,
      targetCpu: 'baseline',
    };
  }
  if (!fs.existsSync(configPath)) throw new CompileError(`project file not found: ${configPath}`, null, configPath);
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!raw.entry || typeof raw.entry !== 'string') throw new CompileError('lazyscriptex.json must contain an "entry" path', null, configPath);
  const root = path.dirname(configPath);
  const subsystem = raw.subsystem === 'console' ? 'console' : 'windows';
  const nativeBindings = raw.nativeBindings === undefined ? [] : raw.nativeBindings;
  const runtimeFiles = raw.runtimeFiles === undefined ? [] : raw.runtimeFiles;
  const moduleRootsRaw = raw.moduleRoots === undefined ? {} : raw.moduleRoots;
  if (!Array.isArray(nativeBindings)) throw new CompileError('lazyscriptex.json "nativeBindings" must be an array', null, configPath);
  if (!moduleRootsRaw || typeof moduleRootsRaw !== 'object' || Array.isArray(moduleRootsRaw) || Object.values(moduleRootsRaw).some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new CompileError('lazyscriptex.json "moduleRoots" must be an object mapping names to non-empty paths', null, configPath);
  }
  if (!Array.isArray(runtimeFiles) || runtimeFiles.some((file) => typeof file !== 'string' || file.length === 0)) {
    throw new CompileError('lazyscriptex.json "runtimeFiles" must be an array of non-empty paths', null, configPath);
  }
  const optimization = raw.optimization === undefined ? 6 : Number(raw.optimization);
  const pgoGenerate = raw.pgoGenerate ? path.resolve(root, String(raw.pgoGenerate)) : null;
  const pgoUse = raw.pgoUse ? path.resolve(root, String(raw.pgoUse)) : null;
  const targetCpu = raw.targetCpu === undefined ? 'baseline' : String(raw.targetCpu).toLowerCase();
  if (!['baseline', 'avx2', 'avx2-fma'].includes(targetCpu)) {
    throw new CompileError('lazyscriptex.json "targetCpu" must be baseline, avx2, or avx2-fma', null, configPath);
  }
  if (!Number.isInteger(optimization) || optimization < 0 || optimization > 6) {
    throw new CompileError('lazyscriptex.json "optimization" must be 0, 1, 2, 3, 4, 5, or 6', null, configPath);
  }
  return {
    configPath,
    root,
    entry: path.resolve(root, raw.entry),
    output: path.resolve(root, raw.output || 'build/LazyScriptEXGame.exe'),
    subsystem,
    optimization,
    nativeBindings,
    runtimeFiles,
    moduleRoots: Object.fromEntries(Object.entries(moduleRootsRaw).map(([name, value]) => [name, path.resolve(root, value)])),
    pgoGenerate,
    pgoUse,
    targetCpu,
  };
}

function checkFile(inputPath, moduleRoots = {}) {
  const program = new Program(inputPath, moduleRoots);
  const root = program.load(inputPath);
  program.validate();
  const entry = program.getEntryFunction(root);
  return { program, root, entry };
}

function copyDirectoryRecursive(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copied += copyDirectoryRecursive(sourcePath, destinationPath);
    else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
      copied += 1;
    }
  }
  return copied;
}

function resolveProjectFile(project, source) {
  if (!source.startsWith('@')) return path.resolve(project.root, source);
  const slash = source.indexOf('/');
  if (slash <= 1) return path.resolve(project.root, source);
  const rootName = source.slice(1, slash);
  const remainder = source.slice(slash + 1);
  let root = project.moduleRoots?.[rootName] || null;
  if (!root) {
    let current = project.root;
    for (;;) {
      const candidate = path.join(current, rootName);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) { root = candidate; break; }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return root ? path.resolve(root, remainder) : path.resolve(project.root, source);
}

function copyRuntimeAssets(project, output, importGroups = []) {
  const candidates = ['assets'];
  const copiedDirectories = [];
  const copiedFiles = [];
  const automaticFiles = [];
  const missingFiles = [];
  const stagedDestinations = new Set();
  let count = 0;
  const outputDirectory = path.dirname(output);
  for (const directoryName of candidates) {
    const source = path.join(project.root, directoryName);
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) continue;
    const destination = path.join(outputDirectory, directoryName);
    fs.rmSync(destination, { recursive: true, force: true });
    count += copyDirectoryRecursive(source, destination);
    copiedDirectories.push(destination);
  }

  const requested = (project.runtimeFiles || []).map((source) => ({ source, automatic: false }));
  const importedDlls = new Set((importGroups || []).map((group) => String(group.dll || '').toLowerCase()));
  const automaticByDll = new Map([
    ['lsxgamekit.dll', [
      '@LazyScript/native/LSXGameKit.dll',
      '@LazyScript/runtime/glfw3.dll',
      '@LazyScript/runtime/OpenAL32.dll',
    ]],
    ['lsxmedia.dll', ['@LazyScript/native/LSXMedia.dll']],
    ['lsxglabi.dll', ['@LazyScript/native/LSXGLABI.dll']],
    ['lsxmath.dll', ['@LazyScript/native/LSXMath.dll']],
    ['stb_image.dll', ['@LazyScript/native/stb_image.dll']],
    ['lsxfreetype.dll', [
      '@LazyScript/native/LSXFreeType.dll',
      '@LazyScript/native/libfreetype.dll',
      '@LazyScript/native/vcruntime140.dll',
      '@LazyScript/native/vcruntime140_1.dll',
    ]],
    ['libfreetype.dll', [
      '@LazyScript/native/libfreetype.dll',
      '@LazyScript/native/vcruntime140.dll',
      '@LazyScript/native/vcruntime140_1.dll',
    ]],
    ['glfw3.dll', ['@LazyScript/runtime/glfw3.dll']],
    ['openal32.dll', ['@LazyScript/runtime/OpenAL32.dll']],
  ]);
  for (const dll of importedDlls) {
    for (const source of automaticByDll.get(dll) || []) requested.push({ source, automatic: true });
  }

  for (const item of requested) {
    const source = resolveProjectFile(project, item.source);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      if (!missingFiles.includes(source)) missingFiles.push(source);
      continue;
    }
    const destination = path.join(outputDirectory, path.basename(source));
    const destinationKey = destination.toLowerCase();
    if (stagedDestinations.has(destinationKey)) continue;
    fs.copyFileSync(source, destination);
    stagedDestinations.add(destinationKey);
    copiedFiles.push(destination);
    if (item.automatic) automaticFiles.push(destination);
    count += 1;
  }
  return { count, directories: copiedDirectories, files: copiedFiles, automaticFiles, missingFiles };
}

function build(inputPath, outputOverride = null, options = {}) {
  const project = loadProjectConfig(inputPath);
  project.moduleRoots = { ...environmentModuleRoots(), ...project.moduleRoots, ...(options.moduleRoots || {}) };
  const optimization = options.optimization === undefined ? project.optimization : Number(options.optimization);
  if (!Number.isInteger(optimization) || optimization < 0 || optimization > 6) throw new CompileError('optimization level must be 0, 1, 2, 3, 4, 5, or 6');
  const program = new Program(project.entry, project.moduleRoots);
  const root = program.load(project.entry);
  program.validate();
  const entry = program.getEntryFunction(root);
  if (!entry) throw new CompileError('entry script must define fn main() or contain a backward-compatible top-level call', null, root.filePath);
  const pgoUse = options.pgoUse || project.pgoUse || null;
  const pgoGenerateRequested = options.pgoGenerate || project.pgoGenerate || null;
  const targetCpu = options.targetCpu || project.targetCpu || 'baseline';
  if (!['baseline', 'avx2', 'avx2-fma'].includes(targetCpu)) throw new CompileError('target CPU must be baseline, avx2, or avx2-fma');
  const pgoGenerate = pgoGenerateRequested ? path.resolve(project.root, pgoGenerateRequested) : null;
  const pgoLoaded = pgoUse ? loadPgoProfile(path.resolve(project.root, pgoUse), program) : null;
  const optimizer = new Optimizer(program, optimization, entry);
  const optimizationStats = optimizer.run();
  optimizationStats.pgoFunctionsMatched = pgoLoaded?.matched || 0;
  const sectionInfo = buildSections(program, root, entry, optimization, optimizationStats, { pgoGeneratePath: pgoGenerate, targetCpu });
  const exe = makePe(sectionInfo, { subsystem: project.subsystem });
  const output = path.resolve(outputOverride || project.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const nativeBindings = buildNativeBindings(project, output);
  fs.writeFileSync(output, exe);
  const runtimeAssets = copyRuntimeAssets(project, output, sectionInfo.importGroups);
  if (runtimeAssets.missingFiles.length) throw new CompileError(`required runtime file not found: ${runtimeAssets.missingFiles.join(', ')}`, null, project.configPath);
  return { project: { ...project, optimization, targetCpu }, program, root, entry, output, size: exe.length, imports: sectionInfo.importGroups, nativeBindings, runtimeAssets, optimizationStats, pgo: { loaded: pgoLoaded, generate: pgoGenerate } };
}

function printUsage() {
  console.log(`LazyScriptEX compiler ${VERSION}\n\nUsage:\n  node lazyscriptex.js check <file.lsx> [--lazy-script-root path] [--module-root Name=Path] [--diagnostics=json]\n  node lazyscriptex.js check-project <project-folder|lazyscriptex.json> [--lazy-script-root path] [--module-root Name=Path] [--diagnostics=json]\n  node lazyscriptex.js build <entry.lsx|project-folder|lazyscriptex.json> [-o output.exe] [--opt 0-6] [--pgo-generate profile.pgo] [--pgo-use profile.pgo] [--cpu baseline|avx2|avx2-fma] [--lazy-script-root path] [--module-root Name=Path]\n  node lazyscriptex.js --version`);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) { printUsage(); return; }
  if (args.includes('--version')) { console.log(VERSION); return; }
  const command = args[0];
  const input = args[1];
  if (!input) throw new CompileError('missing input file or project path');
  const commandLineRoots = parseModuleRootFlags(args.slice(2));
  if (command === 'check') {
    const nearestConfig = findNearestProjectConfig(input);
    const projectRoots = nearestConfig ? loadProjectConfig(nearestConfig).moduleRoots : {};
    const result = checkFile(input, { ...projectRoots, ...commandLineRoots });
    const kind = result.entry ? 'entry-capable script' : 'module';
    console.log(`OK ${kind}: ${path.resolve(input)} (${result.program.moduleOrder.length} module${result.program.moduleOrder.length === 1 ? '' : 's'})`);
    return;
  }
  if (command === 'check-project') {
    const project = loadProjectConfig(input);
    project.moduleRoots = { ...environmentModuleRoots(), ...project.moduleRoots, ...commandLineRoots };
    const result = checkFile(project.entry, project.moduleRoots);
    if (!result.entry) throw new CompileError('project entry does not define fn main()', null, project.entry);
    console.log(`OK project: ${project.configPath || project.entry}\nEntry: ${project.entry}\nModules: ${result.program.moduleOrder.length}`);
    return;
  }
  if (command === 'build') {
    const outputFlag = args.indexOf('-o');
    const output = outputFlag >= 0 ? args[outputFlag + 1] : null;
    if (outputFlag >= 0 && !output) throw new CompileError('-o requires an output path');
    const optFlag = args.indexOf('--opt');
    const optimization = optFlag >= 0 ? Number(args[optFlag + 1]) : undefined;
    if (optFlag >= 0 && (!Number.isInteger(optimization) || optimization < 0 || optimization > 6)) throw new CompileError('--opt requires 0, 1, 2, 3, 4, 5, or 6');
    const pgoGenerateFlag = args.indexOf('--pgo-generate');
    const pgoUseFlag = args.indexOf('--pgo-use');
    const cpuFlag = args.indexOf('--cpu');
    const pgoGenerate = pgoGenerateFlag >= 0 ? args[pgoGenerateFlag + 1] : undefined;
    const pgoUse = pgoUseFlag >= 0 ? args[pgoUseFlag + 1] : undefined;
    const targetCpu = cpuFlag >= 0 ? String(args[cpuFlag + 1] || '').toLowerCase() : undefined;
    if (pgoGenerateFlag >= 0 && (!pgoGenerate || pgoGenerate.startsWith('--'))) throw new CompileError('--pgo-generate requires a profile path');
    if (pgoUseFlag >= 0 && (!pgoUse || pgoUse.startsWith('--'))) throw new CompileError('--pgo-use requires a profile path');
    if (cpuFlag >= 0 && !['baseline', 'avx2', 'avx2-fma'].includes(targetCpu)) throw new CompileError('--cpu requires baseline, avx2, or avx2-fma');
    const result = build(input, output, { optimization, pgoGenerate, pgoUse, targetCpu, moduleRoots: commandLineRoots });
    console.log(`Built ${result.output}`);
    console.log(`Entry: ${result.project.entry}`);
    console.log(`Modules: ${result.program.moduleOrder.length}`);
    console.log(`Imports: ${result.imports.map((g) => `${g.dll}(${g.functions.size})`).join(', ')}`);
    console.log(`Subsystem: ${result.project.subsystem}`);
    console.log(`Target CPU: ${result.project.targetCpu}`);
    const stats = result.optimizationStats;
    console.log(`Optimization: O${result.project.optimization} (folded ${stats.constantFolds + stats.constantReferences}, simplified ${stats.algebraicSimplifications}, copies ${stats.copiesPropagated}, CSE ${stats.commonSubexpressions}, inlined ${stats.functionsInlined}, stripped ${stats.functionsStripped} functions, reused ${stats.stackSlotsReused} stack slots, removed ${stats.branchesRemoved} branches/${stats.loopsRemoved} loops/${stats.deadStatementsRemoved} dead statements, tail calls ${stats.tailCallsOptimized}, strength reductions ${stats.strengthReductions}, register locals ${stats.registerVariables}, fast ops ${stats.fastBinaryOps}, inline table ops ${stats.inlineTableOps || 0}, constant strides ${stats.constantTableStrides || 0}, direct calls ${stats.directSimpleCalls}, stack objects ${stats.stackObjects || 0}, LICM ${stats.loopInvariantsHoisted || 0}, bounds removed ${stats.boundsChecksEliminated || 0}, cached table loops ${stats.cachedTableLoopsEmitted || 0}, vector loops ${stats.vectorizedLoops || 0} x${stats.vectorWidth || 4}, fused vector ops ${stats.fusedVectorOps || 0})`);
    if (result.runtimeAssets.count > 0) {
      console.log(`Runtime assets: ${result.runtimeAssets.count} file${result.runtimeAssets.count === 1 ? '' : 's'} copied beside the executable`);
    }
    for (const binding of result.nativeBindings) {
      console.log(`Native binding: ${binding.output} (${binding.mode}${binding.toolchain ? `, ${binding.toolchain}` : ''})`);
      if (binding.warning) console.warn(`LazyScriptEX warning: ${binding.warning}`);
    }
    if (result.pgo.loaded) console.log(`PGO profile: ${result.pgo.loaded.path} (${result.pgo.loaded.matched}/${result.pgo.loaded.records} functions matched)`);
    if (result.pgo.generate) console.log(`PGO instrumentation: ${result.optimizationStats.pgoInstrumentedFunctions} functions -> ${result.pgo.generate}`);
    console.log(`Executable size: ${result.size} bytes`);
    return;
  }
  throw new CompileError(`unknown command '${command}'`);
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    process.exitCode = 1;
    const diagnostic = compilerDiagnostic(error);
    if (wantsJsonDiagnostics(process.argv)) console.error(JSON.stringify(diagnostic));
    else console.error(formatHumanDiagnostic(diagnostic));
  }
}

module.exports = {
  Lexer, Parser, Program, Optimizer, analyzeFunction, checkFile, build, makePe, VERSION,
  CompileError, compilerDiagnostic, formatHumanDiagnostic, diagnosticDetails,
  normalizeLazyScriptRoot, findNearestProjectConfig, findNamedDirectoryRecursive, parseModuleRootFlags
};
