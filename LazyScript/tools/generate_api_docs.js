#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { TAG_FUNCTIONS, LSHTML_EVENT_HELPERS, LSHTML_ATTRIBUTES, LSCSS_PROPERTIES, LSCSS_STATE_SELECTORS, LSCSS_SELECTOR_FORMS } = require('../compiler/inline_ui');
const languageApiReference = require('./language_api_reference.json');

const root = path.resolve(__dirname, '..');
const bindingsRoot = path.join(root, 'bindings');
const outputRoot = path.join(root, 'api');
fs.mkdirSync(outputRoot, { recursive: true });

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.lsx')) out.push(full);
  }
  return out;
}

function moduleName(file) {
  if (path.resolve(file) === path.join(root, 'LSG.lsx')) return 'LSG';
  if (path.resolve(file) === path.join(root, 'LSSL.lsx')) return 'LSSL';
  const rel = path.relative(bindingsRoot, file).replace(/\\/g, '/').replace(/\.lsx$/, '');
  if (rel === 'GLFW/GLFW') return 'GLFW';
  if (rel === 'OpenGL/OpenGL46') return 'OpenGL';
  if (rel === 'OpenAL/OpenAL') return 'OpenAL';
  return rel;
}

function commentBefore(lines, line) {
  const out = [];
  let i = line - 1;
  while (i >= 0 && /^\s*$/.test(lines[i])) i--;
  while (i >= 0 && /^\s*--(?!\[\[)/.test(lines[i])) {
    out.unshift(lines[i].replace(/^\s*--\s?/, '').trim());
    i--;
  }
  return out.join('\n');
}

function fallbackDescription(module, kind, name, owner = '', dll = '') {
  const qualified = owner ? `${owner}.${name}` : name;
  if (kind === 'constant') return `${module} constant ${name}.`;
  if (kind === 'field') return `Native field ${qualified} with a fixed compile-time layout.`;
  if (kind === 'typed object' || kind === 'typed struct') return `Packed native LSX type ${name} with fixed field offsets and direct method calls.`;
  if (module === 'LSG') return `Beginner-facing graphics operation ${qualified}; GLFW and OpenGL details stay inside LSG.`;
  if (module === 'LSSL') return `Beginner-facing shader-program operation ${qualified} for compiled .lssl shaders.`;
  if (module === 'OpenGL') return `OpenGL API binding for ${name}${dll ? ` imported through ${dll}` : ''}.`;
  if (module === 'GLFW') return `GLFW window, input, monitor, or context API binding for ${name}${dll ? ` imported through ${dll}` : ''}.`;
  if (module === 'OpenAL' || module.startsWith('OpenAL/')) return `OpenAL audio API binding for ${name}${dll ? ` imported through ${dll}` : ''}.`;
  if (module === 'System/Threading') return `Native operating-system threading or synchronization operation ${qualified}.`;
  if (module === 'System/File') return `Native UTF-8 file-system operation ${qualified}.`;
  if (module === 'System/Log') return `Thread-safe persistent text logging operation ${qualified}.`;
  if (module === 'Data/Json') return `LSX-native JSON DOM operation ${qualified}.`;
  if (module === 'Network/Sockets') return `Native WinSock2 networking operation ${qualified}.`;
  if (module === 'Network/Http') return `Native WinHTTP HTTP/HTTPS operation ${qualified}.`;
  if (module === 'Graphics/Media') return `Native media-runtime diagnostic operation ${qualified}.`;
  if (module === 'Graphics/STBImage') return `Direct stb_image operation ${qualified}.`;
  if (module === 'Graphics/Image') return `stb_image compatibility operation ${qualified}.`;
  if (module === 'Graphics/Texture2D') return `OpenGL texture loading and ownership operation ${qualified}.`;
  if (module === 'Text/FreeTypeRaw') return `Direct FreeType C API operation ${qualified}.`;
  if (module === 'Text/FreeType') return `Typed FreeType face or glyph operation ${qualified}.`;
  if (module === 'Text/Font') return `FreeType SDF atlas, upload, or text-mesh operation ${qualified}.`;
  if (module === 'Math/GLMRaw') return `Internal GLM native bridge operation ${qualified}; normal engine code should import Math/GLM instead.`;
  if (module === 'Math/GLM') return `GLM-backed LSX math operation ${qualified} with native C++ details hidden behind the typed wrapper.`;
  if (module === 'Math/Camera') return `Typed LSX camera operation ${qualified} built on the wrapped GLM transform and projection APIs.`;
  if (module === 'Math/OpenGL') return `Direct OpenGL uniform upload helper for wrapped GLM matrix data: ${qualified}.`;
  if (module === 'UI/LazyUI') return kind === 'method' ? `Retained LazyUI ${owner} operation ${qualified}.` : `Native LSHTML/LSCSS element, style, event, layout, or canvas operation ${qualified}.`;
  if (module === 'UI/Renderer') return `Batched LazyUI LSG renderer operation ${qualified} for OpenGL or Vulkan.`;
  if (module === 'UI/ShaderSources') return `Embedded LazyUI shader source ${qualified}.`;
  if (kind === 'method') return `Method ${qualified} on a packed native LSX object.`;
  return `${module} ${kind} ${qualified}.`;
}

function extractObject(lines, start, module, rel, owner) {
  let depth = 0;
  const selected = [];
  const members = [];
  const startIndent = (lines[start].match(/^\s*/) || [''])[0].length;
  let memberIndent = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    selected.push(line);
    const trimmed = line.trim();
    const indent = (line.match(/^\s*/) || [''])[0].length;
    if (i > start && memberIndent === null && trimmed && !trimmed.startsWith('--') && trimmed !== '}') {
      if (indent > startIndent) memberIndent = indent;
    }
    let match;
    const atMemberLevel = i > start && memberIndent !== null && indent === memberIndent;
    if (atMemberLevel && (match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*fn\s*\(([^)]*)\)\s*(?:->\s*([^\s,}]+))?/))) {
      if (!match[1].startsWith('_')) {
        const returnType = match[3] ? ` -> ${match[3]}` : '';
        const signature = `${match[1]}(${match[2].trim()})${returnType}`;
        const description = commentBefore(lines, i) || fallbackDescription(module, 'method', match[1], owner);
        members.push({ module, kind: 'method', owner, name: match[1], signature, description, source: rel, line: i + 1 });
      }
    } else if (atMemberLevel && (match = line.match(/^\s*([A-Za-z_]\w*)\s*:\s*([^=,]+?)\s*=/))) {
      if (!match[1].startsWith('_')) {
        const signature = `${match[1]}: ${match[2].trim()}`;
        const description = commentBefore(lines, i) || fallbackDescription(module, 'field', match[1], owner);
        members.push({ module, kind: 'field', owner, name: match[1], signature, description, source: rel, line: i + 1 });
      }
    } else if (atMemberLevel && (match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(?!fn\b)(.+?)\s*,?\s*$/))) {
      if (!match[1].startsWith('_')) {
        const defaultValue = match[2].trim().replace(/,$/, '').trim();
        const compactDefault = defaultValue.length > 80 ? `${defaultValue.slice(0, 77)}...` : defaultValue;
        const signature = `${match[1]} = ${compactDefault}`;
        const description = commentBefore(lines, i) || `Inferred field ${owner}.${match[1]} stored directly on the LSX object.`;
        members.push({ module, kind: 'field', owner, name: match[1], signature, description, source: rel, line: i + 1, inferred: true });
      }
    }

    let inString = false;
    let escaped = false;
    for (const ch of line) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (depth <= 0 && i > start) return { text: selected.join('\n'), end: i, members };
  }
  return { text: selected.join('\n'), end: lines.length - 1, members };
}

