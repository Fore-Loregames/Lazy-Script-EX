# OpenGL binding

`OpenGL46.lsx` contains OpenGL 4.6 plus all extension commands and constants generated from the Khronos-derived GLAD 4.6 registry header.

After GLFW creates a context and `glfwMakeContextCurrent` is called, call `lsxLoadOpenGL()`. Each exported command then forwards directly to the function pointer returned by GLFW. Unsupported extension commands safely return zero or do nothing.

Because LazyScriptEX currently exposes `f32` rather than a native `f64` type, scalar `GLdouble` arguments and results are converted at the binding boundary. Pointer-based double arrays remain raw pointers.

`TextureUpload.lsx` packs the nine `glTexImage2D` arguments into a fixed-layout object and performs the native call through `LSXGLABI.dll`.
