# Example projects

Every folder is an independent LSX project with its own `main.lsx`, `lazyscriptex.json`, and `build.bat`. Copy any example to start a game, or run `new-project.bat Name` from the toolkit root.

| Project | Demonstrates |
|---|---|
| 00_glfw_window | GLFW window/context, OpenGL loading, reusable framebuffer size |
| 01_input_polling | Keyboard, mouse, cursor position, resize-safe viewport |
| 02_opengl_triangle | Packed positional LSX vertex data, shader program, VAO/VBO, triangle rendering |
| 03_indexed_cube_depth | Compiler-inferred packed `f32` vertices and `u32` indices, indexed geometry, and depth testing |
| 04_texture_checkerboard | Resizable compiler-inferred pixel data and a procedural RGBA texture; no WIC |
| 05_framebuffer_blit | Offscreen framebuffer and resize-aware blit |
| 06_instanced_drawing | Instanced rendering |
| 07_compute_shader_ssbo | OpenGL 4.6 compute and typed object SSBO readback |
| 08_openal_generated_tone | OpenAL buffer/source helpers and generated compiler-inferred PCM |
| 09_openal_wav_playback | WAV PCM loading and playback |
| 10_openal_efx_reverb | OpenAL EFX effect and auxiliary slot |
| 11_gamepad_polling | Reusable typed gamepad state |
| 12_multiple_shared_windows | Two GLFW windows with a shared OpenGL context |
| 13_window_icon_rgba | Full GLFW icon access without manual struct allocation |
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
| 29_lazyui_controls_gallery | Real editable inputs and textarea, password masking, selection/clipboard, checkboxes, radios, toggles, switches, ranges/sliders, scrollbars, and a live color picker |
| 30_lazyui_editor_workspace | Full editor composition with hierarchy, scene view, inspector, project browser, console, toolbar, menu, and properties |
| 31_lazyui_node_graph | Corrected absolute-layout node graph with cards, ports, connections, scrollable palette, minimap, and working inspector controls |
| 32_lazyui_runtime_hud | Corrected anchored runtime HUD with health/mana, quests, minimap, dialogue, notification, crosshair, hotbar, and inventory slots |
| ProjectTemplate | Clean starting project |
