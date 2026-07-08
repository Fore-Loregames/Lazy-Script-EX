# Direct FreeType APIs

`FreeTypeRaw.lsx` exposes the public FreeType C API from `libfreetype.dll`.
`FreeType.lsx` provides a small LSX wrapper. `LSXFreeType.dll` only exposes
glyph-slot fields that are awkward to read safely from LSX; FreeType still does
all font loading, glyph rasterization, kerning, metrics, and SDF generation.

`Font.lsx` packs FreeType-rendered SDF glyphs into a single-channel atlas,
uploads the one-channel source through the exact native OpenGL texture ABI path, and builds each text block as one vertex batch.
There is no GDI path, custom distance-field generator, or atlas cache layer.
