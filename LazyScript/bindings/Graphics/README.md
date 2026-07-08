# Direct image APIs

`STBImage.lsx` binds directly to `stb_image.dll`. It exposes the native stb_image
entry points and an owned `Image` object whose pixel pointer can be uploaded
directly to the GPU. Call `destroy()` after the upload to release stb_image's
decoded allocation.

`Image.lsx` is the compatibility facade over that direct binding.
`Texture2D.lsx` performs a direct stb_image-to-OpenGL RGBA upload with optional
sRGB, mipmaps, and vertical flipping. No media runtime or intermediate pixel
conversion is involved.
