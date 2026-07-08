# LazyScriptEX (LSX)

LazyScriptEX is an open-source, statically compiled scripting language for native Windows applications, games, tools, and user interfaces. LSX is designed to keep everyday code small and readable while compiling directly to native x64 machine code.

Normal LSX code relies on inference instead of explicit type annotations. Low-level ABI details remain inside bindings, so application code can work with ordinary functions, objects, tables, strings, and modules.

## Open source

LazyScriptEX is open source under the [MIT License](LICENSE). You may use, modify, distribute, and build commercial or non-commercial software with it under the terms of that license.

Third-party libraries retain their own licenses. Their notices are included under [`LazyScript/licenses`](LazyScript/licenses).

## Current platform

The current toolchain targets:

- Windows 10 or Windows 11
- x64 processors
- Native PE executables
- OpenGL 4.6 through GLFW
- OpenAL Soft for audio
- Visual Studio Code as the recommended editor

Node.js 18 or newer is required to run the compiler. The runtime setup script downloads or prepares the native libraries used by the examples.

## What LSX includes

- Native x64 compilation with optimization levels O0 through O6
- Inferred variables, parameters, returns, object fields, and tables
- Closed objects with methods, cloning, ownership, and compile-time inheritance
- Growable tables and packed numeric buffers using ordinary `{}` syntax
- Modules through `use "path" as Name`
- Direct Windows x64 foreign-function bindings
- GLFW windowing, input, monitors, cursors, gamepads, and timing
- OpenGL 4.6 rendering and compute APIs
- OpenAL audio, WAV loading, and EFX
- GLM-backed vectors, matrices, quaternions, transforms, and cameras
- File I/O, JSON, persistent logging, threads, synchronization, sockets, and HTTP
- stb_image image loading and FreeType SDF text
- Native LSHTML, LSCSS, and retained LazyUI
- Compiler diagnostics with error codes, source ranges, underlines, and hints
- A VS Code extension with diagnostics, hovers, completions, navigation, build, and run commands
- An offline searchable API with beginner explanations and runnable examples

## Quick start

### 1. Prepare the runtime

From the repository root, run:

```bat
setup-runtime.bat
```

This prepares the native libraries required by the bundled projects.

### 2. Install the VS Code extension

Run:

```bat
INSTALL_VSCODE_EXTENSION.bat
```

Restart Visual Studio Code. Projects may be opened anywhere on disk. When a project is not beside this repository, open the Command Palette and run:

```text
LazyScriptEX: Select LazyScript/API Folder
```

Select the `LazyScript` folder, `LazyScript/api`, or this toolkit root. The extension then uses that location for `@LazyScript` imports, compiler diagnostics, recursive IntelliSense, path autocomplete, and the offline API.

This step is strongly recommended but not required to compile from the command line.

### 3. Optionally rebuild every example

```bat
build-all.bat
```

Rebuilding locally is useful when Windows warns about downloaded prebuilt executables. It also confirms that the compiler and runtime are installed correctly on your machine.

### 4. Open the beginner guide and API

Run either:

```bat
START_HERE.bat
```

or:

```bat
open-api.bat
```

The offline guide covers setup, language basics, windows, UI, tables, bindings, and the complete API.

## Create your first project

From the repository root:

```bat
new-project.bat MyFirstProject
```

The project is created at:

```text
Projects/MyFirstProject/
├─ main.lsx
├─ lazyscriptex.json
├─ build.bat
└─ build/
```

Edit `Projects\MyFirstProject\main.lsx`, then build it:

```bat
Projects\MyFirstProject\build.bat
```

The executable is written to the project’s `build` folder.

## A complete first window

This is a complete LSX program. It loads the native libraries, creates an OpenGL window, clears the screen each frame, handles resizing, and cleans up correctly.

