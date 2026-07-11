/*
   LazyScriptEX FreeType bridge.
   This is deliberately a thin ABI bridge only: FreeType performs all font
   loading, hinting, kerning, grayscale rasterization, and SDF rasterization.
   No GDI font path and no custom distance-field generator are used here.
*/

#define WIN32_LEAN_AND_MEAN 1
#define NULL ((void*)0)

int _fltused = 0;

typedef void* HMODULE;
typedef void* FARPROC;
typedef void* LPVOID;
typedef unsigned long DWORD;
typedef int BOOL;
typedef unsigned long long ULONG_PTR;

__declspec(dllimport) HMODULE __stdcall LoadLibraryA(const char* name);
__declspec(dllimport) FARPROC __stdcall GetProcAddress(HMODULE module, const char* name);
__declspec(dllimport) BOOL __stdcall FreeLibrary(HMODULE module);

/* FreeType public ABI types for 64-bit Windows. */
typedef signed char FT_Char;
typedef unsigned char FT_Byte;
typedef signed short FT_Short;
typedef unsigned short FT_UShort;
typedef signed int FT_Int;
typedef unsigned int FT_UInt;
typedef signed int FT_Int32;
typedef unsigned int FT_UInt32;
typedef signed long FT_Long;
typedef unsigned long FT_ULong;
typedef signed long FT_Fixed;
typedef signed long FT_Pos;
typedef int FT_Error;
typedef void* FT_Library;
typedef void* FT_CharMap;

typedef struct FT_Vector_ {
    FT_Pos x;
    FT_Pos y;
} FT_Vector;

typedef struct FT_Generic_ {
    void* data;
    void* finalizer;
} FT_Generic;

typedef struct FT_BBox_ {
    FT_Pos xMin;
    FT_Pos yMin;
    FT_Pos xMax;
    FT_Pos yMax;
} FT_BBox;

typedef struct FT_Bitmap_Size_ {
    FT_Short height;
    FT_Short width;
    FT_Pos size;
    FT_Pos x_ppem;
    FT_Pos y_ppem;
} FT_Bitmap_Size;

typedef struct FT_Glyph_Metrics_ {
    FT_Pos width;
    FT_Pos height;
    FT_Pos horiBearingX;
    FT_Pos horiBearingY;
    FT_Pos horiAdvance;
    FT_Pos vertBearingX;
    FT_Pos vertBearingY;
    FT_Pos vertAdvance;
} FT_Glyph_Metrics;

typedef struct FT_Bitmap_ {
    unsigned int rows;
    unsigned int width;
    int pitch;
    unsigned char* buffer;
    unsigned short num_grays;
    unsigned char pixel_mode;
    signed char palette_mode;
    void* palette;
} FT_Bitmap;

typedef struct FT_GlyphSlotRec_ {
    FT_Library library;
    void* face;
    void* next;
    FT_UInt glyph_index;
    FT_Generic generic;
    FT_Glyph_Metrics metrics;
    FT_Fixed linearHoriAdvance;
    FT_Fixed linearVertAdvance;
    FT_Vector advance;
    int format;
    FT_Bitmap bitmap;
    FT_Int bitmap_left;
    FT_Int bitmap_top;
} FT_GlyphSlotRec, *FT_GlyphSlot;

typedef struct FT_Size_Metrics_ {
    FT_UShort x_ppem;
    FT_UShort y_ppem;
    FT_Fixed x_scale;
    FT_Fixed y_scale;
    FT_Pos ascender;
    FT_Pos descender;
    FT_Pos height;
    FT_Pos max_advance;
} FT_Size_Metrics;

typedef struct FT_SizeRec_ {
    void* face;
    FT_Generic generic;
    FT_Size_Metrics metrics;
    void* internal;
} FT_SizeRec, *FT_Size;

typedef struct FT_FaceRec_ {
    FT_Long num_faces;
    FT_Long face_index;
    FT_Long face_flags;
    FT_Long style_flags;
    FT_Long num_glyphs;
    char* family_name;
    char* style_name;
    FT_Int num_fixed_sizes;
    FT_Bitmap_Size* available_sizes;
    FT_Int num_charmaps;
    FT_CharMap* charmaps;
    FT_Generic generic;
    FT_BBox bbox;
    FT_UShort units_per_EM;
    FT_Short ascender;
    FT_Short descender;
    FT_Short height;
    FT_Short max_advance_width;
    FT_Short max_advance_height;
    FT_Short underline_position;
    FT_Short underline_thickness;
    FT_GlyphSlot glyph;
    FT_Size size;
    FT_CharMap charmap;
} FT_FaceRec, *FT_Face;

