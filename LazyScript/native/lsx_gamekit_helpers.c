// Hand-written convenience exports layered over the generated raw forwarders.
// These helpers only remove trivial pointer-output plumbing. They do not own a
// window, a renderer, an audio device, or an event loop.

#define LSX_EXPORT __declspec(dllexport)

typedef unsigned int u32;
typedef long long i64;
typedef unsigned char u8;

// Generated OpenGL exports from lsx_gamekit_bridge.c.
extern void glGenBuffers(int, void*);
extern void glGenVertexArrays(int, void*);
extern void glGenTextures(int, void*);
extern void glGenFramebuffers(int, void*);
extern void glGenRenderbuffers(int, void*);
extern void glGenSamplers(int, void*);
extern void glGenQueries(int, void*);
extern void glGenTransformFeedbacks(int, void*);
extern void glGenProgramPipelines(int, void*);
extern void glDeleteBuffers(int, const void*);
extern void glDeleteVertexArrays(int, const void*);
extern void glDeleteTextures(int, const void*);
extern void glDeleteFramebuffers(int, const void*);
extern void glDeleteRenderbuffers(int, const void*);
extern void glDeleteSamplers(int, const void*);
extern void glDeleteQueries(int, const void*);
extern void glDeleteTransformFeedbacks(int, const void*);
extern void glDeleteProgramPipelines(int, const void*);
extern void glGetIntegerv(u32, void*);
extern void glGetInteger64v(u32, void*);
extern void glGetFloatv(u32, void*);
extern void glGetBooleanv(u32, void*);
extern void glGetShaderiv(u32, u32, void*);
extern void glGetProgramiv(u32, u32, void*);
extern void glGetBufferParameteriv(u32, u32, void*);
extern void glGetNamedBufferParameteriv(u32, u32, void*);
extern void glGetTextureParameteriv(u32, u32, void*);
extern void glGetSamplerParameteriv(u32, u32, void*);
extern void glGetQueryiv(u32, u32, void*);
extern void glGetShaderInfoLog(u32, int, void*, void*);
extern void glGetProgramInfoLog(u32, int, void*, void*);
extern void glGetProgramPipelineiv(u32, u32, void*);
extern void glGetProgramPipelineInfoLog(u32, int, void*, void*);
extern void* glGetString(u32);

// Generated OpenAL exports.
extern void alGenBuffers(int, void*);
extern void alGenSources(int, void*);
extern void alGenEffects(int, void*);
extern void alGenFilters(int, void*);
extern void alGenAuxiliaryEffectSlots(int, void*);
extern void alDeleteBuffers(int, const void*);
extern void alDeleteSources(int, const void*);
extern void alDeleteEffects(int, const void*);
extern void alDeleteFilters(int, const void*);
extern void alDeleteAuxiliaryEffectSlots(int, const void*);
extern void alGetSourcei(u32, u32, void*);
extern void alGetBufferi(u32, u32, void*);

// Generated GLFW exports use ABI-neutral pointers for opaque GLFW types.
extern void glfwSetWindowIcon(void*, int, void*);
extern void* glfwCreateCursor(void*, int, int);

typedef struct LSXGlfwImage {
    int width;
    int height;
    unsigned char* pixels;
} LSXGlfwImage;

LSX_EXPORT void _lsxGlfwSetWindowIconRGBA(void* window, int width, int height, void* pixels) {
    LSXGlfwImage image;
    image.width = width;
    image.height = height;
    image.pixels = (unsigned char*)pixels;
    glfwSetWindowIcon(window, 1, &image);
}

LSX_EXPORT void* _lsxGlfwCreateCursorRGBA(int width, int height, void* pixels, int xHotspot, int yHotspot) {
    LSXGlfwImage image;
    image.width = width;
    image.height = height;
    image.pixels = (unsigned char*)pixels;
    return glfwCreateCursor(&image, xHotspot, yHotspot);
}

#define CREATE_ONE(name, generator) \
    LSX_EXPORT u32 name(void) { u32 value = 0; generator(1, &value); return value; }
#define DELETE_ONE(name, deleter) \
    LSX_EXPORT void name(u32 value) { if (value) deleter(1, &value); }

CREATE_ONE(_lsxGlCreateBuffer, glGenBuffers)
CREATE_ONE(_lsxGlCreateVertexArray, glGenVertexArrays)
CREATE_ONE(_lsxGlCreateTexture, glGenTextures)
CREATE_ONE(_lsxGlCreateFramebuffer, glGenFramebuffers)
CREATE_ONE(_lsxGlCreateRenderbuffer, glGenRenderbuffers)
CREATE_ONE(_lsxGlCreateSampler, glGenSamplers)
CREATE_ONE(_lsxGlCreateQuery, glGenQueries)
CREATE_ONE(_lsxGlCreateTransformFeedback, glGenTransformFeedbacks)
CREATE_ONE(_lsxGlCreateProgramPipeline, glGenProgramPipelines)
DELETE_ONE(_lsxGlDeleteBuffer, glDeleteBuffers)
DELETE_ONE(_lsxGlDeleteVertexArray, glDeleteVertexArrays)
DELETE_ONE(_lsxGlDeleteTexture, glDeleteTextures)
DELETE_ONE(_lsxGlDeleteFramebuffer, glDeleteFramebuffers)
DELETE_ONE(_lsxGlDeleteRenderbuffer, glDeleteRenderbuffers)
DELETE_ONE(_lsxGlDeleteSampler, glDeleteSamplers)
DELETE_ONE(_lsxGlDeleteQuery, glDeleteQueries)
DELETE_ONE(_lsxGlDeleteTransformFeedback, glDeleteTransformFeedbacks)
DELETE_ONE(_lsxGlDeleteProgramPipeline, glDeleteProgramPipelines)

