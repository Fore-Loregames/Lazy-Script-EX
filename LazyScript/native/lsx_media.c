// LazyScriptEX native media support for Windows x64.
//
// This DLL keeps all OS handles, allocations, pixel conversion, glyph
// rasterization, atlas generation, and cache I/O behind clean LSX objects.
// Image/font work happens during loading/setup; no media work is added to the
// render-frame hot path.

#define LSX_EXPORT __declspec(dllexport)
#define LSX_IMPORT __declspec(dllimport)
#define WINAPI __stdcall

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef unsigned long DWORD;
typedef long LONG;
typedef int BOOL;
typedef unsigned long long u64;
typedef long long i64;
typedef unsigned long long ULONG_PTR;
typedef void* HANDLE;
typedef void* HMODULE;
typedef void* HDC;
typedef void* HFONT;
typedef void* HGDIOBJ;
typedef unsigned short WCHAR;
typedef struct LSX_INIT_ONCE { void* value; } LSX_INIT_ONCE;
typedef struct LSX_SRWLOCK { void* value; } LSX_SRWLOCK;
typedef BOOL (WINAPI *LSX_INIT_ONCE_FN)(LSX_INIT_ONCE*,void*,void**);

// Required when linking a freestanding MSVC-compatible object that uses float.
int _fltused = 0;

LSX_IMPORT HMODULE WINAPI LoadLibraryA(const char*);
LSX_IMPORT void* WINAPI GetProcAddress(HMODULE,const char*);
LSX_IMPORT HANDLE WINAPI GetProcessHeap(void);
LSX_IMPORT void* WINAPI HeapAlloc(HANDLE,DWORD,ULONG_PTR);
LSX_IMPORT void* WINAPI HeapReAlloc(HANDLE,DWORD,void*,ULONG_PTR);
LSX_IMPORT BOOL WINAPI HeapFree(HANDLE,DWORD,void*);
LSX_IMPORT int WINAPI MultiByteToWideChar(u32,DWORD,const char*,int,WCHAR*,int);
LSX_IMPORT HANDLE WINAPI CreateFileW(const WCHAR*,DWORD,DWORD,void*,DWORD,DWORD,HANDLE);
LSX_IMPORT HANDLE WINAPI CreateFileA(const char*,DWORD,DWORD,void*,DWORD,DWORD,HANDLE);
LSX_IMPORT BOOL WINAPI ReadFile(HANDLE,void*,DWORD,DWORD*,void*);
LSX_IMPORT BOOL WINAPI WriteFile(HANDLE,const void*,DWORD,DWORD*,void*);
LSX_IMPORT BOOL WINAPI GetFileSizeEx(HANDLE,i64*);
LSX_IMPORT BOOL WINAPI SetFilePointerEx(HANDLE,i64,i64*,DWORD);
LSX_IMPORT BOOL WINAPI CloseHandle(HANDLE);
LSX_IMPORT DWORD WINAPI GetLastError(void);
LSX_IMPORT BOOL WINAPI CreateDirectoryA(const char*,void*);
LSX_IMPORT void WINAPI OutputDebugStringA(const char*);
LSX_IMPORT BOOL WINAPI InitOnceExecuteOnce(LSX_INIT_ONCE*,LSX_INIT_ONCE_FN,void*,void**);
LSX_IMPORT void WINAPI AcquireSRWLockExclusive(LSX_SRWLOCK*);
LSX_IMPORT void WINAPI ReleaseSRWLockExclusive(LSX_SRWLOCK*);

#define CP_UTF8 65001u
#define GENERIC_READ 0x80000000u
#define GENERIC_WRITE 0x40000000u
#define FILE_SHARE_READ 1u
#define FILE_SHARE_WRITE 2u
#define OPEN_EXISTING 3u
#define OPEN_ALWAYS 4u
#define CREATE_ALWAYS 2u
#define FILE_ATTRIBUTE_NORMAL 0x80u
#define FILE_END 2u
#define INVALID_HANDLE_VALUE ((HANDLE)(i64)-1)
#define FR_PRIVATE 0x10u
#define GDI_ERROR 0xFFFFFFFFu
#define GGO_GRAY8_BITMAP 6u
#define ANTIALIASED_QUALITY 4u
#define OUT_TT_PRECIS 4u
#define CLIP_DEFAULT_PRECIS 0u
#define DEFAULT_CHARSET 1u
#define DEFAULT_PITCH 0u
#define FF_DONTCARE 0u
#define FW_NORMAL 400
#define IMAGE_LOCK_MODE_READ 1u
#define PIXEL_FORMAT_32BPP_ARGB 0x0026200Au
#define HEAP_ZERO_MEMORY 0x00000008u
#define HGDI_ERROR ((HGDIOBJ)(i64)-1)

static char g_last_error[256];
static LSX_SRWLOCK g_log_lock;

static void* halloc(ULONG_PTR bytes) {
    if (!bytes) bytes = 1;
    return HeapAlloc(GetProcessHeap(),HEAP_ZERO_MEMORY,bytes);
}
static void hfree(void* p) { if (p) HeapFree(GetProcessHeap(),0,p); }
static int cstrlen(const char* s) { int n=0; if (!s) return 0; while(s[n]) n++; return n; }
static void memzero(void* p,ULONG_PTR n) { u8* d=(u8*)p; ULONG_PTR i=0; while(i<n){d[i]=0;i++;} }
static void memcopy(void* dst,const void* src,ULONG_PTR n) { u8* d=(u8*)dst; const u8* s=(const u8*)src; ULONG_PTR i=0; while(i<n){d[i]=s[i];i++;} }
static void copy_text(char* dst,const char* text,int cap) {
    int i=0;
    if(!dst||cap<1) return;
    if(!text) text="Unknown error";
    while(text[i] && i<cap-1){dst[i]=text[i];i++;}
    dst[i]=0;
}
static void media_log(const char* text) {
    HANDLE file;
    DWORD written=0;
    int length;
    if(!text) return;
    AcquireSRWLockExclusive(&g_log_lock);
    OutputDebugStringA(text);
    OutputDebugStringA("\r\n");
    CreateDirectoryA("logs",0);
    file=CreateFileA("logs/LSXMedia.log",GENERIC_WRITE,FILE_SHARE_READ+FILE_SHARE_WRITE,0,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,0);
    if(file!=INVALID_HANDLE_VALUE){
        SetFilePointerEx(file,0,0,FILE_END);
        length=cstrlen(text);
        if(length>0) WriteFile(file,text,(DWORD)length,&written,0);
        WriteFile(file,"\r\n",2,&written,0);
        CloseHandle(file);
    }
    ReleaseSRWLockExclusive(&g_log_lock);
}
static void set_error(char* dst,const char* text) {
    copy_text(dst,text,256);
    copy_text(g_last_error,text,256);
    media_log(text);
}
static WCHAR* utf8_to_wide(const char* text) {
    int count;
    WCHAR* out;
    if(!text) return 0;
    count=MultiByteToWideChar(CP_UTF8,0,text,-1,0,0);
    if(count<1) return 0;
    out=(WCHAR*)halloc((ULONG_PTR)count*2u);
    if(!out) return 0;
    if(!MultiByteToWideChar(CP_UTF8,0,text,-1,out,count)){hfree(out);return 0;}
    return out;
}
static u32 checksum_bytes(const u8* data,u64 count) {
    u32 hash=2166136261u;
    u64 i=0;
    if(!data) return 0;
    while(i<count){hash^=(u32)data[i];hash*=16777619u;i++;}
    return hash;
}

