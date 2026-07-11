# LazyScriptEX Native GameKit

LazyScriptEX is a statically compiled language and native game/application framework for Windows x64. It keeps ordinary LSX code small and inference-first while compiling directly to native executables.

The current repository includes the complete **0.21.6** toolchain with OpenGL 4.6, Vulkan, LSG, LSSL, modular ray effects, native LSHTML/LSCSS/LazyUI, audio, image loading, SDF text, math, networking, threading, file I/O, JSON, the offline API, and the Visual Studio Code extension.

## Platform and requirements

- Windows 10 or Windows 11, x64
- Node.js 18 or newer
- A current OpenGL 4.6 or Vulkan-capable graphics driver
- Visual Studio Code is recommended but not required

## Main features

- Native x64 compilation with optimization levels O0–O6
- Inferred variables, function parameters, returns, object fields, and tables
- Closed objects, compile-time inheritance, constructors, ownership, `GetTypeName()`, and `IsType(...)`
- Growable tables plus compiler-packed numeric buffers using ordinary `{ ... }` syntax
- LSG front-end graphics API shared by OpenGL and Vulkan
- LSSL vertex, fragment, compute, overlay, storage, image, and modular ray shader support
- Vulkan shared-scene ray-traced shadows, AO, GI, and reflections
- Native retained LSHTML, LSCSS, and LazyUI on OpenGL or Vulkan
- GLFW windowing/input, OpenAL audio, stb_image loading, FreeType SDF text, and GLM math
- Native files, JSON, logging, threads, synchronization, TCP/UDP, HTTP/HTTPS, and Win32 integration
- VS Code diagnostics, completion, hovers, signatures, navigation, formatting, build/run commands, and offline API access
- 66 bundled projects covering language, runtime, OpenGL, Vulkan, LazyUI, ray effects, compute, and procedural generation

## Quick start

### 1. Prepare the runtime

From the repository root:

```bat
setup-runtime.bat
```

### 2. Install the VS Code extension

```bat
INSTALL_VSCODE_EXTENSION.bat
```

Restart or reload Visual Studio Code afterward.

### 3. Create a project

```bat
new-project.bat MyGame
```

Build it with:

```bat
Projects\MyGame\build.bat
```

### 4. Open the offline API

```bat
open-api.bat
```

The API separates normal front-end LSX usage from raw backend/native declarations. LSG, LSSL, inheritance, LazyUI, LSHTML, LSCSS, events, and programmatic elements are documented with copy-ready examples.

## First window

```lsx
use "@LazyScript/LSG.lsx" as LSG

fn main()
    local window = LSG.open("My LSX window",1280,720)
    if not window.ready() then
        return LSG.show_error(window.error())
    end

    while window.running() do
        window.begin(0.03,0.04,0.07)
        window.end()
    end

    window.destroy()
    return 0
end
```

OpenGL is the default. Select Vulkan before opening the first window:

```lsx
LSG.use_vulkan()
local window = LSG.open("My Vulkan window",1280,720)
```

The same window, input, mesh, texture, framebuffer, storage, shader, camera, and frame-loop APIs are then used on either backend.

## Clear LSG front-end names

Normal application code uses clear operation names:

```lsx
window.activate()
window.set_vsync(false)
window.set_title("Scene Editor")

if window.is_key_down(LSG.Key.Escape) then
    window.close()
end

window.begin(0.02,0.03,0.05)
-- Draw here.
window.end()
```

Older names remain compatibility aliases so existing projects continue to compile, but they are kept out of the beginner-facing API.

## LSSL shaders

A `.lssl` file is compiled to embedded GLSL for OpenGL and embedded SPIR-V for Vulkan.

```lssl
shader Basic
vulkan
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

Import it from LSX and use the generated module:

```lsx
use "shaders/basic.lssl" as Basic

local shader = Basic.create()
if not shader.ready() then
    return LSG.show_error(shader.error())
