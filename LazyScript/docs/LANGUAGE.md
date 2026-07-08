# LazyScriptEX language reference

LazyScriptEX compiles `.lsx` source directly to native Windows x64 machine code. Ordinary LSX code uses compile-time inference. Exact type annotations are reserved for low-level foreign ABI declarations where the compiler must match a native binary signature.

This document describes the public language syntax used by applications and libraries.

## Source files and entry point

An LSX project starts from the file named by `entry` in `lazyscriptex.json`. A runnable program provides `main()`:

```lsx
fn main()
    return 0
end
```

`main()` returns the process exit code. `0` means success.

## Comments

```lsx
-- This is a line comment.
```

## Values and inference

```lsx
local title = "LazyScriptEX"
local lives = 3
local speed = 4.0
local enabled = true
local selected = null
```

The compiler infers storage from initial values and later use. Normal LSX code does not need explicit annotations for locals, parameters, object fields, or return values.

## Local values

Declare a local value with `local`:

```lsx
local score = 0
score = score + 10
```

## Constants and object definitions

Use `const` for module-level values and object definitions:

```lsx
const Player = {
    name = "Player"
    health = 100
    speed = 4.0
}
```

A named-field table has a fixed native layout. Create an owned instance with `.new()`:

```lsx
local player = Player.new()
player.health = player.health - 10
player.destroy()
```

## Functions

```lsx
fn add(left, right)
    return left + right
end
```

Parameter and return storage is inferred from call sites, operators, fields, forwarded values, and return expressions. When every call passes related derived objects, LSX widens the parameter to their nearest common base so members declared on that base remain available without explicit annotations.

```lsx
const LazyBehavior = {
    Start = fn()
    end
}

const Transform : base(LazyBehavior) = {}
const Spinner : base(LazyBehavior) = {}

const GameObject = {
    AddLazyBehavior = fn(behavior)
        behavior.Start()
    end
}
```

Calls that pass both `Transform` and `Spinner` infer `behavior` as `LazyBehavior`. This is compile-time common-base inference; inheritance method dispatch remains direct rather than virtual.

```lsx
fn main()
    local total = add(20, 22)
    return 0
end
```

Functions may be referenced before their definitions. A separate forward declaration is not required.

## Function values inside objects

```lsx
const Counter = {
    value = 0

    increase = fn(amount)
        self.value = self.value + amount
    end
}
```

`self` refers to the receiving object:

```lsx
local counter = Counter.new()
counter.increase(5)
console.write_line(counter.value)
counter.destroy()
```

Member and method access always use dot syntax.

## Return and early return

```lsx
fn divide(left, right)
    if right == 0 then return 0 end
    return left / right
end
```

A function may return early from any branch.

## Conditions

```lsx
if health <= 0 then
    state = "dead"
elseif health < 25 then
    state = "hurt"
else
    state = "ready"
end
```

Supported logical and comparison operators include:

```text
==  ~=  <  <=  >  >=
and  or  not
```

Arithmetic operators include:

```text
+  -  *  /  %
```

## While loops

```lsx
local index = 0

while index < 10 do
    console.write_line(index)
    index = index + 1
end
```

Use `break` to leave a loop:

```lsx
while true do
    if finished then break end
end
```

## For loops

A growable table can be iterated directly:

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

An initially empty growable table also learns a common inherited element type from `push(...)` calls. The variable introduced by `for value in table do` receives that inferred element type, so base members are available inside the loop:

```lsx
const GameObject = {
    lazyBehaviors = {}

    AddLazyBehavior = fn(behavior)
        self.lazyBehaviors.push(behavior)
        behavior.Start()
    end

    Update = fn()
        for behavior in self.lazyBehaviors do
            behavior.Update()
        end
    end
}
```

## Object tables

Named fields create an object shape:

```lsx
const Transform = {
    x = 0.0
    y = 0.0
    z = 0.0

    translate = fn(x, y, z)
        self.x = self.x + x
        self.y = self.y + y
        self.z = self.z + z
    end
}
```

Create, clone, and destroy instances:

```lsx
local transform = Transform.new()
local copy = transform.clone()

transform.translate(1.0, 2.0, 3.0)

copy.destroy()
transform.destroy()
```

Objects use fixed field offsets and direct method calls. LSX does not require a garbage collector, runtime reflection table, or prototype chain.

## Constructors

Add a `constructor` function when an object needs initialization arguments or setup code. Calling `.new(...)` allocates the object, applies its field defaults, and then calls the constructor with the supplied values:

