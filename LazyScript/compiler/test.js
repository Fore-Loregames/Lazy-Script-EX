'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const compiler = path.join(__dirname, 'lazyscriptex.js');
const compilerApi = require('./lazyscriptex');
const root = path.resolve(__dirname, '..');
const toolkitRoot = path.resolve(root, '..');

function run(args, expectedStatus = 0) {
  const result = cp.spawnSync(process.execPath, [compiler, ...args], { encoding: 'utf8', env: { ...process.env, LSX_USE_PREBUILT_NATIVE: '1' } });
  assert.strictEqual(result.status, expectedStatus, `command: ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function parsePe(buffer) {
  assert.strictEqual(buffer.readUInt16LE(0), 0x5A4D);
  const pe = buffer.readUInt32LE(0x3C);
  assert.strictEqual(buffer.toString('ascii', pe, pe + 4), 'PE\0\0');
  assert.strictEqual(buffer.readUInt16LE(pe + 4), 0x8664);
  const count = buffer.readUInt16LE(pe + 6);
  const optionalSize = buffer.readUInt16LE(pe + 20);
  const optional = pe + 24;
  const table = optional + optionalSize;
  const sections = [];
  for (let i = 0; i < count; i += 1) {
    const o = table + i * 40;
    sections.push({
      name: buffer.toString('ascii', o, o + 8).replace(/\0.*$/, ''),
      virtualSize: buffer.readUInt32LE(o + 8),
      rva: buffer.readUInt32LE(o + 12),
      rawSize: buffer.readUInt32LE(o + 16),
      rawPointer: buffer.readUInt32LE(o + 20),
    });
  }
  const rvaToOffset = (rva) => {
    const section = sections.find((s) => rva >= s.rva && rva < s.rva + Math.max(s.virtualSize, s.rawSize));
    if (!section) throw new Error(`RVA not mapped: 0x${rva.toString(16)}`);
    return section.rawPointer + rva - section.rva;
  };
  const cString = (offset) => {
    let end = offset;
    while (buffer[end] !== 0) end += 1;
    return buffer.toString('ascii', offset, end);
  };
  const importRva = buffer.readUInt32LE(optional + 112 + 8);
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
    imports.push({ dll, functions });
    descriptor += 20;
  }
  const subsystem = buffer.readUInt16LE(optional + 68);
  return { pe, sections, imports, subsystem };
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-080-'));
const write = (relative, source) => {
  const file = path.join(temp, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
};

// Modules remain valid without an entry point and comments are ignored correctly.
const config = write('config.lsx', `
--- exported configuration
--[[ block comment ]]
export title = "Lazy Native GameKit"
export width = 960
export height = 540
`);
run(['check', config]);

// Recursive functions across a circular module graph are valid.
write('cycle/a.lsx', `
use "b.lsx" as B
export fn even(value: i64) -> bool
    if value == 0 then
        return true
    end
    return B.odd(value - 1)
end
`);
write('cycle/b.lsx', `
use "a.lsx" as A
export fn odd(value: i64) -> bool
    if value == 0 then
        return false
    end
    return A.even(value - 1)
end
`);
const recursiveMain = write('cycle/main.lsx', `
use "a.lsx" as A
fn main() -> i32
    if A.even(10) and not A.even(9) then
        return 0
    end
    return 1
end
`);
const recursiveExe = path.join(temp, 'cycle.exe');
run(['build', recursiveMain, '-o', recursiveExe]);
assert(fs.existsSync(recursiveExe));

// Arbitrary C ABI imports are emitted into the native PE import table.
write('ffi/native.lsx', `
export extern "test-native.dll" fn NativeProbe(version_out: ptr) -> i32
export fn probe() -> i32
    local version = memory.alloc(4)
    local result = NativeProbe(version)
    memory.free(version)
    return result
end
`);
const ffiMain = write('ffi/main.lsx', `
use "native.lsx" as Native
fn main() -> i32
    return Native.probe()
end
`);
const ffiExe = path.join(temp, 'ffi.exe');
run(['build', ffiMain, '-o', ffiExe]);
const ffiPe = parsePe(fs.readFileSync(ffiExe));
assert.deepStrictEqual(ffiPe.sections.map((s) => s.name), ['.text', '.rdata', '.data']);
const nativeImport = ffiPe.imports.find((entry) => entry.dll.toLowerCase() === 'test-native.dll');
assert(nativeImport, 'test-native.dll import missing');
assert(nativeImport.functions.includes('NativeProbe'));
const ffiKernel = ffiPe.imports.find((entry) => entry.dll.toLowerCase() === 'kernel32.dll');
for (const name of ['GetProcessHeap', 'HeapAlloc', 'HeapFree']) assert(ffiKernel.functions.includes(name), `process-heap allocator import missing ${name}`);
assert(!ffiKernel.functions.includes('HeapValidate'), 'release allocator still performs an expensive HeapValidate call on every free');

// Build the bundled native GLFW/OpenGL project. The EXE imports only the
// generated forwarding DLL; GLFW itself owns window creation and events.
const projectExe = path.join(temp, 'NativeGameKit.exe');
run(['build', path.join(toolkitRoot, 'Projects', '02_opengl_triangle', 'lazyscriptex.json'), '-o', projectExe]);
const projectBuffer = fs.readFileSync(projectExe);
const projectPe = parsePe(projectBuffer);
assert.strictEqual(projectPe.subsystem, 2, 'Native GameKit example must use the Windows subsystem');
const bridgeImport = projectPe.imports.find((entry) => entry.dll.toLowerCase() === 'lsxgamekit.dll');
assert(bridgeImport, 'LSXGameKit.dll import missing');
for (const name of ['lsxLoadLibraries', 'glfwInit', 'glfwCreateWindow', 'glfwMakeContextCurrent', 'lsxLoadOpenGL', 'lsxCreateProgram', '_lsxGlCreateVertexArray', 'glfwSwapBuffers'])
  assert(bridgeImport.functions.includes(name), `${name} binding import missing`);
for (const [source, filename] of [
  [path.join(root, 'native', 'LSXGameKit.dll'), 'LSXGameKit.dll'],
  [path.join(root, 'runtime', 'glfw3.dll'), 'glfw3.dll'],
  [path.join(root, 'runtime', 'OpenAL32.dll'), 'OpenAL32.dll'],
]) {
  const staged = path.join(path.dirname(projectExe), filename);
  assert(fs.existsSync(staged), `compiler did not automatically stage ${filename} beside the EXE`);
  assert(fs.readFileSync(source).equals(fs.readFileSync(staged)), `automatically staged ${filename} differs from the toolkit runtime`);
}

// Both atomic widths are generated as direct lock-prefixed x64 instructions.
// They must never become imports for Windows SDK Interlocked macros.
const atomicMain = write('atomic/main.lsx', `
use "@LazyScript/bindings/System/Threading.lsx" as Threading
fn main()
    local a32 = Threading.AtomicI32.new()
    a32.store(-5)
    local v32 = a32.load() + a32.exchange(7) + a32.add(4) + a32.increment() + a32.decrement() + a32.compare_exchange(99,11)
    local a64 = Threading.AtomicI64.new()
    a64.store(-9)
    local v64 = a64.load() + a64.exchange(13) + a64.add(5) + a64.increment() + a64.decrement() + a64.compare_exchange(123,18)
    a32.destroy()
    a64.destroy()
    if v32 == 35 and v64 == 55 then return 0 end
    return 1
end
`);
const atomicConfig = path.join(temp, 'atomic', 'lazyscriptex.json');
fs.writeFileSync(atomicConfig, JSON.stringify({
  entry: 'main.lsx',
  output: 'build/atomic.exe',
  subsystem: 'console',
  optimization: 4,
  moduleRoots: { LazyScript: root },
}, null, 2));
run(['build', atomicConfig]);
const atomicExe = path.join(temp, 'atomic', 'build', 'atomic.exe');
const atomicBuffer = fs.readFileSync(atomicExe);
const atomicPe = parsePe(atomicBuffer);
assert(!atomicPe.imports.some((entry) => entry.functions.some((name) => /^Interlocked/i.test(name))), 'atomic code imported an Interlocked macro as a DLL function');
for (const instruction of [
  [0xF0, 0x0F, 0xC1],
  [0xF0, 0x0F, 0xB1],
  [0xF0, 0x48, 0x0F, 0xC1],
  [0xF0, 0x48, 0x0F, 0xB1],
]) assert(atomicBuffer.indexOf(Buffer.from(instruction)) >= 0, `missing compiler-emitted atomic opcode ${instruction.map((v) => v.toString(16)).join(' ')}`);

// Non-empty positional numeric literals infer one homogeneous packed native
// element type. Decimal literals become f32 and non-negative integer literals
// that fit in 32 bits become u32, matching OpenGL vertex/index buffer ABI data.
const packedInferenceSource = write('packed-inference/main.lsx', `
fn main()
    local vertices = {-1.0,-1.0,0.0, 1.0,-1.0,0.0, 0.0,1.0,0.0}
    local indices = {0,1,2, 2,3,0}
    return vertices.byte_length() + indices.byte_length()
end
`);
const packedInferenceResult = compilerApi.checkFile(packedInferenceSource);
const packedInferenceStructs = packedInferenceResult.program.moduleOrder
  .flatMap((module) => [...module.structs.values()])
  .filter((struct) => struct.runtimeLiteral && struct.positional);
const inferredVertices = packedInferenceStructs.find((struct) => struct.positionalCount === 9);
const inferredIndices = packedInferenceStructs.find((struct) => struct.positionalCount === 6);
assert(inferredVertices, 'untyped vertex literal was not registered as packed positional data');
assert(inferredIndices, 'untyped index literal was not registered as packed positional data');
assert.strictEqual(inferredVertices.positionalElement?.name, 'f32');
assert.strictEqual(inferredVertices.size, 9 * 4);
assert(inferredVertices.fieldOrder.every((field) => field.type === 'f32'));
assert.strictEqual(inferredIndices.positionalElement?.name, 'u32');
assert.strictEqual(inferredIndices.size, 6 * 4);
assert(inferredIndices.fieldOrder.every((field) => field.type === 'u32'));
run(['build', packedInferenceSource, '-o', path.join(temp, 'packed-inference.exe'), '--opt', '4']);

// Runtime object literals are packed native LSX data. Positional values support
// vector aliases, numeric indexing, mutation, byte sizing, and direct ptr ABI use.
const objectData = write('object-data/main.lsx', `
extern "object-data.dll" fn consume(data: ptr, bytes: i64) -> void
fn main()
    local x = 2.0
    local y = 3.0
    local vector = {x,y}
    vector.x = 4.0
    vector[1] = vector.x + y
    local total = vector[0] + vector.y
    consume(vector,vector.byte_length())

    local pixels = {}
    pixels.push(0xFF0000FF)
    pixels.push(0xFF00FF00)
    pixels.push(0xFFFF0000)
    pixels.resize(8)
    pixels[7] = 0xFFFFFFFF
    consume(pixels,pixels.byte_length())

    pixels.destroy()
    vector.destroy()
    return total
end
`);
const objectDataExe = path.join(temp, 'object-data.exe');
run(['check', objectData]);
run(['build', objectData, '-o', objectDataExe, '--opt', '4']);
const objectDataPe = parsePe(fs.readFileSync(objectDataExe));
const objectDataImport = objectDataPe.imports.find((entry) => entry.dll.toLowerCase() === 'object-data.dll');
assert(objectDataImport?.functions.includes('consume'), 'native object/table pointer ABI import missing');

// Eight-argument extern calls are part of the renderer ABI and must remain compilable.
const call8Source = write('call8/main.lsx', `
extern "call8.dll" fn verify8(a1: u64, a2: u64, a3: u64, a4: u64, a5: u64, a6: u64, a7: u64, a8: u64) -> i32
fn main() -> i32
    return verify8(11, 22, 33, 44, 55, 66, 77, 88)
end
`);
const call8Exe = path.join(temp, 'call8.exe');
run(['build', call8Source, '-o', call8Exe]);
const call8Pe = parsePe(fs.readFileSync(call8Exe));
const call8Import = call8Pe.imports.find((entry) => entry.dll.toLowerCase() === 'call8.dll');
assert(call8Import && call8Import.functions.includes('verify8'), 'eight-argument extern call import missing');

// Selective runtime emission still produces correct indirect calls for every requested FFI arity.
const ffiCalls = write('ffi_calls/main.lsx', `
fn main() -> i32
    ffi.call0(0)
    ffi.call1(0, 1)
    ffi.call2(0, 1, 2)
    ffi.call3(0, 1, 2, 3)
    ffi.call4(0, 1, 2, 3, 4)
    ffi.call5(0, 1, 2, 3, 4, 5)
    ffi.call6(0, 1, 2, 3, 4, 5, 6)
    ffi.call7(0, 1, 2, 3, 4, 5, 6, 7)
    ffi.call8(0, 1, 2, 3, 4, 5, 6, 7, 8)
    return 0
end
`);
const ffiCallsExe = path.join(temp, 'ffi_calls.exe');
run(['build', ffiCalls, '-o', ffiCallsExe]);
const ffiCallsBuffer = fs.readFileSync(ffiCallsExe);
const indirectCallRax = Buffer.from([0xFF, 0xD0]);
let indirectCallCount = 0;
for (let i = 0; i <= ffiCallsBuffer.length - indirectCallRax.length; i += 1) {
  if (ffiCallsBuffer.subarray(i, i + indirectCallRax.length).equals(indirectCallRax)) indirectCallCount += 1;
}
assert(indirectCallCount >= 9, `expected requested ffi.call0..ffi.call8 helpers to contain call rax; found ${indirectCallCount}`);

// O2 folds constants, removes unreachable code, strips unused runtimes/imports,
// and converts self-tail recursion into a jump.
const optimizedSource = write('optimizer/main.lsx', `
fn count_down(value: i64, result: i64) -> i64
    if value == 0 then
        return result
    end
    return count_down(value - 1, result + 1)
end

fn main() -> i32
    local folded = 10 * 4 + 2
    local unused = 999
    if false then
        console.write_line("optimizer-dead-branch")
    end
    while false do
        console.write_line("optimizer-dead-loop")
    end
    return count_down(folded, 0)
end
`);
const optimizerO0 = path.join(temp, 'optimizer-o0.exe');
const optimizerO2 = path.join(temp, 'optimizer-o2.exe');
const o0Result = run(['build', optimizedSource, '-o', optimizerO0, '--opt', '0']);
const o2Result = run(['build', optimizedSource, '-o', optimizerO2, '--opt', '2']);
const o0Buffer = fs.readFileSync(optimizerO0);
const o2Buffer = fs.readFileSync(optimizerO2);
assert(o2Buffer.length < o0Buffer.length, `expected O2 (${o2Buffer.length}) to be smaller than O0 (${o0Buffer.length})`);
assert(!o2Buffer.includes(Buffer.from('optimizer-dead-branch\\0', 'ascii')));
assert(!o2Buffer.includes(Buffer.from('optimizer-dead-loop\\0', 'ascii')));
assert(o2Result.stdout.includes('tail calls 1'), o2Result.stdout);
assert(o2Result.stdout.includes('removed 1 branches/1 loops'), o2Result.stdout);
assert(o0Result.stdout.includes('Optimization: O0'), o0Result.stdout);
const optimizerPe = parsePe(o2Buffer);
const optimizerUser = optimizerPe.imports.find((entry) => entry.dll.toLowerCase() === 'user32.dll');
assert(optimizerUser && optimizerUser.functions.includes('MessageBoxA'), 'every native executable must retain the crash dialog import');
const optimizerKernel = optimizerPe.imports.find((entry) => entry.dll.toLowerCase() === 'kernel32.dll');
for (const required of ['ExitProcess','SetUnhandledExceptionFilter','CreateFileA','WriteFile','FlushFileBuffers','CloseHandle','SetFilePointerEx','lstrlenA']) {
  assert(optimizerKernel.functions.includes(required), `automatic runtime logging import missing ${required}`);
}


// Field snapshots must remain scalar values across side-effecting calls. Copy
// propagation used to replace `width` with `image.width` after image.destroy(),
// which turned the stb_image texture path into a use-after-free at O3/O4.
const snapshotSource = write('optimizer-field-snapshot/main.lsx', `
const Image = {
    width:i32 = 0,
    destroy = fn()
        self.width = 0
    end
}
extern "snapshot.dll" fn consume(value:i32) -> void
fn main() -> i32
    local image = Image.new()
    image.width = 256
    local width:i32 = image.width
    image.destroy()
    consume(width)
    image.destroy()
    return 0
end
`);
const snapshotChecked = compilerApi.checkFile(snapshotSource);
const snapshotOptimizer = new compilerApi.Optimizer(snapshotChecked.program, 4, snapshotChecked.entry);
snapshotOptimizer.run();
const snapshotBody = snapshotChecked.entry.body;
const widthDeclaration = snapshotBody.find((statement) => statement.kind === 'local' && statement.name === 'width');
assert(widthDeclaration, 'optimizer removed the field snapshot local');
assert.deepStrictEqual(widthDeclaration.expression.path, ['image', 'width']);
const consumeStatement = snapshotBody.find((statement) => statement.kind === 'expr' && statement.expression?.path?.[0] === 'consume');
assert(consumeStatement, 'snapshot consume call missing after optimization');
assert.deepStrictEqual(consumeStatement.expression.args[0].path, ['width'], 'optimizer propagated a freed object field across destroy()');
run(['build', snapshotSource, '-o', path.join(temp, 'optimizer-field-snapshot.exe'), '--opt', '4']);

// O3 performs straight-line copy propagation, local CSE, strength reduction, and register-local allocation.
const o3Source = write('optimizer-o3/main.lsx', `
fn hot(value: i64, count: i64) -> i64
    local copied = value
    local first = copied * 8
    local second = copied * 8
    while count > 0 do
        first = first + second
        count = count - 1
    end
    return first
end
fn main() -> i32
    return hot(3, 10)
end
`);
const o3Exe = path.join(temp, 'optimizer-o3.exe');
const o3Result = run(['build', o3Source, '-o', o3Exe, '--opt', '3']);
assert(o3Result.stdout.includes('copies '), o3Result.stdout);
assert(o3Result.stdout.includes('CSE 1'), o3Result.stdout);
assert(o3Result.stdout.includes('strength reductions 1'), o3Result.stdout);
assert(/register locals [1-9]/.test(o3Result.stdout), o3Result.stdout);



// O3 copy propagation must not turn a snapshot local into a mutable loop source.
const loopCopySource = write('optimizer-loop-copy/main.lsx', `
fn work(source: i64) -> i64
    local snapshot = source
    while snapshot > 0 do
        source = source - 1
        break
    end
    return snapshot
end
fn main() -> i32
    return work(5)
end
`);
const loopCopyProgram = new compilerApi.Program(loopCopySource);
const loopCopyRoot = loopCopyProgram.load(loopCopySource);
loopCopyProgram.validate();
const loopCopyEntry = loopCopyProgram.getEntryFunction(loopCopyRoot);
new compilerApi.Optimizer(loopCopyProgram, 3, loopCopyEntry).run();
const loopCopyFn = loopCopyRoot.functions.get('work');
const loopStatement = loopCopyFn.body.find((statement) => statement.kind === 'while');
assert.strictEqual(loopStatement.condition.left.kind, 'reference');
assert.strictEqual(loopStatement.condition.left.path[0], 'snapshot');

// Copy propagation must preserve assignment conversions. HSV sector selection
// relies on f32->i64 truncation; replacing `sector` with `sectorValue` changes
// every middle hue branch into a floating-point equality test.
const narrowingCopySource = write('optimizer-narrowing-copy/main.lsx', `
fn classify(value:f32) -> i64
    local sector:i64 = value
    if sector == 2 then return 2 end
    return 0
end
fn main() -> i32
    return classify(2.75)
end
`);
const narrowingProgram = new compilerApi.Program(narrowingCopySource);
const narrowingRoot = narrowingProgram.load(narrowingCopySource);
narrowingProgram.validate();
const narrowingEntry = narrowingProgram.getEntryFunction(narrowingRoot);
new compilerApi.Optimizer(narrowingProgram, 6, narrowingEntry).run();
const narrowingFn = narrowingRoot.functions.get('classify');
const narrowingIf = narrowingFn.body.find((statement) => statement.kind === 'if');
assert(narrowingIf, 'narrowing conversion branch disappeared');
assert.strictEqual(narrowingIf.branches[0].condition.left.kind, 'reference');
assert.strictEqual(narrowingIf.branches[0].condition.left.path[0], 'sector', 'optimizer removed an f32->i64 assignment conversion');
run(['build', narrowingCopySource, '-o', path.join(temp, 'optimizer-narrowing-copy.exe'), '--opt', '6']);

// O4 performs small pure-function inlining, whole-program dead-function stripping,
// and conservative stack-slot coloring after O3 register allocation.
const o4Source = write('optimizer-o4/main.lsx', `
fn add2(a: i64, b: i64) -> i64
    return a + b
end

fn dead_debug() -> i64
    debug.message("dead-function-title", "dead-function-body")
    return 0
end

fn chain(value: i64) -> i64
    local x1 = value + 1
    local x2 = x1 + 1
    local x3 = x2 + 1
    local x4 = x3 + 1
    local x5 = x4 + 1
    local x6 = x5 + 1
    return x6
end

fn main() -> i32
    local folded = add2(40, 2)
    return chain(folded)
end
`);
const o4O3Exe = path.join(temp, 'optimizer-o4-at-o3.exe');
const o4Exe = path.join(temp, 'optimizer-o4.exe');
run(['build', o4Source, '-o', o4O3Exe, '--opt', '3']);
const o4Result = run(['build', o4Source, '-o', o4Exe, '--opt', '4']);
const o4O3Pe = parsePe(fs.readFileSync(o4O3Exe));
const o4PeBuffer = fs.readFileSync(o4Exe);
const o4Pe = parsePe(o4PeBuffer);
assert(/inlined [1-9]/.test(o4Result.stdout), o4Result.stdout);
assert(/stripped [1-9]/.test(o4Result.stdout), o4Result.stdout);
assert(/reused [1-9]/.test(o4Result.stdout), o4Result.stdout);
assert(o4Pe.sections.find((section) => section.name === '.text').virtualSize < o4O3Pe.sections.find((section) => section.name === '.text').virtualSize);
assert(!o4PeBuffer.includes(Buffer.from('dead-function-title\0', 'ascii')));
const o4User = o4Pe.imports.find((entry) => entry.dll.toLowerCase() === 'user32.dll');
assert(o4User && o4User.functions.includes('MessageBoxA'), 'automatic crash dialog must remain even when debug code is stripped');

// Native f32, closed-table methods, imported table types, typed collections,
// and explicit SIMD must survive the full O4 pipeline together.
write('game_data/math.lsx', `
export const Vec2 = {
    x: float = 0.0,
    y: float = 0.0,
    add_scaled = fn(other: Vec2, scale: float) -> void
        self.x = self.x + other.x * scale
        self.y = self.y + other.y * scale
    end,
    length_squared = fn() -> float
        return self.x * self.x + self.y * self.y
    end
}

export fn make_vec2() -> Vec2
    return Vec2.new()
end

export const Vec4 = {
    x: float = 0.0,
    y: float = 0.0,
    z: float = 0.0,
    w: float = 0.0,
    add_from = fn(a: Vec4, b: Vec4) -> void
        simd.add_f32x4(self, a, b)
    end,
    dot = fn(other: Vec4) -> float
        return simd.dot_f32x4(self, other)
    end
}
`);
const gameDataMain = write('game_data/main.lsx', `
use "math.lsx" as Math
fn blend(a: float, b: float, amount: float) -> float
    return a + (b - a) * amount
end
fn main() -> i32
    local created: Math.Vec2 = Math.make_vec2()
    local vectors = {}
    local a = Math.Vec2.new()
    local b = Math.Vec2.new()
    b.x = 4.0
    b.y = 2.0
    a.add_scaled(b, 0.5)
    a.x = blend(a.x, 10.0, 0.25)
    vectors.push(a)
    vectors.push(b)
    local copied = vectors[0]
    vectors.push(copied)
    local first = vectors[0]
    local last = vectors[2]
    first.add_scaled(last, 0.0)
    vectors[0] = first
    for current in vectors do
        current.add_scaled(last, 0.0)
    end
    local was_empty = vectors.is_empty()
    local length: float = a.length_squared()

    local left = Math.Vec4.new()
    local right = Math.Vec4.new()
    local out = Math.Vec4.new()
    left.x = 1.0
    right.x = 2.0
    out.add_from(left, right)
    local dot: float = out.dot(left)

    local count = vectors.length()
    vectors.remove_fast(1)
    vectors.pop()
    vectors.remove(0)
    vectors.clear()
    vectors.destroy()
    created.destroy()
    a.destroy()
    b.destroy()
    left.destroy()
    right.destroy()
    out.destroy()
    if dot >= 0.0 and length >= 0.0 and count == 3 and not was_empty then
        return 0
    end
    return 1
end
`);
const gameDataExe = path.join(temp, 'game-data.exe');
run(['check', gameDataMain]);
const gameDataResult = run(['build', gameDataMain, '-o', gameDataExe, '--opt', '4']);
const gameDataBuffer = fs.readFileSync(gameDataExe);
assert(gameDataResult.stdout.includes('Optimization: O4'), gameDataResult.stdout);
assert(/inlined [1-9]/.test(gameDataResult.stdout), gameDataResult.stdout);
assert(gameDataBuffer.includes(Buffer.from([0xF3, 0x0F, 0x59])), 'native scalar MULSS opcode missing');
assert(gameDataBuffer.includes(Buffer.from([0x0F, 0x58])), 'packed ADDPS opcode missing');
assert(gameDataBuffer.includes(Buffer.from([0x0F, 0x59])), 'packed MULPS opcode missing');



// Object inheritance is compile-time only: inherited fields keep the base
// prefix layout, inherited functions retain direct labels, and overrides can
// call the original implementation through base.function(...).
write('inheritance/base.lsx', `
export const LazyBehavior = {
    enabled: bool = true,
    ticks: i64 = 0,
    set_enabled = fn(value: bool) -> void
        self.enabled = value
    end,
    update = fn(delta: i64) -> i64
        self.ticks = self.ticks + delta
        return self.ticks
    end
}
`);
const inheritanceMain = write('inheritance/main.lsx', `
use "base.lsx" as Engine

const Player : base(Engine.LazyBehavior) = {
    health: i64 = 100,
    update = fn(delta: i64) -> i64
        return base.update(delta) + self.health
    end
}

const FastPlayer : base(Player) = {
    speed: f32 = 8.0
}

fn accept_behavior(value: Engine.LazyBehavior) -> i64
    return value.update(1)
end

fn main() -> i32
    local player = FastPlayer.new()
    player.set_enabled(false)
    local total = player.update(2)
    local base_total = accept_behavior(player)
    player.destroy()
    if total > 0 and base_total > 0 then
        return 0
    end
    return 1
end
`);
const inheritanceCheck = compilerApi.checkFile(inheritanceMain);
const inheritanceRoot = inheritanceCheck.root;
const inheritanceBaseModule = [...inheritanceCheck.program.moduleOrder].find((module) => module.filePath.endsWith(`${path.sep}base.lsx`));
const inheritanceBehaviorType = inheritanceBaseModule.structs.get('LazyBehavior');
const inheritancePlayerType = inheritanceRoot.structs.get('Player');
const inheritanceFastPlayerType = inheritanceRoot.structs.get('FastPlayer');
assert.strictEqual(inheritancePlayerType.baseType, inheritanceBehaviorType);
assert.strictEqual(inheritanceFastPlayerType.baseType, inheritancePlayerType);
assert.strictEqual(inheritancePlayerType.fields.get('enabled').offset, inheritanceBehaviorType.fields.get('enabled').offset);
assert.strictEqual(inheritancePlayerType.fields.get('ticks').offset, inheritanceBehaviorType.fields.get('ticks').offset);
assert.strictEqual(inheritanceFastPlayerType.fields.get('health').offset, inheritancePlayerType.fields.get('health').offset);
assert.strictEqual(inheritancePlayerType.methods.get('set_enabled'), inheritanceBehaviorType.methods.get('set_enabled'), 'inherited methods should reuse the direct base function label');
assert.notStrictEqual(inheritancePlayerType.methods.get('update'), inheritanceBehaviorType.methods.get('update'), 'override should own a separate direct function label');
assert(inheritancePlayerType.size > inheritanceBehaviorType.size, 'derived object must append its fields after the base prefix');
assert(inheritanceFastPlayerType.size > inheritancePlayerType.size, 'multi-level inheritance must append fields once per level');
const inheritanceExe = path.join(temp, 'inheritance.exe');
const inheritanceBuild = run(['build', inheritanceMain, '-o', inheritanceExe, '--opt', '4']);
assert(/direct calls [1-9]/.test(inheritanceBuild.stdout), inheritanceBuild.stdout);
assert(fs.existsSync(inheritanceExe));

const duplicateInheritedField = write('inheritance/duplicate-field.lsx', `
const Base = { value: i64 = 1 }
const Child : base(Base) = { value: i64 = 2 }
`);
const duplicateResult = run(['check', duplicateInheritedField], 1);
assert(duplicateResult.stderr.includes("field 'value' already exists on base object 'Base'"), duplicateResult.stderr);

const circularInheritance = write('inheritance/circular.lsx', `
const First : base(Second) = {}
const Second : base(First) = {}
`);
const circularResult = run(['check', circularInheritance], 1);
assert(circularResult.stderr.includes('circular base inheritance'), circularResult.stderr);

// Closed tables are the public object/class/namespace model. Methods that use
// self receive an implicit native receiver; pure function-table members compile
// as direct calls with no receiver argument. Typed tables use hidden contiguous
// storage behind push/index/length.
const tableCore = write('table-core/main.lsx', `
const Math = {}
Math.add = fn(a: int, b: int) -> int
    return a + b
end

const Actor = {
    health: int = 100,
    speed: float = 4.0,
    damage = fn(amount: int) -> void
        self.health = self.health - amount
    end,
    movement = fn(delta: float) -> float
        return self.speed * delta
    end
}

fn main() -> i32
    local actor = Actor.new()
    actor.damage(10)
    local movement: float = actor.movement(0.5)

    local values = {}
    values.push(4)
    values.push(8)
    local second = values[1]
    values[0] = Math.add(second, 1)

    local actors = {}
    actors.push(actor)
    local first_actor = actors[0]
    first_actor.damage(1)
    actors[0] = first_actor

    local object = {
        value: int = 5,
        double = fn() -> int
            return self.value * 2
        end
    }
    local doubled = object.double()
    local count = values.length() + actors.length()
    object.destroy()
    values.destroy()
    actors.destroy()
    actor.destroy()
    if movement > 0.0 then
        return count + doubled
    end
    return 1
end
`);
const tableCoreExe = path.join(temp, 'table-core.exe');
const tableCoreResult = run(['build', tableCore, '-o', tableCoreExe, '--opt', '4']);
const tableCoreBuffer = fs.readFileSync(tableCoreExe);
assert(tableCoreResult.stdout.includes('Optimization: O4'), tableCoreResult.stdout);
assert(tableCoreBuffer.includes(Buffer.from([0xF3, 0x0F, 0x59])), 'closed-table float method should retain native MULSS');

const tableCoreProgram = new compilerApi.Program(tableCore);
const tableCoreRoot = tableCoreProgram.load(tableCore);
tableCoreProgram.validate();
const mathTable = tableCoreRoot.tables.get('Math');
const actorTable = tableCoreRoot.tables.get('Actor');
assert(mathTable, 'closed function table missing');
assert(actorTable, 'closed object table missing');
assert.strictEqual(mathTable.methods.get('add').isStatic, true, 'function table member should be a static direct call');
assert.strictEqual(actorTable.methods.get('damage').isStatic, false, 'self-using table member should receive an implicit receiver');
assert.strictEqual(actorTable.methods.get('damage').params[0].name, 'self');


// Closed-table objects can create independent native copies from either an
// instance or the template. Nested closed-table object fields are deep-cloned.
const objectClone = write('object-clone/main.lsx', `
const Stats = {
    health: int = 100,
    speed: float = 4.0
}

const Player = {
    name: string = "Jessie",
    stats: Stats = null
}

fn main() -> i32
    local original = Player.new()
    original.stats = Stats.new()
    original.stats.health = 75

    local clone_a = original.clone()
    local clone_b = Player.new(original)
    clone_a.stats.health = 25
    clone_b.stats.speed = 8.0

    local result = original.stats.health + clone_a.stats.health + clone_b.stats.health
    original.destroy()
    clone_a.destroy()
    clone_b.destroy()
    return result
end
`);
const objectCloneExe = path.join(temp, 'object-clone.exe');
run(['check', objectClone]);
run(['build', objectClone, '-o', objectCloneExe, '--opt', '4']);
assert(fs.existsSync(objectCloneExe), 'object clone executable missing');

const cloneProgram = new compilerApi.Program(objectClone);
const cloneRoot = cloneProgram.load(objectClone);
cloneProgram.validate();
const playerType = cloneRoot.tables.get('Player');
assert(playerType?.cloneLabel, 'closed table clone label missing');
assert(playerType?.destroyLabel, 'closed table destroy label missing');
assert.strictEqual(playerType.fields.get('stats').typeInfo.kind, 'struct', 'nested object field should retain a native table-object type');

// Collection fields use normal {} initialization. The compiler infers the
// hidden packed element layout from how the field is used.
const sceneTableField = write('scene-table-field/main.lsx', `
const Item = {
    value: int = 0
}
const Scene = {
    objects = {},
    initialize = fn() -> void
        self.objects = {}
    end
}
fn main() -> i32
    local scene = Scene.new()
    scene.initialize()
    local object = Item.new()
    local objects = scene.objects
    objects.push(object)
    object.destroy()
    local result = objects.length()
    objects.destroy()
    scene.destroy()
    return result - 1
end
`);
run(['check', sceneTableField]);
run(['build', sceneTableField, '-o', path.join(temp, 'scene-table-field.exe'), '--opt', '4']);

// Empty collection defaults on packed objects must allocate independent native
// collection headers during Struct.new(). JSON documents depend on this for
// source, string, node, child, and member storage.
const ownedTableDefault = write('owned-table-default/main.lsx', `
const Entry = {
    value = 0
}
const Store = {
    bytes = {},
    entries = {}
}
fn main()
    local first = Store.new()
    local second = Store.new()
    first.bytes.push(7)
    local entry = Entry.new()
    entry.value = 11
    first.entries.push(entry)
    entry.destroy()
    local result = first.bytes.length() + first.entries.length() + second.bytes.length() + second.entries.length()
    first.bytes.destroy()
    first.entries.destroy()
    second.bytes.destroy()
    second.entries.destroy()
    first.destroy()
    second.destroy()
    return result - 2
end
`);
run(['check', ownedTableDefault]);
run(['build', ownedTableDefault, '-o', path.join(temp, 'owned-table-default.exe'), '--opt', '4']);
const ownedProgram = new compilerApi.Program(ownedTableDefault);
const ownedRoot = ownedProgram.load(ownedTableDefault);
ownedProgram.validate();
const storeType = ownedRoot.tables.get('Store');
ownedProgram.resolveStructLayout(storeType);
assert.strictEqual(storeType.fields.get('bytes').defaultConstructTable, true, 'inferred byte collection must allocate in Store.new()');
assert.strictEqual(storeType.fields.get('entries').defaultConstructTable, true, 'inferred object collection must allocate in Store.new()');

// Byte-buffer methods on an object field must refine the field itself to packed
// u8 storage. Texture2D RGBA copies and Font SDF atlas allocation use this path.
const ownedByteField = write('owned-byte-field/main.lsx', `
const Buffer = {
    pixels = {},
    allocate = fn(byteCount)
        return self.pixels.resize_bytes(byteCount)
    end
}
fn main()
    local buffer = Buffer.new()
    if not buffer.allocate(64) then return 1 end
    if buffer.pixels.byte_length() ~= 64 then return 2 end
    memory.write_u8(buffer.pixels.byte_data(),0,255)
    local first = memory.read_u8(buffer.pixels.byte_data(),0)
    buffer.pixels.destroy()
    buffer.destroy()
    if first ~= 255 then return 3 end
    return 0
end
`);
run(['check', ownedByteField]);
const ownedByteProgram = new compilerApi.Program(ownedByteField);
const ownedByteRoot = ownedByteProgram.load(ownedByteField);
ownedByteProgram.validate();
const bufferType = ownedByteRoot.tables.get('Buffer');
ownedByteProgram.resolveStructLayout(bufferType);
assert.strictEqual(bufferType.fields.get('pixels').type, 'table<u8>', 'resize_bytes on a field must infer packed u8 storage');
assert.strictEqual(bufferType.fields.get('pixels').defaultConstructTable, true, 'packed u8 field must allocate an independent collection header in Buffer.new()');
const ownedByteBuild = run(['build', ownedByteField, '-o', path.join(temp, 'owned-byte-field.exe'), '--opt', '6']);
assert(ownedByteBuild.stdout.includes('Optimization: O6'), ownedByteBuild.stdout);


// Ordinary LSX source is declaration-light: fields, parameters, returns,
// object references, and collection contents are inferred from values and use.
write('inference/context.lsx', `
export const Context = {
    ready = false,
    start = fn(title)
        if title == "Inference" then
            self.ready = true
        end
        return self.ready
    end
}
`);
const inferredMain = write('inference/main.lsx', `
use "context.lsx" as Native
const Camera = {
    horizontal_scale = 0.0475,
    project_x = fn(x, z)
        return (x - z) * self.horizontal_scale
    end
}
const Application = {
    title = "LazyEngine",
    running = false,
    context = null,
    objects = {},
    initialize = fn(title, width, height)
        self.title = title
        self.context = Native.Context.new()
        self.running = self.context.start(title)
        local total = width + height
        return self.running and total > 0
    end,
    add = fn(object)
        self.objects.push(object)
    end
}
fn main()
    local app = Application.new()
    local context = Native.Context.new()
    local camera = Camera.new()
    app.add(context)
    if app.initialize("Inference", 1280, 720) and camera.project_x(1.0, 0.5) > 0.0 then
        app.objects.destroy()
        app.context.destroy()
        app.destroy()
        context.destroy()
        camera.destroy()
        return 0
    end
    return 1
end
`);
const inferredProgram = new compilerApi.Program(inferredMain);
const inferredRoot = inferredProgram.load(inferredMain);
inferredProgram.validate();
const applicationType = inferredRoot.tables.get('Application');
const cameraType = inferredRoot.tables.get('Camera');
assert.strictEqual(applicationType.fields.get('title').type, 'string');
assert.strictEqual(applicationType.fields.get('running').type, 'bool');
assert.strictEqual(applicationType.fields.get('context').type, 'Native.Context');
assert.strictEqual(applicationType.fields.get('objects').type, 'table<Native.Context>');
assert.strictEqual(applicationType.methods.get('initialize').params[1].type, 'string');
assert.strictEqual(applicationType.methods.get('initialize').params[2].type, 'i64');
assert.strictEqual(applicationType.methods.get('initialize').params[3].type, 'i64');
assert.strictEqual(applicationType.methods.get('initialize').returnType, 'bool');
assert.strictEqual(cameraType.methods.get('project_x').params[1].type, 'f32');
assert.strictEqual(cameraType.methods.get('project_x').params[2].type, 'f32');
assert.strictEqual(cameraType.methods.get('project_x').returnType, 'f32');
run(['build', inferredMain, '-o', path.join(temp, 'inference.exe'), '--opt', '4']);

// Nested f32 arithmetic must reserve every temporary inside the native stack
// frame. This exact camera expression previously wrote one float over the
// function return address and crashed immediately after renderer stage 01.
const floatFrameSafety = write('float-frame-safety/main.lsx', `
const Camera = {
    aspect_fix = 1.0,
    configure = fn(width, height)
        if width > 0 and height > 0 then
            self.aspect_fix = (height * 1.7777778) / width
        else
            self.aspect_fix = 1.0
        end
    end
}
fn main()
    local camera = Camera.new()
    camera.configure(1280, 720)
    camera.destroy()
    return 0
end
`);
run(['check', floatFrameSafety]);
run(['build', floatFrameSafety, '-o', path.join(temp, 'float-frame-safety.exe'), '--opt', '4']);

// Indexed stores reserve their hidden pointer slot plus nested expression
// temporaries without overlapping the return address.
const indexFrameSafety = write('index-frame-safety/main.lsx', `
const Value = { amount = 0.0 }
fn main()
    local values = {}
    local first = Value.new()
    values.push(first)
    values[0] = first
    first.amount = (4.0 * 2.0) / 8.0
    values.destroy()
    first.destroy()
    return 0
end
`);
run(['check', indexFrameSafety]);
run(['build', indexFrameSafety, '-o', path.join(temp, 'index-frame-safety.exe'), '--opt', '4']);

// Foreign native byte buffers can be copied into compiler-owned inferred
// collection storage without exposing an imported memcpy declaration in LSX bindings.
const tableForeignCopy = write('table-foreign-copy/main.lsx', `
fn main()
    local source = memory.alloc(16)
    memory.write_u32(source,0,0x11223344)
    memory.write_u32(source,4,0x55667788)
    local values = {}
    if not values.resize(4) then return 1 end
    values[0] = 0x11223344
    if not values.copy_from_ptr(source,16) then return 2 end
    local first = values[0]
    values.destroy()
    memory.free(source)
    if first ~= 0x11223344 then return 3 end
    return 0
end
`);
run(['check', tableForeignCopy]);
run(['build', tableForeignCopy, '-o', path.join(temp, 'table-foreign-copy.exe'), '--opt', '4']);

// Byte-oriented generated buffers infer packed u8 storage without typed-table syntax.
const inferredByteBuffer = write('inferred-byte-buffer/main.lsx', `
fn main()
    local source = memory.alloc(16)
    memory.write_u32(source,0,0x11223344)
    local bytes = {}
    if not bytes.resize_bytes(16) then return 1 end
    if not bytes.copy_bytes_from_ptr(source,16) then return 2 end
    local value = memory.read_u32(bytes.byte_data(),0)
    bytes.destroy()
    memory.free(source)
    if value ~= 0x11223344 then return 3 end
    return 0
end
`);
const inferredByteResult = compilerApi.checkFile(inferredByteBuffer);
const byteMain = inferredByteResult.entry;
const byteLocal = byteMain.variables.get('bytes');
assert(byteLocal && byteLocal.type === 'table<u8>', `byte buffer inferred as ${byteLocal?.type}`);
const byteBuild = run(['build', inferredByteBuffer, '-o', path.join(temp, 'inferred-byte-buffer.exe'), '--opt', '6']);
assert(byteBuild.stdout.includes('Optimization: O6'), byteBuild.stdout);

// The clean Native GameKit is bindings only: no engine, renderer abstraction,
// custom Win32 launcher, or hidden message loop.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'bindings', 'BINDING_MANIFEST.json'), 'utf8'));
assert.strictEqual(manifest.glfwFunctions, 124, 'GLFW function count changed');
assert.strictEqual(manifest.openGLFunctions, 2541, 'OpenGL function count changed');
assert.strictEqual(manifest.openALFunctions, 126, 'OpenAL function count changed');
const glfwBinding = fs.readFileSync(path.join(root, 'bindings', 'GLFW', 'GLFW.lsx'), 'utf8');
const glBinding = fs.readFileSync(path.join(root, 'bindings', 'OpenGL', 'OpenGL46.lsx'), 'utf8');
const textureUploadBinding = fs.readFileSync(path.join(root, 'bindings', 'OpenGL', 'TextureUpload.lsx'), 'utf8');
const alBinding = fs.readFileSync(path.join(root, 'bindings', 'OpenAL', 'OpenAL.lsx'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(root, 'native', 'lsx_gamekit_bridge.c'), 'utf8');
for (const token of ['glfwCreateWindow', 'glfwPollEvents', 'glfwGetGamepadState', 'glfwMakeContextCurrent'])
  assert(glfwBinding.includes(token), `${token} GLFW binding missing`);
for (const token of ['glCreateShader', 'glDispatchCompute', 'glCreateFramebuffers', 'glMultiDrawElementsIndirect'])
  assert(glBinding.includes(token), `${token} OpenGL binding missing`);
for (const token of ['alcOpenDevice', 'alGenSources', 'alGenEffects', 'alcCaptureOpenDevice'])
  assert(alBinding.includes(token), `${token} OpenAL binding missing`);
for (const forbidden of ['CreateWindowEx', 'RegisterClassEx', 'DefWindowProc', 'PeekMessage', 'DispatchMessage'])
  assert(!bridgeSource.includes(forbidden), `${forbidden} custom window implementation must not exist`);
assert(bridgeSource.includes('GetProcAddress(g_glfw, "glfwCreateWindow")'), 'GLFW forwarding loader missing');
assert(bridgeSource.includes('p_glfwGetProcAddress'), 'OpenGL loader must use GLFW proc lookup');

const stbBinding = fs.readFileSync(path.join(root, 'bindings', 'Graphics', 'STBImage.lsx'), 'utf8');
const imageBinding = fs.readFileSync(path.join(root, 'bindings', 'Graphics', 'Image.lsx'), 'utf8');
const textureBinding = fs.readFileSync(path.join(root, 'bindings', 'Graphics', 'Texture2D.lsx'), 'utf8');
const freeTypeRawBinding = fs.readFileSync(path.join(root, 'bindings', 'Text', 'FreeTypeRaw.lsx'), 'utf8');
const freeTypeBinding = fs.readFileSync(path.join(root, 'bindings', 'Text', 'FreeType.lsx'), 'utf8');
const fontBinding = fs.readFileSync(path.join(root, 'bindings', 'Text', 'Font.lsx'), 'utf8');
const freeTypeBridgeSource = fs.readFileSync(path.join(root, 'native', 'lsx_freetype_bridge.c'), 'utf8');
for (const token of ['extern "stb_image.dll" fn stbi_load', 'stbi_load_from_memory', 'stbi_image_free', 'stbi_failure_reason'])
  assert(stbBinding.includes(token), `${token} direct stb_image binding missing`);
assert(imageBinding.includes('use "STBImage.lsx" as STBImage'), 'Image compatibility facade must use direct stb_image binding');
for (const token of ['STBImage.load_ex', 'pixels.resize_bytes(byteCount)', 'pixels.copy_bytes_from_ptr(image.pixels(),byteCount)', 'GL.glTexImage2D', 'glGenerateMipmap'])
  assert(textureBinding.includes(token), `${token} direct texture helper missing`);
assert(!textureBinding.includes('TextureUpload.rgba8'), 'RGBA images must use the proven standard inferred packed OpenGL path');
assert(!textureBinding.includes('image.rgba32(index)'), 'Texture2D must copy the stb_image RGBA block directly instead of calling per-pixel accessors');
assert(!textureBinding.includes('glGetTexLevelParameteriv'), 'Texture2D must not perform the crashing post-upload texture query');
for (const token of ['LSXGLABI.dll', 'glfwGetProcAddress("glTexImage2D")', 'lsxGlTexImage2DCall'])
  assert(textureUploadBinding.includes(token), `${token} OpenGL texture ABI helper missing`);
for (const token of ['extern "libfreetype.dll" fn FT_Init_FreeType', 'FT_New_Face', 'FT_Load_Char', 'FT_Render_Glyph', 'FT_Get_Kerning'])
  assert(freeTypeRawBinding.includes(token), `${token} direct FreeType binding missing`);
for (const token of ['_lsxFTCreateFace', '_lsxFTLoadGlyph', '_lsxFTCopyBitmap', '_lsxFTDestroyFace'])
  assert(freeTypeBinding.includes(token), `${token} typed FreeType bridge binding missing`);
for (const token of ['FreeType.RENDER_SDF', 'create_ascii_atlas', 'resize_bytes(result.width * result.height)', 'byte_data()', 'build_text', 'TextureUpload.r8'])
  assert(fontBinding.includes(token), `${token} FreeType SDF helper missing`);
for (const token of ['LoadLibraryA("libfreetype.dll")', 'load_proc("FT_Init_FreeType")', 'load_proc("FT_Render_Glyph")'])
  assert(freeTypeBridgeSource.includes(token), `${token} FreeType runtime forwarding missing`);
for (const forbidden of ['GdipCreateBitmapFromFile', 'GetGlyphOutlineW', 'make_sdf'])
  assert(!freeTypeBridgeSource.includes(forbidden), `${forbidden} must not exist in the FreeType bridge`);
const exampleFolders = fs.readdirSync(path.join(toolkitRoot, 'Projects'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(toolkitRoot, 'Projects', entry.name, 'lazyscriptex.json')));
assert.strictEqual(exampleFolders.length, 34, 'project library must contain 33 examples plus ProjectTemplate');
for (const name of ['00_glfw_window', '07_compute_shader_ssbo', '10_openal_efx_reverb', '14_full_game_loop', '21_file_io', '22_json', '23_text_logging', '24_image_loading', '25_sdf_text', '26_media_self_test', '28_lazyui_inline', '29_lazyui_controls_gallery', '30_lazyui_editor_workspace', '31_lazyui_node_graph', '32_lazyui_runtime_hud'])
  assert(exampleFolders.some((entry) => entry.name === name), `${name} example missing`);

// Project builds must copy runtime assets beside the executable.
const assetProject = path.join(temp, 'asset-project');
fs.mkdirSync(path.join(assetProject, 'assets', 'nested'), { recursive: true });
fs.writeFileSync(path.join(assetProject, 'main.lsx'), 'fn main() -> i32\n    return 0\nend\n');
fs.writeFileSync(path.join(assetProject, 'assets', 'nested', 'payload.bin'), Buffer.from([1, 2, 3, 4]));
fs.writeFileSync(path.join(assetProject, 'runtime-extra.dat'), Buffer.from([5, 6, 7, 8]));
fs.writeFileSync(path.join(assetProject, 'lazyscriptex.json'), JSON.stringify({ entry: 'main.lsx', output: 'build/asset-project.exe', subsystem: 'windows', optimization: 4, runtimeFiles: ['runtime-extra.dat'] }, null, 2));
run(['build', path.join(assetProject, 'lazyscriptex.json')]);
assert.deepStrictEqual(fs.readFileSync(path.join(assetProject, 'build', 'assets', 'nested', 'payload.bin')), Buffer.from([1, 2, 3, 4]), 'runtime assets were not copied beside the project executable');
assert.deepStrictEqual(fs.readFileSync(path.join(assetProject, 'build', 'runtime-extra.dat')), Buffer.from([5, 6, 7, 8]), 'runtimeFiles entry was not copied beside the project executable');

// LSHTML and LSCSS are first-class declarations inside the LSX module. They
// lower to ordinary LazyUI element functions; no external HTML/CSS document,
// generated ID file, browser DOM, or runtime markup parser is involved.
const uiProject = path.join(temp, 'ui-project');
fs.mkdirSync(uiProject, { recursive: true });
fs.writeFileSync(path.join(uiProject, 'main.lsx'), `
const Props = {
    title = "Inspector",
    status = "Ready",
    clicks = 0
}

lscss .card = {
    display = flex
    flex_direction = column
    width = 320px
    padding = 12px
    background = #181b22
    border = 1px solid #303746
    border_radius = 8px
    box_shadow = 0px 8px 24px 0px #00000066
}

lscss #save:hover = {
    background = #4d82ff
}

lshtml inspector(props) = {(
    <panel id="root" class="card">
        <label>{props.title}</label>
        <button id="save" onclick={save_clicked} context={props}>Save</button>
        <status-bar id="status">{props.status}</status-bar>
        <canvas id="preview" />
    </panel>
)}

fn main()
    local props = Props.new()
    local root = inspector(props)
    local ok = root.find_id(0) == null
    root.destroy()
    props.destroy()
    if ok then return 0 end
    return 1
end

-- Deliberately defined after both the LSHTML declaration and main. LSX does
-- not require forward declarations.
fn save_clicked(element,event,props.Props)
    props.clicks = props.clicks + 1
    return 0
end
`);
fs.writeFileSync(path.join(uiProject, 'lazyscriptex.json'), JSON.stringify({ entry: 'main.lsx', output: 'build/ui-project.exe', subsystem: 'windows', optimization: 6, moduleRoots: { LazyScript: root } }, null, 2));
run(['check-project', path.join(uiProject, 'lazyscriptex.json')]);
const inlineUiCompiler = require('./inline_ui');
const inlineSourcePath = path.join(uiProject, 'main.lsx');
const inlineOriginal = fs.readFileSync(inlineSourcePath, 'utf8');
const inlineLowered = inlineUiCompiler.compileInlineUiSource(inlineOriginal, inlineSourcePath).source;
assert(inlineLowered.includes('.status_bar()'), 'kebab-case built-in UI tag did not lower to its element function');
assert(inlineLowered.includes('STATE_HOVER'), 'LSCSS pseudo-state did not lower to a retained state style');
assert(inlineLowered.includes('_bind_click'), 'LSHTML props context did not lower through the hidden event/context bridge');
assert(inlineLowered.includes('memory.ptr(props,0)'), 'compiler did not hide the object-context conversion inside lowered code');
assert(!inlineOriginal.includes('ptr') && !inlineOriginal.includes('fnptr'), 'front-facing LSHTML example exposed pointer syntax');
assert(!fs.existsSync(path.join(uiProject, 'ui')), 'inline LSHTML/LSCSS unexpectedly generated an external UI document tree');

// O4 linear interval reuse must not alias stack locals across loop back-edges.
// The sphere generator previously assigned the same slots to rings/phi1 and
// slices/theta0, so its first iteration overwrote both loop bounds.
const loopLiveness = write('loop-liveness/main.lsx', `
fn main() -> i32
    local limit = 8.0
    local accumulator = 0.0
    local a0=0.0 local a1=1.0 local a2=2.0 local a3=3.0 local a4=4.0 local a5=5.0
    local a6=6.0 local a7=7.0 local a8=8.0 local a9=9.0 local a10=10.0 local a11=11.0
    local index = 0
    while index < limit do
        local angle = limit * 0.5 + index
        accumulator = accumulator + angle + a0+a1+a2+a3+a4+a5+a6+a7+a8+a9+a10+a11
        index = index + 1
    end
    return accumulator
end
`);
const loopCheck = compilerApi.checkFile(loopLiveness);
const loopInfo = compilerApi.analyzeFunction(loopCheck.entry, 4, {});
assert.strictEqual(loopInfo.hasLoop, true, 'loop-aware stack allocation did not detect the loop');
const loopStackOffsets = loopInfo.variables.filter((variable) => variable.stackOffset !== null).map((variable) => variable.stackOffset);
assert.strictEqual(new Set(loopStackOffsets).size, loopStackOffsets.length, 'O4 reused a stack slot inside a loop-containing function');
run(['build', loopLiveness, '-o', path.join(temp, 'loop-liveness.exe'), '--opt', '4']);

// A simple f32 argument passed to a u32 parameter must leave the direct-call
// fast path and use an explicit register-class conversion at O4.
const floatToIntegerCall = write('float-to-integer-call/main.lsx', `
fn consume(value: u32) -> u32
    return value
end
fn main() -> i32
    local scaled = 639.5
    return consume(scaled)
end
`);
run(['build', floatToIntegerCall, '-o', path.join(temp, 'float-to-integer-call.exe'), '--opt', '4']);

// A typed table must emit its hidden native storage even when push is the only
// collection operation in the program.
const pushOnly = write('push-only/main.lsx', `
fn main()
    local values = {}
    values.push(1)
    return 0
end
`);
run(['build', pushOnly, '-o', path.join(temp, 'push-only.exe'), '--opt', '4']);

// Unknown fields must be diagnosed instead of silently compiling invalid engine data access.
const badField = write('bad-field.lsx', `
const Point = {
    x = 0.0
}
fn main()
    local point = Point.new()
    point.missing = 1.0
    return 0
end
`);
const badFieldResult = run(['check', badField], 1);
assert(badFieldResult.stderr.includes("has no field 'missing'"), badFieldResult.stderr);

// LSX function labels are first-class native function pointers for real OS threads.
// Worker functions remain reachable at O4 and CreateThread is imported directly.
const nativeThread = write('native-thread/main.lsx', `
const Work = {
    value:i64 = 0
}
fn worker(work:Work) -> u32
    work.value = work.value + 1
    return 7
end
fn main() -> i32
    local work = Work.new()
    local handle = thread.start(worker,work)
    if handle == 0 then return 1 end
    if not thread.join(handle) then return 2 end
    local code = thread.exit_code(handle)
    thread.close(handle)
    work.destroy()
    if code == 7 then return 0 end
    return 3
end
`);
const nativeThreadExe = path.join(temp, 'native-thread.exe');
run(['build', nativeThread, '-o', nativeThreadExe, '--opt', '4']);
const nativeThreadPe = parsePe(fs.readFileSync(nativeThreadExe));
const nativeThreadKernel = nativeThreadPe.imports.find((entry) => entry.dll.toLowerCase() === 'kernel32.dll');
assert(nativeThreadKernel?.functions.includes('CreateThread'), 'native thread build does not import CreateThread');
assert(nativeThreadKernel?.functions.includes('WaitForSingleObject'), 'native thread build does not import WaitForSingleObject');
assert(nativeThreadKernel?.functions.includes('GetExitCodeThread'), 'native thread build does not import GetExitCodeThread');

// Direct thread entry signatures are checked before native code is emitted.
const badThreadEntry = write('bad-thread-entry.lsx', `
fn worker() -> u32
    return 0
end
fn main()
    local handle = thread.start(worker,null)
    return 0
end
`);
const badThreadEntryResult = run(['check', badThreadEntry], 1);
assert(badThreadEntryResult.stderr.includes('must accept exactly one context argument'), badThreadEntryResult.stderr);

// Imported object-return inference must translate the source module's native type
// into the caller's alias instead of creating an ambiguous unqualified type.
write('imported-inference/module.lsx', `
export const Value = {
    count:i64 = 0,
    create = fn()
        return Value.new()
    end
}
`);
const importedInference = write('imported-inference/main.lsx', `
use "module.lsx" as Module
const Holder = { value:Module.Value = null }
fn main()
    local value = Module.Value.create()
    local holder = Holder.new()
    holder.value = value
    holder.destroy()
    value.destroy()
    return 0
end
`);
run(['check', importedInference]);
run(['build', importedInference, '-o', path.join(temp, 'imported-inference.exe'), '--opt', '4']);

// High-level networking modules compile through native WinSock2 and WinHTTP.
const networkSurface = write('network-surface/main.lsx', `
use "${path.join(root, 'bindings', 'Network', 'Sockets.lsx').replace(/\\/g, '/')}" as Sockets
use "${path.join(root, 'bindings', 'Network', 'Http.lsx').replace(/\\/g, '/')}" as Http
fn main()
    Sockets.initialize()
    local udp = Sockets.Socket.udp_bind("127.0.0.1","0")
    udp.close()
    udp.destroy()
    Sockets.cleanup()
    local client = Http.Client.create("LSX-Test")
    local response = client.post_text("example.com","/","Content-Type: text/plain\\r\\n","hello",true)
    response.close()
    response.destroy()
    client.close()
    client.destroy()
    return 0
end
`);
const networkSurfaceExe = path.join(temp, 'network-surface.exe');
run(['build', networkSurface, '-o', networkSurfaceExe, '--opt', '4']);
const networkPe = parsePe(fs.readFileSync(networkSurfaceExe));
assert(networkPe.imports.some((entry) => entry.dll.toLowerCase() === 'ws2_32.dll'), 'WinSock2 import missing');
assert(networkPe.imports.some((entry) => entry.dll.toLowerCase() === 'winhttp.dll'), 'WinHTTP import missing');

// New console snippets compile as real language features instead of false diagnostics.
const consoleEntry = write('console/main.lsx', `
fn main()
    console.open("LazyScriptEX Test")
    console.write_line("stage")
    if false then
        console.error_line("never")
        console.wait()
        return 1
    end
    return 0
end
`);
run(['check', consoleEntry]);
run(['build', consoleEntry, '-o', path.join(temp, 'console.exe')]);

// The extension snippet gallery must stay valid as language features evolve.
run(['check', path.join(toolkitRoot, 'Projects', '00_glfw_window', 'main.lsx')]);

// Modules never receive a fake missing-main/window diagnostic.
const moduleResult = run(['check', path.join(root, 'bindings', 'OpenGL', 'OpenGL46.lsx')]);
assert(moduleResult.stdout.includes('OK module'));

// Native string helpers compile as direct pointer/byte operations plus KERNEL32 comparisons.
const stringHelpers = write('string-helpers/main.lsx', `
fn main()
    local value = "LazyScriptEX"
    if string.length(value) ~= 12 then return 1 end
    if string.byte_at(value,0) ~= 76 then return 2 end
    if not string.equals(value,"LazyScriptEX") then return 3 end
    if string.compare(value,"LazyScriptEX") ~= 0 then return 4 end
    local same = string.from_utf8(string.data_at(value,0))
    if not string.equals(same,value) then return 5 end
    return 0
end
`);
const stringExe = path.join(temp, 'string-helpers.exe');
run(['build', stringHelpers, '-o', stringExe, '--opt', '4']);
const stringPe = parsePe(fs.readFileSync(stringExe));
const stringKernel = stringPe.imports.find((entry) => entry.dll.toLowerCase() === 'kernel32.dll');
assert(stringKernel && stringKernel.functions.includes('lstrlenA'), 'native string length import missing');
assert(stringKernel.functions.includes('lstrcmpA'), 'native string comparison import missing');

// Raw backtick strings preserve quotes and line breaks without LSX escaping.
const rawString = write('raw-string/main.lsx', `
use "${path.join(root, 'bindings', 'Data', 'Json.lsx').replace(/\\/g, '/')}" as Json
fn main()
    local inline = \`{"name":"LazyScriptEX","nested":{"enabled":true},"values":[1,2,3]}
second line is intentionally outside valid JSON\`
    if string.length(inline) < 20 then return 1 end
    local json_only = \`{"name":"LazyScriptEX","nested":{"enabled":true},"values":[1,2,3]}\`
    local document = Json.parse_text(json_only)
    local valid = document.valid and string.equals(document.root_string("name",""),"LazyScriptEX")
    document.destroy()
    if valid then return 0 end
    return 2
end
`);
run(['check', rawString]);
run(['build', rawString, '-o', path.join(temp, 'raw-string.exe'), '--opt', '4']);

