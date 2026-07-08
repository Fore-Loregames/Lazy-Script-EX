# GLM math binding

`GLM.lsx` is the public LSX-first wrapper around GLM 1.0.2. It exposes typed vectors, matrices, quaternions, dual quaternions, transforms, projection builders, project/unproject, decomposition, and camera-oriented helpers without exposing C++ or raw native pointers.

```lsx
use "@LazyScript/bindings/Math/GLM.lsx" as GLM
use "@LazyScript/bindings/Math/Camera.lsx" as Camera

local camera=Camera.create()
camera.set_perspective(60.0,16.0/9.0,0.1,1000.0)
local viewProjection=camera.view_projection()
```

Matrices use GLM/OpenGL column-major order. `Math/OpenGL.lsx` uploads them directly to GLSL uniforms.