typedef FT_Error (__cdecl *PFN_FT_Init_FreeType)(FT_Library*);
typedef FT_Error (__cdecl *PFN_FT_Done_FreeType)(FT_Library);
typedef FT_Error (__cdecl *PFN_FT_New_Face)(FT_Library, const char*, FT_Long, FT_Face*);
typedef FT_Error (__cdecl *PFN_FT_Done_Face)(FT_Face);
typedef FT_Error (__cdecl *PFN_FT_Set_Pixel_Sizes)(FT_Face, FT_UInt, FT_UInt);
typedef FT_Error (__cdecl *PFN_FT_Load_Char)(FT_Face, FT_ULong, FT_Int32);
typedef FT_Error (__cdecl *PFN_FT_Render_Glyph)(FT_GlyphSlot, int);
typedef FT_UInt (__cdecl *PFN_FT_Get_Char_Index)(FT_Face, FT_ULong);
typedef FT_Error (__cdecl *PFN_FT_Get_Kerning)(FT_Face, FT_UInt, FT_UInt, FT_UInt, FT_Vector*);
typedef void (__cdecl *PFN_FT_Library_Version)(FT_Library, FT_Int*, FT_Int*, FT_Int*);
typedef const char* (__cdecl *PFN_FT_Error_String)(FT_Error);
typedef FT_Error (__cdecl *PFN_FT_Property_Set)(FT_Library, const char*, const char*, const void*);

static HMODULE g_freetype_module;
static PFN_FT_Init_FreeType p_FT_Init_FreeType;
static PFN_FT_Done_FreeType p_FT_Done_FreeType;
static PFN_FT_New_Face p_FT_New_Face;
static PFN_FT_Done_Face p_FT_Done_Face;
static PFN_FT_Set_Pixel_Sizes p_FT_Set_Pixel_Sizes;
static PFN_FT_Load_Char p_FT_Load_Char;
static PFN_FT_Render_Glyph p_FT_Render_Glyph;
static PFN_FT_Get_Char_Index p_FT_Get_Char_Index;
static PFN_FT_Get_Kerning p_FT_Get_Kerning;
static PFN_FT_Library_Version p_FT_Library_Version;
static PFN_FT_Error_String p_FT_Error_String;
static PFN_FT_Property_Set p_FT_Property_Set;
static int g_runtime_state;

#define LSX_FT_FACE_CAPACITY 64

typedef struct LSXFTFace_ {
    int used;
    int last_stage;
    FT_Error last_error;
    FT_Library library;
    FT_Face face;
    int pixel_width;
    int pixel_height;
    unsigned int sdf_spread;
} LSXFTFace;

static LSXFTFace g_faces[LSX_FT_FACE_CAPACITY];

static FARPROC load_proc(const char* name) {
    if (!g_freetype_module) return NULL;
    return GetProcAddress(g_freetype_module, name);
}

static int load_runtime(void) {
    if (g_runtime_state != 0) return g_runtime_state > 0;
    g_runtime_state = -1;
    g_freetype_module = LoadLibraryA("libfreetype.dll");
    if (!g_freetype_module) g_freetype_module = LoadLibraryA("freetype.dll");
    if (!g_freetype_module) return 0;

    p_FT_Init_FreeType = (PFN_FT_Init_FreeType)load_proc("FT_Init_FreeType");
    p_FT_Done_FreeType = (PFN_FT_Done_FreeType)load_proc("FT_Done_FreeType");
    p_FT_New_Face = (PFN_FT_New_Face)load_proc("FT_New_Face");
    p_FT_Done_Face = (PFN_FT_Done_Face)load_proc("FT_Done_Face");
    p_FT_Set_Pixel_Sizes = (PFN_FT_Set_Pixel_Sizes)load_proc("FT_Set_Pixel_Sizes");
    p_FT_Load_Char = (PFN_FT_Load_Char)load_proc("FT_Load_Char");
    p_FT_Render_Glyph = (PFN_FT_Render_Glyph)load_proc("FT_Render_Glyph");
    p_FT_Get_Char_Index = (PFN_FT_Get_Char_Index)load_proc("FT_Get_Char_Index");
    p_FT_Get_Kerning = (PFN_FT_Get_Kerning)load_proc("FT_Get_Kerning");
    p_FT_Library_Version = (PFN_FT_Library_Version)load_proc("FT_Library_Version");
    p_FT_Error_String = (PFN_FT_Error_String)load_proc("FT_Error_String");
    p_FT_Property_Set = (PFN_FT_Property_Set)load_proc("FT_Property_Set");

    if (!p_FT_Init_FreeType || !p_FT_Done_FreeType || !p_FT_New_Face ||
        !p_FT_Done_Face || !p_FT_Set_Pixel_Sizes || !p_FT_Load_Char ||
        !p_FT_Render_Glyph || !p_FT_Get_Char_Index || !p_FT_Get_Kerning ||
        !p_FT_Library_Version) {
        FreeLibrary(g_freetype_module);
        g_freetype_module = NULL;
        return 0;
    }
    g_runtime_state = 1;
    return 1;
}