// O6 caches stable typed-table data/count headers across canonical loops,
// removes the loop bounds check, and uses the compile-time element stride.
const cachedTableLoop = write('cached-table-loop/main.lsx', `
fn main() -> i32
    local values:table<f32> = {1.0,2.0,3.0,4.0,5.0,6.0,7.0,8.0}
    local i = 0
    local total:f32 = 0.0
    while i < values.count() do
        total = total + values[i]
        i = i + 1
    end
    if total == 36.0 then return 0 end
    return 7
end
`);
const cachedTableExe = path.join(temp, 'cached-table-loop.exe');
const cachedTableResult = run(['build', cachedTableLoop, '-o', cachedTableExe, '--opt', '6']);
assert(/bounds removed [1-9]/.test(cachedTableResult.stdout), cachedTableResult.stdout);
assert(/cached table loops [1-9]/.test(cachedTableResult.stdout), cachedTableResult.stdout);

// The CPU target is explicit: baseline stays SSE-width while AVX2-FMA emits
// eight-wide vector loops and a fused multiply-add for a*b+c.
const avxVector = write('avx-vector/main.lsx', `
fn main() -> i32
    local a = {1.0,2.0,3.0,4.0,5.0,6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0,14.0,15.0,16.0}
    local b = {2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0,2.0}
    local c = {3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0}
    local i = 0
    while i < a.length() do
        a[i] = b[i] * c[i] + a[i]
        i = i + 1
    end
    return 0
end
`);
const avxVectorExe = path.join(temp, 'avx-vector.exe');
const avxVectorResult = run(['build', avxVector, '-o', avxVectorExe, '--opt', '6', '--cpu', 'avx2-fma']);
assert(avxVectorResult.stdout.includes('Target CPU: avx2-fma'), avxVectorResult.stdout);
assert(/vector loops [1-9][0-9]* x8/.test(avxVectorResult.stdout), avxVectorResult.stdout);
assert(/fused vector ops [1-9]/.test(avxVectorResult.stdout), avxVectorResult.stdout);
const avxBytes = fs.readFileSync(avxVectorExe);
assert(avxBytes.includes(Buffer.from([0xC4,0xE2,0x75,0xB8,0xC2])), 'AVX2 FMA opcode missing');
assert(avxBytes.includes(Buffer.from([0xC5,0xF8,0x77])), 'VZEROUPPER missing');
run(['build', avxVector, '-o', path.join(temp, 'avx-vector-baseline.exe'), '--opt', '6', '--cpu', 'baseline']);
run(['build', avxVector, '-o', path.join(temp, 'invalid-cpu.exe'), '--cpu', 'not-a-cpu'], 1);