end
```

LSSL also supports compute stages, storage buffers, images, flat stage values, overlay pipelines, and modular Vulkan ray effects. See [`LazyScript/docs/LSSL.md`](LazyScript/docs/LSSL.md).

## Modular Vulkan ray effects

A normal material can opt into any combination of shared-scene effects:

```lssl
raytracing shadows ao gi reflections
```

or:

```lssl
raytracing all
```

Enable the shared scene before creating the shader:

```lsx
LSG.use_vulkan()
LSG.set_ray_tracing(true)
```

Triangle-list meshes created through normal LSG mesh functions participate automatically when their first vertex attribute is `Vector3 position`. Transforms and material values stay on the normal mesh object:

```lsx
mesh.set_ray_transform(model)
mesh.set_ray_material(0.8,0.25,0.12,0.35,0.0,0.0)
```

## LazyUI, LSHTML, and LSCSS

LSHTML and LSCSS are compiler-native retained UI declarations. No browser, DOM runtime, or JavaScript framework is involved.

```lsx
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI

const ToolbarProps = {
    status = "Ready"
}

lscss .primary = {
    padding = "8px 14px"
    background = "#3478f6"
    border_radius = "8px"
}

lshtml toolbar_view(props) = {(
    <row class="toolbar">
        <button id="save" class="primary">Save</button>
        <span>{props.status}</span>
    </row>
)}

fn main()
    local props = ToolbarProps.new()
    local root = toolbar_view(props)
    local document = UI.document(root)
    document.destroy()
    props.destroy()
    return 0
end
```

The same retained UI works on OpenGL and Vulkan. Projects 28–32 and 57–62 cover controls, scrolling, editor layouts, node graphs, HUDs, SDF text, images, and clipping.

## Multiple windows

LSG can render different editor systems into separate windows while sharing the same front-end API:

```lsx
local first = LSG.open("Window A",640,400)
local second = LSG.open("Window B",640,400)

while first.running() and second.running() do
    first.activate()
    first.begin(0.20,0.04,0.06)
    first.end()

    second.activate()
    second.begin(0.03,0.08,0.22)
    second.end()
end
```

## Repository commands

| Command | Purpose |
|---|---|
| `setup-runtime.bat` | Prepare required runtime libraries |
| `INSTALL_VSCODE_EXTENSION.bat` | Install the bundled VS Code extension |
| `new-project.bat Name` | Create a project from `ProjectTemplate` |
| `build-all.bat` | Build every bundled project |
| `check-all.bat` | Check every project and validate the API |
| `test-all.bat` | Run compiler, API, extension, and project validation |
| `update-api.bat` | Regenerate and synchronize the offline API |
| `package-extension.bat` | Rebuild the installable VS Code VSIX |
| `clean.bat` | Remove generated project/test build directories |
| `open-api.bat` | Open the offline API in the default browser |

## Repository layout

```text
LazyScriptEX/
├─ LazyScript/
│  ├─ compiler/       LSX and LSSL compiler
│  ├─ bindings/       LSX-facing native APIs
│  ├─ native/         required native Windows libraries
│  ├─ runtime/        GLFW and OpenAL runtime libraries
│  ├─ api/            generated offline API
│  ├─ docs/           language, LSG, LSSL, optimizer, and ABI documentation
│  ├─ extension/      Visual Studio Code extension source
│  ├─ LSG.lsx         beginner graphics front end
│  └─ LSSL.lsx        shader runtime front end
├─ Projects/          runnable examples and project template
├─ CompilerTests/     compiler regression projects
├─ Benchmarks/        reproducible performance workloads
└─ .github/workflows/ repository validation
```

## Documentation

- [Language guide](LazyScript/docs/LANGUAGE.md)
- [LSG graphics guide](LazyScript/docs/LSG.md)
- [LSSL shader guide](LazyScript/docs/LSSL.md)
- [Optimizer guide](LazyScript/docs/OPTIMIZER.md)
- [Performance guide](LazyScript/docs/PERFORMANCE.md)
- [Native C ABI notes](LazyScript/docs/C_ABI.md)
- [Project index](Projects/README.md)
- [Vulkan example coverage](Projects/VULKAN_EXAMPLES.md)
- [Changelog](CHANGELOG.md)

## License

LazyScriptEX is released under the [MIT License](LICENSE). Third-party notices remain under [`LazyScript/licenses`](LazyScript/licenses).
