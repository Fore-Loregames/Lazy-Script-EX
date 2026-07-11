# LSG — LazyScript Graphics

LSG is the beginner-facing graphics framework. Ordinary projects import LSG rather than raw GLFW, OpenGL, or Vulkan bindings.

```lsx
use "@LazyScript/LSG.lsx" as LSG
```

## Choose a backend once

OpenGL 4.6 is the default:

```lsx
local window = LSG.open("OpenGL Game",960,540)
```

Choose Vulkan before opening the first window:

```lsx
LSG.use_vulkan()
local window = LSG.open("Vulkan Game",960,540)
```

The public frame flow is identical:

```lsx
while window.running() do
    window.begin(0.05,0.08,0.12)
    shader.bind()
    mesh.draw()
    window.end()
end
```

LSG hides context/device selection, swapchains, render passes, command buffers, synchronization, descriptors, pipeline layouts, staging, resize recovery, and resource destruction. Vulkan also uses a backend-owned negative-height viewport and clip-depth conversion, so the same camera matrices and vertex positions have the same orientation as OpenGL.


## Clear front-end naming

The normal frame pair is `begin()` and `end()`. `end()` finishes the frame, submits it, shows it, processes events, and updates the optional FPS title. Older names such as `present()` remain as compatibility aliases, but new projects and autocomplete use the clearer front-end names.

Other common front-end names follow the same rule:

```lsx
window.activate()
window.set_title("Updated title")
window.set_vsync(false)

LSG.poll_events()
LSG.depth_test(true)
LSG.face_culling(true)
LSG.alpha_blending(true)
```

Backend terminology remains inside the raw binding modules rather than being required in ordinary game code.

## VSync works on both backends

```lsx
window.set_vsync(false)
```

OpenGL forwards this to the context swap interval. Vulkan changes the swapchain present mode safely on the next frame. VSync on uses `FIFO`. VSync off prefers `IMMEDIATE`, then falls back to `MAILBOX`, `FIFO_RELAXED`, and finally `FIFO` only when the driver exposes no faster mode. Runtime switching waits for the device before rebuilding swapchain-dependent resources, so it is safe to call after the window has been created.

## Meshes use shader-owned layouts

```lsx
use "shaders/basic.lssl" as Basic

local vertices = {
    -0.7,-0.6, 1.0,0.2,0.2,
     0.7,-0.6, 0.2,1.0,0.2,
     0.0, 0.7, 0.2,0.4,1.0
}

local mesh = LSG.mesh(vertices,Basic.vertex_layout)
if not mesh.ready() then return LSG.show_error(mesh.error()) end
```

LSSL creates `Basic.vertex_layout`. LSG turns it into the correct OpenGL attributes or Vulkan vertex input without requiring component counts, offsets, formats, bindings, or stride calculations in game code.

Both backends support normal, indexed, empty, dynamic, and instanced meshes. `LSG.empty_mesh(count)` is useful for full-screen shaders built from `vertex.id`.

## Textures, framebuffers, compute, and uniforms

The same front-end objects are available on both backends:

```lsx
local texture = LSG.texture_from_pixels(pixels)
local target = LSG.framebuffer(960,540)
local data = LSG.storage(bytes,0)
```

LSSL reflection lets Vulkan create and update descriptors and automatic uniform buffers internally. OpenGL uses its matching binding path. Normal projects do not create descriptor pools, descriptor sets, pipeline layouts, or barriers manually.

## Input and devices

```lsx
if window.is_key_down(LSG.Key.Escape) then window.close() end
if window.is_mouse_down(LSG.Mouse.Left) then console.write_line("Click") end
```

Window input, monitors, icons, multiple windows, and gamepads use the same calls regardless of the selected renderer.

## LazyUI uses the same backend

LazyUI no longer switches back to OpenGL when an application selects Vulkan. Create the normal retained renderer after opening the LSG window:

```lsx
LSG.use_vulkan()
local window = LSG.open("Vulkan UI",1280,720)
local renderer = UIRenderer.create(null,64)
```

The existing LazyUI API is unchanged. SDF text, generated and loaded images, clipping, canvas shapes, controls, scrolling, editor layouts, and input callbacks use backend-neutral `LSG.Texture` and `LSG.Storage` objects. Vulkan snapshots textures, storage bindings, and automatic uniforms for every draw, so a 3D scene and its UI overlay can safely share one command buffer.

See projects 57–62. Build them individually or run `build-all.bat` from the repository root.

## Universal ray scene for custom materials

Enable the shared Vulkan ray scene before creating a ray-enabled LSSL material:

```lsx
LSG.use_vulkan()
LSG.set_ray_tracing(true)
local window = LSG.open("Ray game",1280,720)
local shader = MyMaterial.create()
```

The material remains an ordinary custom vertex/fragment shader. It opts into one or several effects with one declaration:

```lssl
raytracing shadows ao gi reflections
```

or:

```lssl
raytracing all
```

Triangles do not need to be submitted to a second ray API. A Vulkan mesh automatically participates when it is created through `LSG.mesh`, `LSG.dynamic_mesh`, or `LSG.indexed_mesh`, uses triangle-list topology, and has `Vector3 position` as its first shader attribute. This is the same mesh path a future OBJ, glTF, FBX, or engine model loader will use.

The shared scene uses normal mesh state:

```lsx
mesh.set_ray_transform(model)
mesh.set_ray_material(0.8,0.2,0.1,0.35,0.0,0.0)
mesh.set_ray_visible(true)
```

The material parameters are red, green, blue, roughness, metallic, and emissive. `set_ray_material_rgba` also accepts alpha. Defaults are provided, so geometry participates even before a loader supplies richer material metadata.

A conventional shader `uniform model = Matrix4` is captured automatically whenever `mesh.draw()` runs. `set_ray_transform(model)` is still useful for an engine that updates all scene transforms before rendering, because the complete ray scene is then correct before the first ray-enabled draw of the frame. Model loaders should call the mesh material/transform methods internally; game code does not rebuild triangles or write ray intersection functions.

Shared lighting is configured once:

```lsx
LSG.set_ray_sun(-0.4,-0.8,-0.3,1.0,0.95,0.86,2.0,0.10)
LSG.clear_ray_point_lights()
LSG.add_ray_point_light(0.0,4.0,2.0,0.4,0.6,1.0,12.0,10.0)
```

Up to eight shared point lights are currently stored. `LSG.ray_scene_triangle_count()` reports the active triangle count for diagnostics. `mesh.set_ray_visible(false)` excludes helpers, collision previews, gizmos, or other meshes from ray intersections without removing them from raster rendering. Line, point, and triangle-strip mesh modes are excluded automatically.

Project `63_vulkan_universal_modular_ray` demonstrates one custom material receiving shadows, AO, GI, and reflections simultaneously from three ordinary indexed LSG meshes.

### Current traversal backend

This is a universal shared triangle scene, not a hard-coded demo scene. It currently uses a backend-owned CPU-built BVH uploaded to Vulkan storage, with persistent topology, transform refitting, and shader traversal rather than KHR BLAS/TLAS. Capability queries remain available for the future hardware implementation:

```lsx
LSG.supports_hardware_ray_tracing()
LSG.supports_ray_queries()
LSG.supports_ray_pipelines()
```

Because the LSSL declaration, LSG mesh path, transform/material state, and model-loader contract do not expose the traversal implementation, hardware acceleration can replace the current portable backend without changing game shaders.

Raw GLFW, OpenGL, and Vulkan bindings remain available for binding authors and backend implementation work, not as the normal application API.

