# 25 - SDF text

This example creates an SDF atlas from Segoe UI on first launch, caches it under `build/cache`, builds one contiguous text mesh, and renders the complete string in a single OpenGL draw call.

Later launches load the cached atlas instead of regenerating glyphs.

The one-channel FreeType SDF atlas is uploaded through `OpenGL/TextureUpload.lsx` and `LSXGLABI.dll`.
