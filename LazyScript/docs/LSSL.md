# LSSL — LazyScript Shader Language

LSSL is the LSX-shaped GPU language used by LSG. A `.lssl` graphics shader is compiled for both supported backends when possible:

- OpenGL receives embedded GLSL 4.60.
- Vulkan receives embedded SPIR-V generated during the LSX build.

Normal builds expose neither generated GLSL nor generated SPIR-V beside the executable. `--emit-lssl` is an explicit backend-debug option only.

## One shader creation call

```lsx
use "@LazyScript/LSG.lsx" as LSG
use "@LazyScript/LSSL.lsx" as LSSL
use "shaders/basic.lssl" as Basic

local shader = Basic.create()
if not shader.ready() then return LSG.show_error(shader.error()) end
```

`Basic.create()` checks the active LSG backend. It compiles/links the embedded GLSL through the installed OpenGL driver or creates a Vulkan graphics pipeline from the embedded SPIR-V. Pipeline objects and SPIR-V tables never appear in user code.

## Vertex and fragment shader

```lssl
shader Basic
vertex
    input position = Vector2
    input tint = Color3
    output color = Color3

    main = fn()
        color = tint
        screen.position = Vector4(position,0.0,1.0)
    end
end

fragment
    input color = Color3
    output finalColor = Color4

    main = fn()
        finalColor = Color4(color,1.0)
    end
end
end
```

LSSL generates shader versions, native GPU types, vertex locations, synchronized stage locations, fragment output locations, resource bindings, GPU entry points, the scalar `vertex_layout` used by LSG, and backend-specific shader code.

Add `vulkan` directly below `shader Name` when Vulkan output is required and the compiler must reject the file if SPIR-V generation fails:

```lssl
shader Basic
vulkan
vertex
    -- ...
end
fragment
    -- ...
end
end
```

## Friendly types

| LSSL | GPU type |
|---|---|
| `Number` | 32-bit float |
| `Whole` | signed integer |
| `Unsigned` | unsigned integer |
| `Truth` | boolean |
| `Vector2` / `Vector3` / `Vector4` | 2/3/4-component vectors |
| `Color3` / `Color4` | 3/4-component color vectors |
| `Matrix2` / `Matrix3` / `Matrix4` | 2x2/3x3/4x4 matrices |

Locals use inference:

```lssl
local brightness = max(dot(normalize(normal),sunDirection),0.0)
local color = albedo.sample(uv)
```

## Friendly GPU names

| LSSL | Meaning |
|---|---|
| `screen.position` | final vertex position |
| `screen.depth` | fragment depth |
| `screen.pixel` | current fragment coordinate |
| `vertex.id` | current vertex number |
| `instance.id` | current instance number |
| `worker.id` | global compute invocation ID |
| `worker.local_id` | local compute invocation ID |
| `worker.group` | workgroup ID |
| `worker.index` | local invocation index |

LSSL maps names such as `vertex.id` to the correct backend spelling (`gl_VertexID` for OpenGL and `gl_VertexIndex` for Vulkan).

## Flat stage values

Backend and shader-library code can mark vertex outputs and matching fragment inputs as `flat` when every pixel of a primitive must receive the exact un-interpolated value:

```lssl
vertex
    flat output materialIndex = Whole
    flat output commandData = Vector4
end
fragment
    flat input materialIndex = Whole
    flat input commandData = Vector4
end
```

The qualifier must match on both stages. LazyUI uses flat payloads internally so Vulkan reads each retained UI record in the vertex stage rather than repeatedly reading storage buffers for every covered pixel. Normal game materials should use ordinary interpolated `input` and `output` values unless interpolation is specifically unwanted.

## Uniforms, textures, storage, and compute

The same LSSL resource declarations serve both OpenGL and Vulkan:

```lssl
uniform viewProjection = Matrix4
texture albedo
storage particles = Vector4
```

```lsx
shader.bind()
shader.matrix4("viewProjection",cameraMatrix)
shader.texture("albedo",0)
texture.bind(0)
```

OpenGL uses native GLSL bindings. Vulkan uses compiler-generated SPIR-V, hidden descriptor layouts, descriptor updates, automatic uniform buffers, and backend-owned synchronization. Compute shaders and storage buffers therefore keep the same front-end shape.