const entries = [];
const documentedFiles = [...walk(bindingsRoot), path.join(root, 'LSG.lsx'), path.join(root, 'LSSL.lsx')].sort();
for (const file of documentedFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const module = moduleName(file);
  const rel = path.relative(root, file).replace(/\\/g, '/');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    let match;
    if ((match = trimmed.match(/^export\s+extern\s+"([^"]+)"\s+fn\s+([A-Za-z_]\w*)/))) {
      const description = commentBefore(lines, i) || fallbackDescription(module, 'raw function', match[2], '', match[1]);
      entries.push({ module, kind: 'raw function', name: match[2], signature: trimmed.replace(/^export\s+extern\s+"[^"]+"\s+fn\s+/, ''), description, dll: match[1], source: rel, line: i + 1 });
      continue;
    }
    if ((match = trimmed.match(/^export\s+fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([A-Za-z_][A-Za-z0-9_.<>]*))?/))) {
      if (match[1].startsWith('_')) continue;
      const description = commentBefore(lines, i) || fallbackDescription(module, 'typed function', match[1]);
      const signature = `${match[1]}(${match[2].trim()})${match[3] ? ` -> ${match[3]}` : ''}`;
      entries.push({ module, kind: 'typed function', name: match[1], signature, description, source: rel, line: i + 1 });
      continue;
    }
    if ((match = trimmed.match(/^export\s+(static\s+)?const\s+([A-Za-z_]\w*)(?:\s*:\s*base\(([^)]+)\))?\s*=\s*\{/))) {
      const isStaticObject = Boolean(match[1]);
      const objectName = match[2];
      const block = extractObject(lines, i, module, rel, objectName);
      const kind = isStaticObject ? 'static object' : 'typed object';
      const description = commentBefore(lines, i) || (isStaticObject
        ? `One persistent LSX object ${objectName}, initialized once and called directly without .new().`
        : fallbackDescription(module, 'typed object', objectName));
      entries.push({ module, kind, name: objectName, signature: `${isStaticObject ? 'static ' : ''}const ${objectName}${match[3] ? ` : base(${match[3].trim()})` : ''}`, description, source: rel, line: i + 1, base: match[3]?.trim() || '' });
      entries.push(...block.members);
      i = block.end;
      continue;
    }
    if ((match = trimmed.match(/^export\s+struct\s+([A-Za-z_]\w*)/))) {
      const selected = [lines[i]];
      const members = [];
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        selected.push(lines[j]); end = j;
        const field = lines[j].match(/^\s*([A-Za-z_]\w*)\s*:\s*(.+?)\s*$/);
        if (field && !field[1].startsWith('_')) members.push({ module, kind: 'field', owner: match[1], name: field[1], signature: `${field[1]}: ${field[2]}`, description: commentBefore(lines, j) || fallbackDescription(module, 'field', field[1], match[1]), source: rel, line: j + 1 });
        if (/^\s*end\s*$/.test(lines[j])) break;
      }
      const description = commentBefore(lines, i) || fallbackDescription(module, 'typed struct', match[1]);
      entries.push({ module, kind: 'typed struct', name: match[1], signature: `struct ${match[1]}`, description, source: rel, line: i + 1 });
      entries.push(...members);
      i = end;
      continue;
    }
    if ((match = trimmed.match(/^export\s+const\s+([A-Za-z_]\w*)\s*=\s*(.+)$/))) {
      const description = commentBefore(lines, i) || fallbackDescription(module, 'constant', match[1]);
      entries.push({ module, kind: 'constant', name: match[1], signature: trimmed, description, source: rel, line: i + 1 });
      continue;
    }
    if ((match = trimmed.match(/^export\s+([A-Za-z_]\w*)\s*=\s*(.+)$/))) {
      const description = commentBefore(lines, i) || fallbackDescription(module, 'constant', match[1]);
      entries.push({ module, kind: 'constant', name: match[1], signature: trimmed, description, source: rel, line: i + 1 });
      continue;
    }
  }
}

entries.push({
  module: 'Language/Packed literals',
  kind: 'compiler feature',
  name: 'numeric positional inference',
  signature: 'local vertices = {-1.0,0.0,1.0}  -- packed f32\nlocal indices = {0,1,2}          -- packed u32',
  description: 'Infers one homogeneous contiguous native element type for non-empty positional numeric literals. Decimal values become f32; non-negative integer literals that fit in 32 bits become u32.',
  source: 'docs/LANGUAGE.md',
  line: 87,
});

entries.push({
  module: 'Language/Collection',
  kind: 'compiler method',
  owner: 'collection',
  name: 'copy_from_ptr',
  signature: 'copy_from_ptr(source:ptr, byte_count:i64) -> bool',
  description: 'Copies a foreign native byte buffer into an already-sized compiler-inferred contiguous collection after validating destination capacity.',
  source: 'docs/LANGUAGE.md',
  line: 111,
});

for (const entry of [
  ['resize_bytes', 'resize_bytes(byte_count:i64) -> bool', 'Establishes annotation-free packed u8 storage and resizes it to an exact byte count.'],
  ['reserve_bytes', 'reserve_bytes(byte_capacity:i64) -> bool', 'Establishes annotation-free packed u8 storage and reserves byte capacity without changing length.'],
  ['byte_data', 'byte_data() -> ptr', 'Returns the native pointer for an inferred packed u8 collection.'],
  ['copy_bytes_from_ptr', 'copy_bytes_from_ptr(source:ptr, byte_count:i64) -> bool', 'Copies a foreign native byte block into an already-sized inferred packed u8 collection.'],
]) entries.push({
  module: 'Language/Collection', kind: 'compiler method', owner: 'collection',
  name: entry[0], signature: entry[1], description: entry[2], source: 'docs/LANGUAGE.md', line: 114,
});

// Keep the complete public language reference in a separate canonical data file.
// Binding regeneration must never erase language-only syntax such as control
// flow, functions, ordinary objects, strings, tables, and inferred values.
entries.push(...languageApiReference.entries.map((entry) => ({ ...entry })));