```lsx
use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL
use "@LazyScript/bindings/Platform/Win32.lsx" as Win32

fn fail(message)
    Win32.MessageBoxA(0, message, "LazyScriptEX", Win32.MB_OK + Win32.MB_ICONERROR)
    return 1
end

fn main()
    if GLFW.lsxLoadLibraries() < 1 then
        return fail("Could not load glfw3.dll. Run setup-runtime.bat first.")
    end

    if GLFW.glfwInit() == 0 then
        return fail("glfwInit failed.")
    end

    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR, 4)
    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR, 6)
    GLFW.glfwWindowHint(GLFW.GLFW_OPENGL_PROFILE, GLFW.GLFW_OPENGL_CORE_PROFILE)
    GLFW.glfwWindowHint(GLFW.GLFW_RESIZABLE, GLFW.GLFW_TRUE)

    local window = GLFW.glfwCreateWindow(1280, 720, "My first LSX window", 0, 0)

    if window == 0 then
        GLFW.glfwTerminate()
        return fail("Window creation failed. OpenGL 4.6 may not be available.")
    end

    GLFW.glfwMakeContextCurrent(window)
    GLFW.glfwSwapInterval(1)

    if GL.lsxLoadOpenGL() < 1 then
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        return fail("OpenGL function loading failed.")
    end

    local framebuffer = GLFW.FramebufferSize.new()

    while GLFW.glfwWindowShouldClose(window) == 0 do
        framebuffer.refresh(window)

        GL.glViewport(0, 0, framebuffer.width, framebuffer.height)
        GL.glClearColor(0.055, 0.075, 0.11, 1.0)
        GL.glClear(GL.GL_COLOR_BUFFER_BIT)

        GLFW.glfwSwapBuffers(window)
        GLFW.glfwPollEvents()
    end

    framebuffer.destroy()
    GLFW.glfwDestroyWindow(window)
    GLFW.glfwTerminate()
    GLFW.lsxUnloadLibraries()
    return 0
end
```

The same program is available in [`Projects/00_glfw_window`](Projects/00_glfw_window).

## Language overview

### Variables and inferred values

```lsx
local name = "Jessie"
local health = 100
local speed = 4.0
local enabled = true
```

The compiler infers how each value is stored. Ordinary application code does not need `name:string`, `health:i32`, or return annotations.

Use `const` for reusable object definitions and fixed module-level values:

```lsx
const Player = {
    name = "Player"
    health = 100
    speed = 4.0
}
```

### Functions

```lsx
fn add(left, right)
    return left + right
end

fn main()
    local total = add(20, 22)
    return 0
end
```

Parameters and returns are inferred from how the function is called and how its values are used.

### Conditions

```lsx
if health <= 0 then
    state = "dead"
elseif health < 25 then
    state = "hurt"
else
    state = "ready"
end
```

Conditions can be kept on one line for small checks:

```lsx
if window == 0 then return 1 end
```

### While loops

```lsx
local index = 0

while index < 10 do
    console.write_line(index)
    index = index + 1
end
```

### For loops over growable tables

```lsx
local names = {}
names.push("Luna")
names.push("Tami")
names.push("Janet")

for name in names do
    console.write_line(name)
end

names.destroy()
```

Use `break` to leave a loop early:

```lsx
for value in values do
    if value == target then
        found = true
        break
    end
end
```

## Tables

LSX uses table syntax for several practical jobs. The compiler determines the storage and behavior from the table’s shape and how it is used.

### Object tables

Named fields create an object definition:

```lsx
const Enemy = {
    name = "Slime"
    health = 20

    damage = fn(amount)
        self.health = self.health - amount
    end
}

local enemy = Enemy.new()
enemy.damage(5)
console.write_line(enemy.health)
enemy.destroy()
```

Object fields use fixed native offsets. Method calls use dot syntax.

### Growable tables

An empty table can become a growable collection:

```lsx
local scores = {}

scores.push(10)
scores.push(25)
scores.push(40)

local first = scores.get(0)
local count = scores.length()

scores.remove(1)
scores.clear()
scores.destroy()
```

Common operations include:

| Operation | Purpose |
|---|---|
| `push(value)` | Add a value to the end |
| `get(index)` | Read a value by index |
| `length()` | Return the number of stored values |
| `capacity()` | Return the current reserved capacity |
| `remove(index)` | Remove an item while preserving order |
| `remove_fast(index)` | Remove an item without preserving order |
| `pop()` | Remove and return the final item |
| `last()` | Read the final item |
| `clear()` | Remove all items while keeping allocated capacity |
| `destroy()` | Release owned storage |

### Fixed positional tables

A non-empty positional table can represent a small fixed value:

```lsx
local position = {10.0, 20.0, 30.0}

position.x = position.x + 1.0
position.y = position.y + 2.0
position.z = position.z + 3.0

local count = position.length()
local bytes = position.byte_length()

position.destroy()
```

