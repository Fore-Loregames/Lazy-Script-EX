# LazyScriptEX for Visual Studio Code

The LazyScriptEX extension provides language support for `.lsx` and `.lssl` files, including the current OpenGL/Vulkan LSG and LSSL APIs.

## Installation

From the repository root run:

```bat
INSTALL_VSCODE_EXTENSION.bat
```

Restart or reload Visual Studio Code afterward.

The bundled package may also be installed manually with:

```text
Extensions → ... → Install from VSIX
```

## Features

- LSX, LSSL, LSHTML, and LSCSS syntax highlighting
- File icons for LSX source
- Compiler diagnostics while typing and on save
- Scope-aware completion for locals, parameters, loop variables, object members, modules, tables, LSG, LSSL, LazyUI, LSHTML, and LSCSS
- Hover documentation and copy-ready examples from the generated API
- Signature help
- Go to Definition, Find References, Rename Symbol, Document Symbols, and Workspace Symbols
- Import-path completion for `.lsx` and `.lssl` files
- Project-aware build, run, check, and project creation commands
- LSX formatting and indentation
- Offline Front-end and Backend API views
- Current canonical LSG names such as `window.begin()`, `window.end()`, `window.activate()`, `window.set_vsync()`, and `mesh.draw_instances()`
- OpenGL and Vulkan shader/runtime metadata, including LSSL compute and modular ray features

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

## Toolkit discovery

When a project is outside this repository, run:

```text
LazyScriptEX: Select LazyScript/API Folder
```

Select the `LazyScript` directory, `LazyScript/api`, or the repository root. The extension then uses that installation for `@LazyScript` imports, diagnostics, completion, hovers, signatures, and the offline API.

## API synchronization

From the repository root:

```bat
update-api.bat
```

This regenerates the API from current source declarations and copies it into the extension source before validating the result.

Rebuild the installable package from the repository root with:

```bat
package-extension.bat
```
