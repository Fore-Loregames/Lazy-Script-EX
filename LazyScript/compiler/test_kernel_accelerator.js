'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('./lazyscriptex');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-kernel-accelerator-'));
fs.writeFileSync(path.join(temp, 'main.lsx'), `fn main()
    local cleared:table<f32> = {1.0,2.0,3.0,4.0,5.0,6.0,7.0,8.0}
    local clearIndex = 0
    while clearIndex < cleared.count() do
        cleared[clearIndex] = 0.0
        clearIndex = clearIndex + 1
    end

    local partial:table<f32> = {9.0,9.0,9.0,9.0,9.0,9.0,9.0,9.0}
    local partialIndex = 0
    while partialIndex < 4 do
        partial[partialIndex] = 0.0
        partialIndex = partialIndex + 1
    end

    local left:table<f32> = {1.0,2.0,3.0,4.0,5.0,6.0,7.0,8.0}
    local right:table<f32> = {2.0,3.0,4.0,5.0,6.0,7.0,8.0,9.0}
    local output:table<f32> = {0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0}
    local result:table<f32> = {0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0}

    local first = 0
    while first < output.count() do
        output[first] = left[first] + right[first]
        first = first + 1
    end
    local second = 0
    while second < output.count() do
        result[second] = output[second] * 2.0
        second = second + 1
    end

    if cleared[0] == 0.0 and partial[4] == 9.0 and result[7] == 34.0 then return 0 end
    return 1
end
`);
fs.writeFileSync(path.join(temp, 'lazyscriptex.json'), JSON.stringify({
  entry: 'main.lsx',
  output: 'build/kernel.exe',
  subsystem: 'console',
  optimization: 6,
  targetCpu: 'avx2-fma',
  emitKernels: true,
}, null, 2));

const result = build(temp);
const stats = result.optimizationStats;
assert(stats.kernelLoopsAnalyzed >= 2, 'kernel dependency analysis did not annotate canonical loops');
assert(stats.independentKernelLoops >= 2, 'independent loop detection did not fire');
assert.strictEqual(stats.loopsFused, 1, 'adjacent pointwise loops were not fused');
assert.strictEqual(stats.multiOperationVectorLoops, 1, 'fused loop did not receive multi-operation SIMD');
assert(stats.parallelKernelCandidates >= 2, 'worker-pool candidates were not recorded');
assert(stats.computeKernelCandidates >= 2, 'compute candidates were not recorded');
assert.strictEqual(stats.zeroFillKernels, 1, 'only full-table zero-fill loops should become native memory kernels');
assert.strictEqual(stats.algorithmicKernelsEmitted, 1, 'zero-fill algorithm did not lower to the native memory kernel');
assert(result.kernelOutputs.count >= 2, 'automatic LSSL compute kernels were not generated');
assert(fs.existsSync(result.kernelOutputs.manifest), 'kernel manifest was not written');
const manifest = JSON.parse(fs.readFileSync(result.kernelOutputs.manifest, 'utf8'));
assert(manifest.kernels.some((kernel) => kernel.fusedOperations === 2), 'fused compute kernel is missing from the manifest');
assert(manifest.kernels.every((kernel) => kernel.strategies.includes('worker_pool') && kernel.strategies.includes('compute')),
  'kernel manifest does not expose all runtime strategies');
assert(manifest.kernels.every((kernel) => Array.isArray(kernel.parameterStorage)
    && kernel.parameterStorage.some((storage) => storage.entries.some((entry) => entry.source === 'count'))),
  'generated kernels do not expose their portable storage-backed parameter ABI');
for (const kernel of manifest.kernels) {
  const wrapper = path.resolve(path.dirname(result.output), kernel.wrapper);
  const wrapperSource = fs.readFileSync(wrapper, 'utf8');
  assert(wrapperSource.includes('export const vulkan_ready = true'),
    `generated kernel ${kernel.name} did not compile to embedded Vulkan SPIR-V`);
  assert(!wrapperSource.includes('/tmp/') && !wrapperSource.includes('lazyscriptex-lssl-cache'),
    `generated kernel ${kernel.name} retained a machine-local SPIR-V cache path`);
  assert(wrapperSource.includes(`memory.embed_binary("${path.basename(kernel.spirv)}")`),
    `generated kernel ${kernel.name} does not embed its portable sibling SPIR-V artifact`);
  assert(wrapperSource.includes('export fn groups_for(count)') && wrapperSource.includes('data_binding_'),
    `generated kernel ${kernel.name} is missing discoverable LSX dispatch metadata`);
  assert(kernel.backends.includes('opengl') && kernel.backends.includes('vulkan') && kernel.spirvWords > 0,
    `generated kernel ${kernel.name} does not list both graphics backends`);
  assert(fs.existsSync(path.resolve(path.dirname(result.output), kernel.spirv)),
    `generated kernel ${kernel.name} did not write its Vulkan SPIR-V artifact`);
}
const fusedKernel = manifest.kernels.find((kernel) => kernel.fusedOperations === 2);
fs.writeFileSync(path.join(temp, 'wrapper_check.lsx'), `use "build/${fusedKernel.wrapper}" as GeneratedKernel

fn main()
    if GeneratedKernel.groups_for(129) == 3 then return 0 end
    return 1
end
`);
fs.writeFileSync(path.join(temp, 'wrapper-check.json'), JSON.stringify({
  entry: 'wrapper_check.lsx', output: 'verify/wrapper-check.exe', subsystem: 'console', optimization: 2,
  moduleRoots: { LazyScript: path.resolve(__dirname, '..') },
}, null, 2));
build(path.join(temp, 'wrapper-check.json'));

const parallelTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-worker-pool-'));
fs.writeFileSync(path.join(parallelTemp, 'main.lsx'), `use "@LazyScript/bindings/System/Parallel.lsx" as Parallel

const Work = {
    values:table<f32> = {}
}

fn fill_chunk(begin:i64,finish:i64,context:Work)
    local index = begin
    while index < finish do
        context.values[index] = 2.0 * index
        index = index + 1
    end
    return 0
end

fn main()
    local work = Work.new()
    work.values.resize(4096)
    local pool = Parallel.create_with_workers(2)
    if not pool.ready() then return 1 end
    local completed = pool.run(fill_chunk,work,work.values.count(),128)
    pool.destroy()
    work.destroy()
    if completed then return 0 end
    return 2
end
`);
fs.writeFileSync(path.join(parallelTemp, 'lazyscriptex.json'), JSON.stringify({
  entry: 'main.lsx', output: 'build/pool.exe', subsystem: 'console', optimization: 6,
}, null, 2));
const pool = build(parallelTemp);
assert(pool.imports.some((group) => group.dll.toLowerCase() === 'kernel32.dll' && group.functions.has('CreateThread')),
  'persistent worker pool did not retain native thread creation');

console.log('Kernel accelerator regressions passed: dependency plans, safe loop fusion, multi-operation SIMD, native zero-fill, worker-pool compilation, and generated LSSL compute kernels.');
