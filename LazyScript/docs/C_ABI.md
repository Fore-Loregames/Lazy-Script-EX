# LazyScriptEX foreign ABI

LazyScriptEX imports ordinary Windows x64 ABI exports directly:

```lsx
extern "LSXGameKit.dll" fn glfwInit() -> i32
extern "user32.dll" fn SetWindowTextA(hwnd: handle, title: string) -> i32
extern "kernel32.dll" fn ReadFile(file: handle, target: ptr, count: u32, read_out: ptr, overlapped: ptr) -> i32
```

The compiler writes imports into the PE import table. Integer, pointer, and handle arguments use Windows x64 general-purpose argument slots. Floating-point arguments use their positional XMM slots. `f32` results return in `XMM0`.

## Indirect calls

COM and other vtable APIs are invoked with:

```lsx
ffi.call0(function_pointer)
ffi.call1(function_pointer, a0)
...
ffi.call8(function_pointer, a0, a1, a2, a3, a4, a5, a6, a7)
```

This remains available for COM/vtable APIs and project-specific native interfaces.

## Optional project-native bindings

The compiler also supports generic project-specific native bindings declared in `lazyscriptex.json`. The Native GameKit uses the packaged prebuilt `LSXGameKit.dll` through normal `extern` declarations, so examples do not compile C code during each build.

## Function pointers and thread entry points

Named LSX functions have the primitive ABI type `fnptr`. Passing a function to `thread.start` emits its native code address directly. On Windows x64, the worker receives one pointer-sized context argument and returns an integer status in `RAX`/`EAX`, matching the `CreateThread` entry ABI.

Packed LSX objects and inferred collections automatically expose their native storage when a foreign declaration expects `ptr`. This conversion is performed at the call boundary without copying the payload.


## Copying foreign buffers into LSX-owned collections

For raw foreign payloads, call `resize_bytes(byte_count)` and then `copy_bytes_from_ptr(source, byte_count)`. These operations establish annotation-free packed `u8` storage, validate the destination capacity, and emit one native block copy. The general `copy_from_ptr` operation remains available when a collection already has an inferred element layout. This is the supported path for retaining data after the foreign library frees its allocation.
