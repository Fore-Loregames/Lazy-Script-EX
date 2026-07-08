# GLFW binding

This is the complete non-Vulkan GLFW 3.4 API. The binding DLL does not create, size, poll, or destroy windows itself. Every call is forwarded to the official `glfw3.dll` runtime.

Call `lsxLoadLibraries()` once, then use the normal GLFW lifecycle: `glfwInit`, hints, `glfwCreateWindow`, `glfwMakeContextCurrent`, polling, swap, destroy, terminate.

Scalar `double` values are converted to LSX `f32`. `glfwGetCursorPos` writes two `f32` values for the same reason. Callback setters accept raw native function pointers; LSX-only projects can use polling APIs directly.
