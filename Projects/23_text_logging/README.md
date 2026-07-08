# 23 - Persistent text logging

This example demonstrates the native LSX logger and the compiler's automatic runtime log.

After the program runs, check:

- `build/logs/LazyScriptEX.log` for application stages, errors, warnings, and success records.
- `build/LazyScriptEX-runtime.log` for process start, clean return, or an unhandled native crash.

The logger flushes each record, so the last completed stage remains available even if a later native call crashes the process. Logging is protected by a native Windows mutex and can be shared by real LSX worker threads.