static LSXFTFace* allocate_face(void) {
    int i;
    for (i = 0; i < LSX_FT_FACE_CAPACITY; ++i) {
        if (!g_faces[i].used) {
            g_faces[i].used = 1;
            g_faces[i].last_stage = 0;
            g_faces[i].last_error = 0;
            g_faces[i].library = NULL;
            g_faces[i].face = NULL;
            g_faces[i].pixel_width = 0;
            g_faces[i].pixel_height = 0;
            g_faces[i].sdf_spread = 16;
            return &g_faces[i];
        }
    }
    return NULL;
}

static int valid_face(LSXFTFace* handle) {
    return handle && handle->used && handle->library && handle->face;
}

__declspec(dllexport) int __cdecl _lsxFTReady(void) {
    return load_runtime();
}

__declspec(dllexport) int __cdecl _lsxFTVersionMajor(void) {
    FT_Library library = NULL;
    FT_Int major = 0, minor = 0, patch = 0;
    if (!load_runtime() || p_FT_Init_FreeType(&library) != 0 || !library) return 0;
    p_FT_Library_Version(library, &major, &minor, &patch);
    p_FT_Done_FreeType(library);
    return major;
}

__declspec(dllexport) int __cdecl _lsxFTVersionMinor(void) {
    FT_Library library = NULL;
    FT_Int major = 0, minor = 0, patch = 0;
    if (!load_runtime() || p_FT_Init_FreeType(&library) != 0 || !library) return 0;
    p_FT_Library_Version(library, &major, &minor, &patch);
    p_FT_Done_FreeType(library);
    return minor;
}

__declspec(dllexport) int __cdecl _lsxFTVersionPatch(void) {
    FT_Library library = NULL;
    FT_Int major = 0, minor = 0, patch = 0;
    if (!load_runtime() || p_FT_Init_FreeType(&library) != 0 || !library) return 0;
    p_FT_Library_Version(library, &major, &minor, &patch);
    p_FT_Done_FreeType(library);
    return patch;
}

__declspec(dllexport) LSXFTFace* __cdecl _lsxFTCreateFace(const char* path, int pixel_height) {
    LSXFTFace* handle;
    FT_Error error;
    if (!path || pixel_height <= 0 || !load_runtime()) return NULL;
    handle = allocate_face();
    if (!handle) return NULL;

    handle->last_stage = 1;
    error = p_FT_Init_FreeType(&handle->library);
    handle->last_error = error;
    if (error != 0 || !handle->library) goto failed;

    /* FreeType defaults to an 8-pixel SDF spread. At larger display scales
       descenders can reach that bitmap edge and look hard-clipped. The shipped
       runtime supports the public sdf/spread property, so use a wider field.
       Dynamic atlas sizing in Font.lsx accounts for the larger bitmaps. */
    if (p_FT_Property_Set) {
        FT_UInt spread = (FT_UInt)handle->sdf_spread;
        p_FT_Property_Set(handle->library, "sdf", "spread", &spread);
    }

    handle->last_stage = 2;
    error = p_FT_New_Face(handle->library, path, 0, &handle->face);
    handle->last_error = error;
    if (error != 0 || !handle->face) goto failed;

    handle->last_stage = 3;
    error = p_FT_Set_Pixel_Sizes(handle->face, 0, (FT_UInt)pixel_height);
    handle->last_error = error;
    if (error != 0) goto failed;

    handle->pixel_width = 0;
    handle->pixel_height = pixel_height;
    handle->last_stage = 0;
    handle->last_error = 0;
    return handle;

failed:
    if (handle->face) p_FT_Done_Face(handle->face);
    if (handle->library) p_FT_Done_FreeType(handle->library);
    handle->face = NULL;
    handle->library = NULL;
    /* Keep the slot alive long enough for the caller to query the error. */
    return handle;
}