## Overlay shaders for retained UI

Backend renderers can mark a graphics shader as an overlay:

```lssl
shader UIBox
vulkan
overlay
```

`overlay` keeps normal color blending while disabling depth testing/writes in the generated Vulkan pipeline. LSSL also supports `discard` for rounded clipping, SDF glyph edges, and image clipping. LazyUI uses these features internally; application UI code remains LSHTML/LSCSS and normal LSX.

## Universal modular ray tracing

A normal Vulkan vertex/fragment material can opt into any combination of shared-scene ray effects:

```lssl
shader MyMaterial
vulkan
raytracing shadows ao gi reflections
vertex
    input position = Vector3
    input normal = Vector3
    output worldNormal = Vector3
    uniform model = Matrix4
    uniform view = Matrix4
    uniform projection = Matrix4

    main = fn()
        worldNormal = normalize((model * Vector4(normal,0.0)).xyz)
        screen.position = projection * view * model * Vector4(position,1.0)
    end
end
fragment
    input worldNormal = Vector3
    output finalColor = Color4
    uniform objectColor = Color4
    uniform cameraPosition = Vector3

    main = fn()
        -- This remains your shader. LSSL applies the selected shared-scene
        -- ray effects after main has produced finalColor.
        finalColor = objectColor
    end
end
end
```

`raytracing all` is shorthand for all four features. Commas or spaces may be used, and duplicates are ignored.

The normal material shader still owns vertex transformation, textures, animation, lighting, and `finalColor`. LSSL adds world-position/world-normal varyings, binds the shared LSG ray scene, and applies only the selected effects after the fragment function. There is no per-project triangle loop and no procedural scene code to copy.

Universal ray materials follow two layout rules so every LSG mesh and future model loader can use the same native geometry path:

- `input position = Vector3` must be the first vertex input.
- The fragment stage must expose `output finalColor = Color4`.

`input normal = Vector3` is recommended. Without it, LSSL derives a face normal from screen-space world-position derivatives. If a shader deforms vertices, it may explicitly write `ray.position` and `ray.normal` in the vertex stage; otherwise LSSL derives both from `position`, `normal`, and a `uniform model = Matrix4` when present.

Automatic application is the normal path. A material that needs exact placement in its own fragment logic can call:

```lssl
finalColor = ray.apply(finalColor)
```

or provide explicit surface data:

```lssl
finalColor = ray.apply(finalColor,customWorldPosition,customWorldNormal)
```

An explicit `ray.apply` call disables the compiler-added final application, so an effect is never applied twice.

### Shared LSG scene

Every Vulkan triangle-list mesh made by `LSG.mesh`, `LSG.dynamic_mesh`, or `LSG.indexed_mesh` automatically joins the shared ray scene when its first attribute is a `Vector3` position. The native backend keeps the CPU triangle copy, transformed triangle data, ray material data, directional light, and point lights in one context-owned storage buffer. Any number of custom LSSL materials can consume that same scene.

The model matrix is captured at draw time from a conventional `uniform model = Matrix4`, even when the mesh is drawn by a non-ray shader. Engines and model loaders can also update the transform and material directly through the mesh methods documented in LSG. Non-triangle primitive modes are automatically excluded.

### Fragment-only diagnostics

The older fragment-only form remains available for the four self-contained procedural diagnostic scenes:

```lssl
shader RayDiagnostic
vulkan
raytracing shadows
fragment
    output finalColor = Color4
    main = fn()
        finalColor = ray.color()
    end
end
end
```

`ray.color`, `ray.debug_color`, and `ray.mix` belong to that compatibility/diagnostic form. It accepts one procedural mode at a time. Combining several effects requires a normal geometry vertex/fragment shader and the shared LSG scene.

The current universal backend performs real triangle intersections in Vulkan shader code and works without KHR ray-query hardware. The native backend builds and retains a CPU-side BVH, refits it when transforms change, uploads the compact scene/BVH data through persistent storage, and traverses it in the generated shader. It does not yet build `VK_KHR_acceleration_structure` BLAS/TLAS objects. LSSL keeps the scene and shader contract independent of the traversal backend so a later hardware ray-query or ray-pipeline implementation can replace it without rewriting materials or model loaders.

