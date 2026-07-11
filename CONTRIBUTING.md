# Contributing

## Source rules

- Keep normal LSX examples inference-first. Do not add explicit front-end type annotations unless the code is an internal binding or ABI declaration.
- Use dot field and dot method access. Do not introduce colon method syntax.
- Keep native pointers, packed layouts, descriptor details, and backend plumbing inside bindings/compiler/runtime code.
- Add public graphics behavior through LSG/LSSL before exposing raw OpenGL or Vulkan calls to ordinary projects.
- Update the offline API and extension metadata whenever a public declaration changes.

## Validation

Run from the repository root:

```bat
update-api.bat
package-extension.bat
check-all.bat
test-all.bat
```

Generated `build`, `out`, `dist`, cache, and dependency folders are ignored and should not be committed.

## API generation

The API is generated from current LSX bindings, `LSG.lsx`, `LSSL.lsx`, compiler language metadata, LSHTML tags/attributes/events, and LSCSS properties.

```bat
update-api.bat
```

This regenerates `LazyScript/api`, synchronizes `LazyScript/extension/api`, and runs the beginner/backend API validator.

## VS Code package

After changing extension code, syntax metadata, snippets, compiler copies, or API files, rebuild the installable package:

```bat
package-extension.bat
```

The script verifies that the VSIX manifest version matches `LazyScript/extension/package.json` and writes `LazyScriptEX-Native-GameKit.vsix` at the repository root.