__declspec(dllexport) int __cdecl _lsxFTFaceValid(LSXFTFace* handle) {
    return valid_face(handle);
}

__declspec(dllexport) int __cdecl _lsxFTSetPixelSize(LSXFTFace* handle, int width, int height) {
    FT_Error error;
    if (!valid_face(handle) || width < 0 || height <= 0) return 0;
    handle->last_stage = 3;
    error = p_FT_Set_Pixel_Sizes(handle->face, (FT_UInt)width, (FT_UInt)height);
    handle->last_error = error;
    if (error != 0) return 0;
    handle->pixel_width = width;
    handle->pixel_height = height;
    handle->last_stage = 0;
    return 1;
}

__declspec(dllexport) int __cdecl _lsxFTLoadGlyph(LSXFTFace* handle, unsigned int codepoint, int render_mode) {
    FT_Error error;
    FT_GlyphSlot slot;
    if (!valid_face(handle)) return 0;
    handle->last_stage = 4;
    /* SDF outlines should not use embedded bitmaps or grid hinting. Keeping the
       original outline gives the distance renderer a clean, unclipped contour. */
    FT_Int32 load_flags = render_mode == 5 ? ((1L << 1) | (1L << 3)) : 0;
    error = p_FT_Load_Char(handle->face, (FT_ULong)codepoint, load_flags);
    handle->last_error = error;
    if (error != 0) return 0;
    slot = handle->face->glyph;
    if (!slot) {
        handle->last_error = -1;
        return 0;
    }
    handle->last_stage = 5;
    error = p_FT_Render_Glyph(slot, render_mode);
    handle->last_error = error;
    if (error != 0) return 0;
    handle->last_stage = 0;
    return 1;
}

__declspec(dllexport) unsigned int __cdecl _lsxFTCharIndex(LSXFTFace* handle, unsigned int codepoint) {
    if (!valid_face(handle)) return 0;
    return p_FT_Get_Char_Index(handle->face, (FT_ULong)codepoint);
}

__declspec(dllexport) float __cdecl _lsxFTKerning(LSXFTFace* handle, unsigned int left_codepoint, unsigned int right_codepoint) {
    FT_UInt left;
    FT_UInt right;
    FT_Vector vector;
    FT_Error error;
    if (!valid_face(handle) || !left_codepoint || !right_codepoint) return 0.0f;
    left = p_FT_Get_Char_Index(handle->face, (FT_ULong)left_codepoint);
    right = p_FT_Get_Char_Index(handle->face, (FT_ULong)right_codepoint);
    if (!left || !right) return 0.0f;
    vector.x = 0;
    vector.y = 0;
    error = p_FT_Get_Kerning(handle->face, left, right, 0, &vector);
    if (error != 0) {
        handle->last_stage = 6;
        handle->last_error = error;
        return 0.0f;
    }
    return ((float)vector.x) / 64.0f;
}

static FT_GlyphSlot current_slot(LSXFTFace* handle) {
    if (!valid_face(handle)) return NULL;
    return handle->face->glyph;
}

__declspec(dllexport) int __cdecl _lsxFTBitmapWidth(LSXFTFace* handle) {
    FT_GlyphSlot slot = current_slot(handle);
    return slot ? (int)slot->bitmap.width : 0;
}

__declspec(dllexport) int __cdecl _lsxFTBitmapRows(LSXFTFace* handle) {
    FT_GlyphSlot slot = current_slot(handle);
    return slot ? (int)slot->bitmap.rows : 0;
}

__declspec(dllexport) int __cdecl _lsxFTBitmapPitch(LSXFTFace* handle) {
    FT_GlyphSlot slot = current_slot(handle);
    return slot ? slot->bitmap.pitch : 0;
}

__declspec(dllexport) unsigned char* __cdecl _lsxFTBitmapBuffer(LSXFTFace* handle) {
    FT_GlyphSlot slot = current_slot(handle);
    return slot ? slot->bitmap.buffer : NULL;
}

__declspec(dllexport) int __cdecl _lsxFTBitmapLeft(LSXFTFace* handle) {
    FT_GlyphSlot slot = current_slot(handle);
    return slot ? slot->bitmap_left : 0;
}

