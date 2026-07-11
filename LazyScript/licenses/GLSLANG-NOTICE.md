# glslang WASM notice

LazyScriptEX includes the JavaScript/WebAssembly build from `@webgpu/glslang` 0.0.15 to compile Vulkan-targeted LSSL shaders into embedded SPIR-V during the normal LSX build.

The upstream compiler is KhronosGroup/glslang. Its complete combined license text is preserved in `GLSLANG-LICENSE.txt`.

The vendored files are:

- `compiler/vendor/glslang/glslang.js`
- `compiler/vendor/glslang/glslang.wasm`

They are build-time compiler components. Generated shader output is embedded into the native executable; normal project builds do not write readable GLSL or SPIR-V files beside the game.