// ---------------- Media diagnostics ----------------
LSX_EXPORT u32 _lsxMediaVersion(void){return 0x000F0600u;}
LSX_EXPORT int _lsxMediaProbe(void){media_log("[MEDIA] LSXMedia 0.15.6 probe succeeded");return 1;}
LSX_EXPORT const char* _lsxMediaLastError(void){return g_last_error[0]?g_last_error:"No media error has been recorded";}

// ---------------- GDI+ image decoding ----------------
typedef int GpStatus;
typedef void GpImage;
typedef void GpBitmap;
typedef struct { u32 GdiplusVersion; void* DebugEventCallback; BOOL SuppressBackgroundThread; BOOL SuppressExternalCodecs; } GdiplusStartupInput;
typedef char lsx_assert_gdiplus_startup_size[(sizeof(GdiplusStartupInput)==24)?1:-1];
typedef struct { int X,Y,Width,Height; } GpRect;
typedef struct { u32 Width,Height; int Stride; int PixelFormat; void* Scan0; ULONG_PTR Reserved; } BitmapData;
typedef char lsx_assert_bitmap_data_size[(sizeof(BitmapData)==32)?1:-1];
typedef GpStatus (WINAPI *PFN_GdiplusStartup)(ULONG_PTR*,const GdiplusStartupInput*,void*);
typedef void (WINAPI *PFN_GdiplusShutdown)(ULONG_PTR);
typedef GpStatus (WINAPI *PFN_GdipCreateBitmapFromFile)(const WCHAR*,GpBitmap**);
typedef GpStatus (WINAPI *PFN_GdipGetImageWidth)(GpImage*,u32*);
typedef GpStatus (WINAPI *PFN_GdipGetImageHeight)(GpImage*,u32*);
typedef GpStatus (WINAPI *PFN_GdipBitmapLockBits)(GpBitmap*,const GpRect*,u32,int,BitmapData*);
typedef GpStatus (WINAPI *PFN_GdipBitmapUnlockBits)(GpBitmap*,BitmapData*);
typedef GpStatus (WINAPI *PFN_GdipDisposeImage)(GpImage*);

static HMODULE g_gdiplus;
static ULONG_PTR g_gdiplus_token;
static LSX_INIT_ONCE g_gdiplus_once;
static int g_gdiplus_ready;
static PFN_GdiplusStartup p_GdiplusStartup;
static PFN_GdiplusShutdown p_GdiplusShutdown;
static PFN_GdipCreateBitmapFromFile p_GdipCreateBitmapFromFile;
static PFN_GdipGetImageWidth p_GdipGetImageWidth;
static PFN_GdipGetImageHeight p_GdipGetImageHeight;
static PFN_GdipBitmapLockBits p_GdipBitmapLockBits;
static PFN_GdipBitmapUnlockBits p_GdipBitmapUnlockBits;
static PFN_GdipDisposeImage p_GdipDisposeImage;

static BOOL WINAPI initialize_gdiplus_once(LSX_INIT_ONCE* once,void* parameter,void** context) {
    GdiplusStartupInput input;
    (void)once;(void)parameter;(void)context;
    media_log("[MEDIA] Initializing GDI+ image decoder");
    g_gdiplus=LoadLibraryA("gdiplus.dll");
    if(!g_gdiplus){set_error(0,"GDI+ image decoder DLL could not be loaded");return 0;}
    p_GdiplusStartup=(PFN_GdiplusStartup)GetProcAddress(g_gdiplus,"GdiplusStartup");
    p_GdiplusShutdown=(PFN_GdiplusShutdown)GetProcAddress(g_gdiplus,"GdiplusShutdown");
    p_GdipCreateBitmapFromFile=(PFN_GdipCreateBitmapFromFile)GetProcAddress(g_gdiplus,"GdipCreateBitmapFromFile");
    p_GdipGetImageWidth=(PFN_GdipGetImageWidth)GetProcAddress(g_gdiplus,"GdipGetImageWidth");
    p_GdipGetImageHeight=(PFN_GdipGetImageHeight)GetProcAddress(g_gdiplus,"GdipGetImageHeight");
    p_GdipBitmapLockBits=(PFN_GdipBitmapLockBits)GetProcAddress(g_gdiplus,"GdipBitmapLockBits");
    p_GdipBitmapUnlockBits=(PFN_GdipBitmapUnlockBits)GetProcAddress(g_gdiplus,"GdipBitmapUnlockBits");
    p_GdipDisposeImage=(PFN_GdipDisposeImage)GetProcAddress(g_gdiplus,"GdipDisposeImage");
    if(!p_GdiplusStartup||!p_GdipCreateBitmapFromFile||!p_GdipGetImageWidth||!p_GdipGetImageHeight||!p_GdipBitmapLockBits||!p_GdipBitmapUnlockBits||!p_GdipDisposeImage){set_error(0,"GDI+ image decoder exports are incomplete");return 0;}
    memzero(&input,sizeof(input)); input.GdiplusVersion=1;
    g_gdiplus_ready=p_GdiplusStartup(&g_gdiplus_token,&input,0)==0;
    if(g_gdiplus_ready) media_log("[MEDIA] GDI+ image decoder ready");
    else set_error(0,"GDI+ image decoder startup failed");
    return g_gdiplus_ready;
}
static int ensure_gdiplus(void) {
    if(g_gdiplus_ready) return 1;
    return InitOnceExecuteOnce(&g_gdiplus_once,initialize_gdiplus_once,0,0)&&g_gdiplus_ready;
}