__declspec(dllexport) int __cdecl _lsxFTBitmapTop(LSXFTFace* handle) {
    FT_GlyphSlot slot = current_slot(handle);
    return slot ? slot->bitmap_top : 0;
}

__declspec(dllexport) float __cdecl _lsxFTAdvanceX(LSXFTFace* handle) {
    FT_GlyphSlot slot = current_slot(handle);
    return slot ? ((float)slot->advance.x) / 64.0f : 0.0f;
}

__declspec(dllexport) float __cdecl _lsxFTLineHeight(LSXFTFace* handle) {
    if (!valid_face(handle) || !handle->face->size) return 0.0f;
    return ((float)handle->face->size->metrics.height) / 64.0f;
}

__declspec(dllexport) float __cdecl _lsxFTAscender(LSXFTFace* handle) {
    if (!valid_face(handle) || !handle->face->size) return 0.0f;
    return ((float)handle->face->size->metrics.ascender) / 64.0f;
}

__declspec(dllexport) float __cdecl _lsxFTDescender(LSXFTFace* handle) {
    if (!valid_face(handle) || !handle->face->size) return 0.0f;
    return ((float)handle->face->size->metrics.descender) / 64.0f;
}

__declspec(dllexport) int __cdecl _lsxFTCopyBitmap(LSXFTFace* handle, unsigned char* destination,
                                                   int destination_width, int destination_height,
                                                   int destination_x, int destination_y) {
    FT_GlyphSlot slot = current_slot(handle);
    FT_Bitmap* bitmap;
    int rows;
    int width;
    int pitch;
    int y;
    if (!slot || !destination || destination_width <= 0 || destination_height <= 0) return 0;
    bitmap = &slot->bitmap;
    rows = (int)bitmap->rows;
    width = (int)bitmap->width;
    pitch = bitmap->pitch;
    if (!bitmap->buffer || rows <= 0 || width <= 0) return 1;
    if (destination_x < 0 || destination_y < 0 || destination_x + width > destination_width || destination_y + rows > destination_height) return 0;

    for (y = 0; y < rows; ++y) {
        unsigned char* source_row;
        unsigned char* destination_row = destination + (destination_y + y) * destination_width + destination_x;
        int x;
        if (pitch >= 0) source_row = bitmap->buffer + y * pitch;
        else source_row = bitmap->buffer + (rows - 1 - y) * (-pitch);
        for (x = 0; x < width; ++x) destination_row[x] = source_row[x];
    }
    return 1;
}

__declspec(dllexport) int __cdecl _lsxFTLastErrorCode(LSXFTFace* handle) {
    return handle ? handle->last_error : -1;
}

__declspec(dllexport) const char* __cdecl _lsxFTLastError(LSXFTFace* handle) {
    if (!load_runtime()) return "FreeType runtime could not be loaded";
    if (!handle) return "FreeType face handle is null";
    if (handle->last_error == 0) return "No FreeType error";
    if (handle->last_error > 0 && p_FT_Error_String) {
        const char* message = p_FT_Error_String(handle->last_error);
        if (message) return message;
    }
    if (handle->last_stage == 1) return "FT_Init_FreeType failed";
    if (handle->last_stage == 2) return "FT_New_Face failed";
    if (handle->last_stage == 3) return "FT_Set_Pixel_Sizes failed";
    if (handle->last_stage == 4) return "FT_Load_Char failed";
    if (handle->last_stage == 5) return "FT_Render_Glyph failed";
    if (handle->last_stage == 6) return "FT_Get_Kerning failed";
    return "FreeType operation failed";
}

__declspec(dllexport) void __cdecl _lsxFTDestroyFace(LSXFTFace* handle) {
    if (!handle || !handle->used) return;
    if (handle->face && p_FT_Done_Face) p_FT_Done_Face(handle->face);
    if (handle->library && p_FT_Done_FreeType) p_FT_Done_FreeType(handle->library);
    handle->face = NULL;
    handle->library = NULL;
    handle->last_error = 0;
    handle->last_stage = 0;
    handle->pixel_width = 0;
    handle->pixel_height = 0;
    handle->used = 0;
}

BOOL __stdcall DllMain(void* module, DWORD reason, LPVOID reserved) {
    (void)module;
    (void)reserved;
    if (reason == 0 && g_freetype_module) {
        FreeLibrary(g_freetype_module);
        g_freetype_module = NULL;
        g_runtime_state = 0;
    }
    return 1;
}
