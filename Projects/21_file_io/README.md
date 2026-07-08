# 21 - Native file I/O

Demonstrates user-facing LSX text file operations without raw memory or Windows handles.

The executable creates `logs/file_io_test.txt`, appends a second line, reads the file back, prints it, and waits for Enter before closing.

Persistent diagnostics are written to:

- `logs/LazyScriptEX.log` for explicit application stages
- `LazyScriptEX-runtime.log` for process start, normal exit, or an unhandled native crash

The VS Code runner launches the executable from its `build` directory, so all paths in this example are intentionally relative to that directory.