The first positions can also be accessed as `r`, `g`, `b`, and `a` when the value represents a color.

### Flat numeric buffers

The same syntax is used for native vertex, index, pixel, audio, and compute data:

```lsx
local vertices = {
    -0.75, -0.65, 1.0, 0.2, 0.15,
     0.75, -0.65, 0.15, 0.8, 0.25,
     0.0,   0.75, 0.2, 0.35, 1.0
}

local indices = {0, 1, 2}

GL.glBufferData(GL.GL_ARRAY_BUFFER, vertices.byte_length(), vertices, GL.GL_STATIC_DRAW)
GL.glBufferData(GL.GL_ELEMENT_ARRAY_BUFFER, indices.byte_length(), indices, GL.GL_STATIC_DRAW)

vertices.destroy()
indices.destroy()
```

The compiler keeps the packed native representation hidden from normal LSX code.

## Objects and ownership

Create an object with `.new()`:

```lsx
local player = Player.new()
```

Copy one with `.clone()`:

```lsx
local copy = player.clone()
```

Release owned objects and growable data with `.destroy()` when they are no longer needed:

```lsx
copy.destroy()
player.destroy()
```

LSX does not use a garbage collector. Ownership is explicit so native applications can control allocation and cleanup.

## Compile-time inheritance

A closed object can inherit fields and methods from one base object:

```lsx
const Actor = {
    name = "Actor"
    active = true

    update = fn(delta)
        return 0
    end
}

const Player : base(Actor) = {
    health = 100

    update = fn(delta)
        base.update(delta)
        return 0
    end
}
```

Inheritance is resolved during compilation. It does not introduce a runtime prototype chain or reflection system.

## Modules and imports

Relative imports begin at the file containing the `use` statement:

```lsx
use "./CameraController.lsx" as CameraController
use "../Shared/MathHelpers.lsx" as MathHelpers
```

Named roots work from any folder depth:

```lsx
use "@LazyScript/bindings/Math/GLM.lsx" as GLM
use "@Engine/Window/WindowManager.lsx" as WindowManager
```

`@LazyScript` comes from the selected LazyScript/API folder. Additional roots are configured in `lazyscriptex.json`:

```json
{
  "entry": "main.lsx",
  "output": "build/Game.exe",
  "moduleRoots": {
    "Engine": "../Engine",
    "Shared": "../Shared"
  }
}
```

Paths in `moduleRoots` are relative to that JSON file. The key omits `@`, so `"Engine"` creates the `@Engine/...` import root.

While typing inside a `use` path, the VS Code extension lists real folders and `.lsx` files. Choosing a folder continues completion at the next level, and Go to Definition on the quoted path opens the imported file.

Only exported declarations are visible through a module alias:

```lsx
export const Settings = {
    width = 1280
    height = 720
}

export fn create_window(title)
    return 0
end
```

Use imported members through the alias:

```lsx
local result = MathHelpers.lerp(0.0, 10.0, 0.5)
```

Shared source folders do not need their own executable project. Editor and Game projects can both map the same `../Engine` folder and import it through `@Engine`.

## Strings and raw strings

Normal strings support escapes:

```lsx
local message = "Line one\nLine two"
```

Backtick strings preserve quotes and line breaks, which is useful for embedded shaders and JSON:

```lsx
local json_text = `{"name":"LazyScriptEX","enabled":true}`

local shader = `#version 460 core
void main() {
}`
```

## Files and JSON

```lsx
use "@LazyScript/bindings/System/File.lsx" as File
use "@LazyScript/bindings/Data/Json.lsx" as Json

fn main()
    File.write_text("settings.json", `{"volume":0.8}`)

    local document = Json.load("settings.json")
    local value = document.get(document.root, "volume")
    local volume = document.as_f32(value)

    document.destroy()
    return 0
end
```

See [`Projects/21_file_io`](Projects/21_file_io) and [`Projects/22_json`](Projects/22_json) for complete programs.

## Native threads

LSX can run named functions on real operating-system threads:

```lsx
use "@LazyScript/bindings/System/Threading.lsx" as Threading

const Work = {
    value = 0
}

fn run_worker(work)
    work.value = work.value + 1
    return 0
end

fn main()
    local work = Work.new()
    local worker = Threading.Thread.start(run_worker, work)

    worker.join()
    worker.close()
    work.destroy()
    return 0
end
```

