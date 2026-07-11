'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { build } = require('./lazyscriptex');

const root = path.resolve(__dirname, '..', '..');
const byteCount = (buffer, sequence) => {
  let count = 0;
  for (let at = 0; at <= buffer.length - sequence.length; at += 1) {
    if (buffer.subarray(at, at + sequence.length).equals(sequence)) count += 1;
  }
  return count;
};

const typed = build(path.join(root, 'Benchmarks', 'near_c', 'typed_table', 'lazyscriptex.json'), null, {
  optimization: 6,
  targetCpu: 'baseline',
});
assert.strictEqual(typed.optimizationStats.unrolledFloatReductions, 1, 'canonical f32 table reduction was not unrolled');
const typedBinary = fs.readFileSync(typed.output);
assert(byteCount(typedBinary, Buffer.from([0xF3, 0x41, 0x0F, 0x58])) >= 8,
  'unrolled f32 reduction does not use direct scalar memory additions');

const vector = build(path.join(root, 'Benchmarks', 'near_c', 'vector_fma', 'lazyscriptex.json'), null, {
  optimization: 6,
  targetCpu: 'avx2-fma',
});
assert.strictEqual(vector.optimizationStats.persistentVectorRecurrences, 1,
  'fixed-width AVX2 recurrence was not kept in registers across the outer loop');
const vectorBinary = fs.readFileSync(vector.output);
assert(vectorBinary.includes(Buffer.from([0xC4, 0xE3, 0x7D, 0x19])), 'AVX2 recurrence has no vextractf128 threshold check');
assert(vectorBinary.includes(Buffer.from([0x48, 0x83, 0xF9, 0x10])), 'AVX2 recurrence has no exact 16-element runtime guard');
assert(vectorBinary.includes(Buffer.from([0x4D, 0x39, 0xC8])) || vectorBinary.includes(Buffer.from([0x4D, 0x39, 0xD0])),
  'AVX2 recurrence has no output/source alias guard');

const retained = build(path.join(root, 'Benchmarks', 'near_c', 'retained_objects', 'lazyscriptex.json'), null, {
  optimization: 6,
  targetCpu: 'baseline',
});
const retainedBinary = fs.readFileSync(retained.output);
assert.strictEqual(byteCount(retainedBinary, Buffer.from([0x49, 0x87, 0x02])), 0,
  'single-thread retained-object allocator still takes the global slab spin lock');

const threaded = build(path.join(root, 'Projects', '18_native_threads', 'lazyscriptex.json'), null, {
  optimization: 6,
  targetCpu: 'baseline',
});
const threadedBinary = fs.readFileSync(threaded.output);
assert(byteCount(threadedBinary, Buffer.from([0x49, 0x87, 0x02])) > 0,
  'threaded programs lost allocator synchronization');

const reachabilityDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-o0-reachability-'));
const reachabilitySource = path.join(reachabilityDir, 'main.lsx');
fs.writeFileSync(reachabilitySource, `const UnusedGeneric = {
    update = fn(values)
        return values.byte_length()
    end
}
fn main()
    return 0
end
`);
const reachability = build(reachabilitySource, path.join(reachabilityDir, 'reachability.exe'), { optimization: 0 });
assert(reachability.optimizationStats.functionsStripped > 0,
  'O0 did not strip unreachable generic methods before code generation');

const compilerSource = fs.readFileSync(path.join(__dirname, 'lazyscriptex.js'));
const extensionSource = fs.readFileSync(path.join(root, 'LazyScript', 'extension', 'compiler', 'lazyscriptex.js'));
assert(compilerSource.equals(extensionSource), 'extension compiler is not synchronized with the main compiler');

console.log('Near-C optimizer regressions passed: direct unrolled reductions, persistent AVX2 recurrences, alias/count guards, thread-aware allocator locking, and O0 reachability stripping.');
