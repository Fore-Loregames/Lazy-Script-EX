# LazyScriptEX for Visual Studio Code

The LazyScriptEX extension provides editing, navigation, diagnostics, build, run, and offline API support for `.lsx` files.

## Installation

From the LazyScriptEX repository root, run:

```bat
INSTALL_VSCODE_EXTENSION.bat
```

Restart Visual Studio Code afterward and open the complete repository root for automatic compiler, binding, project, and API discovery.

You may also install the bundled `.vsix` manually through:

```text
Extensions → ... → Install from VSIX
```

Do not open the `.vsix` with Microsoft Visual Studio's VSIX installer. This extension is for Visual Studio Code.

## Features

- Completion replaces the currently typed member fragment or highlighted selection instead of inserting duplicate text.

- Syntax highlighting for LSX, LSHTML, and LSCSS
- Dedicated LSX file icon in the Explorer, tabs, search results, and other language-aware views
- Compiler diagnostics while typing and on save
- Exact error ranges in the Problems panel
- Beginner-oriented hints for common compiler errors
- Scope-aware completion for function parameters, local variables, loop variables, `self`, object fields, `GetTypeName()`, `IsType(...)`, inferred growable-table methods, imports, real folders and `.lsx` filenames inside `use` paths, modules, methods, constants, LSHTML tags, attributes, and LSCSS properties
- Built-in document formatting for LSX constructors, object methods, control flow, multiline calls, LSHTML, and LSCSS
- Rich hover explanations with practical LSX examples
- Go to Definition
- Find References
- Rename Symbol
- Signature Help
- Document Symbols
- Workspace Symbols
- Recursive `.lsx` indexing across workspace folders, the selected LazyScript installation, and every configured module root
- Build, run, check, project creation, and offline API commands
- Persistent run terminals that keep program output and exit codes visible

## Commands

Open the Command Palette and search for `LazyScriptEX`:

- `LazyScriptEX: Build Project`
- `LazyScriptEX: Build and Run Project`
- `LazyScriptEX: Check Current File`
- `LazyScriptEX: Refresh Recursive Index`
- `LazyScriptEX: Open Offline API`
- `LazyScriptEX: Create Project from Template`
- `LazyScriptEX: Show Output`
- `LazyScriptEX: Explain Symbol Under Cursor`
- `LazyScriptEX: Select LazyScript/API Folder`
- `LazyScriptEX: Select Offline API Page`
- `LazyScriptEX: Format Document`

Default shortcuts:

| Shortcut | Action |
|---|---|
| `F6` | Build the current project |
| `Ctrl+F6` | Build and run |
| `Ctrl+Shift+F6` | Check the current file or project |
| `Ctrl+Alt+R` | Refresh the recursive symbol index |

## Local completion and formatting

The extension provides scope-aware completion for function parameters, `local` variables, loop variables, `self`, and the fields and methods on the current object. It automatically opens the suggestion list while you type inside a function, so values such as `width`, `height`, `window`, and `framebuffer` appear without switching files or manually pressing `Ctrl+Space`. Values from unrelated functions do not leak into the current list.

Compiler diagnostics now use the containing `lazyscriptex.json` whenever the edited file belongs to a project. This lets call-site inference see all mapped modules instead of incorrectly checking a shared Engine file in isolation. Untyped parameters and growable-table loop variables can therefore resolve members from their inferred common base, such as `behavior.Start()`, `behavior.Update()`, and `behavior.Draw()`.

Inherited object values also expose `GetTypeName()` and `IsType(...)`. The compiler keeps these checks compact: names are shared static strings, literal type checks become integer type-ID comparisons, and no reflection object is allocated.

The extension is registered as the default formatter for `.lsx` files. **Format Document** (`Shift+Alt+F`), **Format Selection**, format-on-type indentation, and format-on-save are supported. The formatter corrects indentation for functions, static objects, `if`/`elseif`/`else`, loops, multiline calls, LSHTML tags, and LSCSS blocks. It also normalizes assignment/comparison spacing and spaces after commas without changing strings, comments, or HTML attributes.

Formatting on save is enabled for LSX by default. To disable it only for LSX in a workspace:

```json
"[lazyscriptex]": {
    "editor.formatOnSave": false
}
```

