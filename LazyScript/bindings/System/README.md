# System bindings

## Native threading

```lsx
use "@LazyScript/bindings/System/Threading.lsx" as Threading
```

`Threading.lsx` uses Windows kernel threading primitives directly. An LSX worker function is compiled to a native machine-code label and passed to `CreateThread`; there is no VM scheduler, coroutine emulation, browser worker, or hidden C# layer.

```lsx
const Work = {
    counter:Threading.AtomicI64 = null,
    iterations:i64 = 0
}

fn worker(work)
    local index = 0
    while index < work.iterations do
        work.counter.increment()
        index = index + 1
    end
    return 0
end

fn main()
    local counter = Threading.AtomicI64.new()
    local work = Work.new()
    work.counter = counter
    work.iterations = 100000

    local task = Threading.Thread.start(worker,work)
    task.join()
    task.close()

    work.destroy()
    counter.destroy()
    return 0
end
```

Available primitives:

- `Thread`: start, optional stack size, join, timed wait, completion check, exit code, priority, affinity, ID, and handle close/detach.
- `Mutex`, `Semaphore`, and manual/automatic-reset `Event`.
- `CriticalSection` for fast recursive in-process locking.
- `RWLock` for native shared/exclusive SRW locking.
- `ConditionVariable` for blocking worker queues without spin loops.
- `AtomicI32` and `AtomicI64` emitted directly as native x64 `lock`/`xchg` instructions by the LSX compiler; no nonexistent DLL entry points are imported.
- `ThreadLocal` using native TLS slots.
- Current thread ID/handle, CPU count, current processor, yield, and thread exit.

A context object must remain alive until every worker using it has completed. Closing a `Thread` handle without joining detaches the handle but does not terminate the native thread.


## Persistent parallel kernels

```lsx
use "@LazyScript/bindings/System/Parallel.lsx" as Parallel
```

`Parallel.lsx` creates a fixed native worker set once, assigns large ranges through an atomic chunk counter, and lets the calling thread participate. `pool.run(callback, context, count, grain)` invokes the callback with `[begin, finish)` ranges. Dispatches are serialized per pool, and all workers are joined during `destroy()`. This is intended for independent procedural generation, simulation, transforms, image processing, and other large loops.

```lsx
use "@LazyScript/bindings/System/KernelRuntime.lsx" as Kernels

local kernels = Kernels.create()
kernels.set_grain(4096)
local completed = kernels.run_cpu(generate_chunk, world, cellCount)
kernels.destroy()
```

`KernelRuntime.lsx` provides one policy object for scalar, SIMD, worker-pool, and generated-compute thresholds. CPU execution remains explicit and safe. `strategy(count, computeReady)` reports the preferred path so an engine can dispatch a generated LSSL module only when its buffers are already suitable for GPU ownership.

## Native files

```lsx
use "@LazyScript/bindings/System/File.lsx" as File
```

`File.lsx` provides typed UTF-8 and binary reads/writes, append, existence checks, directory creation/removal, copy, move, and delete operations. Normal LSX code receives `File.Bytes` and `File.WriteResult` objects; native handles and output counters remain private to the module.


## Persistent text logging

```lsx
use "@LazyScript/bindings/System/Log.lsx" as Log

fn main()
    local logger = Log.open_default()
    logger.stage("Loading the world")
    logger.info("Renderer initialized")
    logger.warning("Optional asset was not found")
    logger.error_line("Network connection failed")
    logger.success("Shutdown completed normally")
    logger.close()
    return 0
end
```

`Log.lsx` writes ordinary UTF-8 text records and flushes each complete record immediately. A native Windows mutex protects shared loggers used by real LSX worker threads. `open_default()` writes `logs/LazyScriptEX.log`; `open(path)` and append variants are also available.

The compiler additionally emits `LazyScriptEX-runtime.log` automatically for every executable. It records entry into `main`, a normal return, or an unhandled native exception. The crash handler also shows a persistent Windows error dialog instead of allowing a native crash to disappear silently.