typedef struct LSXImage {
    int ok,width,height,channels;
    i64 byte_count;
    u32 checksum;
    u8* pixels;
    char error[256];
} LSXImage;

LSX_EXPORT void* _lsxImageLoad(const char* path,int desired_channels,int flip_y) {
    LSXImage* out=(LSXImage*)halloc(sizeof(LSXImage));
    WCHAR* wide=0;
    GpBitmap* bitmap=0;
    u32 width=0,height=0;
    GpRect rect;
    BitmapData bits;
    int status;
    int channels;
    int x,y;
    if(!out) return 0;
    media_log("[IMAGE] Load started");
    if(!path||!path[0]){set_error(out->error,"Image path is empty");return out;}
    if(desired_channels<0||desired_channels>4){set_error(out->error,"Image desired channels must be 0 through 4");return out;}
    if(!ensure_gdiplus()){set_error(out->error,g_last_error);return out;}
    wide=utf8_to_wide(path);
    if(!wide){set_error(out->error,"Image path is invalid UTF-8");return out;}
    status=p_GdipCreateBitmapFromFile(wide,&bitmap);
    hfree(wide);
    if(status!=0||!bitmap){set_error(out->error,"Image file could not be opened or decoded");return out;}
    if(p_GdipGetImageWidth((GpImage*)bitmap,&width)!=0||p_GdipGetImageHeight((GpImage*)bitmap,&height)!=0||!width||!height){set_error(out->error,"Decoded image dimensions are invalid");p_GdipDisposeImage((GpImage*)bitmap);return out;}
    channels=desired_channels?desired_channels:4;
    if(width>32768u||height>32768u||(u64)width*(u64)height*(u64)channels>0x7fffffffULL){set_error(out->error,"Decoded image is too large");p_GdipDisposeImage((GpImage*)bitmap);return out;}
    out->pixels=(u8*)halloc((ULONG_PTR)width*(ULONG_PTR)height*(ULONG_PTR)channels);
    if(!out->pixels){set_error(out->error,"Image pixel allocation failed");p_GdipDisposeImage((GpImage*)bitmap);return out;}
    rect.X=0;rect.Y=0;rect.Width=(int)width;rect.Height=(int)height;memzero(&bits,sizeof(bits));
    status=p_GdipBitmapLockBits(bitmap,&rect,IMAGE_LOCK_MODE_READ,PIXEL_FORMAT_32BPP_ARGB,&bits);
    if(status!=0||!bits.Scan0||bits.Stride==0){set_error(out->error,"Decoded image pixels could not be locked");hfree(out->pixels);out->pixels=0;p_GdipDisposeImage((GpImage*)bitmap);return out;}
    for(y=0;y<(int)height;y++){
        int source_y=flip_y?((int)height-1-y):y;
        const u8* row;
        u8* dst=out->pixels+(i64)y*(i64)width*(i64)channels;
        // Scan0 is scan line zero and Stride is the signed offset to the
        // next scan line. A negative stride is therefore used directly for
        // bottom-up buffers rather than being converted to an absolute value.
        row=(const u8*)bits.Scan0+(i64)source_y*(i64)bits.Stride;
        for(x=0;x<(int)width;x++){
            u8 b=row[x*4+0],g=row[x*4+1],r=row[x*4+2],a=row[x*4+3];
            if(channels==1){dst[x]=(u8)(((u32)r*77u+(u32)g*150u+(u32)b*29u)>>8);}
            else if(channels==2){dst[x*2]=(u8)(((u32)r*77u+(u32)g*150u+(u32)b*29u)>>8);dst[x*2+1]=a;}
            else if(channels==3){dst[x*3]=r;dst[x*3+1]=g;dst[x*3+2]=b;}
            else {dst[x*4]=r;dst[x*4+1]=g;dst[x*4+2]=b;dst[x*4+3]=a;}
        }
    }
    p_GdipBitmapUnlockBits(bitmap,&bits);
    p_GdipDisposeImage((GpImage*)bitmap);
    out->ok=1;
    out->width=(int)width;
    out->height=(int)height;
    out->channels=channels;
    out->byte_count=(i64)width*(i64)height*(i64)channels;
    out->checksum=checksum_bytes(out->pixels,(u64)out->byte_count);
    g_last_error[0]=0;
    media_log("[IMAGE] Load completed successfully");
    return out;
}
LSX_EXPORT int _lsxImageOk(void* h){return h?((LSXImage*)h)->ok:0;}
LSX_EXPORT int _lsxImageWidth(void* h){return h?((LSXImage*)h)->width:0;}
LSX_EXPORT int _lsxImageHeight(void* h){return h?((LSXImage*)h)->height:0;}
LSX_EXPORT int _lsxImageChannels(void* h){return h?((LSXImage*)h)->channels:0;}
LSX_EXPORT i64 _lsxImageByteCount(void* h){return h?((LSXImage*)h)->byte_count:0;}
LSX_EXPORT u32 _lsxImageChecksum(void* h){return h?((LSXImage*)h)->checksum:0;}
LSX_EXPORT void* _lsxImagePixels(void* h){return h?((LSXImage*)h)->pixels:0;}
LSX_EXPORT const char* _lsxImageError(void* h){return h?((LSXImage*)h)->error:"Image handle is null";}
LSX_EXPORT void _lsxImageDestroy(void* h){LSXImage* v=(LSXImage*)h;if(!v)return;hfree(v->pixels);hfree(v);}