```lsx
const Transform = {
    position = null
    rotation = null
    scale = null

    constructor = fn(position, rotation, scale)
        self.position = position
        self.rotation = rotation
        self.scale = scale
    end
}

local transform = Transform.new(
    {0, 0, 0},
    {0, 0, 0},
    {1, 1, 1}
)
```

Constructor parameters and stored field representations are inferred normally. Constructors do not return a value and are not called manually through an instance. Use `Object.new(...)` to construct an object.

When inheritance is involved:

- if the derived object does not declare a constructor, it uses the inherited constructor;
- if the derived constructor has a parameterless base constructor, LSX calls that base constructor automatically before the derived body;
- if the base constructor needs arguments, put `base.constructor(...)` as the first statement in the derived constructor;
- all field defaults for the full inherited object are applied before constructor code runs.

```lsx
const LazyBehavior = {
    parent = null
    lazyVars = {}

    constructor = fn(parent)
        self.parent = parent
    end
}

const Transform : base(LazyBehavior) = {
    constructor = fn(parent, position, rotation, scale)
        base.constructor(parent)
        self.lazyVars = {
            position = position
            rotation = rotation
            scale = scale
        }
    end
}

local transform = Transform.new(
    owner,
    {0, 0, 0},
    {0, 0, 0},
    {1, 1, 1}
)
```

A zero-argument constructor on a `static const` object runs once before `main()`. Static constructors cannot accept arguments because static objects are not created with `.new()`.

For copying, prefer `object.clone()`. The older `Object.new(existing)` copy form remains available only for object definitions that do not declare a constructor.

## Compile-time inheritance

A closed object can inherit from one base object:

```lsx
const Actor = {
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

Inheritance is resolved at compile time:

- inherited fields remain a fixed prefix of the derived layout;
- derived fields are appended;
- a same-named method overrides the base method;
- `base.method(...)` calls the immediate base implementation;
- circular inheritance is rejected;
- no runtime vtable or prototype walk is added.

## Tables and native storage

LSX uses `{}` for objects, growable collections, fixed positional values, and native numeric buffers. The compiler determines the representation from the literal and its use.

### Growable tables

```lsx
local values = {}
values.push(10)
values.push(20)
values.push(30)

local count = values.length()
local first = values.get(0)

values.remove(1)
values.destroy()
```

Common operations:

```text
push(value)
get(index)
length()
count()
capacity()
reserve(capacity)
resize(count)
remove(index)
remove_fast(index)
pop()
last()
is_empty()
clear()
destroy()
```

### Fixed positional values

```lsx
local position = {10.0, 20.0, 30.0}
position.x = 12.0
position.y = 24.0
position.z = 36.0
```

The first four positions can be accessed through:

```text
x y z w
r g b a
```

Useful operations include:

```lsx
local count = position.length()
local bytes = position.byte_length()
local pointer = position.data()
position.destroy()
```

### Flat numeric buffers

Numeric tables can be passed directly to native APIs:

```lsx
local vertices = {
    -0.75, -0.65, 1.0, 0.2, 0.15,
     0.75, -0.65, 0.15, 0.8, 0.25,
     0.0,   0.75, 0.2, 0.35, 1.0
}

local indices = {0, 1, 2}

GL.glBufferData(GL.GL_ARRAY_BUFFER, vertices.byte_length(), vertices, GL.GL_STATIC_DRAW)
GL.glBufferData(GL.GL_ELEMENT_ARRAY_BUFFER, indices.byte_length(), indices, GL.GL_STATIC_DRAW)
```

Decimal literals infer packed floating storage. Non-negative integer literals that fit in 32 bits infer packed unsigned integer storage. Generated buffers can begin as `{}` and establish their layout through writes, `push`, assignment, function calls, or native-call context.

### Byte buffers

Raw file, image, font, and network payloads can use byte-oriented operations:

```lsx
local bytes = {}
bytes.resize_bytes(byte_count)
bytes.copy_bytes_from_ptr(source, byte_count)
local pointer = bytes.byte_data()
bytes.destroy()
```

Low-level memory operations are available for interop, but ordinary LSX code should prefer tables and wrapper APIs.

## Strings

Normal strings support escapes:

```lsx
local message = "Line one\nLine two"
```

Backtick strings preserve quotes and newlines:

```lsx
local json_text = `{"name":"LazyScriptEX","enabled":true}`

