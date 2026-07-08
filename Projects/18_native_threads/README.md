# 18 - Native threads

Creates four real Windows threads from ordinary LSX functions. Each thread updates a shared native atomic counter. No VM scheduler, cooperative coroutine, raw pointer allocation, or memory write API is involved.

The atomic operations are compiler-emitted machine instructions and do not import the Windows SDK `Interlocked*` macros as DLL functions.