Shared writable data still requires locks, atomics, events, or another synchronization primitive.

## GLM math

The public GLM wrapper keeps C++ types and pointers out of normal LSX code:

```lsx
use "@LazyScript/bindings/Math/GLM.lsx" as GLM
use "@LazyScript/bindings/Math/Camera.lsx" as Camera

local position = GLM.vec3(4.0, 3.0, 6.0)
local direction = GLM.vec3(0.0, 0.0, -1.0)
local normalized = direction.normalized()

local camera = Camera.create()
camera.set_position(position.x, position.y, position.z)
camera.set_perspective(60.0, 16.0 / 9.0, 0.1, 1000.0)

local view_projection = camera.view_projection()
```

The offline API documents vectors, matrices, quaternions, transforms, projection, interpolation, decomposition, and cameras with runnable examples.

## Native LSHTML, LSCSS, and LazyUI

LSHTML and LSCSS are declared inside ordinary `.lsx` files. They compile to retained native UI objects and do not require a browser or JavaScript runtime.

```lsx
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI

const WelcomeProps = {
    title = "Welcome"
    message = "This interface is written in LSHTML and LSCSS."
}

lscss .welcome-card = {
    width = "420px"
    padding = "24px"
    gap = "12px"
    background = "#111a29"
    border = "1px solid #2d4668"
    border_radius = "12px"
}

lscss .primary-button = {
    padding = "10px 16px"
    background = "#3478f6"
    border_radius = "8px"
}

lshtml welcome_view(props) = {(
    <panel class="welcome-card">
        <h1>{props.title}</h1>
        <paragraph>{props.message}</paragraph>
        <button class="primary-button" onclick={continue_clicked} context={props}>
            Continue
        </button>
    </panel>
)}

fn continue_clicked(element, event, props)
    props.message = "The button was pressed."
    return 0
end
```

Complete window, document, input, renderer, frame-loop, scrolling, controls, and HUD examples are available in projects 28 through 32 and in the offline API.

## Compiler commands

Show compiler help:

```bat
node LazyScript\compiler\lazyscriptex.js
```

Check one source file:

```bat
node LazyScript\compiler\lazyscriptex.js check path\to\main.lsx
```

Check a complete project:

```bat
node LazyScript\compiler\lazyscriptex.js check-project Projects\00_glfw_window
```

Build a project:

```bat
node LazyScript\compiler\lazyscriptex.js build Projects\00_glfw_window
```

Request structured diagnostics:

```bat
node LazyScript\compiler\lazyscriptex.js check-project Projects\00_glfw_window --diagnostics=json
```

Select optimization and CPU targets:

```bat
node LazyScript\compiler\lazyscriptex.js build Projects\02_opengl_triangle --opt 6 --cpu avx2-fma
```

Supported CPU targets are `baseline`, `avx2`, and `avx2-fma`.

## Diagnostics

Compiler errors include a stable error code, source location, offending line, underline, and a practical hint when one is available:

```text
LazyScriptEX error [LSX1200]: Game/main.lsx:18:21: unknown field 'positon'

18 | player.positon.x = 10.0
   |        ^^^^^^^^

Hint: Did you mean 'position'?
```

The VS Code extension displays the same diagnostics in the editor and Problems panel while typing and on save.

## VS Code commands

Open the Command Palette and search for `LazyScriptEX`:

- `LazyScriptEX: Build Project`
- `LazyScriptEX: Build and Run Project`
- `LazyScriptEX: Check Current File`
- `LazyScriptEX: Refresh Recursive Index`
- `LazyScriptEX: Open Offline API`
- `LazyScriptEX: Create Project from Template`
- `LazyScriptEX: Explain Symbol Under Cursor`

Default shortcuts:

| Shortcut | Action |
|---|---|
| `F6` | Build the current project |
| `Ctrl+F6` | Build and run |
| `Ctrl+Shift+F6` | Check the current file/project |
| `Ctrl+Alt+R` | Refresh the workspace index |

## Repository layout

