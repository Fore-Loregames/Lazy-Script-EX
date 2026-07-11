# Projects

The beginner graphics examples use `@LazyScript/LSG.lsx`. Shader examples import `.lssl` modules, which generate the correct OpenGL or Vulkan program for the active backend. Raw GLFW/OpenGL examples remain at the beginning of the set for binding and backend reference.

Start with `00_glfw_window`, then `02_opengl_triangle`, or open `33_lsg_lssl_triangle` for the smallest combined LSG/LSSL example. Shader source is embedded in the executable. Normal builds do not expose generated GLSL or SPIR-V files. Backend developers can request temporary generated files with `--emit-lssl`.

Every folder is an independent LSX project with its own `main.lsx`, `lazyscriptex.json`, and `build.bat`. Copy any example to start a game, or run `new-project.bat Name` from the toolkit root.

| Project | Demonstrates |
|---|---|
| 00_glfw_window | GLFW window/context, OpenGL loading, reusable framebuffer size |
| 01_input_polling | Keyboard, mouse, cursor position, resize-safe viewport |
| 02_opengl_triangle | Packed positional LSX vertex data, shader program, VAO/VBO, triangle rendering |
| 03_indexed_cube_depth | Compiler-inferred packed `f32` vertices and `u32` indices, indexed geometry, and depth testing |
| 04_texture_checkerboard | `LSG.PixelImage` packed RGBA8 generation and a procedural checkerboard texture |
| 05_framebuffer_blit | Offscreen framebuffer and resize-aware blit |
| 06_instanced_drawing | Instanced rendering |
| 07_compute_shader_ssbo | OpenGL 4.6 compute and typed object SSBO readback |
| 08_openal_generated_tone | Safe packed PCM16 generation, a lower soft triangle tone, and OpenAL playback |
| 09_openal_wav_playback | WAV PCM loading and playback |
| 10_openal_efx_reverb | Lower generated PCM16 tone, OpenAL EFX effect, and auxiliary slot |
| 11_gamepad_polling | Reusable typed gamepad state |
| 12_multiple_shared_windows | Two GLFW windows with a shared OpenGL context |
| 13_window_icon_rgba | Generated `LSG.PixelImage` window icon without exposed native structs or byte packing |
| 14_full_game_loop | Input, rendering, and optional audio together |
| 15_monitor_video_modes | Typed monitor lists, work area, scale, and video modes |
| 16_shader_diagnostics | Program status, logs, and OpenGL identity strings |
| 17_typed_queries | Scalar OpenGL state queries and query resources |
| 18_native_threads | Four real OS worker threads sharing a native atomic counter |
| 19_tcp_loopback | Graphical localhost TCP server/client with an open connection and two-way text exchange |
| 20_http_client | Graphical local HTTP server plus WinHTTP client request/response validation |
| 21_file_io | Native UTF-8 and binary file operations without exposed handles or memory code |
| 22_json | Real deep JSON asset loading, nested inferred-variable traversal, console output, persistent stage logging, and serialization |
| 23_text_logging | Thread-safe flushed text logs plus automatic process lifecycle and native crash records |
| 24_image_loading | stb_image decode copied into the same inferred packed texture path used by example 04, then rendered in a visible loop |
| 25_sdf_text | Direct FreeType face loading, FreeType SDF glyphs, one 8-bit single-channel atlas, and batched text rendering |
| 26_media_self_test | Console-only stb_image and FreeType/SDF validation without GLFW or OpenGL |
| 27_glm_camera | Normal untyped LSX geometry literals plus fully wrapped GLM vectors, matrices, quaternions, TRS, camera view/projection, and direct OpenGL matrix uniforms |
| 28_lazyui_inline | 500-row retained hierarchy stress test with foldout, FPS counter, cached instance batches, viewport culling, mouse-wheel/drag scrollbar, declarative canvas, and SDF text |
| 29_lazyui_controls_gallery | Immediate non-blocking startup, editable controls, scrollbars, and a live HSV/alpha color picker |
| 30_lazyui_editor_workspace | Full editor composition with hierarchy, scene view, inspector, project browser, console, toolbar, menu, and properties |
| 31_lazyui_node_graph | Corrected absolute-layout node graph with cards, ports, connections, scrollable palette, minimap, and working inspector controls |
| 32_lazyui_runtime_hud | Corrected anchored runtime HUD with health/mana, quests, minimap, dialogue, notification, crosshair, hotbar, and inventory slots |
| 33_lsg_lssl_triangle | Smallest shared LSG/LSSL triangle; OpenGL by default |
| 34_vulkan_window | Vulkan window/swapchain clear through the same LSG front end |
| 35_vulkan_triangle | LSSL triangle and OpenGL/Vulkan orientation parity |
| 36_vulkan_animated_frame | Animated Vulkan frame and compound assignment |
| 37_vulkan_raytraced_shadows | Ray-scene shadows with final/debug views |
| 38_vulkan_indexed_cube_depth | Vulkan indexed mesh and depth |
| 39_vulkan_procedural_checkerboard | Procedural Vulkan RGBA texture upload |
| 40_vulkan_instanced_drawing | Vulkan instanced mesh drawing |
| 41_vulkan_input_polling | Vulkan window input |
| 42_vulkan_window_icon | Generated window icon with Vulkan rendering |
| 43_vulkan_multiple_windows | Multiple Vulkan contexts/windows |
| 44_vulkan_raytraced_reflections | Reflective water/room ray scene |
| 45_vulkan_raytraced_gi | One-bounce GI/color-bleed ray scene |
| 46_vulkan_raytraced_ao | Laddered-cube AO ray scene |
| 47_vulkan_image_loading | stb_image texture through Vulkan |
| 48_vulkan_rt_gallery | Shadows, reflections, GI, and AO gallery |
| 49_vulkan_full_game_loop | Vulkan input, uniforms, textures, mesh, and update loop |
| 50_vulkan_monitor_device | Monitor and Vulkan device information |
| 51_vulkan_compute_storage | Vulkan compute and storage buffer readback |
| 52_vulkan_framebuffer_blit | Offscreen Vulkan target and swapchain blit |
| 53_vulkan_glm_camera | Inference-only Camera and GLM matrices on Vulkan |
| 54_vulkan_sdf_text | FreeType SDF text on Vulkan |
| 55_vulkan_shader_diagnostics | Embedded SPIR-V and driver diagnostics |
| 56_vulkan_gamepad_polling | Gamepad input with Vulkan |
| 57_vulkan_lazyui_inline | Full retained LazyUI stress test on Vulkan |
| 58_vulkan_lazyui_controls_gallery | Complete LazyUI controls/images/text gallery on Vulkan |
| 59_vulkan_lazyui_editor_workspace | Complete LazyUI editor workspace on Vulkan |
| 60_vulkan_lazyui_node_graph | LazyUI node graph on Vulkan |
| 61_vulkan_lazyui_runtime_hud | LazyUI runtime HUD on Vulkan |
| 62_vulkan_lazyui_text_image_clip | Focused Vulkan SDF text, image, rounded clipping, and input test |
| 63_vulkan_universal_modular_ray | Shared-scene modular ray shadows, AO, GI, and reflections on ordinary LSG meshes |
| 64_parallel_procedural_world | Parallel procedural terrain and biome generation using the persistent worker system |
| ProjectTemplate | Clean starting project |