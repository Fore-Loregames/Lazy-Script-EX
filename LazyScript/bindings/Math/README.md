# GLM math binding

`GLM.lsx` is the public LSX wrapper around GLM 1.0.2. It provides vectors, matrices, quaternions, dual quaternions, transforms, projection helpers, interpolation, decomposition, and project/unproject operations without exposing C++ pointers.

```lsx
use "@LazyScript/bindings/Math/GLM.lsx" as GLM
use "@LazyScript/bindings/Math/Camera.lsx" as Camera

local position = GLM.vec3(4.0, 3.0, 6.0)
local direction = GLM.vec3(0.0, 0.0, -1.0)
local forward = direction.normalized()

local camera = Camera.create()
camera.set_position(position.x, position.y, position.z)
camera.set_perspective(60.0, 16.0 / 9.0, 0.1, 1000.0)

local view_projection = camera.view_projection()
```

Matrices use GLM/OpenGL column-major order. `Math/OpenGL.lsx` uploads wrapped matrices directly to GLSL uniforms.

Owned GLM wrapper objects should be destroyed when they are no longer needed. See `Projects/27_glm_camera` and the offline API for complete examples.
