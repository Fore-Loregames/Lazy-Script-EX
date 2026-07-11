# Changelog

## 0.21.6

- Updated the compiler and extension to support ordinary method calls through arbitrarily deep static-object field chains such as `WindowManagerMod.WindowManager.windowHandle.begin(...)`.
- Preserved concrete object inference when locals or fields start as `null` and receive a real object later.
- Added deep chained completion, hover, signature help, and Go to Definition across imported modules, static objects, nested fields, and inferred return values.
- Added lightweight return-flow analysis for inferred LSX functions and assignment-flow analysis for locals and object fields.
- Prevented fuzzy module-alias recovery from overriding a real local variable or object with a similar name.
- Synchronized the source compiler, packaged compiler, LSSL translator, LazyUI lowering, native bindings, grammar, snippets, API metadata, and VSIX version.
- Added a static LSG window-manager snippet and regression coverage for the exact null-window-handle workflow.

## 0.21.5

- Replaced awkward LSG front-end names with clear canonical names such as `Window.end()`, `Window.activate()`, `Window.set_vsync()`, `Window.set_title()`, `Window.is_key_down()`, `Mesh.draw_instances()`, `Mesh.update_vertices()`, and `Framebuffer.display()`.
- Preserved older LSG names as compatibility aliases while hiding them from the beginner-facing API.
- Updated compiler parsing, formatting, syntax highlighting, completion, hover, signature help, examples, and documentation for keyword-named members such as `window.end()`.
- Completed the Vulkan/OpenGL LSG and LSSL API split, including backend-only raw Vulkan declarations.
- Expanded the generated API to document LSSL shader declarations, graphics stages, compute, resources, overlay/strip pipelines, and modular ray features.

## 0.21.4

- Added the Vulkan analytic LazyUI path for retained boxes, text, images, clipping, and effects.
- Reduced Vulkan UI submission and shader payload overhead while retaining compatibility fallback behavior.

## 0.21.1

- Added persistent Vulkan uniform/storage paths, descriptor caching, persistent mapped dynamic mesh memory, and reduced synchronization overhead.
- Added persistent/refittable ray-scene acceleration data and optimized shadow traversal.
- Added FPS reporting to graphical examples and converted graphical applications to the Windows GUI subsystem.
- Replaced the synthetic workload example with a parallel procedural terrain/biome generator.

## 0.20.0

- Added Vulkan and embedded SPIR-V as a second LSG/LSSL backend while retaining OpenGL as the default.
- Added Vulkan windows, meshes, textures, framebuffers, compute, input, SDF text, LazyUI, and modular ray examples.
