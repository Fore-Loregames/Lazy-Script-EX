'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function commandExists(command) {
  if (!command) return false;
  if (path.isAbsolute(command)) return fs.existsSync(command);
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const probe = cp.spawnSync(locator, [command], { encoding: 'utf8', windowsHide: true });
  return !probe.error && probe.status === 0;
}

function run(command, args, cwd) {
  const result = cp.spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    const details = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }
  return result;
}

function findCommand(candidates) {
  for (const candidate of candidates) {
    if (candidate && commandExists(candidate)) return candidate;
  }
  return null;
}

function writeKernel32ImportDefinition(directory) {
  const definition = path.join(directory, 'kernel32.def');
  fs.writeFileSync(definition, [
    'LIBRARY KERNEL32.dll',
    'EXPORTS',
    'LoadLibraryA',
    'GetProcAddress',
    'GetModuleHandleA',
    'FreeLibrary',
    'AllocConsole',
    'GetStdHandle',
    'WriteFile',
    'ReadFile',
    'CreateFileA',
    'GetFileSize',
    'CloseHandle',
    'VirtualAlloc',
    'VirtualFree',
    'SetUnhandledExceptionFilter',
    '',
  ].join('\n'));
  return definition;
}

function compileWithClang(source, output, tempDir) {
  const clang = findCommand([
    process.env.LSX_CLANG,
    process.platform === 'win32' ? 'clang.exe' : 'clang',
    '/usr/local/swift/usr/bin/clang',
  ]);
  const linker = findCommand([
    process.env.LSX_LLD_LINK,
    process.platform === 'win32' ? 'lld-link.exe' : 'lld-link',
    '/usr/local/swift/usr/bin/lld-link',
  ]);
  if (!clang || !linker) throw new Error('clang and lld-link were not found');

  const object = path.join(tempDir, 'LazyNativeBinding.obj');
  const kernelDef = writeKernel32ImportDefinition(tempDir);
  const kernelImport = path.join(tempDir, 'kernel32.lib');
  const ignoredStub = path.join(tempDir, 'kernel32-import-stub.dll');
  const importLib = path.join(tempDir, 'LazyNativeBinding.lib');

  run(linker, [
    '/dll', '/noentry', '/machine:x64', `/def:${kernelDef}`,
    `/out:${ignoredStub}`, `/implib:${kernelImport}`,
  ], tempDir);

  run(clang, [
    '--target=x86_64-pc-windows-msvc', '-c', source, '-o', object,
    '-O2', '-ffreestanding', '-fno-stack-protector',
  ], tempDir);

  run(linker, [
    '/dll', '/machine:x64', '/nodefaultlib', '/entry:DllMain',
    '/opt:ref', '/opt:icf', `/out:${output}`, `/implib:${importLib}`,
    object, kernelImport,
  ], tempDir);

  return { toolchain: `${path.basename(clang)} + ${path.basename(linker)}` };
}

function compileWithMsvc(source, output, tempDir) {
  const cl = findCommand([process.env.LSX_CL, process.platform === 'win32' ? 'cl.exe' : 'cl']);
  const link = findCommand([process.env.LSX_LINK, process.platform === 'win32' ? 'link.exe' : 'link']);
  if (!cl || !link) throw new Error('MSVC cl.exe and link.exe were not found in PATH');

  const object = path.join(tempDir, 'LazyNativeBinding.obj');
  const importLib = path.join(tempDir, 'LazyNativeBinding.lib');
  run(cl, ['/nologo', '/c', '/O2', '/GS-', '/TC', source, `/Fo:${object}`], tempDir);
  run(link, [
    '/nologo', '/dll', '/machine:x64', '/nodefaultlib', '/entry:DllMain',
    '/opt:ref', '/opt:icf', `/out:${output}`, `/implib:${importLib}`,
    object, 'kernel32.lib',
  ], tempDir);
  return { toolchain: 'MSVC cl + link' };
}


function verifyNativeDll(filePath, requiredExports = []) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 256 || buffer.readUInt16LE(0) !== 0x5A4D) {
    throw new Error(`native binding is not a valid PE file: ${filePath}`);
  }
  const peOffset = buffer.readUInt32LE(0x3C);
  if (peOffset + 24 >= buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error(`native binding has no valid PE header: ${filePath}`);
  }
  if (buffer.readUInt16LE(peOffset + 4) !== 0x8664) {
    throw new Error(`native binding is not Windows x64: ${filePath}`);
  }
  const characteristics = buffer.readUInt16LE(peOffset + 22);
  if ((characteristics & 0x2000) === 0) {
    throw new Error(`native binding is not marked as a DLL: ${filePath}`);
  }
  for (const name of requiredExports) {
    if (!buffer.includes(Buffer.from(`${name}\0`, 'ascii'))) {
      throw new Error(`native binding is missing required export '${name}': ${filePath}`);
    }
  }
}

function buildOneBinding(binding, projectRoot, executableOutput) {
  if (!binding || typeof binding !== 'object') throw new Error('nativeBindings entries must be objects');
  if (!binding.source || typeof binding.source !== 'string') throw new Error('native binding is missing a source path');

  const source = path.resolve(projectRoot, binding.source);
  if (!fs.existsSync(source)) throw new Error(`native binding source not found: ${source}`);

  const fileName = path.basename(binding.output || binding.name || 'NativeBinding.dll');
  const output = path.join(path.dirname(executableOutput), fileName.toLowerCase().endsWith('.dll') ? fileName : `${fileName}.dll`);
  const prebuilt = binding.prebuilt ? path.resolve(projectRoot, binding.prebuilt) : null;
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-native-binding-'));
  const temporaryOutput = path.join(tempDir, path.basename(output));
  const errors = [];
  let result = null;

  try {
    if (process.env.LSX_USE_PREBUILT_NATIVE === '1' && prebuilt && fs.existsSync(prebuilt)) {
      fs.copyFileSync(prebuilt, output);
      verifyNativeDll(output, binding.requiredExports || []);
      return { name: binding.name || path.basename(output, '.dll'), source, output, mode: 'validated-prebuilt', toolchain: null };
    }
    if (process.platform === 'win32') {
      try { result = compileWithMsvc(source, temporaryOutput, tempDir); } catch (error) { errors.push(error.message); }
    }
    if (!result) {
      try { result = compileWithClang(source, temporaryOutput, tempDir); } catch (error) { errors.push(error.message); }
    }

    if (result && fs.existsSync(temporaryOutput)) {
      fs.copyFileSync(temporaryOutput, output);
      verifyNativeDll(output, binding.requiredExports || []);
      return { name: binding.name || path.basename(output, '.dll'), source, output, mode: 'compiled', toolchain: result.toolchain };
    }

    if (prebuilt && fs.existsSync(prebuilt)) {
      fs.copyFileSync(prebuilt, output);
      verifyNativeDll(output, binding.requiredExports || []);
      return {
        name: binding.name || path.basename(output, '.dll'), source, output,
        mode: 'prebuilt-fallback', toolchain: null,
        warning: `Native C toolchain was unavailable; copied validated prebuilt binding. ${errors.join(' | ')}`,
      };
    }

    throw new Error(`could not build native binding '${binding.name || fileName}'. ${errors.join(' | ')}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildNativeBindings(project, executableOutput) {
  const bindings = Array.isArray(project.nativeBindings) ? project.nativeBindings : [];
  return bindings.map((binding) => buildOneBinding(binding, project.root, executableOutput));
}

module.exports = { buildNativeBindings, buildOneBinding, compileWithClang, compileWithMsvc, verifyNativeDll };
