# 27 - GLM camera and transforms

Uses the LSX-first GLM wrapper for a perspective camera, quaternion rotation, TRS model matrix, and direct OpenGL uniform uploads.

The vertex and index lists use normal LSX literals. The compiler packs decimal vertices as contiguous `f32` and non-negative indices as contiguous `u32`; no front-end collection type annotation is used.
