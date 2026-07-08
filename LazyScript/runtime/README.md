# Native runtime DLLs

Run `..\setup-runtime.bat` from the project root to download:

- official GLFW 3.4 64-bit `glfw3.dll`
- official OpenAL Soft 1.25.2 64-bit DLL, copied as `OpenAL32.dll`

The toolkit already includes the direct image/font sidecars under `native/`:

- `stb_image.dll`
- `libfreetype.dll`
- `LSXFreeType.dll`
- the two Visual C++ runtime DLLs required by the bundled FreeType build

Project configurations copy only the DLLs they import beside the generated
executable. `LSXGameKit.dll` is also copied from `native/` when OpenGL/GLFW
bindings require it.