// ---------------- Native Windows font and SDF atlas ----------------
// Windows FIXED is fract first, then signed integer value. The old media DLL
// had these fields reversed, producing a near-zero glyph transform.
typedef struct { u16 fract; short value; } FIXED;
typedef struct { FIXED eM11,eM12,eM21,eM22; } MAT2;
typedef char lsx_assert_fixed_size[(sizeof(FIXED)==4)?1:-1];
typedef char lsx_assert_mat2_size[(sizeof(MAT2)==16)?1:-1];
typedef struct { LONG x,y; } POINTL;
typedef struct { u32 gmBlackBoxX,gmBlackBoxY; POINTL gmptGlyphOrigin; short gmCellIncX,gmCellIncY; } GLYPHMETRICS;
typedef struct { LONG tmHeight,tmAscent,tmDescent,tmInternalLeading,tmExternalLeading,tmAveCharWidth,tmMaxCharWidth,tmWeight,tmOverhang,tmDigitizedAspectX,tmDigitizedAspectY; WCHAR tmFirstChar,tmLastChar,tmDefaultChar,tmBreakChar; u8 tmItalic,tmUnderlined,tmStruckOut,tmPitchAndFamily,tmCharSet; } TEXTMETRICW;
typedef struct { u16 wFirst,wSecond; int iKernAmount; } KERNINGPAIR;

typedef int (WINAPI *PFN_AddFontResourceExW)(const WCHAR*,DWORD,void*);
typedef BOOL (WINAPI *PFN_RemoveFontResourceExW)(const WCHAR*,DWORD,void*);
typedef HDC (WINAPI *PFN_CreateCompatibleDC)(HDC);
typedef BOOL (WINAPI *PFN_DeleteDC)(HDC);
typedef HFONT (WINAPI *PFN_CreateFontW)(int,int,int,int,int,DWORD,DWORD,DWORD,DWORD,DWORD,DWORD,DWORD,DWORD,const WCHAR*);
typedef HGDIOBJ (WINAPI *PFN_SelectObject)(HDC,HGDIOBJ);
typedef BOOL (WINAPI *PFN_DeleteObject)(HGDIOBJ);
typedef BOOL (WINAPI *PFN_GetTextMetricsW)(HDC,TEXTMETRICW*);
typedef DWORD (WINAPI *PFN_GetGlyphOutlineW)(HDC,u32,u32,GLYPHMETRICS*,DWORD,void*,const MAT2*);
typedef DWORD (WINAPI *PFN_GetKerningPairsW)(HDC,DWORD,KERNINGPAIR*);

static HMODULE g_gdi32;
static LSX_INIT_ONCE g_gdi_once;
static int g_gdi_ready;
static PFN_AddFontResourceExW p_AddFontResourceExW;
static PFN_RemoveFontResourceExW p_RemoveFontResourceExW;
static PFN_CreateCompatibleDC p_CreateCompatibleDC;
static PFN_DeleteDC p_DeleteDC;
static PFN_CreateFontW p_CreateFontW;
static PFN_SelectObject p_SelectObject;
static PFN_DeleteObject p_DeleteObject;
static PFN_GetTextMetricsW p_GetTextMetricsW;
static PFN_GetGlyphOutlineW p_GetGlyphOutlineW;
static PFN_GetKerningPairsW p_GetKerningPairsW;

static BOOL WINAPI initialize_gdi_once(LSX_INIT_ONCE* once,void* parameter,void** context){
    (void)once;(void)parameter;(void)context;
    media_log("[FONT] Initializing Windows font rasterizer");
    g_gdi32=LoadLibraryA("gdi32.dll");
    if(!g_gdi32){set_error(0,"Windows font rasterizer DLL could not be loaded");return 0;}
    p_AddFontResourceExW=(PFN_AddFontResourceExW)GetProcAddress(g_gdi32,"AddFontResourceExW");
    p_RemoveFontResourceExW=(PFN_RemoveFontResourceExW)GetProcAddress(g_gdi32,"RemoveFontResourceExW");
    p_CreateCompatibleDC=(PFN_CreateCompatibleDC)GetProcAddress(g_gdi32,"CreateCompatibleDC");
    p_DeleteDC=(PFN_DeleteDC)GetProcAddress(g_gdi32,"DeleteDC");
    p_CreateFontW=(PFN_CreateFontW)GetProcAddress(g_gdi32,"CreateFontW");
    p_SelectObject=(PFN_SelectObject)GetProcAddress(g_gdi32,"SelectObject");
    p_DeleteObject=(PFN_DeleteObject)GetProcAddress(g_gdi32,"DeleteObject");
    p_GetTextMetricsW=(PFN_GetTextMetricsW)GetProcAddress(g_gdi32,"GetTextMetricsW");
    p_GetGlyphOutlineW=(PFN_GetGlyphOutlineW)GetProcAddress(g_gdi32,"GetGlyphOutlineW");
    p_GetKerningPairsW=(PFN_GetKerningPairsW)GetProcAddress(g_gdi32,"GetKerningPairsW");
    g_gdi_ready=p_CreateCompatibleDC&&p_DeleteDC&&p_CreateFontW&&p_SelectObject&&p_DeleteObject&&p_GetTextMetricsW&&p_GetGlyphOutlineW;
    if(g_gdi_ready) media_log("[FONT] Windows font rasterizer ready");
    else set_error(0,"Windows font rasterizer exports are incomplete");
    return g_gdi_ready;
}
static int ensure_gdi(void){
    if(g_gdi_ready) return 1;
    return InitOnceExecuteOnce(&g_gdi_once,initialize_gdi_once,0,0)&&g_gdi_ready;
}

typedef struct LSXFont {
    int ok,pixel_height,private_added;
    HDC dc; HFONT font; HGDIOBJ previous;
    WCHAR* path; WCHAR* face;
    float ascent,descent,line_height;
    KERNINGPAIR* kern_pairs; u32 kern_count;
    char error[256];
} LSXFont;

typedef struct LSXGlyph {
    int codepoint;
    float advance,x0,y0,x1,y1,u0,v0,u1,v1;
} LSXGlyph;

typedef struct LSXSdfAtlas {
    int ok,width,height,pixel_height,first_codepoint,glyph_count,spread,padding;
    float ascent,descent,line_height;
    u32 checksum;
    u8* pixels; LSXGlyph* glyphs;
    char error[256];
} LSXSdfAtlas;