// BEGIN GENERATED STATIC OBJECT LANGUAGE ENTRIES
entries.push(...[
  {
    module: 'Language/Static objects', kind: 'compiler feature', name: 'static const object',
    signature: 'export static const Name = { ... }',
    description: 'Declares one persistent object initialized once before main(). It keeps shared state, may use a zero-argument constructor for startup setup, and is called directly without .new().',
    source: 'docs/LANGUAGE.md', line: 377,
    example: 'export static const AppState = {\n    running = true\n    Stop = fn()\n        self.running = false\n    end\n}'
  },
  {
    module: 'Language/Static objects', kind: 'compiler feature', name: 'static constructor',
    signature: 'constructor = fn()',
    description: 'Runs once automatically after the shared static object fields are initialized and before main(). Static constructors cannot accept arguments and are never called manually.',
    source: 'docs/LANGUAGE.md', line: 425,
    example: 'export static const AppState = {\n    ready = false\n\n    constructor = fn()\n        self.ready = true\n    end\n}'
  },
  {
    module: 'Language/Static objects', kind: 'compiler feature', name: 'direct static method call',
    signature: 'ModuleAlias.StaticObject.Method(arguments)',
    description: 'Calls a method on the one shared static object while the compiler supplies that object as self.',
    source: 'docs/LANGUAGE.md', line: 400,
    example: 'WindowManagerMod.WindowManager.CreateWindow(1920, 1080, "LazyEngine")'
  },
  {
    module: 'Language/Static objects', kind: 'compiler feature', name: 'shared static field',
    signature: 'ModuleAlias.StaticObject.field',
    description: 'Reads or changes a field stored on the one shared static object.',
    source: 'docs/LANGUAGE.md', line: 411,
    example: 'local window = WindowManagerMod.WindowManager.windowHandle'
  },
  {
    module: 'Language/Static objects', kind: 'compiler feature', name: 'self in a static object',
    signature: 'self.field / self.Method()',
    description: 'Refers to the single persistent static object from inside one of its methods.',
    source: 'docs/LANGUAGE.md', line: 413,
    example: 'Stop = fn()\n    self.running = false\nend'
  },
  {
    module: 'Language/Static objects', kind: 'compiler feature', name: 'static object shutdown',
    signature: 'StaticObject.Shutdown()',
    description: 'Provides explicit cleanup for native handles and resources owned by a static object.',
    source: 'docs/LANGUAGE.md', line: 418,
    example: 'WindowManagerMod.WindowManager.Shutdown()'
  },
  {
    module: 'Language/Static objects', kind: 'compiler feature', name: 'static object new error',
    signature: 'StaticObject.new()  -- invalid',
    description: 'A static object already has one compiler-created instance and therefore cannot be constructed with .new().',
    source: 'docs/LANGUAGE.md', line: 417,
    example: 'WindowManagerMod.WindowManager.CreateWindow(1280, 720, "LazyEngine")'
  }
]);
// END GENERATED STATIC OBJECT LANGUAGE ENTRIES