local shader = `#version 460 core
void main() {
}`
```

Raw strings do not process backslash escapes.

String helpers include length, byte access, comparison, and UTF-8 conversion through the built-in `string` namespace.

## Null values

Use `null` when an object or result may be absent:

```lsx
local selected = null

if selected ~= null then
    console.write_line(selected.name)
end
```

The compiler tracks how the value is later assigned and used.


## Static objects

A normal object table is a reusable object definition. Create independent instances with `.new()` when each object needs separate state.

A **static object** is different: the compiler creates exactly one persistent object, initializes its fields once before `main()`, and keeps that shared state for the lifetime of the program. Static objects are intended for systems such as a window manager, renderer service, input service, application state, or global asset registry.

```lsx
export static const WindowManager = {
    windowSizeX = 1920
    windowSizeY = 1080
    windowHandle = 0
    title = ""

    CreateWindow = fn(width, height, windowTitle)
        self.windowSizeX = width
        self.windowSizeY = height
        self.title = windowTitle
        self.windowHandle = GLFW.glfwCreateWindow(width, height, windowTitle, 0, 0)
        return self.windowHandle
    end
}
```

A zero-argument static constructor can prepare shared state. It runs automatically once after field defaults and before `main()`:

```lsx
export static const AppState = {
    ready = false

    constructor = fn()
        self.ready = true
    end
}
```

Static constructors cannot accept arguments and cannot be called manually.

Import and use the exported static object directly:

```lsx
use "@Engine/Window/WindowManager.lsx" as WindowManagerMod

fn main()
    local window = WindowManagerMod.WindowManager.CreateWindow(1920, 1080, "LazyEngine")
    return 0
end
```

Rules:

- Write `static const`, usually with `export` when another module needs it.
- Use `self.field` and `self.Method()` inside its methods.
- Call methods directly through the static object.
- Read or write shared fields directly when appropriate.
- Do not call `.new()` or `constructor()`; a static object already exists and its constructor runs automatically.
- Add an explicit `Shutdown` method for native handles and resources.
- Static state is shared by every caller. Protect writable state with synchronization when multiple threads can access it.

## Modules, imports, and source roots

LSX can import files from any folder depth. A relative import starts from the file containing the `use` statement, while a named import starts from a configured module root.

### Relative imports

Use `./` for the current source folder and `../` to move up one folder:

```lsx
use "./CameraController.lsx" as CameraController
use "../Input/InputManager.lsx" as Input

fn main()
    Input.update()
    CameraController.update()
    return 0
end
```

The path is **not** calculated from the executable, VS Code workspace, or project entry file. It is calculated from the `.lsx` file that contains the import.

### Named module roots

Named roots remove long chains of `../` segments:

```lsx
use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@Engine/Window/WindowManager.lsx" as WindowManager
```

`@LazyScript` represents the selected LazyScript installation folder. Additional names such as `@Engine` or `@Shared` come from `moduleRoots`.

In VS Code, run:

```text
LazyScriptEX: Select LazyScript/API Folder
```

Select the `LazyScript` folder, its `api` folder, or the toolkit folder containing `LazyScript`. The extension then uses that location for:

- `@LazyScript` imports;
- compiler checks and builds;
- recursive IntelliSense indexing;
- API opening and hovers;
- import-path autocomplete.

This means a project can be stored anywhere on disk or several folders deeper than the language toolkit.

### Import-path autocomplete

Start typing inside the quotes:

```lsx
use "@LazyScript/
```

VS Code lists real child folders and `.lsx` files. Choosing a folder immediately opens completion for the next level. The same completion works with relative paths:

```lsx
use "../
```

Go to Definition on the path opens the imported file.

### Module aliases

The name after `as` is the local module alias:

```lsx
use "@LazyScript/bindings/Math/GLM.lsx" as GLM

local position = GLM.vec3(1.0, 2.0, 3.0)
```

Type `GLM.` to browse the module's exported API.

### Exporting public declarations

Only declarations marked with `export` are visible through another file's alias:

```lsx
export const WindowSettings = {
    width = 1280
    height = 720
}

export fn create_window(title)
    return 0
end
```

Private helper functions can omit `export`.

### Shared Engine, Editor, and Game folders

A shared source tree does not need to sit inside an executable project:

```text
LazyEngineLSX/
├─ Engine/
│  └─ Window/WindowManager.lsx
├─ Editor/
│  ├─ main.lsx
│  └─ lazyscriptex.json
└─ Game/
   ├─ main.lsx
   └─ lazyscriptex.json
