'use strict';
const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const compiler = path.join(__dirname, 'lazyscriptex.js');
const examplesRoot = path.resolve(root, '..', 'Projects');
const rebuild = process.argv.includes('--build');

function parsePe(buffer) {
  assert.strictEqual(buffer.readUInt16LE(0), 0x5A4D, 'missing MZ header');
  const pe = buffer.readUInt32LE(0x3C);
  assert.strictEqual(buffer.toString('ascii', pe, pe + 4), 'PE\0\0', 'missing PE header');
  assert.strictEqual(buffer.readUInt16LE(pe + 4), 0x8664, 'example is not x64');
  const count = buffer.readUInt16LE(pe + 6);
  const optionalSize = buffer.readUInt16LE(pe + 20);
  const optional = pe + 24;
  const table = optional + optionalSize;
  const sections = [];
  for (let i = 0; i < count; i += 1) {
    const o = table + i * 40;
    sections.push({ virtualSize: buffer.readUInt32LE(o + 8), rva: buffer.readUInt32LE(o + 12), rawSize: buffer.readUInt32LE(o + 16), rawPointer: buffer.readUInt32LE(o + 20) });
  }
  const rvaToOffset = (rva) => {
    const section = sections.find((s) => rva >= s.rva && rva < s.rva + Math.max(s.virtualSize, s.rawSize));
    if (!section) throw new Error(`RVA not mapped: 0x${rva.toString(16)}`);
    return section.rawPointer + rva - section.rva;
  };
  const cString = (offset) => {
    let end = offset;
    while (end < buffer.length && buffer[end] !== 0) end += 1;
    return buffer.toString('ascii', offset, end);
  };
  const importRva = buffer.readUInt32LE(optional + 120);
  const imports = [];
  let descriptor = rvaToOffset(importRva);
  for (;;) {
    const lookup = buffer.readUInt32LE(descriptor);
    const nameRva = buffer.readUInt32LE(descriptor + 12);
    const iat = buffer.readUInt32LE(descriptor + 16);
    if (lookup === 0 && nameRva === 0 && iat === 0) break;
    const dll = cString(rvaToOffset(nameRva));
    const functions = [];
    let thunk = rvaToOffset(lookup);
    for (;;) {
      const entry = Number(buffer.readBigUInt64LE(thunk));
      if (entry === 0) break;
      functions.push(cString(rvaToOffset(entry) + 2));
      thunk += 8;
    }
    imports.push({ dll: dll.toLowerCase(), functions });
    descriptor += 20;
  }
  return imports;
}

const folders = fs.readdirSync(examplesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(examplesRoot, entry.name, 'lazyscriptex.json')))
  .map((entry) => entry.name)
  .sort();
assert(folders.length >= 22, 'expected the complete Native GameKit project set');

