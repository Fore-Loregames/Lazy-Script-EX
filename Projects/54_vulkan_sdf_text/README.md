# 54 - Vulkan FreeType SDF text

Creates a native FreeType SDF atlas from Segoe UI, uploads it through the backend-neutral LSG texture path, and renders the full string in one Vulkan draw call. The atlas measures the actual SDF bitmap bounds before allocation and includes a transparent spread gutter so descenders and wide glyphs are not clipped.

The example uses an overlay pipeline with depth reads and writes disabled, alpha blending, and automatic FPS reporting in the window title.
