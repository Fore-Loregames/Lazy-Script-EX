# OpenAL binding

The binding includes OpenAL 1.1, ALC 1.1, capture, and the standard EFX object APIs. Calls forward to `OpenAL32.dll` from OpenAL Soft. No additional mixer or scene layer is added on top.

Call `lsxLoadLibraries()` through the GLFW module first. `lsxHasOpenAL()` reports whether the runtime was loaded.
