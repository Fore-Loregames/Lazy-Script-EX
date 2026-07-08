# 22 - Native JSON file and deep tree traversal

This example loads the real `assets/engine_world.json` file, walks its nested worlds, zones, entities, components, arrays, and objects with ordinary inferred LSX variables, prints the tree to a native console, serializes it again, and waits before closing.

It also writes two persistent logs:

- `logs/LazyScriptEX.log` contains the last completed application stage and any JSON errors.
- `LazyScriptEX-runtime.log` records process start, a normal return, or an unhandled native crash.

There are no explicit local type declarations in the example and no embedded escaped JSON string.
