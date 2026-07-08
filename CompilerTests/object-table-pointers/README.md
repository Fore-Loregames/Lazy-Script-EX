# Closed-object pointer table regression

Builds the same native runtime test at O0 and O6. It verifies that `table<Node>` has pointer identity semantics across `push`, `get`, `at`, `[]`, `first`, `last`, `add_copy`, `add`, typed literals, default object-owned tables, and `Node.table(capacity)`. Both executables must return 0 under the strict native-heap emulator or on Windows.
