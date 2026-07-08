# LazyScriptEX example projects

Each folder is a complete LSX project with its own `main.lsx`, `lazyscriptex.json`, and `build.bat`.

From the repository root, prepare the runtime first:

```bat
setup-runtime.bat
```

Build one example:

```bat
Projects\00_glfw_window\build.bat
```

Create a clean project from the template:

```bat
new-project.bat MyFirstProject
```

## Examples

| Project | What it teaches |
|---|---|
| `00_glfw_window` | Complete GLFW window, OpenGL loading, resize-safe viewport, frame loop, and cleanup |
| `01_input_polling` | Keyboard, mouse, cursor position, and window resize handling |
| `02_opengl_triangle` | Shader compilation, VAO/VBO setup, packed vertex data, and triangle rendering |
| `03_indexed_cube_depth` | Indexed geometry, inferred vertex/index buffers, matrices, and depth testing |
| `04_texture_checkerboard` | Generated RGBA pixels and texture upload |
| `05_framebuffer_blit` | Offscreen framebuffer rendering and resize-aware blitting |
| `06_instanced_drawing` | Instanced OpenGL drawing |
| `07_compute_shader_ssbo` | OpenGL compute shaders and SSBO readback |
| `08_openal_generated_tone` | Generated PCM data and OpenAL playback |
| `09_openal_wav_playback` | WAV loading and playback |
| `10_openal_efx_reverb` | OpenAL EFX reverb and auxiliary effect slots |
| `11_gamepad_polling` | Reusable gamepad state and button/axis polling |
| `12_multiple_shared_windows` | Multiple GLFW windows sharing one OpenGL context |
| `13_window_icon_rgba` | Creating and applying a GLFW window icon from RGBA data |
| `14_full_game_loop` | Input, rendering, timing, and optional audio in one loop |
| `15_monitor_video_modes` | Monitor enumeration, work areas, scale, and video modes |
| `16_shader_diagnostics` | Shader/program status, error logs, and OpenGL information strings |
| `17_typed_queries` | OpenGL state and resource queries through convenience wrappers |
| `18_native_threads` | Real OS worker threads, synchronization, and an atomic counter |
| `19_tcp_loopback` | Local TCP server/client connection and two-way messages |
| `20_http_client` | WinHTTP request/response flow against a local server |
| `21_file_io` | UTF-8 text and binary file operations |
| `22_json` | Loading, traversing, editing, and writing JSON |
| `23_text_logging` | Persistent flushed logs and runtime lifecycle records |
| `24_image_loading` | stb_image decoding and OpenGL texture upload |
| `25_sdf_text` | FreeType SDF glyphs, atlas packing, and batched text rendering |
| `26_media_self_test` | Console-only image and font validation |
| `27_glm_camera` | GLM vectors, matrices, quaternions, transforms, cameras, and uniform upload |
| `28_lazyui_inline` | Retained UI, large scrollable lists, culling, SDF text, and canvas elements |
| `29_lazyui_controls_gallery` | Inputs, textareas, selection, clipboard, toggles, sliders, scrollbars, and color controls |
| `30_lazyui_editor_workspace` | Multi-panel tool layout with hierarchy, inspector, browser, and console regions |
| `31_lazyui_node_graph` | Experimental node-graph layout and interaction test; not recommended as a production reference yet |
| `32_lazyui_runtime_hud` | Anchored HUD layout, bars, minimap, dialogue, notifications, and inventory slots |
| `ProjectTemplate` | Minimal project created by `new-project.bat` |

## Suggested learning order

Start with:

1. `00_glfw_window`
2. `01_input_polling`
3. `02_opengl_triangle`
4. `03_indexed_cube_depth`
5. `14_full_game_loop`
6. `21_file_io`
7. `22_json`
8. `27_glm_camera`
9. `28_lazyui_inline`
10. `29_lazyui_controls_gallery`

Use the offline API for explanations of every binding used by these projects:

```bat
open-api.bat
```