```

Both executable projects can map the shared folder:

```json
{
  "entry": "main.lsx",
  "output": "build/Game.exe",
  "optimization": 6,
  "moduleRoots": {
    "Engine": "../Engine"
  }
}
```

Then either project can import:

```lsx
use "@Engine/Window/WindowManager.lsx" as WindowManager
```

The extension recursively indexes configured roots and passes them to the compiler even when the currently edited file is inside the shared `Engine` folder instead of beneath `Editor` or `Game`.

### Command-line roots

For one-off checks or projects opened outside VS Code, pass the LazyScript folder directly:

```bat
node LazyScript\compiler\lazyscriptex.js check Engine\Window\WindowManager.lsx --lazy-script-root C:\Tools\LazyScriptEX\LazyScript
```

Additional roots use `Name=Path`:

```bat
node LazyScript\compiler\lazyscriptex.js check Game\main.lsx --module-root Engine=C:\Projects\LazyEngineLSX\Engine
```

## Files

```lsx
use "@LazyScript/bindings/System/File.lsx" as File

fn main()
    File.write_text("message.txt", "Hello from LSX")
    local content = File.read_text("message.txt")
    console.write_line(content.text())
    content.destroy()
    return 0
end
```

See `Projects/21_file_io` for the complete API.

## JSON

```lsx
use "@LazyScript/bindings/Data/Json.lsx" as Json

fn main()
    local document = Json.load("settings.json")
    local value = document.get(document.root, "volume")
    local volume = document.as_f32(value)

    document.destroy()
    return 0
end
```

JSON data uses a compact native representation and integer node indices.

## Logging and crash records

Compiled programs write `LazyScriptEX-runtime.log` for process entry, clean return, and unhandled native exceptions.

Use the logging wrapper for detailed stages:

```lsx
use "@LazyScript/bindings/System/Log.lsx" as Log

fn main()
    local logger = Log.open_default()
    logger.stage("Loading settings")
    logger.success("Settings loaded")
    logger.close()
    return 0
end
```

Records are flushed before each logging call returns.

## Native threads

Named functions can be passed to native thread APIs:

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

Threads are real operating-system threads. Shared writable data must use appropriate synchronization.

## Sockets and HTTP

```lsx
use "@LazyScript/bindings/Network/Sockets.lsx" as Sockets
use "@LazyScript/bindings/Network/Http.lsx" as Http
```

The socket module wraps WinSock2 for TCP, UDP, DNS, polling, and nonblocking operation. The HTTP module wraps WinHTTP for HTTP and HTTPS requests.

Complete examples are available in `Projects/19_tcp_loopback` and `Projects/20_http_client`.

## GLM math and cameras

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

The public wrapper provides vectors, matrices, quaternions, dual quaternions, transforms, projection, interpolation, decomposition, project/unproject, and camera helpers without exposing C++ pointers.

## Images and textures

Use the graphics bindings for stb_image decoding and OpenGL texture upload:

```lsx
use "@LazyScript/bindings/Graphics/Texture2D.lsx" as Texture2D

local texture = Texture2D.load("Assets/image.png")
if texture.valid() then
    texture.bind(0)
end
texture.destroy()
```

See `Projects/24_image_loading` for a complete rendered example.

## Fonts and SDF text

The text bindings provide FreeType loading, SDF glyph rendering, atlas packing, and batched text geometry. See `Projects/25_sdf_text` and `bindings/Text/README.md`.

## LSHTML and LSCSS

LSHTML and LSCSS are first-class declarations inside `.lsx` files:

```lsx
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI

const WelcomeProps = {
    title = "Welcome"
    message = "Native UI written in LSX."
}

lscss .welcome-card = {
    width = "420px"
    padding = "24px"
    gap = "12px"
    background = "#111a29"
    border = "1px solid #2d4668"
    border_radius = "12px"
}

lshtml welcome_view(props) = {(
    <panel class="welcome-card">
        <h1>{props.title}</h1>
        <paragraph>{props.message}</paragraph>
        <button onclick={continue_clicked} context={props}>Continue</button>
    </panel>
)}

fn continue_clicked(element, event, props)
    props.message = "The button was pressed."
    return 0
end
```

The compiler lowers the markup and styles to retained native LSX UI objects. The UI does not require a browser, JavaScript runtime, DOM, or virtual DOM.

Normal LSX can retrieve retained LSHTML elements through the document:

```lsx
local continue_button = document.find("#continue")
local first_action = document.find(".action")
local first_button = document.find("button")
```

Bare tag lookup is ASCII case-insensitive and accepts LSHTML kebab-case or underscore aliases such as `status-bar` and `status_bar`. Use `find_all()` for every class or tag match. The returned collection owns only its list storage, so destroy the collection when finished; the document continues to own the elements.

```lsx
local actions = document.find_all(".action")
for action in actions do
    action.disabled = false
