# LazyScriptEX optimizer

LazyScriptEX generates PE32+ executables and x86-64 instructions directly:

```text
LSX modules
  → parsing, table-shape resolution, and native type validation
  → O1/O2 local optimization
  → O3 hot-path optimization
  → O4 whole-program optimization
  → O5 fixed-point whole-program optimization
  → O6 aggressive register/code-generation optimization
  → x64 integer/SSE instruction selection
  → Windows executable
```

## O1

- compact integer immediates and arithmetic
- direct integer arguments through `RCX`, `RDX`, `R8`, and `R9`
- direct float arguments through positional `XMM0`–`XMM3`
- scalar float arithmetic using `MOVSS`, `ADDSS`, `SUBSS`, `MULSS`, and `DIVSS`
- direct comparison branches
- smaller leaf-function frames

## O2

- constant folding, including float constants
- algebraic simplification and module-constant substitution
- dead branch, dead loop, and unreachable-statement removal
- immutable-local propagation
- unread-store elimination while preserving calls
- self-tail recursion converted to a native loop
- unused runtime families and imports stripped, including unused threading/network declarations

## O3 — native hot-path pass

- straight-line copy/value propagation
- local common-subexpression elimination
- power-of-two integer multiplication lowered to shifts
- weighted integer register allocation into `R12`–`R15`
- weighted float register allocation into preserved `XMM6`–`XMM9`
- extra allocation priority for loop-hot variables
- ABI-correct save/restore of preserved GPR and XMM registers

## O4 — whole-program game pass

- small pure-function and field-only table-method inlining
- a second optimization pass after inlining
- call-graph reachability rooted at `main`, including functions referenced through `fnptr`
- unreachable LSX function, string, import, and runtime removal
- conservative stack-slot lifetime reuse
- O3 register allocation over the surviving program

## O5 — fixed-point whole-program pass

- repeats inlining and local optimization until more cross-function simplification is exposed
- raises the pure-expression inlining budget while preserving side-effect ordering
- performs additional dead-code, constant-folding, copy-propagation, and CSE passes after each inlining wave
- keeps O4 call-graph stripping and native ABI guarantees

## O6 — maximum native game pass

- keeps O4's first preserved-register choices stable, then expands into `RBX`, `RSI`, `RDI`, `XMM10`–`XMM15` only when access scores justify the ABI save/restore cost
- places call-free leaf locals in volatile `R8`/`R9` and `XMM2`–`XMM5`, eliminating unnecessary stack frames and nonvolatile register saves
- updates register-resident assignments in place instead of routing values through `RAX`, `XMM0`, or temporary stack slots
- emits simple scalar float arithmetic directly between XMM registers; common `f32` loops no longer spill the left operand to the stack
- preserves immutable loop-used `f32` constants in XMM registers instead of rebuilding them from integer bit patterns every iteration
- emits direct register comparisons and truth tests for loop conditions
- converts cheap loops to a bottom-tested form and reuses decrement flags for `while count > 0` counted loops
- sizes temporary frames from the optimization path actually emitted, including safe O0–O3 indexed-store accounting
- runs four whole-program optimization waves and a larger pure-function inlining budget
- remains conservative around pointer aliasing, external calls, owned objects, collection lifetime, and side-effect ordering
- is the default project optimization level

## Table specialization

- closed-table field names become compile-time byte offsets
- closed static function members become direct native calls
- instance methods receive an implicit receiver only when `self` is referenced
- small table methods are eligible for O4–O6 inlining
- imported table members resolve across modules during compilation
- anonymous named literals receive generated closed shapes
- positional literals receive packed fixed-offset native layouts
- homogeneous positional objects lower indexing to a stride multiply and direct load/store
- native `ptr` calls accept packed objects and inferred collections directly without payload copies
- inferred collections use hidden contiguous storage with a compile-time stride
- indexing lowers to direct address calculation plus typed load/store
- table iteration evaluates the collection once and creates no iterator object
- unused table members and their strings/runtime dependencies are removed by reachability
- inherited objects use a hidden compiler-owned type ID without changing visible field offsets
- `GetTypeName()` lowers to a direct header load and indexed static-table load with no allocation
- literal `IsType(...)` checks lower to integer type-ID ancestry comparisons; dynamic interned names use pointer equality before string fallback

## Record and object table storage

Table layout is selected from the record's ownership shape:

- Scalar-only records containing numeric and boolean fields are stored inline with their complete native stride. `push`, `add_copy`, typed literals, indexing, `get`, `at`, `first`, and `last` operate on the copied record body. This is used by data such as `Font.Glyph` and JSON node/member records.
- Reference-bearing or owning records containing nested objects, tables, strings, handles, pointers, function pointers, or a custom destructor are stored as eight-byte native object pointers. Their accessors preserve object identity across table growth, and `add()` allocates/initializes the object before storing its pointer.
- Packed positional numeric values retain their existing inline fixed-layout path.

This split preserves compact contiguous data for engine hot loops without allowing retained UI, graph, ECS-owner, or resource references to move when a table reallocates.

## Current limits

O6 automatically vectorizes canonical contiguous f32 loops: four-wide SSE for `baseline`, eight-wide AVX2 for `avx2`, and AVX2 FMA for recognized `a*b+c` forms under `avx2-fma`. PGO generation/use can reorder and prioritize hot functions. General alias analysis across arbitrary pointers, vectorization of irregular control flow, and cross-module link-time SIMD transformation remain outside the current pass.

Closed tables intentionally optimize known shapes. Fully dynamic runtime string keys are not implemented in 0.17.0; adding them later will use a separate slower path rather than weakening the fixed-shape engine path.
