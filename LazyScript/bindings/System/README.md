# System bindings

The system modules provide native threads, synchronization, files, and persistent logs while keeping Windows handles and ABI details inside the binding layer.

## Native threading

```lsx
use "@LazyScript/bindings/System/Threading.lsx" as Threading
```

A named LSX function can run on a real operating-system thread:

```lsx
const Work = {
    counter = null
    iterations = 0
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

    local task = Threading.Thread.start(worker, work)
    task.join()
    task.close()

    work.destroy()
    counter.destroy()
    return 0
end
```

Available primitives include:

- `Thread`
- `Mutex`
- `Semaphore`
- manual-reset and automatic-reset `Event`
- `CriticalSection`
- shared/exclusive `RWLock`
- `ConditionVariable`
- `AtomicI32` and `AtomicI64`
- `ThreadLocal`
- processor count, current processor, priorities, affinity, yield, and thread exit

A context object must remain alive until every worker using it has completed. Closing a thread handle without joining does not terminate the thread.

## Native files

```lsx
use "@LazyScript/bindings/System/File.lsx" as File
```

Write and read text:

```lsx
local written = File.write_text("message.txt", "Hello from LSX")

if written.ok then
    local content = File.read_text("message.txt")

    if content.ok then
        console.write_line(content.text())
    end

    content.destroy()
end
```

`File.lsx` supports text and binary reads/writes, append, existence checks, directories, copy, move, and delete operations. Native handles and output counters remain private to the module.

See `Projects/21_file_io` for a complete example.

## Persistent text logging

```lsx
use "@LazyScript/bindings/System/Log.lsx" as Log

fn main()
    local logger = Log.open_default()

    logger.stage("Loading settings")
    logger.info("Window initialized")
    logger.warning("Optional asset was not found")
    logger.error_line("Network connection failed")
    logger.success("Shutdown completed normally")

    logger.close()
    return 0
end
```

`Log.lsx` writes UTF-8 records and flushes each complete record immediately. `open_default()` writes `logs/LazyScriptEX.log`.

Every compiled executable also writes `LazyScriptEX-runtime.log` for process entry, clean return, and unhandled native exceptions.
