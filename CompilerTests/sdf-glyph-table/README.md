# SDF glyph table regression

Uses the real `Font.Glyph` declaration and verifies that glyph metrics and UVs
are copied into contiguous atlas table storage before the temporary glyph object
is destroyed. This is the exact ownership pattern used by `Font.create_atlas()`.
