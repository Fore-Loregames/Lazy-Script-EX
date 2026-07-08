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

- Syntax highlighting for LSX, LSHTML, and LSCSS
- Compiler diagnostics while typing and on save
- Exact error ranges in the Problems panel
- Beginner-oriented hints for common compiler errors
- Scope-aware completion for function parameters, local variables, loop variables, `self`, object fields, imports, real folders and `.lsx` filenames inside `use` paths, modules, methods, constants, LSHTML tags, attributes, and LSCSS properties
- Built-in document formatting for LSX, object methods, control flow, multiline calls, LSHTML, and LSCSS
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

Completion follows the active LSX scope. Inside a function or object method, IntelliSense includes:

- inferred function parameters such as `width`, `height`, and `title`;
- `local` variables declared before the cursor;
- `for ... in` loop variables;
- `self` inside object methods;
- object fields and methods after typing `self.`;
- members inferred from locally created objects.

Use **Format Document** from the Command Palette or press VS Code's normal format shortcut, `Shift+Alt+F`. The formatter corrects indentation for functions, objects, `if`/`elseif`/`else`, loops, multiline calls, LSHTML tags, and LSCSS blocks. It also adds readable spaces after commas without changing strings or comments.

To format whenever you save, enable VS Code's standard setting:

```json
{
  "[lazyscriptex]": {
    "editor.defaultFormatter": "nissyokugames.lazyscriptex-native-gamekit",
    "editor.formatOnSave": true
  }
}
```

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

Internal records are marked as internal and direct users toward the public wrapper that creates or consumes them.

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

Use the offline API for complete runnable UI examples.

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
| `lazyscriptex.format.enable` | Enables the built-in LSX document formatter |

## Testing the extension

From `LazyScript/extension`:

```bat
npm test
```

## License

The extension is released under the MIT License.
