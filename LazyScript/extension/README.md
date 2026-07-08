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
- Completion for local symbols, imports, modules, objects, fields, methods, constants, LSHTML tags, attributes, and LSCSS properties
- Rich hover explanations with practical LSX examples
- Go to Definition
- Find References
- Rename Symbol
- Signature Help
- Document Symbols
- Workspace Symbols
- Recursive `.lsx` indexing across workspace folders
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

Default shortcuts:

| Shortcut | Action |
|---|---|
| `F6` | Build the current project |
| `Ctrl+F6` | Build and run |
| `Ctrl+Shift+F6` | Check the current file or project |
| `Ctrl+Alt+R` | Refresh the recursive symbol index |

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

## Workspace discovery

The recommended workspace layout is:

```text
LazyScriptEX/
├─ LazyScript/
└─ Projects/
```

When a project is opened separately, set `lazyscriptex.lazyScriptRoot` to the repository root or the `LazyScript` folder.

## Settings

| Setting | Purpose |
|---|---|
| `lazyscriptex.compilerPath` | Optional absolute path to `lazyscriptex.js` |
| `lazyscriptex.lazyScriptRoot` | Optional repository or `LazyScript` root |
| `lazyscriptex.apiPath` | Optional path to the offline API `index.html` |
| `lazyscriptex.checkOnType` | Check after a typing delay |
| `lazyscriptex.checkOnSave` | Check when an LSX file is saved |
| `lazyscriptex.checkDelay` | Delay before type-time diagnostics |
| `lazyscriptex.recursiveIndex` | Index LSX files recursively |
| `lazyscriptex.exclude` | Glob excluded from indexing |

## Testing the extension

From `LazyScript/extension`:

```bat
npm test
```

## License

The extension is released under the MIT License.