// BEGIN GENERATED IMPORT LANGUAGE ENTRIES
entries.push(...[
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "relative import",
    "signature": "use \"../Folder/File.lsx\" as Alias",
    "description": "Imports an LSX file relative to the file containing the use statement. Project depth does not matter because ../ and ./ are resolved from the current source file.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "use \"../Input/InputManager.lsx\" as Input\nuse \"./CameraController.lsx\" as CameraController\n\nfn main()\n    Input.update()\n    CameraController.update()\n    return 0\nend",
    "exampleNote": "Use ./ for the current folder and ../ to move up one folder. Keep the .lsx filename in the import.",
    "friendlyDescription": "Imports an LSX file relative to the file containing the use statement. Project depth does not matter because ../ and ./ are resolved from the current source file.",
    "level": "beginner",
    "whatItIs": "Imports an LSX file relative to the file containing the use statement. Project depth does not matter because ../ and ./ are resolved from the current source file.",
    "whenToUse": "Use relative imports for files that belong to the same project or feature folder.",
    "beginnerNote": "Use ./ for the current folder and ../ to move up one folder. Keep the .lsx filename in the import.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "named module root",
      "module alias",
      "exported member"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "Start typing inside the quotes. VS Code lists folders and .lsx files. Select a folder to continue browsing, finish the path, add as Alias, then call Alias.member.",
    "commonMistake": "Do not calculate the path from the executable or workspace root. Relative imports begin at the source file that contains use.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  },
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "named module root",
    "signature": "use \"@Root/Folder/File.lsx\" as Alias",
    "description": "Imports from a named folder root instead of counting ../ segments. @LazyScript points to the selected LazyScript folder; projects may define additional roots such as @Engine.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "use \"@LazyScript/bindings/GLFW/GLFW.lsx\" as GLFW\nuse \"@Engine/Window/WindowManager.lsx\" as WindowManager\n\nfn main()\n    local manager = WindowManager.WindowManager.new()\n    return 0\nend",
    "exampleNote": "Run \u201cLazyScriptEX: Select LazyScript/API Folder\u201d once for @LazyScript. Other names come from moduleRoots.",
    "friendlyDescription": "Imports from a named folder root instead of counting ../ segments. @LazyScript points to the selected LazyScript folder; projects may define additional roots such as @Engine.",
    "level": "beginner",
    "whatItIs": "Imports from a named folder root instead of counting ../ segments. @LazyScript points to the selected LazyScript folder; projects may define additional roots such as @Engine.",
    "whenToUse": "Use named roots for shared engine code, bindings, libraries, and source trees used by more than one executable project.",
    "beginnerNote": "Run \u201cLazyScriptEX: Select LazyScript/API Folder\u201d once for @LazyScript. Other names come from moduleRoots.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "moduleRoots configuration",
      "select LazyScript/API folder",
      "import path completion"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "The compiler resolves the selected VS Code root, command-line roots, project moduleRoots, then safe recursive discovery. The folder may be anywhere on disk.",
    "commonMistake": "A named root is the folder represented by @Root, not the parent of that folder. @LazyScript must point at the folder containing bindings, compiler, and api.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  },
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "module alias",
    "signature": "Alias.member",
    "description": "Uses a short local name for an imported module. Only exported functions, constants, objects, and structs are available through the alias.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "use \"@LazyScript/bindings/Math/GLM.lsx\" as GLM\n\nlocal position = GLM.vec3(1.0, 2.0, 3.0)\nlocal up = GLM.vec3(0.0, 1.0, 0.0)",
    "exampleNote": "Choose a clear alias such as GLM, GLFW, File, Json, or WindowManager.",
    "friendlyDescription": "Uses a short local name for an imported module. Only exported functions, constants, objects, and structs are available through the alias.",
    "level": "beginner",
    "whatItIs": "Uses a short local name for an imported module. Only exported functions, constants, objects, and structs are available through the alias.",
    "whenToUse": "Use aliases to keep large APIs readable and prevent unrelated modules from fighting over the same names.",
    "beginnerNote": "Choose a clear alias such as GLM, GLFW, File, Json, or WindowManager.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "relative import",
      "named module root",
      "exported member"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "Import once near the top of the file, then type Alias. to browse exported members through autocomplete.",
    "commonMistake": "The alias must match exactly, including capitalization.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  },
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "exported member",
    "signature": "export fn / export const / export struct",
    "description": "Marks a declaration as public so another file can access it through the module alias. Declarations without export remain private to their own file.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "export const WindowSettings = {\n    width = 1280\n    height = 720\n}\n\nexport fn create_window(title)\n    return 0\nend",
    "exampleNote": "Export only the declarations other modules need. Helper functions can stay private.",
    "friendlyDescription": "Marks a declaration as public so another file can access it through the module alias. Declarations without export remain private to their own file.",
    "level": "beginner",
    "whatItIs": "Marks a declaration as public so another file can access it through the module alias. Declarations without export remain private to their own file.",
    "whenToUse": "Use export when building reusable project modules, shared systems, bindings, and public library APIs.",
    "beginnerNote": "Export only the declarations other modules need. Helper functions can stay private.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "module alias",
      "relative import"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "Declare the public object or function in one file, import that file elsewhere, then call Alias.name.",
    "commonMistake": "Importing a file does not automatically expose every declaration. Missing export produces a private/not exported error.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  },
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "moduleRoots configuration",
    "signature": "\"moduleRoots\": { \"Engine\": \"../Engine\" }",
    "description": "Maps @Name imports to real folders in lazyscriptex.json. Paths are resolved relative to the configuration file, so a shared Engine folder can sit beside Editor and Game.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "{\n  \"entry\": \"main.lsx\",\n  \"output\": \"build/Game.exe\",\n  \"optimization\": 6,\n  \"moduleRoots\": {\n    \"Engine\": \"../Engine\",\n    \"Shared\": \"../Shared\"\n  }\n}",
    "exampleNote": "Do not hard-code @LazyScript here unless command-line builds need a portable project-specific path. VS Code can store it separately with the folder selector.",
    "friendlyDescription": "Maps @Name imports to real folders in lazyscriptex.json. Paths are resolved relative to the configuration file, so a shared Engine folder can sit beside Editor and Game.",
    "level": "beginner",
    "whatItIs": "Maps @Name imports to real folders in lazyscriptex.json. Paths are resolved relative to the configuration file, so a shared Engine folder can sit beside Editor and Game.",
    "whenToUse": "Use moduleRoots when several source trees are shared, when code lives outside the executable project, or when command-line builds must resolve named roots.",
    "beginnerNote": "Do not hard-code @LazyScript here unless command-line builds need a portable project-specific path. VS Code can store it separately with the folder selector.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "named module root",
      "shared source layout",
      "project configuration"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "Add each name once. Imports can then use @Engine/... or @Shared/... from any folder depth in that project.",
    "commonMistake": "The key omits @. Write \"Engine\", not \"@Engine\". The value points directly to the Engine folder.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  },
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "select LazyScript/API folder",
    "signature": "LazyScriptEX: Select LazyScript/API Folder",
    "description": "Opens a folder picker and remembers where LazyScript is installed. The same selection powers @LazyScript imports, compiler checks, recursive IntelliSense, API opening, hovers, and path completion.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "1. Press Ctrl+Shift+P\n2. Run: LazyScriptEX: Select LazyScript/API Folder\n3. Select one of these:\n   - the LazyScript folder\n   - LazyScript/api\n   - the toolkit folder containing LazyScript",
    "exampleNote": "This is the normal fix for LSX2101 when a game project is stored somewhere else or several folders deeper than the toolkit.",
    "friendlyDescription": "Opens a folder picker and remembers where LazyScript is installed. The same selection powers @LazyScript imports, compiler checks, recursive IntelliSense, API opening, hovers, and path completion.",
    "level": "beginner",
    "whatItIs": "Opens a folder picker and remembers where LazyScript is installed. The same selection powers @LazyScript imports, compiler checks, recursive IntelliSense, API opening, hovers, and path completion.",
    "whenToUse": "Use once per VS Code workspace whenever the language folder is not inside or above the current project.",
    "beginnerNote": "This is the normal fix for LSX2101 when a game project is stored somewhere else or several folders deeper than the toolkit.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "named module root",
      "import path completion"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "The extension stores the normalized LazyScript path in workspace settings and passes it to the compiler automatically on check and build.",
    "commonMistake": "Selecting only a random project folder will not work. The chosen location must contain the LazyScript bindings and compiler.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  },
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "import path completion",
    "signature": "use \"@LazyScript/...",
    "description": "Provides folder and .lsx filename suggestions while typing inside a use path. It works for relative paths and every configured named module root.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "use \"@LazyScript/bindings/Math/GLM.lsx\" as GLM\nuse \"../Window/WindowManager.lsx\" as WindowManager",
    "exampleNote": "Type the opening quote, @, or ./ and accept suggestions. Choosing a folder immediately opens the next level of suggestions.",
    "friendlyDescription": "Provides folder and .lsx filename suggestions while typing inside a use path. It works for relative paths and every configured named module root.",
    "level": "beginner",
    "whatItIs": "Provides folder and .lsx filename suggestions while typing inside a use path. It works for relative paths and every configured named module root.",
    "whenToUse": "Use whenever writing or repairing an import so paths do not need to be memorized or typed blindly.",
    "beginnerNote": "Type the opening quote, @, or ./ and accept suggestions. Choosing a folder immediately opens the next level of suggestions.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "select LazyScript/API folder",
      "relative import",
      "named module root"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "The extension recursively indexes the workspace, selected LazyScript folder, and configured module roots. Go to Definition on the path opens the imported file.",
    "commonMistake": "Autocomplete only lists real folders and .lsx files. If nothing appears, select the correct root or repair moduleRoots.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  },
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "shared source layout",
    "signature": "Engine shared by Editor and Game",
    "description": "Shows how one shared source tree can be imported by multiple executable projects without copying files or forcing a fixed folder depth.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "LazyEngineLSX/\n\u251c\u2500 Engine/\n\u2502  \u2514\u2500 Window/WindowManager.lsx\n\u251c\u2500 Editor/\n\u2502  \u251c\u2500 main.lsx\n\u2502  \u2514\u2500 lazyscriptex.json\n\u2514\u2500 Game/\n   \u251c\u2500 main.lsx\n   \u2514\u2500 lazyscriptex.json\n\n// Editor/lazyscriptex.json and Game/lazyscriptex.json\n\"moduleRoots\": { \"Engine\": \"../Engine\" }\n\n// either main.lsx\nuse \"@Engine/Window/WindowManager.lsx\" as WindowManager",
    "exampleNote": "WindowManager.lsx can be checked directly in VS Code because configured roots are passed to the compiler even when the file is not below an executable project.",
    "friendlyDescription": "Shows how one shared source tree can be imported by multiple executable projects without copying files or forcing a fixed folder depth.",
    "level": "beginner",
    "whatItIs": "Shows how one shared source tree can be imported by multiple executable projects without copying files or forcing a fixed folder depth.",
    "whenToUse": "Use for shared engine layers, reusable libraries, common gameplay code, and separate Editor/Game executables.",
    "beginnerNote": "WindowManager.lsx can be checked directly in VS Code because configured roots are passed to the compiler even when the file is not below an executable project.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "moduleRoots configuration",
      "named module root",
      "project configuration"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "Each executable owns its own lazyscriptex.json. Both configurations point @Engine to the same folder. The extension indexes all roots recursively.",
    "commonMistake": "Do not place a fake lazyscriptex.json in every subfolder. Configure roots once per executable project or once in VS Code workspace settings.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  },
  {
    "module": "Language/Modules and files",
    "kind": "compiler feature",
    "name": "project configuration",
    "signature": "lazyscriptex.json",
    "description": "Defines an executable project: its entry file, output executable, subsystem, optimization level, CPU target, runtime files, native bindings, and named module roots.",
    "source": "docs/LANGUAGE.md",
    "line": 260,
    "example": "{\n  \"entry\": \"main.lsx\",\n  \"output\": \"build/MyGame.exe\",\n  \"subsystem\": \"windows\",\n  \"optimization\": 6,\n  \"targetCpu\": \"baseline\",\n  \"moduleRoots\": {\n    \"Engine\": \"../Engine\"\n  }\n}",
    "exampleNote": "Keep one configuration beside each executable project. Shared source folders do not need their own project file.",
    "friendlyDescription": "Defines an executable project: its entry file, output executable, subsystem, optimization level, CPU target, runtime files, native bindings, and named module roots.",
    "level": "beginner",
    "whatItIs": "Defines an executable project: its entry file, output executable, subsystem, optimization level, CPU target, runtime files, native bindings, and named module roots.",
    "whenToUse": "Use for every program that builds an EXE. A library-only .lsx file may be checked directly without defining main().",
    "beginnerNote": "Keep one configuration beside each executable project. Shared source folders do not need their own project file.",
    "memberSummary": "",
    "requires": "Imports are built into LSX. The imported file must exist and exported members must use export.",
    "cleanup": "Imports themselves require no cleanup. Destroy only the owned objects or tables created through the imported module.",
    "related": [
      "moduleRoots configuration",
      "shared source layout"
    ],
    "parameterDocs": {},
    "returnsDescription": "",
    "workflow": "F6 builds the associated project. Ctrl+Shift+F6 checks the current file and its complete import tree.",
    "commonMistake": "The entry path is relative to lazyscriptex.json. It is not relative to the VS Code workspace root.",
    "howToGet": "Built into the language and supported by the VS Code extension."
  }
]);
// END GENERATED IMPORT LANGUAGE ENTRIES


// Language and inline UI syntax are compiler features rather than exported
// binding declarations. Generate these entries directly from the same metadata
// used by the LSHTML/LSCSS lowering pass so the API cannot silently omit them.
entries.push({
  module: 'Language/Inheritance',
  kind: 'compiler feature',
  name: 'base method call',
  signature: 'const Player : base(Actor) = { ... }',
  description: 'Creates a derived closed object whose base fields remain a fixed layout prefix. Same-named methods override the base method, and base.method(...) calls the immediate base implementation without a runtime prototype walk or vtable.',
  source: 'docs/LANGUAGE.md',
  line: 212,
  example: `const Actor = {
    active = true

    update = fn(delta)
        return 0
    end
}

const Player : base(Actor) = {
    health = 100

    update = fn(delta)
        base.update(delta)
        return 0
    end
}

local player = Player.new()
player.update(0.016)`,
  exampleNote: 'Inheritance is resolved by the compiler. Derived objects keep normal dot access and dot method calls.',
  friendlyDescription: 'Call the immediate base version of an overridden method.',
  whatItIs: 'The base.method(...) form used inside a derived method when both the parent and child implementations should run.',
  whenToUse: 'Use it inside a derived method when the base implementation still performs required shared work.',
  workflow: 'Override the method on the child, call base.method(...) where the shared parent work belongs, then continue with child-specific work.',
  commonMistake: 'Do not use colon method syntax. Circular inheritance and inheriting from more than one base object are rejected.',
  related: ['Language/Inheritance.base object declaration','Language/Inheritance.method override'],
});

entries.push({
  module: 'LazyUI/LSHTML', kind: 'compiler feature', name: 'lshtml declaration',
  signature: 'lshtml View(props) = { <panel>...</panel> }',
  description: 'Declares a retained LazyUI element tree directly inside an LSX module. The compiler lowers the markup to normal element creation and attachment calls; no browser DOM, parser, or virtual DOM runs at application runtime.',
  source: 'compiler/inline_ui.js', line: 1,
  example: `lshtml Toolbar(props) = {
    <toolbar id="main-toolbar" class="toolbar">
        <button id="save" class="primary">Save</button>
    </toolbar>
}`,
  exampleNote: 'The generated function returns the retained root element.',
});
entries.push({
  module: 'LazyUI/LSHTML', kind: 'compiler feature', name: 'expression binding',
  signature: 'attribute={value} / text {value}',
  description: 'Binds an LSHTML attribute, text node, object property, props field, or supported function result to an ordinary LSX expression. The retained element stores the binding and can be refreshed without reparsing markup.',
  source: 'compiler/inline_ui.js', line: 1,
  example: `lshtml Status(props) = {
    <panel class={props.panel_class}>
        <text>{props.message}</text>
        <progress value={props.progress}></progress>
    </panel>
}`,
});

const tagDescriptions = {
  button: 'Clickable button control.', input: 'Single-line editable input control.', textarea: 'Multiline editable text control.',
  checkbox: 'Boolean checkbox control.', radio: 'Mutually exclusive radio control.', select: 'Selection control containing option elements.', option: 'Choice inside a select control.',
  range: 'Numeric range control.', slider: 'Numeric slider control.', color: 'Color input control.', 'color-picker': 'Editor-style color picker control.',
  panel: 'General retained layout container.', row: 'Flex row container.', column: 'Flex column container.', grid: 'Grid layout container.',
  scroll: 'Scrollable retained container.', canvas: 'Retained canvas host for declarative shapes or CanvasContext drawing.',
  img: 'Image element.', image: 'Image element.', text: 'Text element.', label: 'Text label, often associated with a form control.',
  graph: 'Graph surface container.', nodeeditor: 'Node editor surface.', 'node-editor': 'Node editor surface.', hierarchy: 'Editor hierarchy control.', inspector: 'Editor inspector control.',
};
const canvasShapeTags = new Set(['rect','circle','ellipse','line','triangle','polygon','polyline','path','canvas-text','canvas-image']);
for (const tag of [...TAG_FUNCTIONS].sort()) {
  const isCanvas = canvasShapeTags.has(tag);
  const description = tagDescriptions[tag] || (isCanvas
    ? `Declarative LazyUI canvas ${tag} shape. Geometry comes from LSHTML attributes and appearance comes from LSCSS.`
    : `Supported LSHTML <${tag}> retained element. It lowers to the matching LazyUI element factory and accepts standard id, class, state, binding, and event attributes.`);
  entries.push({
    module: 'LazyUI/LSHTML elements', kind: 'LSHTML element', name: tag,
    signature: isCanvas ? `<${tag} ...></${tag}>` : `<${tag} id="..." class="...">...</${tag}>`,
    description, source: 'compiler/inline_ui.js', line: 920,
    example: isCanvas
      ? `lshtml ShapeExample() = {
    <canvas id="drawing"><${tag} x="12" y="12" width="120" height="48"></${tag}></canvas>
}`
      : `lshtml ${tag.replace(/[^A-Za-z0-9]/g, '_')}_example() = {
    <${tag} id="example" class="example">Content</${tag}>
}`,
    exampleNote: 'Style the element with LSCSS selectors and retrieve it later with document.find("#example").',
  });
}

const eventAttributeNames = new Set(LSHTML_EVENT_HELPERS.keys());
const attributeDescriptions = {
  id: 'Assigns the unique element id used by #id LSCSS selectors and document.find("#id").',
  class: 'Assigns one or more whitespace-separated classes used by .class selectors and document.find(".class").',
  'class-name': 'Alias of class.', text: 'Sets the retained element text.', value: 'Sets the control value.', placeholder: 'Sets input placeholder text.',
  title: 'Sets descriptive title text.', src: 'Sets an image/media source.', alt: 'Sets alternate text.', name: 'Sets the form/control group name.',
  context: 'Associates an ordinary LSX object with event callbacks as the third callback argument.',
  hidden: 'Hides the element.', disabled: 'Disables interaction and enables :disabled styling.', checked: 'Sets checked state.', selected: 'Sets selected state.',
  readonly: 'Prevents editing while preserving display and focus behavior.', multiple: 'Allows multiple values where supported.', draggable: 'Marks the element draggable.', focusable: 'Allows keyboard focus.',
  style: 'Applies an LSX Style object or inline style declaration.', props: 'Passes props to a custom LSHTML component.', function: 'Selects a component function for <component>.', component: 'Alias used to select a component function.',
  points: 'Static x,y coordinate list for polygon/polyline canvas shapes.', d: 'Static simple M/L/H/V/Z path data for a declarative canvas path.',
};
for (const attribute of LSHTML_ATTRIBUTES.filter((name) => !eventAttributeNames.has(name)).sort()) {
  entries.push({
    module: 'LazyUI/LSHTML attributes', kind: 'LSHTML attribute', name: attribute,
    signature: `${attribute}="value" or ${attribute}={expression}`,
    description: attributeDescriptions[attribute] || `Supported LSHTML ${attribute} attribute. Static values are lowered once; {expression} values become retained LSX bindings where the attribute supports runtime binding.`,
    source: 'compiler/inline_ui.js', line: 947,
    example: `lshtml AttributeExample(props) = {
    <button id="example" ${attribute}={props.value}>Example</button>
}`,
  });
}

const runtimeEventNames = {
  click: 'click', change: 'change', input: 'input', focus: 'focus', blur: 'blur',
  key_down: 'keydown', key_up: 'keyup', pointer_down: 'pointerdown', pointer_up: 'pointerup', pointer_move: 'pointermove', scroll: 'scroll',
};
const aliasesByEvent = new Map();
for (const [attribute, helper] of LSHTML_EVENT_HELPERS) {
  const event = runtimeEventNames[helper] || helper;
  if (!aliasesByEvent.has(event)) aliasesByEvent.set(event, []);
  aliasesByEvent.get(event).push(attribute);
}
for (const [event, aliases] of [...aliasesByEvent].sort()) {
  entries.push({
    module: 'LazyUI/Events', kind: 'UI event', name: event,
    signature: `${aliases.join(' / ')}={handler}  |  element.add_event_listener("${event}", handler)`,
    description: `LazyUI ${event} event. LSHTML may attach it declaratively with ${aliases.join(' or ')}, and normal LSX may attach one or more listeners after document.find().`,
    source: 'compiler/inline_ui.js', line: 947,
    example: `fn handle_${event}(element,event,props)
    props.last_event = event.type
end

local element = document.find("#target")
element.add_event_listener_with_context("${event}",handle_${event},props)`,
    exampleNote: 'Callbacks use inferred parameters. No pointer or explicit type syntax is required.',
  });
}
entries.push({
  module: 'LazyUI/Events', kind: 'compiler feature', name: 'runtime event listener workflow',
  signature: 'document.find(selector).add_event_listener(event, handler)',
  description: 'Retrieves retained LSHTML elements from normal LSX and attaches runtime listeners. Multiple listeners may be attached to the same event, and add_event_listener_with_context passes an ordinary LSX context object as the third callback argument.',
  source: 'bindings/UI/LazyUI.lsx', line: 1700,
  example: `fn save_clicked(element,event,editor)
    editor.save_scene()
end

local save_button = document.find("#save")
if save_button ~= null then
    save_button.add_event_listener_with_context("click",save_clicked,editor)
end`,
});

const propertyValueHints = {
  display: 'flex, block, grid, inline, or none', position: 'relative, absolute, fixed, or sticky', width: 'auto, px, %, vw, vh, em, rem, or {expression}',
  height: 'auto, px, %, vw, vh, em, rem, or {expression}', 'flex-direction': 'row, row-reverse, column, or column-reverse',
  'justify-content': 'start, center, end, space-between, space-around, or space-evenly', 'align-items': 'auto, stretch, start, center, end, or baseline',
  overflow: 'visible, hidden, scroll, auto, or clip', cursor: 'default, pointer, text, move, crosshair, grab, grabbing, resize-ew, resize-ns, or not-allowed',
  'pointer-events': 'true/false or none/auto', visibility: 'true/false or visible/hidden', 'object-fit': 'fill, contain, cover, none, or scale-down',
  background: 'a color, linear-gradient(...), radial-gradient(...), or {expression}', color: 'RGBA integer, hex-style source value, or {expression}',
};
for (const property of [...LSCSS_PROPERTIES].sort()) {
  const hint = propertyValueHints[property] || 'a supported static value or {expression}';
  entries.push({
    module: 'LazyUI/LSCSS properties', kind: 'LSCSS property', name: property,
    signature: `${property} = value`,
    description: `Supported LSCSS ${property} property. Accepted values include ${hint}. The compiler lowers it to the retained Style fields and css_* helpers used by LazyUI.`,
    source: 'compiler/inline_ui.js', line: 451,
    example: `lscss .example = {
    ${property} = {props.value}
}`,
    exampleNote: 'LSCSS accepts direct LSX {expression} bindings in addition to static values.',
  });
}
entries.push({
  module: 'LazyUI/LSCSS', kind: 'compiler feature', name: 'lscss declaration',
  signature: 'lscss selector = { property = value }',
  description: 'Declares retained styles directly in an LSX module. Rules are matched to LSHTML elements at compile time, and dynamic {expression} values become retained style bindings.',
  source: 'compiler/inline_ui.js', line: 1,
  example: `lscss .primary = {
    display = flex
    padding = 8px 14px
    background = #3478F6FF
    hover = { background = #4A8BFFFF }
}`,
});
for (const selector of LSCSS_SELECTOR_FORMS) {
  entries.push({
    module: 'LazyUI/LSCSS selectors', kind: 'LSCSS selector', name: selector,
    signature: `lscss ${selector} = { ... }`,
    description: `Supported LSCSS selector form: ${selector}. Selectors are resolved against the LSHTML tree during lowering.`,
    source: 'compiler/inline_ui.js', line: 786,
    example: `lscss ${selector === 'tag' ? 'button' : selector === 'ancestor descendant' ? '.toolbar .primary' : selector === 'parent > child' ? '.toolbar > button' : selector === 'selector, selector' ? '.save, .apply' : selector} = {
    opacity = 1.0
}`,
  });
}
for (const state of LSCSS_STATE_SELECTORS) {
  entries.push({
    module: 'LazyUI/LSCSS selectors', kind: 'LSCSS selector', name: `:${state}`,
    signature: `lscss .control:${state} = { ... }`,
    description: `Styles the retained ${state} state. The same state may also be written as a nested ${state} = { ... } block inside a normal rule.`,
    source: 'compiler/inline_ui.js', line: 1121,
    example: `lscss .control:${state} = {
    opacity = 0.8
}`,
  });
}

// These LazyUI methods intentionally hide their native storage details from
// normal LSX code. The compiler accepts ordinary inferred values and performs
// any required ABI lowering internally, so the searchable API should show the
// source syntax users actually write.
const publicSignatureOverrides = new Map([
  ['UI/LazyUI|Document|find', 'find(selector) -> Element'],
  ['UI/LazyUI|Document|find_all', 'find_all(selector)'],
  ['UI/LazyUI|Element|add_event_listener', 'add_event_listener(event, handler) -> Element'],
  ['UI/LazyUI|Element|add_event_listener_with_context', 'add_event_listener_with_context(event, handler, context) -> Element'],
  ['UI/LazyUI|Element|remove_event_listener', 'remove_event_listener(event, handler) -> bool'],
  ['UI/LazyUI|Element|clear_event_listeners', 'clear_event_listeners(event)'],
]);
for (const entry of entries) {
  const key = `${entry.module}|${entry.owner || ''}|${entry.name}`;
  if (publicSignatureOverrides.has(key)) entry.signature = publicSignatureOverrides.get(key);
}

const manifestPath = path.join(bindingsRoot, 'BINDING_MANIFEST.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const stats = entries.reduce((acc, e) => {
  acc.total++;
  acc.modules[e.module] = (acc.modules[e.module] || 0) + 1;
  acc.kinds[e.kind] = (acc.kinds[e.kind] || 0) + 1;
  return acc;
}, { total: 0, modules: {}, kinds: {} });

