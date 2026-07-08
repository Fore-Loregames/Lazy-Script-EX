# 24 - Direct stb_image loading

Loads a PNG through the direct `stb_image.dll` binding, copies the decoded RGBA bytes once into an annotation-free packed `u8` pixel collection, and uploads that collection through the same proven `glTexImage2D` path used by example 04. The post-upload `glGetTexLevelParameteriv` query was removed because it could crash the image example after the window opened. The temporary CPU collection is destroyed after upload, no per-frame decoding or uploads occur, and `logs/LazyScriptEX.log` records every startup stage plus the first rendered image frame.

## Texture orientation

The example intentionally uses the same UV layout as example 04: bottom
vertices use `V=1` and top vertices use `V=0`. `Texture2D.load_ui` therefore
preserves stb_image row order. Use `Texture2D.load_ui_flipped` only when the
mesh instead uses conventional OpenGL UVs with `V=0` at the bottom.
