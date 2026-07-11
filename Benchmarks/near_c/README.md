# LSX O6 versus optimized C benchmark suite

This suite checks both correctness and elapsed time for the compiler's primary optimized paths:

- `scalar_int`: register-resident integer dependency loop.
- `scalar_f32`: scalar floating-point dependency loop.
- `typed_table`: repeated typed-table traversal and element addressing.
- `vector_fma`: eight-wide AVX2/FMA table loop. This requires an AVX2/FMA-capable CPU.
- `retained_objects`: repeated retained object creation, table storage, destruction, and allocator reuse. The C reference uses `malloc`/`free` for the corresponding retained objects.

Run it from a 64-bit Windows PowerShell prompt:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Benchmarks\near_c\run.ps1 -Runs 7
```

Requirements:

- Node.js available as `node`.
- `clang.exe` or `clang-cl.exe` available on `PATH`.
- An AVX2/FMA processor for `vector_fma`.

By default, the C reference uses the same ISA class as each LSX executable: baseline x86-64 for baseline LSX tests and AVX2/FMA for the vector test. This avoids comparing baseline LSX against AVX-512 or another host-specific C build. To compare against the fastest code Clang can generate for the current machine instead, add `-NativeC`:

```powershell
.\Benchmarks\near_c\run.ps1 -Runs 7 -NativeC
```

The script rebuilds every workload at O6, builds its equivalent C source at `-O3` (or clang-cl `/O2`), performs one warm-up, records the median, and writes `build/near_c_results.csv`. Each executable validates a final checksum/range before its timing is accepted, preventing an invalid optimization from appearing artificially fast.

A ratio of `1.00` means equal elapsed time. Lower is faster. Process launch overhead affects very short workloads, so each workload intentionally performs enough work to dominate startup. Close background applications and use the same power plan for repeatable measurements.

These are focused compiler microbenchmarks, not a claim that every dynamic LSX program equals C. Engine performance also depends on data layout, native API use, cache behavior, safety checks, and whether a code path can be specialized or vectorized.