static u32 kern_key(const KERNINGPAIR* pair){return ((u32)pair->wFirst<<16)|(u32)pair->wSecond;}
static void sort_kern_pairs(KERNINGPAIR* pairs,int left,int right){
    int i=left,j=right;u32 pivot;KERNINGPAIR temporary;
    if(!pairs||left>=right)return;
    pivot=kern_key(&pairs[left+(right-left)/2]);
    while(i<=j){
        while(kern_key(&pairs[i])<pivot)i++;
        while(kern_key(&pairs[j])>pivot)j--;
        if(i<=j){temporary=pairs[i];pairs[i]=pairs[j];pairs[j]=temporary;i++;j--;}
    }
    if(left<j)sort_kern_pairs(pairs,left,j);
    if(i<right)sort_kern_pairs(pairs,i,right);
}

LSX_EXPORT void* _lsxFontLoad(const char* path,const char* face_name,int pixel_height){
    LSXFont* out=(LSXFont*)halloc(sizeof(LSXFont));
    TEXTMETRICW tm;
    DWORD count;
    if(!out) return 0;
    media_log("[FONT] Face load started");
    if(pixel_height<4||pixel_height>512){set_error(out->error,"Font pixel height must be between 4 and 512");return out;}
    if(!ensure_gdi()){set_error(out->error,g_last_error);return out;}
    out->pixel_height=pixel_height;
    out->path=utf8_to_wide(path?path:"");
    out->face=utf8_to_wide(face_name&&face_name[0]?face_name:"Segoe UI");
    if(!out->face){set_error(out->error,"Font face name is invalid UTF-8");return out;}
    if(path&&path[0]&&!out->path){set_error(out->error,"Font file path is invalid UTF-8");return out;}
    if(out->path&&out->path[0]&&p_AddFontResourceExW){
        // Registration failure is not immediately fatal. The requested face may
        // already be installed (for example a file in C:/Windows/Fonts).
        if(p_AddFontResourceExW(out->path,FR_PRIVATE,0)>0) out->private_added=1;
        else media_log("[FONT] Private registration failed; trying the installed face name");
    }
    out->dc=p_CreateCompatibleDC(0);
    if(!out->dc){set_error(out->error,"Font device context creation failed");return out;}
    out->font=p_CreateFontW(-pixel_height,0,0,0,FW_NORMAL,0,0,0,DEFAULT_CHARSET,OUT_TT_PRECIS,CLIP_DEFAULT_PRECIS,ANTIALIASED_QUALITY,DEFAULT_PITCH|FF_DONTCARE,out->face);
    if(!out->font){set_error(out->error,"Font face could not be created; verify the face name");return out;}
    out->previous=p_SelectObject(out->dc,out->font);
    if(!out->previous||out->previous==HGDI_ERROR){set_error(out->error,"Font face could not be selected into the rasterizer");return out;}
    memzero(&tm,sizeof(tm));
    if(!p_GetTextMetricsW(out->dc,&tm)){set_error(out->error,"Font metrics could not be read");return out;}
    out->ascent=(float)tm.tmAscent;
    out->descent=(float)tm.tmDescent;
    out->line_height=(float)(tm.tmHeight+tm.tmExternalLeading);
    if(p_GetKerningPairsW){
        count=p_GetKerningPairsW(out->dc,0,0);
        if(count&&count<1048576u){
            out->kern_pairs=(KERNINGPAIR*)halloc((ULONG_PTR)count*sizeof(KERNINGPAIR));
            if(out->kern_pairs){
                out->kern_count=p_GetKerningPairsW(out->dc,count,out->kern_pairs);
                if(out->kern_count>1)sort_kern_pairs(out->kern_pairs,0,(int)out->kern_count-1);
            }
        }
    }
    out->ok=1;
    g_last_error[0]=0;
    media_log("[FONT] Face load completed successfully");
    return out;
}
LSX_EXPORT int _lsxFontOk(void* h){return h?((LSXFont*)h)->ok:0;}
LSX_EXPORT const char* _lsxFontError(void* h){return h?((LSXFont*)h)->error:"Font handle is null";}
LSX_EXPORT float _lsxFontAscent(void* h){return h?((LSXFont*)h)->ascent:0;}
LSX_EXPORT float _lsxFontDescent(void* h){return h?((LSXFont*)h)->descent:0;}
LSX_EXPORT float _lsxFontLineHeight(void* h){return h?((LSXFont*)h)->line_height:0;}
LSX_EXPORT float _lsxFontKerning(void* h,int left,int right){
    LSXFont* f=(LSXFont*)h;
    u32 target;
    int low,high;
    if(!f||!f->kern_pairs||!f->kern_count)return 0;
    target=((u32)(u16)left<<16)|(u32)(u16)right;
    low=0;high=(int)f->kern_count-1;
    while(low<=high){
        int middle=low+(high-low)/2;
        u32 key=kern_key(&f->kern_pairs[middle]);
        if(key==target)return(float)f->kern_pairs[middle].iKernAmount;
        if(key<target)low=middle+1;else high=middle-1;
    }
    return 0;
}
LSX_EXPORT void _lsxFontDestroy(void* h){
    LSXFont* f=(LSXFont*)h;
    if(!f)return;
    if(f->dc&&f->previous&&f->previous!=HGDI_ERROR)p_SelectObject(f->dc,f->previous);
    if(f->font)p_DeleteObject(f->font);
    if(f->dc)p_DeleteDC(f->dc);
    if(f->private_added&&f->path&&p_RemoveFontResourceExW)p_RemoveFontResourceExW(f->path,FR_PRIVATE,0);
    hfree(f->kern_pairs);hfree(f->path);hfree(f->face);hfree(f);
}

