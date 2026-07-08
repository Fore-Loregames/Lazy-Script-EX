# LazyScriptEX performance and benchmarks

LazyScriptEX is designed to reduce language and runtime overhead in code that the compiler can resolve statically. Performance depends on the workload, data layout, native API cost, allocation patterns, CPU target, and optimization level.

“Near C” describes the goal for optimized hot paths. It is not a promise that every LSX program will match or exceed every C compiler on every workload.

## Measured scalar kernels

The following historical measurements compare generated LSX O6 functions with equivalent scalar loops compiled by Clang O3. Each kernel performed 100,000,000 dependent iterations.

| Kernel | Earlier LSX O6 | Updated LSX O6 | Clang O3 |
|---|---:|---:|---:|
| Integer accumulate/countdown | 0.5749 ns/iteration | 0.2944 ns/iteration | 0.2897 ns/iteration |
| Scalar f32 accumulate/countdown | 3.2356 ns/iteration | 0.5756 ns/iteration | 0.5736 ns/iteration |

In those runs, the updated integer kernel was within about 1.6% of Clang O3 and the scalar floating-point kernel was within about 0.4%. CPU frequency, process scheduling, code alignment, and measurement noise can be larger than those differences, so the result should be read as parity on those specific kernels rather than a universal ranking.

## Generated function size

| Kernel | Earlier LSX O6 | Updated LSX O6 | Reduction |
|---|---:|---:|---:|
| Integer kernel | 103 bytes | 39 bytes | 62.1% |
| Scalar f32 kernel | 144 bytes | 52 bytes | 63.9% |

## O6 optimization work

The current O6 pipeline includes:

- destination-aware integer and floating-point assignment emission;
- direct XMM-to-XMM scalar arithmetic without unnecessary stack temporaries;
- cost-aware integer and XMM register allocation;
- leaf-local register use without unnecessary save/restore frames;
- loop constants retained in registers;
- direct comparisons and truth branches;
- bottom-tested loop lowering where appropriate;
- signed power-of-two division and remainder strength reduction;
- cached process-heap allocation for small objects, strings, tables, and UI storage;
- segregated slab pages for common small allocation sizes;
- escape analysis for small non-escaping closed objects;
- stack-slot coloring;
- CFG construction, liveness analysis, reaching definitions, phi analysis, constant propagation, dead assignment removal, common-subexpression elimination, and conservative loop-invariant motion;
- bounded inlining for small internal functions and direct object methods;
- direct table header operations and compile-time element strides;
- canonical-loop bounds-check elimination;
- SSE vectorization for supported `f32` loops on the baseline target;
- AVX2 vectorization when `targetCpu` is `avx2`;
- AVX2/FMA lowering for supported multiply-add loops when `targetCpu` is `avx2-fma`;
- scalar remainder handling for vectorized loops;
- profile counter generation and profile-guided layout/inlining priority.

## Table storage

The compiler chooses table storage from the actual record shape:

- scalar numeric and boolean records can use contiguous inline storage;
- records containing nested owned objects, strings, tables, handles, pointers, function references, or custom destruction use stable pointer slots;
- inferred primitive collections use contiguous native storage with compile-time stride;
- fixed positional values expose packed storage directly to native APIs.

This keeps compact value data contiguous while preserving identity for retained reference-bearing objects.

## CPU targets

Select a CPU target in `lazyscriptex.json`:

```json
{
  "optimization": 6,
  "targetCpu": "baseline"
}
```

Supported targets:

| Target | Intended use |
|---|---|
| `baseline` | Broad x64 compatibility and SSE paths |
| `avx2` | AVX2-capable processors |
| `avx2-fma` | AVX2 and FMA-capable processors |

Or select the target on the command line:

```bat
node LazyScript\compiler\lazyscriptex.js build Projects\02_opengl_triangle --opt 6 --cpu avx2-fma
```

Do not distribute an AVX2 or FMA executable to machines that do not support the selected instruction set.

## Reproducible LSX-versus-C suite

The [`Benchmarks/near_c`](../../Benchmarks/near_c) directory contains paired LSX and C workloads for:

- scalar integer arithmetic;
- scalar floating-point arithmetic;
- table traversal and element addressing;
- AVX2/FMA loops;
- retained-object allocation and reuse.

Run from a 64-bit Windows PowerShell prompt:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Benchmarks\near_c\run.ps1 -Runs 7
```

Requirements:

- Node.js available as `node`;
- `clang.exe` or `clang-cl.exe` on `PATH`;
- an AVX2/FMA-capable processor for the vector FMA workload.

The script builds LSX at O6, builds the equivalent C source with optimized native settings, performs a warm-up, records median elapsed times, and writes:

```text
Benchmarks/near_c/build/near_c_results.csv
```

A ratio of `1.00` means equal elapsed time. Lower is faster.

## Benchmarking guidance

For useful results:

- close heavy background applications;
- use the same power plan for every run;
- compare the same CPU target;
- run enough iterations to dominate process startup;
- use medians rather than a single run;
- inspect generated code when a result is unexpected;
- measure complete application workloads in addition to microbenchmarks.

## Limitations

Current limitations include:

- one public floating scalar type, `f32`;
- not every loop shape is vectorized;
- dynamic or opaque behavior may prevent specialization;
- native library calls can dominate total time;
- cache misses and poor data layout remain expensive;
- allocation and destruction still have real costs;
- algorithm choice usually matters more than small instruction-level differences.

Performance claims should always name the measured workload, compiler settings, CPU, and test method.