```text
LazyScriptEX/
├─ LazyScript/
│  ├─ compiler/          LSX compiler and tests
│  ├─ bindings/          LSX-facing native APIs
│  ├─ native/            native bridge source and libraries
│  ├─ runtime/           runtime files prepared by setup-runtime
│  ├─ extension/         Visual Studio Code extension
│  ├─ api/               offline beginner guide and API reference
│  ├─ docs/              language, ABI, optimizer, and performance docs
│  └─ licenses/          third-party notices and licenses
├─ Projects/             runnable examples and project template
├─ CompilerTests/        compiler and runtime regression projects
├─ Benchmarks/           reproducible performance benchmarks
├─ setup-runtime.bat
├─ INSTALL_VSCODE_EXTENSION.bat
├─ build-all.bat
├─ check-all.bat
├─ new-project.bat
└─ open-api.bat
```

## Examples

The numbered projects progress from a blank window to rendering, audio, threads, networking, files, JSON, images, text, math, and UI.

Start with:

- [`00_glfw_window`](Projects/00_glfw_window): complete window and frame loop
- [`01_input_polling`](Projects/01_input_polling): keyboard and mouse input
- [`02_opengl_triangle`](Projects/02_opengl_triangle): first OpenGL draw call
- [`03_indexed_cube_depth`](Projects/03_indexed_cube_depth): indexed 3D geometry
- [`14_full_game_loop`](Projects/14_full_game_loop): rendering, input, and audio together
- [`18_native_threads`](Projects/18_native_threads): real OS threads and atomics
- [`21_file_io`](Projects/21_file_io): text and binary files
- [`22_json`](Projects/22_json): parsing and writing JSON
- [`24_image_loading`](Projects/24_image_loading): image decoding and texture upload
- [`25_sdf_text`](Projects/25_sdf_text): FreeType SDF text
- [`27_glm_camera`](Projects/27_glm_camera): vectors, matrices, transforms, and cameras
- [`28_lazyui_inline`](Projects/28_lazyui_inline): retained UI and scrolling
- [`29_lazyui_controls_gallery`](Projects/29_lazyui_controls_gallery): editable controls
- [`32_lazyui_runtime_hud`](Projects/32_lazyui_runtime_hud): runtime HUD layout

See [`Projects/README.md`](Projects/README.md) for the complete list.

## Documentation

- [Language reference](LazyScript/docs/LANGUAGE.md)
- [Foreign ABI](LazyScript/docs/C_ABI.md)
- [Optimizer](LazyScript/docs/OPTIMIZER.md)
- [Performance and benchmarks](LazyScript/docs/PERFORMANCE.md)
- [Example projects](Projects/README.md)
- [GLFW binding](LazyScript/bindings/GLFW/README.md)
- [OpenGL binding](LazyScript/bindings/OpenGL/README.md)
- [OpenAL binding](LazyScript/bindings/OpenAL/README.md)
- [GLM math](LazyScript/bindings/Math/README.md)
- [Files, logs, and threading](LazyScript/bindings/System/README.md)
- [Networking](LazyScript/bindings/Network/README.md)
- [Images and textures](LazyScript/bindings/Graphics/README.md)
- [FreeType and fonts](LazyScript/bindings/Text/README.md)
- [LazyUI, LSHTML, and LSCSS](LazyScript/bindings/UI/README.md)

## Tests

Check every example project:

```bat
check-all.bat
```

Run compiler tests:

```bat
cd LazyScript\compiler
npm test
```

Run the benchmark suite from PowerShell:

```powershell
cd Benchmarks\near_c
.\run.ps1
```

Performance results describe specific measured workloads, not a promise that every program will outperform every native compiler. See [PERFORMANCE.md](LazyScript/docs/PERFORMANCE.md) for methodology and limitations.

## Contributing

Contributions are welcome. Keep public LSX examples inference-first:

- Use `fn name(args)` without ordinary parameter or return annotations.
- Use `name = value` for locals and object fields.
- Use dot access and dot method calls.
- Keep pointers and exact ABI types inside bindings or other low-level interop code.
- Add or update a regression test for compiler changes.
- Run `check-all.bat` and the compiler test suite before submitting changes.
- Document public behavior with a practical example.

## License

LazyScriptEX is released under the [MIT License](LICENSE).

Bundled third-party components are covered by their own licenses and notices under [`LazyScript/licenses`](LazyScript/licenses) and [`LazyScript/runtime`](LazyScript/runtime).