// Fast two-pass chamfer distance field. Atlas generation is setup-time work,
// but this keeps even a cold cache from stalling for the old O(spread^2) cost
// at every output pixel.
static void chamfer_pass(float* d,int width,int height,int forward){
    const float diagonal=1.41421356f;
    int x,y;
    if(forward){
        for(y=0;y<height;y++)for(x=0;x<width;x++){
            int i=y*width+x;float v=d[i],t;
            if(x>0){t=d[i-1]+1.0f;if(t<v)v=t;}
            if(y>0){t=d[i-width]+1.0f;if(t<v)v=t;}
            if(x>0&&y>0){t=d[i-width-1]+diagonal;if(t<v)v=t;}
            if(x+1<width&&y>0){t=d[i-width+1]+diagonal;if(t<v)v=t;}
            d[i]=v;
        }
    }else{
        for(y=height-1;y>=0;y--)for(x=width-1;x>=0;x--){
            int i=y*width+x;float v=d[i],t;
            if(x+1<width){t=d[i+1]+1.0f;if(t<v)v=t;}
            if(y+1<height){t=d[i+width]+1.0f;if(t<v)v=t;}
            if(x+1<width&&y+1<height){t=d[i+width+1]+diagonal;if(t<v)v=t;}
            if(x>0&&y+1<height){t=d[i+width-1]+diagonal;if(t<v)v=t;}
            d[i]=v;
        }
    }
}
static int make_sdf(const u8* source,int sw,int sh,int pitch,u8* output,int ow,int oh,int spread){
    const float inf=1000000.0f;
    float* to_inside=(float*)halloc((ULONG_PTR)ow*(ULONG_PTR)oh*sizeof(float));
    float* to_outside=(float*)halloc((ULONG_PTR)ow*(ULONG_PTR)oh*sizeof(float));
    int x,y;
    if(!to_inside||!to_outside){hfree(to_inside);hfree(to_outside);return 0;}
    for(y=0;y<oh;y++)for(x=0;x<ow;x++){
        int sx=x-spread,sy=y-spread;
        int inside=0;
        int i=y*ow+x;
        if(sx>=0&&sy>=0&&sx<sw&&sy<sh) inside=source[sy*pitch+sx]>=16;
        to_inside[i]=inside?0.0f:inf;
        to_outside[i]=inside?inf:0.0f;
    }
    chamfer_pass(to_inside,ow,oh,1);chamfer_pass(to_inside,ow,oh,0);
    chamfer_pass(to_outside,ow,oh,1);chamfer_pass(to_outside,ow,oh,0);
    for(y=0;y<oh;y++)for(x=0;x<ow;x++){
        int i=y*ow+x;
        float signed_distance=to_outside[i]-to_inside[i];
        int value;
        if(signed_distance>(float)spread)signed_distance=(float)spread;
        if(signed_distance<-(float)spread)signed_distance=-(float)spread;
        value=(int)(128.0f+signed_distance*(127.0f/(float)spread));
        if(value<0)value=0;if(value>255)value=255;
        output[i]=(u8)value;
    }
    hfree(to_inside);hfree(to_outside);return 1;
}

LSX_EXPORT void* _lsxFontCreateSdfAtlas(void* font_handle,int first_codepoint,int glyph_count,int atlas_width,int atlas_height,int spread,int padding){
    LSXFont* font=(LSXFont*)font_handle;
    LSXSdfAtlas* out=(LSXSdfAtlas*)halloc(sizeof(LSXSdfAtlas));
    MAT2 mat;
    int pen_x,pen_y,row_h,i;
    if(!out) return 0;
    media_log("[FONT] SDF atlas generation started");
    if(!font||!font->ok){set_error(out->error,"Font is not valid");return out;}
    if(glyph_count<1||glyph_count>4096||atlas_width<64||atlas_width>16384||atlas_height<64||atlas_height>16384||spread<1||spread>64||padding<0||padding>64){set_error(out->error,"SDF atlas settings are invalid");return out;}
    if((u64)atlas_width*(u64)atlas_height>268435456ULL){set_error(out->error,"SDF atlas is too large");return out;}
    out->pixels=(u8*)halloc((ULONG_PTR)atlas_width*(ULONG_PTR)atlas_height);
    out->glyphs=(LSXGlyph*)halloc((ULONG_PTR)glyph_count*sizeof(LSXGlyph));
    if(!out->pixels||!out->glyphs){set_error(out->error,"SDF atlas allocation failed");return out;}
    memzero(&mat,sizeof(mat));mat.eM11.value=1;mat.eM22.value=1;
    pen_x=padding;pen_y=padding;row_h=0;
    for(i=0;i<glyph_count;i++){
        int codepoint=first_codepoint+i;
        GLYPHMETRICS gm;
        DWORD bytes;
        u8* bitmap=0;
        int pitch,gw,gh,ow,oh,x,y;
        LSXGlyph* glyph=&out->glyphs[i];
        memzero(&gm,sizeof(gm));glyph->codepoint=codepoint;
        bytes=p_GetGlyphOutlineW(font->dc,(u32)codepoint,GGO_GRAY8_BITMAP,&gm,0,0,&mat);
        if(bytes==GDI_ERROR){glyph->advance=font->pixel_height*0.5f;continue;}
        glyph->advance=(float)gm.gmCellIncX;
        gw=(int)gm.gmBlackBoxX;gh=(int)gm.gmBlackBoxY;
        if(gw<1||gh<1) continue;
        pitch=(gw+3)&~3;
        bitmap=(u8*)halloc(bytes?bytes:(ULONG_PTR)pitch*(ULONG_PTR)gh);
        if(!bitmap){set_error(out->error,"Glyph bitmap allocation failed");return out;}
        if(p_GetGlyphOutlineW(font->dc,(u32)codepoint,GGO_GRAY8_BITMAP,&gm,bytes,bitmap,&mat)==GDI_ERROR){hfree(bitmap);continue;}
        ow=gw+spread*2;oh=gh+spread*2;
        if(pen_x+ow+padding>atlas_width){pen_x=padding;pen_y+=row_h+padding;row_h=0;}
        if(pen_y+oh+padding>atlas_height){hfree(bitmap);set_error(out->error,"SDF atlas is full; increase atlas dimensions");return out;}
        {
            u8* sdf=(u8*)halloc((ULONG_PTR)ow*(ULONG_PTR)oh);
            if(!sdf){hfree(bitmap);set_error(out->error,"SDF glyph allocation failed");return out;}
            if(!make_sdf(bitmap,gw,gh,pitch,sdf,ow,oh,spread)){hfree(sdf);hfree(bitmap);set_error(out->error,"SDF distance generation allocation failed");return out;}
            for(y=0;y<oh;y++)for(x=0;x<ow;x++)out->pixels[(pen_y+y)*atlas_width+pen_x+x]=sdf[y*ow+x];
            hfree(sdf);
        }
        hfree(bitmap);
        glyph->x0=(float)gm.gmptGlyphOrigin.x-(float)spread;
        glyph->y0=-(float)gm.gmptGlyphOrigin.y-(float)spread;
        glyph->x1=glyph->x0+(float)ow;glyph->y1=glyph->y0+(float)oh;
        glyph->u0=(float)pen_x/(float)atlas_width;glyph->v0=(float)pen_y/(float)atlas_height;
        glyph->u1=(float)(pen_x+ow)/(float)atlas_width;glyph->v1=(float)(pen_y+oh)/(float)atlas_height;
        pen_x+=ow+padding;if(oh>row_h)row_h=oh;
    }
    out->ok=1;
    out->width=atlas_width;out->height=atlas_height;out->pixel_height=font->pixel_height;
    out->first_codepoint=first_codepoint;out->glyph_count=glyph_count;out->spread=spread;out->padding=padding;
    out->ascent=font->ascent;out->descent=font->descent;out->line_height=font->line_height;
    out->checksum=checksum_bytes(out->pixels,(u64)atlas_width*(u64)atlas_height);
    g_last_error[0]=0;
    media_log("[FONT] SDF atlas generation completed successfully");
    return out;
}