// PGO generation embeds a native counter blob and the final writer path.
const pgoExe = path.join(temp, 'pgo-instrumented.exe');
const pgoPath = path.join(temp, 'profile.pgo');
const pgoResult = run(['build', avxVector, '-o', pgoExe, '--opt', '6', '--pgo-generate', pgoPath]);
assert(/PGO instrumentation: [1-9]/.test(pgoResult.stdout), pgoResult.stdout);
assert(fs.readFileSync(pgoExe).includes(Buffer.from('LSXPGO1\0', 'ascii')), 'PGO profile blob missing');
const pgoBuffer = Buffer.alloc(32);
pgoBuffer.write('LSXPGO1\0', 0, 'ascii');
pgoBuffer.writeBigUInt64LE(1n, 8);
const pgoKey = `${path.normalize(avxVector).toLowerCase()}::main`;
const pgoId = crypto.createHash('sha256').update(pgoKey).digest().readBigUInt64LE(0);
pgoBuffer.writeBigUInt64LE(pgoId, 16);
pgoBuffer.writeBigUInt64LE(5000n, 24);
fs.writeFileSync(pgoPath, pgoBuffer);
const pgoUseResult = run(['build', avxVector, '-o', path.join(temp, 'pgo-used.exe'), '--opt', '6', '--pgo-use', pgoPath]);
assert(/PGO profile: .*\(1\/1 functions matched\)/.test(pgoUseResult.stdout), pgoUseResult.stdout);

// Actual syntax and symbol errors still point to the correct source line.
const bad = write('bad.lsx', `
fn main()
    return Missing.value
end
`);
const badResult = run(['check', bad], 1);
assert(badResult.stderr.includes(`${bad}:3:`));
assert(badResult.stderr.includes("unknown module alias or closed table 'Missing'"));

console.log('LazyScriptEX 0.18.2 compiler, raw strings, native objects, persistent logs, file I/O, JSON, direct atomics, threading, automatic runtime crash records, sockets, HTTP, and GameKit tests passed.');