Automatic local suggestions can be changed with `lazyscriptex.completion.autoTrigger` and `lazyscriptex.completion.autoTriggerDelay`.

### Growable-table methods

The compiler gives inferred growable tables their methods directly, so those methods do not appear as declarations in the source file. The extension now recognizes both local tables and object fields initialized with `{}`:

```lsx
export const GameObject = {
    lazyBehaviors = {}

    AddLazyBehavior = fn(behavior)
        self.lazyBehaviors.push(behavior)
    end
}
```

After typing `self.lazyBehaviors.` or `values.`, IntelliSense shows:

- `push(value)`
- `get(index)`
- `length()`
- `remove(index)`
- `remove_fast(index)`
- `clear()`
- `byte_length()`
- `destroy()`

Each item includes a beginner explanation, a usage example, parameter snippets, hover information, and signature help. The same completion works for table fields reached through imported modules.

## Diagnostics

The extension runs the same compiler used by command-line builds. Errors include an LSX code, source location, exact underline range, and a practical hint when one is available.

```text
LazyScriptEX error [LSX1200]: Game/main.lsx:18:21: unknown field 'positon'

18 | player.positon.x = 10.0
   |        ^^^^^^^^

Hint: Did you mean 'position'?
```

Diagnostics run after a short typing delay and whenever an LSX file is saved. Both behaviors can be changed in VS Code settings.

## API hovers and completions

The extension includes documentation for the language, built-in functions, bundled LSX modules, and wrapped third-party APIs.

Hover information explains:

- what a symbol represents;
- when it is useful;
- how to create or obtain it;
- important parameters and return values;
- ownership and cleanup requirements;
- common mistakes;
- a practical LSX example.

The offline reference opens on a Front-end API containing normal LSX, inheritance, high-level modules, LSHTML, LSCSS, document lookup, and events. Raw functions, native constants, fixed-layout fields, ABI details, and internal renderer/compiler records live in a separate Backend tab.

## LSHTML and LSCSS

The extension highlights and indexes `lshtml` and `lscss` declarations inside `.lsx` files.

It provides help for:

- tags, IDs, classes, props, and components;
- text and attribute expressions;
- click, input, change, focus, keyboard, pointer, and scroll events;
- flex and grid layout;
- overflow and scrollbars;
- editable controls and textareas;
- hover, focus, and active styles;
- retained canvas elements;
- images, lists, tables, trees, overlays, and HUD layouts.

Use the LazyUI Start Here section for copy-ready LSHTML/LSCSS, `document.find()`, runtime listeners, element updates, IDs, and classes. The full element, event, attribute, and style lists remain searchable after those workflows.

## Imports and workspace discovery

Projects do not need to remain beside the language toolkit. Run:

```text
LazyScriptEX: Select LazyScript/API Folder
```

Select any of these:

- the `LazyScript` folder;
- `LazyScript/api`;
- the toolkit folder containing `LazyScript`.

The extension stores the normalized location in workspace settings and passes it to the compiler automatically. The same selection controls `@LazyScript` imports, recursive API indexing, hovers, Go to Definition, import-path completion, and the offline API command.

While typing inside a `use` path, completion lists real folders and `.lsx` files:

```lsx
use "@LazyScript/bindings/Math/GLM.lsx" as GLM
use "../Window/WindowManager.lsx" as WindowManager
```

Choosing a folder retriggers completion for the next path segment. Go to Definition on the quoted path opens the target file.

Additional shared roots may be configured in `lazyscriptex.json`:

```json
{
  "entry": "main.lsx",
  "moduleRoots": {
    "Engine": "../Engine",
    "Shared": "../Shared"
  }
}
```

Then imports can use `@Engine/...` or `@Shared/...` from any source depth. Shared files outside an executable folder are still checked directly because the extension passes associated roots to the compiler.


### Current-scope and imported-module completion

Completion follows the expression being typed instead of mixing every known symbol together:

```lsx
use "@Engine/Window/WindowManager.lsx" as WindowManagerMod

WindowManagerMod.                 -- shows only exports from WindowManager.lsx
WindowManagerMod.WindowManager.   -- shows only fields and methods on WindowManager
```

Without a dotted qualifier, completion shows variables visible in the current function or block, including parameters, locals, loop variables, `self`, and current-object members. After an imported module or exported object qualifier, unrelated current-file variables are excluded. Qualifier matching is case-insensitive for suggestions and accepting a completion restores the declared symbol casing.