const data = { generatedAt: new Date().toISOString(), manifest, stats, entries, moduleGuides: languageApiReference.moduleGuides };
fs.writeFileSync(path.join(outputRoot, 'api-data.json'), JSON.stringify(data, null, 2));

const safeJson = JSON.stringify(data).replace(/</g, '\\u003c').replace(/-->/g, '--\\>');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LazyScriptEX Native GameKit and LazyUI API</title>
<style>
:root{color-scheme:dark;--bg:#0b0e14;--panel:#121722;--panel2:#171e2b;--line:#273144;--text:#e8edf5;--muted:#9ca9bc;--accent:#78a9ff;--green:#76d7a5;--orange:#ffc078;--purple:#c7a0ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 Inter,Segoe UI,system-ui,sans-serif}header{position:sticky;top:0;z-index:5;background:rgba(11,14,20,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(14px)}.head{max-width:1500px;margin:auto;padding:18px 24px}.title{display:flex;gap:14px;align-items:center}.logo{width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#4b7bec,#8e6cef);display:grid;place-items:center;font-weight:800}.title h1{font-size:21px;margin:0}.title p{margin:1px 0 0;color:var(--muted)}.toolbar{display:grid;grid-template-columns:minmax(260px,1fr) 190px 190px auto;gap:10px;margin-top:15px}input,select,button{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:8px;padding:10px 12px;font:inherit}button{cursor:pointer}button:hover{border-color:var(--accent)}main{max-width:1500px;margin:auto;padding:22px 24px 50px}.notice{background:linear-gradient(135deg,#131b2a,#171a29);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:18px}.notice h2{font-size:18px;margin:0 0 8px}.notice code{color:var(--green)}.stats{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}.pill{background:var(--panel2);border:1px solid var(--line);padding:6px 10px;border-radius:999px;color:var(--muted)}.pill strong{color:var(--text)}#results{display:grid;gap:10px}.entry{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}.entry-head{display:flex;gap:12px;align-items:center;padding:12px 14px;background:var(--panel2)}.entry-name{font:600 15px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}.badge{margin-left:auto;font-size:12px;border-radius:999px;padding:3px 8px;border:1px solid var(--line)}.raw-function{color:var(--accent)}.typed-function,.typed-object{color:var(--green)}.constant{color:var(--orange)}pre{margin:0;padding:13px 14px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#0d1119;color:#dce7f7;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.description{padding:11px 14px;color:var(--muted);border-top:1px solid var(--line)}.meta{padding:7px 14px;color:var(--muted);font-size:12px;border-top:1px solid var(--line)}.empty{text-align:center;color:var(--muted);padding:60px}.pager{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:18px}.guides{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-bottom:18px}.guide{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}.guide h3{margin:0 0 6px;font-size:15px}.guide p{margin:0;color:var(--muted)}kbd{border:1px solid var(--line);background:#080b10;padding:1px 5px;border-radius:4px}@media(max-width:800px){.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1}.head,main{padding-left:14px;padding-right:14px}}
</style>
</head>
<body>
<header><div class="head"><div class="title"><div class="logo">LSX</div><div><h1>Native GameKit and LazyUI API</h1><p>Native LSX language, LazyUI LSHTML/LSCSS, canvas, GLM, GLFW, OpenGL 4.6, OpenAL, threading, files, JSON, images, SDF fonts, sockets, HTTP, and platform APIs.</p></div></div><div class="toolbar"><input id="q" autofocus placeholder="Search functions, constants, signatures… (Ctrl+K)"><select id="module"><option value="">All modules</option></select><select id="kind"><option value="">All entry types</option></select><button id="clear">Clear</button></div></div></header>
<main>
<section class="notice"><h2>Native objects, first-class LSHTML/LSCSS, and no front-end memory plumbing.</h2><p>Normal code uses compiler-inferred packed literals, packed LSX objects, and annotation-free contiguous collections. GLM vectors, matrices, quaternions, transforms, projections, and cameras are exposed through an LSX-first layer while the C++ ABI stays internal. Threading maps LSX functions to real OS workers, files map to native KERNEL32 operations, sockets map to WinSock2, and HTTP/HTTPS maps to WinHTTP. Raw memory remains an explicit interop escape hatch. LazyUI markup and styles live directly in <code>.lsx</code> files and lower to retained element functions without a browser or virtual DOM.</p><div class="stats" id="stats"></div></section>
<section class="guides"><article class="guide"><h3>Inline LSHTML and LSCSS</h3><p>Declare retained UI trees and styles directly in <code>.lsx</code> files. Elements are normal LSX functions, props are ordinary objects, and runtime code never reparses or diffs markup.</p></article><article class="guide"><h3>LazyUI canvas and shader</h3><p>Use the retained canvas for paths and custom drawing. The dedicated shader batches rounded corners, borders, shadows, outlines, gradients, text, and images.</p></article><article class="guide"><h3>Packed geometry literals</h3><p>Use normal <code>local vertices = {...}</code> and <code>local indices = {...}</code> syntax. Decimal lists compile as contiguous <code>f32</code>; non-negative 32-bit integer lists compile as contiguous <code>u32</code>.</p></article><article class="guide"><h3>GLM math and cameras</h3><p>Import <code>Math/GLM</code> and <code>Math/Camera</code> for typed vectors, matrices, quaternions, TRS, projections, decomposition, and camera view/projection matrices without native pointers.</p></article><article class="guide"><h3>Project layout</h3><p>Keep <code>LazyScript/</code> beside <code>Projects/</code>. Imports use <code>@LazyScript/...</code>, so copied projects do not need path rewrites.</p></article><article class="guide"><h3>Recursive VS Code indexing</h3><p>Open the toolkit root. The extension indexes every <code>.lsx</code> file below every workspace folder and watches changes.</p></article><article class="guide"><h3>No per-frame size allocations</h3><p>Create <code>GLFW.FramebufferSize.new()</code> once, call <code>refresh(window)</code>, and destroy it at shutdown.</p></article><article class="guide"><h3>Real worker threads</h3><p>Use <code>System/Threading</code> for native threads, atomics, locks, events, condition variables, TLS, priority, and affinity.</p></article><article class="guide"><h3>Persistent text logs</h3><p>Use <code>System/Log</code> for flushed stage, info, warning, error, and success records. Every executable also writes <code>LazyScriptEX-runtime.log</code> for start, clean exit, or native crash.</p></article><article class="guide"><h3>Files and JSON</h3><p>Use <code>System/File</code> for UTF-8/binary files and <code>Data/Json</code> for native LSX parsing, construction, and serialization.</p></article><article class="guide"><h3>Native networking</h3><p>Use <code>Network/Sockets</code> for TCP/UDP and <code>Network/Http</code> for HTTP/HTTPS without a Python, JavaScript, or managed runtime.</p></article><article class="guide"><h3>Exact low-level access</h3><p>The raw C-shaped APIs remain searchable for advanced interop while normal game code stays object-based.</p></article></section>
<div id="results"></div><div class="pager"><button id="prev">Previous</button><span id="page"></span><button id="next">Next</button></div>
</main>
<script id="api-data" type="application/json">${safeJson}</script>
<script>
const data=JSON.parse(document.getElementById('api-data').textContent);const q=document.getElementById('q'),moduleSel=document.getElementById('module'),kindSel=document.getElementById('kind'),results=document.getElementById('results'),pageLabel=document.getElementById('page');let page=0;const pageSize=100;
for(const name of Object.keys(data.stats.modules).sort()){const o=document.createElement('option');o.value=name;o.textContent=name+' ('+data.stats.modules[name]+')';moduleSel.appendChild(o)}for(const name of Object.keys(data.stats.kinds).sort()){const o=document.createElement('option');o.value=name;o.textContent=name+' ('+data.stats.kinds[name]+')';kindSel.appendChild(o)}
const s=document.getElementById('stats');const labels=[['Entries',data.stats.total],['GLFW raw functions',data.manifest.glfwFunctions],['OpenGL functions',data.manifest.openGLFunctions],['OpenAL functions',data.manifest.openALFunctions],['Threading APIs',data.stats.modules['System/Threading']||0],['File APIs',data.stats.modules['System/File']||0],['Logging APIs',data.stats.modules['System/Log']||0],['JSON APIs',data.stats.modules['Data/Json']||0],['Socket APIs',data.stats.modules['Network/Sockets']||0],['HTTP APIs',data.stats.modules['Network/Http']||0],['Media APIs',data.stats.modules['Graphics/Media']||0],['stb_image APIs',data.stats.modules['Graphics/STBImage']||0],['Image compatibility APIs',data.stats.modules['Graphics/Image']||0],['FreeType raw APIs',data.stats.modules['Text/FreeTypeRaw']||0],['FreeType typed APIs',data.stats.modules['Text/FreeType']||0],['Texture APIs',data.stats.modules['Graphics/Texture2D']||0],['SDF font APIs',data.stats.modules['Text/Font']||0],['GLM typed APIs',data.stats.modules['Math/GLM']||0],['GLM raw bridge APIs',data.stats.modules['Math/GLMRaw']||0],['Camera APIs',data.stats.modules['Math/Camera']||0],['GLM OpenGL APIs',data.stats.modules['Math/OpenGL']||0],['LazyUI APIs',data.stats.modules['UI/LazyUI']||0],['LazyUI renderer APIs',data.stats.modules['UI/Renderer']||0]];for(const [k,v] of labels){const n=document.createElement('span');n.className='pill';n.innerHTML='<strong>'+v+'</strong> '+k;s.appendChild(n)}
function escapeHtml(v){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function filtered(){const term=q.value.trim().toLowerCase();return data.entries.filter(e=>(!moduleSel.value||e.module===moduleSel.value)&&(!kindSel.value||e.kind===kindSel.value)&&(!term||(e.name+' '+(e.owner||'')+' '+e.signature+' '+(e.description||'')+' '+e.module+' '+e.kind).toLowerCase().includes(term)))}
function render(){const list=filtered();const pages=Math.max(1,Math.ceil(list.length/pageSize));if(page>=pages)page=pages-1;if(page<0)page=0;results.innerHTML='';const slice=list.slice(page*pageSize,(page+1)*pageSize);if(!slice.length)results.innerHTML='<div class="empty">No matching API entries.</div>';for(const e of slice){const el=document.createElement('article');el.className='entry';const cls=e.kind.replaceAll(' ','-');const qualified=e.module+'.'+(e.owner?e.owner+'.':'')+e.name;el.innerHTML='<div class="entry-head"><span class="entry-name">'+escapeHtml(qualified)+'</span><span class="badge '+cls+'">'+escapeHtml(e.kind)+'</span></div><pre>'+escapeHtml(e.signature)+'</pre><div class="description">'+escapeHtml(e.description||'No description available.')+'</div><div class="meta">'+escapeHtml(e.source)+':'+e.line+(e.dll?' · '+escapeHtml(e.dll):'')+'</div>';results.appendChild(el)}pageLabel.textContent=(list.length?(page*pageSize+1)+'–'+Math.min((page+1)*pageSize,list.length)+' of '+list.length:'0 results');document.getElementById('prev').disabled=page===0;document.getElementById('next').disabled=page>=pages-1;history.replaceState(null,'','#q='+encodeURIComponent(q.value)+'&module='+encodeURIComponent(moduleSel.value)+'&kind='+encodeURIComponent(kindSel.value))}
for(const el of [q,moduleSel,kindSel])el.addEventListener(el===q?'input':'change',()=>{page=0;render()});document.getElementById('clear').onclick=()=>{q.value='';moduleSel.value='';kindSel.value='';page=0;render();q.focus()};document.getElementById('prev').onclick=()=>{page--;render();scrollTo(0,0)};document.getElementById('next').onclick=()=>{page++;render();scrollTo(0,0)};addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();q.focus();q.select()}});const params=new URLSearchParams(location.hash.slice(1));q.value=params.get('q')||'';moduleSel.value=params.get('module')||'';kindSel.value=params.get('kind')||'';render();
</script>
</body></html>`;
const indexPath = path.join(outputRoot, 'index.html');
if (!fs.existsSync(indexPath)) fs.writeFileSync(indexPath, html);
console.log(`Generated ${entries.length} API entries in ${path.join(outputRoot, 'api-data.json')}`);