end
actions.destroy()
```

Runtime event listeners can then be attached from ordinary LSX instead of only through LSHTML attributes:

```lsx
fn continue_from_code(element,event,props)
    props.message = "The listener ran."
end

local continue_button = document.find("#continue")
if continue_button ~= null then
    continue_button.add_event_listener_with_context("click",continue_from_code,props)
end
```

`add_event_listener()` accepts a two-parameter handler. `add_event_listener_with_context()` passes an ordinary LSX object as the third callback parameter. Multiple listeners can share one event; use `remove_event_listener()` or `clear_event_listeners()` to detach them.

Supported features include:

- IDs and classes, including `document.find()` and `document.find_all()` access from normal LSX;
- LSX expressions inside text, attributes, and styles;
- reusable components;
- click, input, change, focus, keyboard, pointer, and scroll events through LSHTML attributes or runtime listeners;
- flex and grid layout;
- clipping and scrollable containers;
- editable text fields and textareas;
- toggles, checkboxes, radios, ranges, sliders, selects, and color controls;
- images, SDF text, canvas shapes, tables, trees, lists, overlays, and HUD layouts;
- state styling for hover, focus, and active states.

See `bindings/UI/README.md`, the offline API, and projects 28 through 32 for complete runnable programs.

## Compile-time binary embedding

`memory.embed_binary()` reads a file during compilation and embeds its exact bytes in the executable:

```lsx
local data = memory.embed_binary("Assets/data.bin")
if data == 0 then return 1 end

-- Pass data to a native API here.

memory.free(data)
```

The path must be a string literal and is resolved relative to the source module.

## Foreign ABI declarations

Ordinary LSX code uses inference. External native functions are different: their binary signature must be written exactly because it cannot be inferred from a DLL.

```lsx
extern "user32.dll" fn MessageBoxA(
    window: handle,
    text: string,
    title: string,
    flags: u32
) -> i32
```

This low-level declaration syntax belongs in bindings and interop modules. It is not required for normal application code.

See [C_ABI.md](C_ABI.md) for calling-convention details.

## Project configuration

A project uses `lazyscriptex.json`:

```json
{
  "entry": "main.lsx",
  "output": "build/MyProject.exe",
  "subsystem": "windows",
  "optimization": 6,
  "targetCpu": "baseline",
  "moduleRoots": {
    "Engine": "../Engine",
    "Shared": "../Shared"
  }
}
```

Important fields:

| Field | Purpose |
|---|---|
| `entry` | Main `.lsx` source file |
| `output` | Output executable path |
| `subsystem` | Console or Windows executable mode |
| `optimization` | Optimization level from 0 through 6 |
| `targetCpu` | `baseline`, `avx2`, or `avx2-fma` |
| `moduleRoots` | Maps `@Name/...` imports to folders. Paths are relative to this JSON file. |
| `runtimeFiles` | Extra files copied beside the executable |
| `nativeBindings` | Optional project-specific native binding definitions |

## Compiler commands

```bat
node LazyScript\compiler\lazyscriptex.js check path\to\main.lsx --lazy-script-root C:\Tools\LazyScriptEX\LazyScript
node LazyScript\compiler\lazyscriptex.js check-project path\to\project
node LazyScript\compiler\lazyscriptex.js build path\to\project --module-root Engine=C:\Projects\MyGame\Engine
```

Structured diagnostics:

```bat
node LazyScript\compiler\lazyscriptex.js check-project path\to\project --diagnostics=json
```

Build options:

```bat
node LazyScript\compiler\lazyscriptex.js build path\to\project --opt 6 --cpu avx2-fma
```

## Diagnostics

Errors include an LSX code, file, line, column, exact range, source underline, and targeted hints where available. The VS Code extension displays the same results while typing and on save.

## Further documentation

- Repository setup and complete first window: [`../../README.md`](../../README.md)
- Native ABI: [`C_ABI.md`](C_ABI.md)
- Optimizer: [`OPTIMIZER.md`](OPTIMIZER.md)
- Performance: [`PERFORMANCE.md`](PERFORMANCE.md)
- Example list: [`../../Projects/README.md`](../../Projects/README.md)
- Offline beginner API: run `open-api.bat` from the repository root