## Settings

| Setting | Purpose |
|---|---|
| `lazyscriptex.compilerPath` | Optional absolute path to `lazyscriptex.js` |
| `lazyscriptex.lazyScriptRoot` | Selected `LazyScript`, `api`, or toolkit location used by imports and diagnostics |
| `lazyscriptex.apiPath` | Optional path to the offline API `index.html`; normally set by the folder selector |
| `lazyscriptex.checkOnType` | Check after a typing delay |
| `lazyscriptex.checkOnSave` | Check when an LSX file is saved |
| `lazyscriptex.checkDelay` | Delay before type-time diagnostics |
| `lazyscriptex.moduleRoots` | Extra `@Name` roots available to IntelliSense and compiler checks |
| `lazyscriptex.recursiveIndex` | Recursively index workspace, LazyScript, and configured roots |
| `lazyscriptex.exclude` | Glob excluded from indexing |
| `lazyscriptex.format.enable` | Enables document, selection, on-type, and save formatting |
| `lazyscriptex.completion.autoTrigger` | Automatically opens scope-aware IntelliSense while typing |
| `lazyscriptex.completion.autoTriggerDelay` | Delay before the scope-aware suggestion list opens |

## Testing the extension

From `LazyScript/extension`:

```bat
npm test
```

## License

The extension is released under the MIT License.

## Object constructors

Closed LSX objects can declare inferred constructors and receive creation arguments through `.new(...)`:

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

Derived constructors may call `base.constructor(...)` as their first statement when the base constructor requires arguments. Parameterless base constructors run automatically before the derived constructor body. Constructor parameters, fields, and return use normal LSX inference; constructors themselves return no value.

Object-table methods may also use a brace-delimited body when that reads better beside the surrounding object table:

```lsx
const Transform : base(Engine.LazyBehavior) = {
    constructor = fn(){
        self.lazyVars = {
            position = {0, 0, 0}
            rotation = {0, 0, 0}
            scale = {1, 1, 1}
        }
    }
}
```

The normal `fn(...) ... end` form remains fully supported. When an exported base object defines an inferred empty placeholder such as `lazyVars = {}`, each derived object may establish its own concrete inherited shape in its constructor without changing the field shape of unrelated derived objects.

## Static service objects

Use `static const` for managers and services that must exist exactly once:

```lsx
export static const WindowManager = {
    windowHandle = 0

    CreateWindow = fn(width, height, title)
        self.windowHandle = GLFW.glfwCreateWindow(width, height, title, 0, 0)
        return self.windowHandle
    end
}
```

Imported static objects are called directly through the module export:

```lsx
use "@Engine/Window/WindowManager.lsx" as WindowManagerMod

WindowManagerMod.WindowManager.CreateWindow(1920, 1080, "LazyEngine")
local window = WindowManagerMod.WindowManager.windowHandle
```

A static object is initialized once before `main()`. A zero-argument `constructor = fn()` may prepare its shared state automatically. `self` points to that one persistent object. Do not call `.new()` or `constructor()` on it; provide an explicit shutdown method for native resources.

## 0.18.18 beginner-first API split

The bundled offline API now has separate Front-end API and Backend tabs. The front-end view contains the LSX language, a complete inheritance section, high-level wrappers, beginner-readable LazyUI workflows, and a separate programmatic-elements section for retained controls created from normal LSX. Internal fields such as `property_hash`, raw ABI calls, fixed native layouts, and renderer/compiler plumbing are kept in the Backend tab. Front-end call shapes hide explicit ABI types and use copy-ready inferred LSX examples.

## 0.18.17 circular object reference fix

The bundled compiler now supports direct circular engine graphs without reverse imports. Inferred object identities can cross module boundaries internally, `.new()`/`.clone()`/object-literal fields remain owned, and assignments from existing objects become borrowed aliases. Automatic cloning and destruction skip borrowed back-references with no runtime reference count or ownership branch.

## 0.18.16 autocomplete replacement fix

LSX completion items now use the same explicit replacement range for both VS Code insert and replace modes. Partial names and highlighted text are replaced instead of appended, reverse-direction selections are supported, and completing a method before an existing `(` no longer inserts duplicate call parentheses.
