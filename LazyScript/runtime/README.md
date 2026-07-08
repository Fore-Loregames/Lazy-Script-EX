# Native runtime files

Run the runtime setup from the repository root:

```bat
setup-runtime.bat
```

The setup prepares the native libraries used by the bundled bindings and examples, including GLFW and OpenAL Soft.

Additional native libraries used by image, font, math, and ABI helpers are stored under `LazyScript/native` and copied beside an executable only when the project imports the related module.

Normal projects should not copy DLLs manually. Build through the project `build.bat` or the LSX compiler so imported runtime files are staged automatically.

Third-party licenses and notices are stored under `LazyScript/licenses` and this runtime folder.