static LSXGlyph* atlas_glyph(LSXSdfAtlas* a,int codepoint){int index;if(!a)return 0;index=codepoint-a->first_codepoint;if(index>=0&&index<a->glyph_count)return &a->glyphs[index];index='?'-a->first_codepoint;if(index>=0&&index<a->glyph_count)return &a->glyphs[index];return 0;}
static int utf8_next(const u8** cursor){const u8* s=*cursor;int cp;if(!s||!*s)return -1;if(s[0]<0x80){*cursor=s+1;return s[0];}if((s[0]&0xE0)==0xC0&&s[1]){cp=((s[0]&31)<<6)|(s[1]&63);*cursor=s+2;return cp;}if((s[0]&0xF0)==0xE0&&s[1]&&s[2]){cp=((s[0]&15)<<12)|((s[1]&63)<<6)|(s[2]&63);*cursor=s+3;return cp;}if((s[0]&0xF8)==0xF0&&s[1]&&s[2]&&s[3]){cp=((s[0]&7)<<18)|((s[1]&63)<<12)|((s[2]&63)<<6)|(s[3]&63);*cursor=s+4;return cp;}*cursor=s+1;return '?';}

LSX_EXPORT int _lsxSdfTextMaxFloats(const char* text){return cstrlen(text)*24;}
LSX_EXPORT int _lsxSdfBuildText(void* atlas_handle,void* font_handle,const char* text,float origin_x,float origin_y,float scale,float* output,int max_floats,float* width_out,float* height_out){
    LSXSdfAtlas* a=(LSXSdfAtlas*)atlas_handle;LSXFont* f=(LSXFont*)font_handle;const u8* cursor=(const u8*)text;float x=origin_x,y=origin_y,baseline=origin_y+(a?a->ascent*scale:0),max_x=origin_x,max_y=origin_y;int written=0,previous=0,cp;
    if(width_out)*width_out=0;if(height_out)*height_out=0;if(!a||!a->ok||!text||!output||scale<=0)return 0;
    while((cp=utf8_next(&cursor))>=0){
        LSXGlyph* g;
        if(cp=='\r')continue;
        if(cp=='\n'){x=origin_x;y+=a->line_height*scale;baseline=y+a->ascent*scale;previous=0;if(y+a->line_height*scale>max_y)max_y=y+a->line_height*scale;continue;}
        g=atlas_glyph(a,cp);if(!g)continue;
        if(previous&&f)x+=_lsxFontKerning(f,previous,cp)*scale;
        if(g->u1>g->u0&&written+24<=max_floats){
            float x0=x+g->x0*scale,y0=baseline+g->y0*scale,x1=x+g->x1*scale,y1=baseline+g->y1*scale;
            float u0=g->u0,v0=g->v0,u1=g->u1,v1=g->v1;
            float v[24]={x0,y0,u0,v0,x1,y0,u1,v0,x1,y1,u1,v1,x0,y0,u0,v0,x1,y1,u1,v1,x0,y1,u0,v1};
            int k;for(k=0;k<24;k++)output[written+k]=v[k];written+=24;
            if(x1>max_x)max_x=x1;if(y1>max_y)max_y=y1;
        }
        x+=g->advance*scale;if(x>max_x)max_x=x;previous=cp;
    }
    if(width_out)*width_out=max_x-origin_x;
    if(height_out)*height_out=(max_y>origin_y?max_y-origin_y:a->line_height*scale);
    return written;
}

LSX_EXPORT int _lsxSdfAtlasOk(void* h){return h?((LSXSdfAtlas*)h)->ok:0;}
LSX_EXPORT const char* _lsxSdfAtlasError(void* h){return h?((LSXSdfAtlas*)h)->error:"SDF atlas handle is null";}
LSX_EXPORT int _lsxSdfAtlasWidth(void* h){return h?((LSXSdfAtlas*)h)->width:0;}
LSX_EXPORT int _lsxSdfAtlasHeight(void* h){return h?((LSXSdfAtlas*)h)->height:0;}
LSX_EXPORT int _lsxSdfAtlasGlyphCount(void* h){return h?((LSXSdfAtlas*)h)->glyph_count:0;}
LSX_EXPORT float _lsxSdfAtlasLineHeight(void* h){return h?((LSXSdfAtlas*)h)->line_height:0;}
LSX_EXPORT void* _lsxSdfAtlasPixels(void* h){return h?((LSXSdfAtlas*)h)->pixels:0;}
LSX_EXPORT i64 _lsxSdfAtlasByteCount(void* h){LSXSdfAtlas* a=(LSXSdfAtlas*)h;return a?(i64)a->width*(i64)a->height:0;}
LSX_EXPORT u32 _lsxSdfAtlasChecksum(void* h){return h?((LSXSdfAtlas*)h)->checksum:0;}
LSX_EXPORT int _lsxSdfAtlasGetGlyph(void* h,int codepoint,void* output){LSXSdfAtlas* a=(LSXSdfAtlas*)h;LSXGlyph* g=atlas_glyph(a,codepoint);if(!g||!output)return 0;memcopy(output,g,sizeof(LSXGlyph));return 1;}
LSX_EXPORT void _lsxSdfAtlasDestroy(void* h){LSXSdfAtlas* a=(LSXSdfAtlas*)h;if(!a)return;hfree(a->pixels);hfree(a->glyphs);hfree(a);}

