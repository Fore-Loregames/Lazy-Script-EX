# 63 - Universal modular LSSL ray tracing

This is the recommended ray-tracing path. The material shader is an ordinary custom vertex/fragment shader and opts into all four shared-scene effects with:

```lssl
raytracing shadows ao gi reflections
```

Every triangle submitted through `LSG.mesh` or `LSG.indexed_mesh` with a `Vector3` position as its first vertex attribute automatically joins the Vulkan ray scene. Mesh transforms, ray material data, and LSG ray lights are shared with every opt-in shader. The shader keeps ownership of `finalColor`; LSSL applies the requested ray effects after its fragment function.
