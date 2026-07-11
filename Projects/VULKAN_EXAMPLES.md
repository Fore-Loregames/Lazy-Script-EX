# Vulkan examples

The Vulkan examples use the same beginner-facing `LSG` and `LSSL` code as the OpenGL examples. The backend owns swapchains, render passes, framebuffers, command buffers, synchronization, descriptors, pipeline layouts, and graphics/compute pipelines.

## Core and OpenGL-parity examples

- `34_vulkan_window` — Vulkan window and clear color
- `35_vulkan_triangle` — LSSL triangle; also verifies Vulkan/OpenGL orientation parity
- `36_vulkan_animated_frame` — animation and compound assignment
- `38_vulkan_indexed_cube_depth` — indexed mesh and depth attachment
- `39_vulkan_procedural_checkerboard` — generated pixels and Vulkan texture upload
- `40_vulkan_instanced_drawing` — instanced mesh drawing
- `41_vulkan_input_polling` — keyboard/mouse polling
- `42_vulkan_window_icon` — generated RGBA window icon
- `43_vulkan_multiple_windows` — separate Vulkan contexts/windows
- `47_vulkan_image_loading` — stb_image texture loading
- `49_vulkan_full_game_loop` — input, animation, texture, uniform, mesh, and loop together
- `50_vulkan_monitor_device` — monitor and selected Vulkan device information
- `51_vulkan_compute_storage` — LSSL compute and storage buffer readback
- `52_vulkan_framebuffer_blit` — offscreen framebuffer and swapchain blit
- `53_vulkan_glm_camera` — GLM transforms and the inference-only Camera front end
- `54_vulkan_sdf_text` — FreeType SDF atlas, alpha blending, and textured text
- `55_vulkan_shader_diagnostics` — embedded SPIR-V and Vulkan error reporting
- `56_vulkan_gamepad_polling` — gamepad input with a Vulkan window

Audio, files, JSON, networking, threads, HTTP, logging, and typed-query examples are backend-neutral and therefore run unchanged; duplicating those folders would not exercise Vulkan.

## LazyUI Vulkan integration examples

These use the actual retained `UI/Renderer`, not a separate Vulkan mock-up. They prove that LSSL shaders, SDF text, generated and loaded images, clipping, controls, canvas shapes, scrolling, editor layouts, node graphs, runtime HUDs, and input callbacks coexist with the Vulkan backend.

- `57_vulkan_lazyui_inline` — 500-row retained tree, SDF text, canvas shapes, clipping, scrolling, and input
- `58_vulkan_lazyui_controls_gallery` — complete controls gallery, color picker, images, editable text, and scrolling
- `59_vulkan_lazyui_editor_workspace` — hierarchy, scene view, inspector, project browser, console, and properties
- `60_vulkan_lazyui_node_graph` — nodes, ports, connections, minimap, inspector controls, and clipping
- `61_vulkan_lazyui_runtime_hud` — health/mana, quests, minimap, dialogue, hotbar, notification, and inventory
- `62_vulkan_lazyui_text_image_clip` — focused SDF text, generated texture, rounded clipping, and button callback test

Run each project with its own `build.bat`, or use `build-all.bat` from the repository root.

## Universal modular ray example

- `63_vulkan_universal_modular_ray` — three ordinary indexed LSG meshes and one custom material using shared-scene shadows, AO, GI, and reflections simultaneously

The recommended material-side declaration is:

```lssl
raytracing all
```

or any explicit combination such as:

```lssl
raytracing shadows ao reflections
```

The rest of the file is a normal vertex/fragment shader. `position` must be the first `Vector3` vertex input and the fragment output must be `finalColor = Color4`. LSSL preserves the material's own result and applies the requested effects afterward.

Ordinary triangle-list geometry from `LSG.mesh`, `LSG.dynamic_mesh`, and `LSG.indexed_mesh` automatically joins one shared Vulkan ray scene. Future model loaders use that same path and forward node transforms/material metadata through `mesh.set_ray_transform(...)` and `mesh.set_ray_material(...)`; game shaders do not contain triangle lists or scene-specific intersection functions.

## Procedural ray diagnostics

- `37_vulkan_raytraced_shadows` — isolated plane, block, and sphere shadow diagnostic
- `44_vulkan_raytraced_reflections` — isolated reflection diagnostic
- `45_vulkan_raytraced_gi` — isolated one-bounce color-bleed diagnostic
- `46_vulkan_raytraced_ao` — isolated contact/crevice AO diagnostic
- `48_vulkan_rt_gallery` — all four procedural diagnostics in one executable

These fragment-only projects remain useful for validating each effect independently. They use `ray.color`, `ray.debug_color`, and `ray.mix`, and accept one procedural mode per shader. They are no longer the architecture used by normal game geometry.

The current universal implementation performs real intersections against the shared submitted triangles and uses the backend-owned persistent/refittable acceleration data. LSG/LSSL keep the traversal implementation hidden so future hardware ray-query or pipeline backends can replace it without changing game shaders.