// Version 2 invalidates the broken 0.15.5 atlas transform/cache.
typedef struct LSXCacheHeader { char magic[8]; u32 version; int width,height,pixel_height,first_codepoint,glyph_count,spread,padding; float ascent,descent,line_height; u32 checksum; u32 reserved; u64 glyph_bytes,pixel_bytes; } LSXCacheHeader;
static int write_all(HANDLE file,const void* data,u64 bytes){const u8* p=(const u8*)data;while(bytes){DWORD chunk=bytes>0x40000000ULL?0x40000000u:(DWORD)bytes,written=0;if(!WriteFile(file,p,chunk,&written,0)||!written)return 0;p+=written;bytes-=written;}return 1;}
static int read_all(HANDLE file,void* data,u64 bytes){u8* p=(u8*)data;while(bytes){DWORD chunk=bytes>0x40000000ULL?0x40000000u:(DWORD)bytes,read=0;if(!ReadFile(file,p,chunk,&read,0)||!read)return 0;p+=read;bytes-=read;}return 1;}
LSX_EXPORT int _lsxSdfAtlasSave(void* h,const char* path){
    LSXSdfAtlas* a=(LSXSdfAtlas*)h;WCHAR* wide;HANDLE file;LSXCacheHeader header;int ok;
    if(!a||!a->ok||!path||!path[0])return 0;
    wide=utf8_to_wide(path);if(!wide)return 0;
    file=CreateFileW(wide,GENERIC_WRITE,0,0,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,0);hfree(wide);
    if(file==INVALID_HANDLE_VALUE)return 0;
    memzero(&header,sizeof(header));
    header.magic[0]='L';header.magic[1]='S';header.magic[2]='X';header.magic[3]='S';header.magic[4]='D';header.magic[5]='F';header.magic[6]='2';
    header.version=2;header.width=a->width;header.height=a->height;header.pixel_height=a->pixel_height;header.first_codepoint=a->first_codepoint;header.glyph_count=a->glyph_count;header.spread=a->spread;header.padding=a->padding;header.ascent=a->ascent;header.descent=a->descent;header.line_height=a->line_height;header.checksum=a->checksum;header.glyph_bytes=(u64)a->glyph_count*sizeof(LSXGlyph);header.pixel_bytes=(u64)a->width*(u64)a->height;
    ok=write_all(file,&header,sizeof(header))&&write_all(file,a->glyphs,header.glyph_bytes)&&write_all(file,a->pixels,header.pixel_bytes);
    CloseHandle(file);
    if(ok)media_log("[FONT] SDF atlas cache saved");else set_error(0,"SDF atlas cache could not be saved");
    return ok;
}
LSX_EXPORT void* _lsxSdfAtlasLoad(const char* path){
    WCHAR* wide;
    HANDLE file;
    LSXCacheHeader h;
    LSXSdfAtlas* a;
    i64 file_size=0;
    u64 expected_glyph_bytes,expected_pixel_bytes,expected_file_bytes;
    if(!path||!path[0])return 0;
    wide=utf8_to_wide(path);if(!wide)return 0;
    file=CreateFileW(wide,GENERIC_READ,FILE_SHARE_READ,0,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,0);hfree(wide);
    if(file==INVALID_HANDLE_VALUE)return 0;
    if(!GetFileSizeEx(file,&file_size)||file_size<(i64)sizeof(h)||!read_all(file,&h,sizeof(h))||h.magic[0]!='L'||h.magic[1]!='S'||h.magic[2]!='X'||h.magic[3]!='S'||h.magic[4]!='D'||h.magic[5]!='F'||h.magic[6]!='2'||h.version!=2||h.width<1||h.width>16384||h.height<1||h.height>16384||h.pixel_height<4||h.pixel_height>512||h.glyph_count<1||h.glyph_count>4096||h.spread<1||h.spread>64||h.padding<0||h.padding>64){CloseHandle(file);return 0;}
    expected_glyph_bytes=(u64)h.glyph_count*sizeof(LSXGlyph);expected_pixel_bytes=(u64)h.width*(u64)h.height;expected_file_bytes=(u64)sizeof(h)+expected_glyph_bytes+expected_pixel_bytes;
    if(h.glyph_bytes!=expected_glyph_bytes||h.pixel_bytes!=expected_pixel_bytes||(u64)file_size!=expected_file_bytes){CloseHandle(file);return 0;}
    a=(LSXSdfAtlas*)halloc(sizeof(LSXSdfAtlas));if(!a){CloseHandle(file);return 0;}
    a->glyphs=(LSXGlyph*)halloc((ULONG_PTR)expected_glyph_bytes);a->pixels=(u8*)halloc((ULONG_PTR)expected_pixel_bytes);
    if(!a->glyphs||!a->pixels||!read_all(file,a->glyphs,expected_glyph_bytes)||!read_all(file,a->pixels,expected_pixel_bytes)){CloseHandle(file);_lsxSdfAtlasDestroy(a);return 0;}
    CloseHandle(file);
    if(checksum_bytes(a->pixels,expected_pixel_bytes)!=h.checksum){_lsxSdfAtlasDestroy(a);return 0;}
    a->ok=1;a->width=h.width;a->height=h.height;a->pixel_height=h.pixel_height;a->first_codepoint=h.first_codepoint;a->glyph_count=h.glyph_count;a->spread=h.spread;a->padding=h.padding;a->ascent=h.ascent;a->descent=h.descent;a->line_height=h.line_height;a->checksum=h.checksum;
    media_log("[FONT] SDF atlas cache loaded");
    return a;
}

BOOL WINAPI DllMain(void* instance,DWORD reason,void* reserved){(void)instance;(void)reason;(void)reserved;return 1;}
