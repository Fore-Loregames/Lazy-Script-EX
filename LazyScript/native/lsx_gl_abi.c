#define LSX_EXPORT __declspec(dllexport)

typedef unsigned int u32;
typedef int i32;
typedef void* ptr;

typedef void (__stdcall *PFN_LSX_GL_TEX_IMAGE_2D)(u32 target, i32 level, i32 internal_format,
                                                   i32 width, i32 height, i32 border,
                                                   u32 format, u32 type, const void* pixels);

typedef struct LSXGlTexImage2DArgs {
    u32 target;
    i32 level;
    i32 internal_format;
    i32 width;
    i32 height;
    i32 border;
    u32 format;
    u32 type;
    const void* pixels;
} LSXGlTexImage2DArgs;

LSX_EXPORT i32 lsxGlTexImage2DCall(ptr function_pointer, const LSXGlTexImage2DArgs* args) {
    PFN_LSX_GL_TEX_IMAGE_2D function;
    if (!function_pointer || !args) return 0;
    function = (PFN_LSX_GL_TEX_IMAGE_2D)function_pointer;
    function(args->target, args->level, args->internal_format,
             args->width, args->height, args->border,
             args->format, args->type, args->pixels);
    return 1;
}
