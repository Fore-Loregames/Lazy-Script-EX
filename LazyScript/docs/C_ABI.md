# LazyScriptEX foreign ABI

LazyScriptEX can import ordinary Windows x64 DLL exports directly. Foreign declarations require exact machine types because the compiler cannot infer a DLL's binary signature.

```lsx
extern "user32.dll" fn MessageBoxA(
    window: handle,
    text: string,
    title: string,
    flags: u32
) -> i32

extern "kernel32.dll" fn ReadFile(
    file: handle,
    target: ptr,
    count: u32,
    read_out: ptr,
    overlapped: ptr
) -> i32
```

This explicit syntax belongs in low-level bindings and interop modules. Normal LSX application code should use inferred values and higher-level wrappers.

## Windows x64 calling convention

The compiler writes imported symbols into the PE import table.

- Integer, pointer, and handle arguments use the Windows x64 general-purpose argument slots.
- Floating-point arguments use their positional XMM slots.
- Integer and pointer results return through `RAX` or `EAX`.
- `f32` results return through `XMM0`.
- Stack shadow space and alignment follow the Windows x64 ABI.

## Packed values and foreign pointers

Fixed positional LSX values and inferred collections automatically expose their native storage when a foreign parameter expects `ptr`.

```lsx
local vertices = {
    -1.0, -1.0, 0.0,
     1.0, -1.0, 0.0,
     0.0,  1.0, 0.0
}

GL.glBufferData(GL.GL_ARRAY_BUFFER, vertices.byte_length(), vertices, GL.GL_STATIC_DRAW)
vertices.destroy()
```

The payload is passed without per-element marshaling or a temporary copy.

## Indirect calls

COM, vtable, and other function-pointer APIs can use the `ffi` helpers:

```lsx
ffi.call0(function_pointer)
ffi.call1(function_pointer, a0)
ffi.call2(function_pointer, a0, a1)
ffi.call3(function_pointer, a0, a1, a2)
ffi.call4(function_pointer, a0, a1, a2, a3)
```

Additional helpers are available through `ffi.call8`.

Use these only when a normal `extern` declaration or existing wrapper cannot represent the API cleanly.

## Function pointers and native thread entry points

Named LSX functions can be emitted as native function pointers. Passing a function to the threading API gives the operating system the generated machine-code address directly.

```lsx
fn run_worker(context)
    context.finished = true
    return 0
end
```

A thread context must remain alive until the worker has finished or been joined.

## Copying foreign buffers into LSX-owned storage

When a native library owns a temporary byte buffer, copy it into an LSX table before releasing the foreign allocation:

```lsx
local bytes = {}
bytes.resize_bytes(byte_count)
bytes.copy_bytes_from_ptr(source, byte_count)
```

For a collection whose element layout is already known, use `copy_from_ptr(source, byte_count)` instead.

These operations validate destination capacity and emit one native block copy.

## Project-specific native bindings

A project may declare additional native bindings through `lazyscriptex.json`. This is intended for advanced integrations that are not already covered by the bundled binding modules.

Keep exact ABI declarations, pointers, handles, and ownership rules inside the binding layer. Expose ordinary LSX functions and objects to application code whenever possible.