LSX_EXPORT int _lsxGlGetInteger(u32 pname) { int value = 0; glGetIntegerv(pname, &value); return value; }
LSX_EXPORT i64 _lsxGlGetInteger64(u32 pname) { i64 value = 0; glGetInteger64v(pname, &value); return value; }
LSX_EXPORT float _lsxGlGetFloat(u32 pname) { float value = 0.0f; glGetFloatv(pname, &value); return value; }
LSX_EXPORT int _lsxGlGetBoolean(u32 pname) { u8 value = 0; glGetBooleanv(pname, &value); return value ? 1 : 0; }
LSX_EXPORT int _lsxGlGetShaderInteger(u32 shader, u32 pname) { int value = 0; glGetShaderiv(shader, pname, &value); return value; }
LSX_EXPORT int _lsxGlGetProgramInteger(u32 program, u32 pname) { int value = 0; glGetProgramiv(program, pname, &value); return value; }
LSX_EXPORT int _lsxGlGetBufferInteger(u32 target, u32 pname) { int value = 0; glGetBufferParameteriv(target, pname, &value); return value; }
LSX_EXPORT int _lsxGlGetNamedBufferInteger(u32 buffer, u32 pname) { int value = 0; glGetNamedBufferParameteriv(buffer, pname, &value); return value; }
LSX_EXPORT int _lsxGlGetTextureInteger(u32 texture, u32 pname) { int value = 0; glGetTextureParameteriv(texture, pname, &value); return value; }
LSX_EXPORT int _lsxGlGetSamplerInteger(u32 sampler, u32 pname) { int value = 0; glGetSamplerParameteriv(sampler, pname, &value); return value; }
LSX_EXPORT int _lsxGlGetQueryInteger(u32 target, u32 pname) { int value = 0; glGetQueryiv(target, pname, &value); return value; }

#define LOG_CAPACITY 65536
static char g_shader_log[LOG_CAPACITY];
static char g_program_log[LOG_CAPACITY];
static char g_pipeline_log[LOG_CAPACITY];

static int clamped_log_size(int requested) {
    if (requested < 1) return 1;
    if (requested > LOG_CAPACITY) return LOG_CAPACITY;
    return requested;
}

LSX_EXPORT const char* _lsxGlShaderInfoLog(u32 shader) {
    int length = 0;
    int written = 0;
    g_shader_log[0] = 0;
    glGetShaderiv(shader, 0x8B84u, &length); // GL_INFO_LOG_LENGTH
    glGetShaderInfoLog(shader, clamped_log_size(length), &written, g_shader_log);
    g_shader_log[LOG_CAPACITY - 1] = 0;
    return g_shader_log;
}

LSX_EXPORT const char* _lsxGlProgramInfoLog(u32 program) {
    int length = 0;
    int written = 0;
    g_program_log[0] = 0;
    glGetProgramiv(program, 0x8B84u, &length); // GL_INFO_LOG_LENGTH
    glGetProgramInfoLog(program, clamped_log_size(length), &written, g_program_log);
    g_program_log[LOG_CAPACITY - 1] = 0;
    return g_program_log;
}

LSX_EXPORT const char* _lsxGlProgramPipelineInfoLog(u32 pipeline) {
    int length = 0;
    int written = 0;
    g_pipeline_log[0] = 0;
    glGetProgramPipelineiv(pipeline, 0x8B84u, &length); // GL_INFO_LOG_LENGTH
    glGetProgramPipelineInfoLog(pipeline, clamped_log_size(length), &written, g_pipeline_log);
    g_pipeline_log[LOG_CAPACITY - 1] = 0;
    return g_pipeline_log;
}

LSX_EXPORT const char* _lsxGlString(u32 name) { return (const char*)glGetString(name); }

CREATE_ONE(_lsxAlCreateBuffer, alGenBuffers)
CREATE_ONE(_lsxAlCreateSource, alGenSources)
CREATE_ONE(_lsxAlCreateEffect, alGenEffects)
CREATE_ONE(_lsxAlCreateFilter, alGenFilters)
CREATE_ONE(_lsxAlCreateAuxiliaryEffectSlot, alGenAuxiliaryEffectSlots)
DELETE_ONE(_lsxAlDeleteBuffer, alDeleteBuffers)
DELETE_ONE(_lsxAlDeleteSource, alDeleteSources)
DELETE_ONE(_lsxAlDeleteEffect, alDeleteEffects)
DELETE_ONE(_lsxAlDeleteFilter, alDeleteFilters)
DELETE_ONE(_lsxAlDeleteAuxiliaryEffectSlot, alDeleteAuxiliaryEffectSlots)

LSX_EXPORT int _lsxAlGetSourceInteger(u32 source, u32 pname) { int value = 0; alGetSourcei(source, pname, &value); return value; }
LSX_EXPORT int _lsxAlGetBufferInteger(u32 buffer, u32 pname) { int value = 0; alGetBufferi(buffer, pname, &value); return value; }
