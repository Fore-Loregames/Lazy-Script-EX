Creates a native SDF atlas from Segoe UI on first launch, caches it in
`build/cache`, builds one contiguous text mesh, and renders the full string in a
single OpenGL draw call. Later launches load the atlas cache instead of
regenerating glyphs.

The one-channel FreeType SDF atlas is uploaded through `OpenGL/TextureUpload.lsx` and `LSXGLABI.dll`.