for (const folder of folders) {
  const projectRoot = path.join(examplesRoot, folder);
  const sourceFiles = [];
  const collectSources = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'build') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) collectSources(absolute);
      else if (entry.isFile() && entry.name.endsWith('.lsx')) sourceFiles.push(absolute);
    }
  };
  collectSources(projectRoot);
  for (const sourceFile of sourceFiles) {
    const source = fs.readFileSync(sourceFile, 'utf8');
    const lines = source.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const original = lines[lineIndex];
      const code = original.replace(/--.*$/, '');
      const location = `${path.relative(examplesRoot, sourceFile)}:${lineIndex + 1}`;
      if (/^\s*(?:export\s+)?fn\s+/.test(code)) {
        const signature = code.split(')', 1)[0];
        assert(!signature.includes(':'), `${location}: example function parameter exposes an explicit type`);
        assert(!/\)\s*->/.test(code), `${location}: example function exposes an explicit return type`);
      }
      assert(!/^\s*(?:local\s+)?[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z_]/.test(code), `${location}: example declaration exposes an explicit type`);
      if (/^\s*(?:export\s+)?lshtml\s+/.test(code)) {
        const match = code.match(/\(([^)]*)\)/);
        if (match) assert(!/[.:]/.test(match[1]), `${location}: LSHTML parameter exposes an explicit type`);
      }
      assert(!/\btable\s*</.test(code), `${location}: example exposes typed-table syntax`);
      const withoutStrings = code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
      assert(!/\b[A-Za-z_][A-Za-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(withoutStrings), `${location}: example uses colon method-call syntax`);
    }
  }
  const configPath = path.join(projectRoot, 'lazyscriptex.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const output = path.resolve(projectRoot, config.output);
  if (rebuild) {
    const built = cp.spawnSync(process.execPath, [compiler, 'build', configPath], { encoding: 'utf8' });
    if (built.status !== 0) throw new Error(`${folder} failed to build\n${built.stdout}${built.stderr}`);
  }
  assert(fs.existsSync(output), `${folder}: executable is missing`);
  const imports = parsePe(fs.readFileSync(output));
  const importMap = new Map(imports.map((entry) => [entry.dll, new Set(entry.functions)]));

  const runtimeFiles = config.runtimeFiles || [];
  for (const relative of runtimeFiles) {
    const source = relative.startsWith('@LazyScript/')
      ? path.resolve(root, relative.slice('@LazyScript/'.length))
      : path.resolve(projectRoot, relative);
    const target = path.join(path.dirname(output), path.basename(source));
    assert(fs.existsSync(target), `${folder}: runtime sidecar is missing: ${path.basename(source)}`);
    assert(fs.readFileSync(source).equals(fs.readFileSync(target)), `${folder}: runtime sidecar differs: ${path.basename(source)}`);
  }

  const bridge = importMap.get('lsxgamekit.dll');
  if (bridge) {
    // Direct bridge APIs such as console helpers do not need to call the
    // GLFW/OpenGL/OpenAL loader. Only require the loader export when the
    // project actually references it.
    const entrySource = fs.readFileSync(path.resolve(projectRoot, config.entry), 'utf8');
    if (entrySource.includes('lsxLoadLibraries')) {
      assert(bridge.has('lsxLoadLibraries'), `${folder}: runtime loader import is missing`);
    }
    for (const [relative, filename] of [
      ['native/LSXGameKit.dll', 'LSXGameKit.dll'],
      ['runtime/glfw3.dll', 'glfw3.dll'],
      ['runtime/OpenAL32.dll', 'OpenAL32.dll'],
    ]) {
      const source = path.join(root, relative);
      const target = path.join(path.dirname(output), filename);
      assert(fs.existsSync(target), `${folder}: automatically staged runtime sidecar is missing: ${filename}`);
      assert(fs.readFileSync(source).equals(fs.readFileSync(target)), `${folder}: automatically staged runtime sidecar differs: ${filename}`);
    }
  }
  if (folder === '18_native_threads') {
    const kernel = importMap.get('kernel32.dll');
    assert(kernel && kernel.has('CreateThread'), `${folder}: CreateThread import is missing`);
    assert(![...kernel].some((name) => /^Interlocked/i.test(name)), `${folder}: Interlocked macro was incorrectly emitted as a DLL import`);
    const binary = fs.readFileSync(output);
    assert(binary.indexOf(Buffer.from([0xF0, 0x48, 0x0F, 0xC1])) >= 0, `${folder}: lock xaddq atomic instruction is missing`);
    assert(binary.indexOf(Buffer.from([0xF0, 0x48, 0x0F, 0xB1])) >= 0, `${folder}: lock cmpxchgq atomic instruction is missing`);
  }
  if (folder === '19_tcp_loopback') {
    const winsock = importMap.get('ws2_32.dll');
    assert(winsock && winsock.has('WSAStartup'), `${folder}: WinSock startup import is missing`);
    assert(winsock.has('accept') && winsock.has('connect'), `${folder}: TCP imports are incomplete`);
  }
  if (folder === '20_http_client') {
    const winhttp = importMap.get('winhttp.dll');
    assert(winhttp && winhttp.has('WinHttpOpen'), `${folder}: WinHTTP session import is missing`);
    assert(winhttp.has('WinHttpSendRequest'), `${folder}: HTTP request import is missing`);
  }
  process.stdout.write(`PASS ${folder}\n`);
}

const bridgeSource = fs.readFileSync(path.join(root, 'native', 'lsx_gamekit_bridge.c'), 'utf8');
for (const forbidden of ['CreateWindowEx', 'RegisterClassEx', 'DefWindowProc', 'PeekMessage', 'DispatchMessage']) {
  assert(!bridgeSource.includes(forbidden), `custom Win32 window token found: ${forbidden}`);
}
console.log(`Audited ${folders.length} x64 Native GameKit executables, runtime sidecars, native threads, WinSock2, and WinHTTP imports.`);
