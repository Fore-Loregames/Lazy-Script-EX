'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const glfwHeader = fs.readFileSync(path.join(root, 'native/include/GLFW/glfw3.h'), 'utf8').replace(/\r/g, '');
const glHeader = fs.readFileSync(path.join(root, 'native/include/glad/gl.h'), 'utf8').replace(/\r/g, '');

function splitParams(text) {
  text = text.trim();
  if (!text || text === 'void') return [];
  const out = [];
  let start = 0, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out;
}

function cleanType(t) {
  return t.replace(/\b(const|volatile|restrict|GLAD_API_PTR|GLFWAPI|APIENTRY|APIENTRYP)\b/g, m => m === 'const' ? 'const' : '')
    .replace(/\s+/g, ' ').trim();
}

function parseParam(p, index) {
  p = p.trim().replace(/\s+/g, ' ');
  if (p === '...') return { raw: p, type: '...', name: `arg${index}` };
  // Arrays are pointer parameters in C.
  p = p.replace(/\[\s*[^\]]*\s*\]$/, '*');
  const m = p.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  if (!m) return { raw: p, type: p, name: `arg${index}` };
  const name = m[1];
  let type = p.slice(0, m.index).trim();
  if (!type) { type = name; return { raw: p, type, name: `arg${index}` }; }
  return { raw: p, type: cleanType(type), name };
}

const callbackTypes = new Set();
for (const m of glfwHeader.matchAll(/typedef\s+[^;]*?\(\s*\*\s*(GLFW[A-Za-z0-9_]*fun|GLFWglproc|GLFWvkproc|PFN_vkGetInstanceProcAddr)\s*\)\s*\([^;]*\)\s*;/gs)) callbackTypes.add(m[1]);
for (const m of glHeader.matchAll(/typedef\s+[^;]*?\(GLAD_API_PTR \*([A-Za-z0-9_]+)\)\s*\([^;]*\)\s*;/g)) callbackTypes.add(m[1]);

function isPointerType(type) {
  return type.includes('*') || callbackTypes.has(type) || /PROC$/.test(type) || [
    'GLFWwindow','GLFWmonitor','GLFWcursor','ALCdevice','ALCcontext','GLsync','GLeglImageOES','GLeglClientBufferEXT','GLVULKANPROCNV'
  ].includes(type.replace(/\bconst\b/g,'').trim());
}

function abiKind(type) {
  const t = type.replace(/\bconst\b/g, '').replace(/\s+/g, ' ').trim();
  if (t === 'void') return 'void';
  if (isPointerType(type)) {
    if (/^const\s+(char|GLchar|ALchar|ALCchar)\s*\*$/.test(type.trim())) return 'string';
    return 'ptr';
  }
  if (/^(double|GLdouble|GLclampd|ALdouble)$/.test(t)) return 'f32double';
  if (/^(float|GLfloat|GLclampf|ALfloat)$/.test(t)) return 'f32';
  if (/^(uint64_t|GLuint64|GLuint64EXT|GLbitfield64|unsigned long long)$/.test(t)) return 'u64';
  if (/^(int64_t|GLint64|GLint64EXT|long long)$/.test(t)) return 'i64';
  if (/^(size_t|ptrdiff_t|GLintptr|GLsizeiptr|GLintptrARB|GLsizeiptrARB)$/.test(t)) return 'i64';
  if (/^(unsigned|unsigned int|uint32_t|GLuint|GLenum|GLbitfield|GLhandleARB|GLhalf|GLhalfNV|GLushort|GLubyte|GLboolean|ALuint|ALboolean|ALbitfield|ALCuint|ALCboolean)$/.test(t)) return 'u32';
  if (/^(int|signed int|GLint|GLsizei|GLfixed|GLshort|GLbyte|GLchar|GLclampx|VkResult|ALint|ALsizei|ALenum|ALchar|ALCint|ALCsizei|ALCenum|ALCchar)$/.test(t)) return 'i32';
  if (/^(uint16_t|unsigned short)$/.test(t)) return 'u32';
  if (/^(int16_t|short)$/.test(t)) return 'i32';
  if (/^(uint8_t|unsigned char)$/.test(t)) return 'u32';
  if (/^(int8_t|signed char|char)$/.test(t)) return 'i32';
  // GLFW opaque handles and Vulkan opaque types are pointers.
  if (/^(VkInstance|VkPhysicalDevice|VkSurfaceKHR)$/.test(t)) return 'ptr';
  return 'ptr';
}

function lsxType(type, forReturn=false) {
  const k = abiKind(type);
  return ({void:'void', ptr:'ptr', string:'string', f32double:'f32', f32:'f32', u64:'u64', i64:'i64', u32:'u32', i32:'i32'})[k] || (forReturn ? 'ptr' : 'ptr');
}

function cExportType(type, forReturn=false) {
  const k = abiKind(type);
  if (k === 'void') return 'void';
  if (k === 'ptr') return 'void*';
  if (k === 'string') return forReturn ? 'const char*' : 'const char*';
  if (k === 'f32' || k === 'f32double') return 'float';
  if (k === 'u64') return 'unsigned long long';
  if (k === 'i64') return 'long long';
  if (k === 'u32') return 'unsigned int';
  return 'int';
}

function defaultReturn(type) {
  const k = abiKind(type);
  if (k === 'void') return '';
  if (k === 'f32' || k === 'f32double') return '0.0f';
  if (k === 'ptr' || k === 'string') return '0';
  return '0';
}

function castArg(type, name) {
  const k = abiKind(type);
  if (k === 'ptr' || k === 'string' || k === 'f32double' || k === 'u32' || k === 'i32' || k === 'u64' || k === 'i64' || k === 'f32') {
    return `(${type})${name}`;
  }
  return `(${type})${name}`;
}

function castReturn(type, expr) {
  const k = abiKind(type);
  if (k === 'void') return `${expr};`;
  return `return (${cExportType(type, true)})(${expr});`;
}

function sanitizeNumeric(expr) {
  let s = expr.trim();
  s = s.replace(/\/\*.*?\*\//g, '').trim();
  s = s.replace(/\b(UINT64_C|INT64_C)\(([^)]+)\)/g, '$2');
  s = s.replace(/\((?:unsigned|signed|long|int|GLuint64|GLint64|GLenum|GLbitfield|uint64_t|int64_t)\)/g, '');
  s = s.replace(/([0-9A-Fa-fx]+)(?:ULL|LLU|UL|LU|LL|U|L)\b/g, '$1');
  s = s.replace(/~0x0/g, '0xFFFFFFFF');
  s = s.replace(/\(\s*~\s*0U?\s*\)/g, '0xFFFFFFFF');
  if (/^-?0x[0-9A-Fa-f]+$/.test(s) || /^-?\d+$/.test(s)) return s;
  return null;
}

function collectDefines(header, prefix) {
  const raw = new Map();
  for (const line of header.split('\n')) {
    const m = line.match(new RegExp(`^#define\\s+(${prefix}[A-Za-z0-9_]+)\\s+(.+?)\\s*$`));
    if (!m) continue;
    if (m[1].includes('(')) continue;
    raw.set(m[1], m[2]);
  }
  const resolved = new Map();
  function resolve(name, stack=new Set()) {
    if (resolved.has(name)) return resolved.get(name);
    if (stack.has(name)) return null;
    stack.add(name);
    const expr = raw.get(name);
    if (!expr) return null;
    let n = sanitizeNumeric(expr);
    if (n == null) {
      const alias = expr.trim().replace(/[()]/g,'');
      if (raw.has(alias)) n = resolve(alias, stack);
    }
    if (n != null) resolved.set(name, n);
    return n;
  }
  for (const name of raw.keys()) resolve(name);
  return [...resolved.entries()];
}

function parseGlfwFunctions() {
  const out = [];
  const re = /^GLFWAPI\s+(.+?)\s+(glfw[A-Za-z0-9_]+)\((.*?)\);/gm;
  for (const m of glfwHeader.matchAll(re)) {
    const name = m[2];
    out.push({ name, ret: cleanType(m[1]), params: splitParams(m[3]).map(parseParam) });
  }
  return out;
}

function parseGlFunctions() {
  const typeDefs = new Map();
  const reType = /^typedef\s+(.+?)\s+\(GLAD_API_PTR \*(PFNGL[A-Z0-9_]+PROC)\)\((.*?)\);/gm;
  for (const m of glHeader.matchAll(reType)) {
    typeDefs.set(m[2], { ret: cleanType(m[1]), params: splitParams(m[3]).map(parseParam) });
  }
  const out = [];
  const reDecl = /^GLAD_API_CALL\s+(PFNGL[A-Z0-9_]+PROC)\s+glad_(gl[A-Za-z0-9_]+);/gm;
  for (const m of glHeader.matchAll(reDecl)) {
    const sig = typeDefs.get(m[1]);
    if (sig) out.push({ name: m[2], pfn: m[1], ...sig });
  }
  return out;
}

const glfw = parseGlfwFunctions();
const gl = parseGlFunctions();

// Hand-maintained standard OpenAL 1.1 + ALC 1.1 + EFX API.  These use only ABI types LSX supports.
const openal = [
  ['void','alEnable','ALenum capability'], ['void','alDisable','ALenum capability'], ['ALboolean','alIsEnabled','ALenum capability'],
  ['const ALchar*','alGetString','ALenum param'], ['void','alGetBooleanv','ALenum param, ALboolean* values'], ['void','alGetIntegerv','ALenum param, ALint* values'], ['void','alGetFloatv','ALenum param, ALfloat* values'], ['void','alGetDoublev','ALenum param, ALdouble* values'],
  ['ALboolean','alGetBoolean','ALenum param'], ['ALint','alGetInteger','ALenum param'], ['ALfloat','alGetFloat','ALenum param'], ['ALdouble','alGetDouble','ALenum param'], ['ALenum','alGetError','void'],
  ['ALboolean','alIsExtensionPresent','const ALchar* extname'], ['void*','alGetProcAddress','const ALchar* fname'], ['ALenum','alGetEnumValue','const ALchar* ename'],
  ['void','alListenerf','ALenum param, ALfloat value'], ['void','alListener3f','ALenum param, ALfloat v1, ALfloat v2, ALfloat v3'], ['void','alListenerfv','ALenum param, const ALfloat* values'], ['void','alListeneri','ALenum param, ALint value'], ['void','alListener3i','ALenum param, ALint v1, ALint v2, ALint v3'], ['void','alListeneriv','ALenum param, const ALint* values'],
  ['void','alGetListenerf','ALenum param, ALfloat* value'], ['void','alGetListener3f','ALenum param, ALfloat* v1, ALfloat* v2, ALfloat* v3'], ['void','alGetListenerfv','ALenum param, ALfloat* values'], ['void','alGetListeneri','ALenum param, ALint* value'], ['void','alGetListener3i','ALenum param, ALint* v1, ALint* v2, ALint* v3'], ['void','alGetListeneriv','ALenum param, ALint* values'],
  ['void','alGenSources','ALsizei n, ALuint* sources'], ['void','alDeleteSources','ALsizei n, const ALuint* sources'], ['ALboolean','alIsSource','ALuint source'],
  ['void','alSourcef','ALuint source, ALenum param, ALfloat value'], ['void','alSource3f','ALuint source, ALenum param, ALfloat v1, ALfloat v2, ALfloat v3'], ['void','alSourcefv','ALuint source, ALenum param, const ALfloat* values'], ['void','alSourcei','ALuint source, ALenum param, ALint value'], ['void','alSource3i','ALuint source, ALenum param, ALint v1, ALint v2, ALint v3'], ['void','alSourceiv','ALuint source, ALenum param, const ALint* values'],
  ['void','alGetSourcef','ALuint source, ALenum param, ALfloat* value'], ['void','alGetSource3f','ALuint source, ALenum param, ALfloat* v1, ALfloat* v2, ALfloat* v3'], ['void','alGetSourcefv','ALuint source, ALenum param, ALfloat* values'], ['void','alGetSourcei','ALuint source, ALenum param, ALint* value'], ['void','alGetSource3i','ALuint source, ALenum param, ALint* v1, ALint* v2, ALint* v3'], ['void','alGetSourceiv','ALuint source, ALenum param, ALint* values'],
  ['void','alSourcePlayv','ALsizei n, const ALuint* sources'], ['void','alSourceStopv','ALsizei n, const ALuint* sources'], ['void','alSourceRewindv','ALsizei n, const ALuint* sources'], ['void','alSourcePausev','ALsizei n, const ALuint* sources'], ['void','alSourcePlay','ALuint source'], ['void','alSourceStop','ALuint source'], ['void','alSourceRewind','ALuint source'], ['void','alSourcePause','ALuint source'], ['void','alSourceQueueBuffers','ALuint source, ALsizei nb, const ALuint* buffers'], ['void','alSourceUnqueueBuffers','ALuint source, ALsizei nb, ALuint* buffers'],
  ['void','alGenBuffers','ALsizei n, ALuint* buffers'], ['void','alDeleteBuffers','ALsizei n, const ALuint* buffers'], ['ALboolean','alIsBuffer','ALuint buffer'], ['void','alBufferData','ALuint buffer, ALenum format, const ALvoid* data, ALsizei size, ALsizei freq'], ['void','alBufferf','ALuint buffer, ALenum param, ALfloat value'], ['void','alBuffer3f','ALuint buffer, ALenum param, ALfloat v1, ALfloat v2, ALfloat v3'], ['void','alBufferfv','ALuint buffer, ALenum param, const ALfloat* values'], ['void','alBufferi','ALuint buffer, ALenum param, ALint value'], ['void','alBuffer3i','ALuint buffer, ALenum param, ALint v1, ALint v2, ALint v3'], ['void','alBufferiv','ALuint buffer, ALenum param, const ALint* values'], ['void','alGetBufferf','ALuint buffer, ALenum param, ALfloat* value'], ['void','alGetBuffer3f','ALuint buffer, ALenum param, ALfloat* v1, ALfloat* v2, ALfloat* v3'], ['void','alGetBufferfv','ALuint buffer, ALenum param, ALfloat* values'], ['void','alGetBufferi','ALuint buffer, ALenum param, ALint* value'], ['void','alGetBuffer3i','ALuint buffer, ALenum param, ALint* v1, ALint* v2, ALint* v3'], ['void','alGetBufferiv','ALuint buffer, ALenum param, ALint* values'],
  ['void','alDopplerFactor','ALfloat value'], ['void','alDopplerVelocity','ALfloat value'], ['void','alSpeedOfSound','ALfloat value'], ['void','alDistanceModel','ALenum distanceModel'],
  ['ALCcontext*','alcCreateContext','ALCdevice* device, const ALCint* attrlist'], ['ALCboolean','alcMakeContextCurrent','ALCcontext* context'], ['void','alcProcessContext','ALCcontext* context'], ['void','alcSuspendContext','ALCcontext* context'], ['void','alcDestroyContext','ALCcontext* context'], ['ALCcontext*','alcGetCurrentContext','void'], ['ALCdevice*','alcGetContextsDevice','ALCcontext* context'], ['ALCdevice*','alcOpenDevice','const ALCchar* devicename'], ['ALCboolean','alcCloseDevice','ALCdevice* device'], ['ALCenum','alcGetError','ALCdevice* device'], ['ALCboolean','alcIsExtensionPresent','ALCdevice* device, const ALCchar* extname'], ['void*','alcGetProcAddress','ALCdevice* device, const ALCchar* funcname'], ['ALCenum','alcGetEnumValue','ALCdevice* device, const ALCchar* enumname'], ['const ALCchar*','alcGetString','ALCdevice* device, ALCenum param'], ['void','alcGetIntegerv','ALCdevice* device, ALCenum param, ALCsizei size, ALCint* values'],
  ['ALCdevice*','alcCaptureOpenDevice','const ALCchar* devicename, ALCuint frequency, ALCenum format, ALCsizei buffersize'], ['ALCboolean','alcCaptureCloseDevice','ALCdevice* device'], ['void','alcCaptureStart','ALCdevice* device'], ['void','alcCaptureStop','ALCdevice* device'], ['void','alcCaptureSamples','ALCdevice* device, ALCvoid* buffer, ALCsizei samples'],
  // EFX 1.0
  ['void','alGenEffects','ALsizei n, ALuint* effects'], ['void','alDeleteEffects','ALsizei n, const ALuint* effects'], ['ALboolean','alIsEffect','ALuint effect'], ['void','alEffecti','ALuint effect, ALenum param, ALint value'], ['void','alEffectiv','ALuint effect, ALenum param, const ALint* values'], ['void','alEffectf','ALuint effect, ALenum param, ALfloat value'], ['void','alEffectfv','ALuint effect, ALenum param, const ALfloat* values'], ['void','alGetEffecti','ALuint effect, ALenum param, ALint* value'], ['void','alGetEffectiv','ALuint effect, ALenum param, ALint* values'], ['void','alGetEffectf','ALuint effect, ALenum param, ALfloat* value'], ['void','alGetEffectfv','ALuint effect, ALenum param, ALfloat* values'],
  ['void','alGenFilters','ALsizei n, ALuint* filters'], ['void','alDeleteFilters','ALsizei n, const ALuint* filters'], ['ALboolean','alIsFilter','ALuint filter'], ['void','alFilteri','ALuint filter, ALenum param, ALint value'], ['void','alFilteriv','ALuint filter, ALenum param, const ALint* values'], ['void','alFilterf','ALuint filter, ALenum param, ALfloat value'], ['void','alFilterfv','ALuint filter, ALenum param, const ALfloat* values'], ['void','alGetFilteri','ALuint filter, ALenum param, ALint* value'], ['void','alGetFilteriv','ALuint filter, ALenum param, ALint* values'], ['void','alGetFilterf','ALuint filter, ALenum param, ALfloat* value'], ['void','alGetFilterfv','ALuint filter, ALenum param, ALfloat* values'],
  ['void','alGenAuxiliaryEffectSlots','ALsizei n, ALuint* slots'], ['void','alDeleteAuxiliaryEffectSlots','ALsizei n, const ALuint* slots'], ['ALboolean','alIsAuxiliaryEffectSlot','ALuint slot'], ['void','alAuxiliaryEffectSloti','ALuint slot, ALenum param, ALint value'], ['void','alAuxiliaryEffectSlotiv','ALuint slot, ALenum param, const ALint* values'], ['void','alAuxiliaryEffectSlotf','ALuint slot, ALenum param, ALfloat value'], ['void','alAuxiliaryEffectSlotfv','ALuint slot, ALenum param, const ALfloat* values'], ['void','alGetAuxiliaryEffectSloti','ALuint slot, ALenum param, ALint* value'], ['void','alGetAuxiliaryEffectSlotiv','ALuint slot, ALenum param, ALint* values'], ['void','alGetAuxiliaryEffectSlotf','ALuint slot, ALenum param, ALfloat* value'], ['void','alGetAuxiliaryEffectSlotfv','ALuint slot, ALenum param, ALfloat* values'],
].map(([ret,name,params]) => ({ret, name, params: splitParams(params).map(parseParam)}));

// OpenAL C typedefs for the generated bridge.
const alPrelude = `
typedef char ALchar; typedef signed char ALbyte; typedef unsigned char ALubyte; typedef short ALshort; typedef unsigned short ALushort;
typedef int ALint; typedef unsigned int ALuint; typedef int ALsizei; typedef int ALenum; typedef unsigned int ALboolean; typedef unsigned int ALbitfield;
typedef float ALfloat; typedef double ALdouble; typedef void ALvoid;
typedef char ALCchar; typedef int ALCint; typedef unsigned int ALCuint; typedef int ALCsizei; typedef int ALCenum; typedef unsigned int ALCboolean; typedef void ALCvoid;
typedef struct ALCdevice_struct ALCdevice; typedef struct ALCcontext_struct ALCcontext;
`;

function emitLsxFunction(f, dll='LSXGameKit.dll') {
  const reserved = new Set(['end','fn','local','if','then','else','while','do','return','use','as','export','extern','const','true','false','not','and','or','base','new','for','break','continue','elseif','null','struct','class','in']);
  const params = f.params.map(p => `${reserved.has(p.name) ? 'arg_'+p.name : p.name}: ${lsxType(p.type)}`).join(', ');
  return `export extern "${dll}" fn ${f.name}(${params}) -> ${lsxType(f.ret, true)}`;
}

function emitPointerAndWrapper(f, kind) {
  const pfn = `LSXPFN_${f.name}`;
  const exactParams = f.params.length ? f.params.map(p => `${p.type} ${p.name}`).join(', ') : 'void';
  const exportParams = f.params.length ? f.params.map(p => `${cExportType(p.type)} ${p.name}`).join(', ') : 'void';
  const args = f.params.map(p => castArg(p.type, p.name)).join(', ');
  const lines = [];
  lines.push(`typedef ${f.ret} (*${pfn})(${exactParams});`);
  lines.push(`static ${pfn} p_${f.name};`);
  let body;
  if (abiKind(f.ret) === 'void') body = `if(!p_${f.name}) return; p_${f.name}(${args});`;
  else body = `if(!p_${f.name}) return ${defaultReturn(f.ret)}; ${castReturn(f.ret, `p_${f.name}(${args})`)}`;
  lines.push(`LSX_EXPORT ${cExportType(f.ret, true)} ${f.name}(${exportParams}) { ${body} }`);
  return lines.join('\n');
}

function emitResolve(f, moduleName) {
  return `    p_${f.name} = (LSXPFN_${f.name})GetProcAddress(${moduleName}, "${f.name}"); if(p_${f.name}) loaded++;`;
}

// Special-case GLFW cursor output so LSX receives f32 values instead of raw f64 storage.
const cursorIndex = glfw.findIndex(f => f.name === 'glfwGetCursorPos');
if (cursorIndex >= 0) {
  glfw[cursorIndex] = { name:'glfwGetCursorPos', ret:'void', params:[{type:'GLFWwindow*',name:'window'},{type:'float*',name:'xpos'},{type:'float*',name:'ypos'}], specialCursor:true };
}

const c = [];
c.push(`// Generated by tools/generate_bindings.js. Thin ABI forwarding only; no window or renderer implementation.\n`);
const glfwRenameBefore = glfw.map(f => `#define ${f.name} glfw_decl_${f.name}`).join('\n');
const glfwRenameAfter = glfw.map(f => `#undef ${f.name}`).join('\n');
const glUndefs = gl.map(f => `#undef ${f.name}`).join('\n');
c.push(`#define WIN32_LEAN_AND_MEAN
#define GLFW_INCLUDE_NONE
#define GLAD_GL_NO_CONTEXT
#ifndef VK_VERSION_1_0
#define VK_VERSION_1_0 1
typedef struct VkInstance_T* VkInstance;
typedef struct VkPhysicalDevice_T* VkPhysicalDevice;
typedef struct VkSurfaceKHR_T* VkSurfaceKHR;
typedef struct VkAllocationCallbacks VkAllocationCallbacks;
typedef int VkResult;
typedef void (*PFN_vkVoidFunction)(void);
typedef PFN_vkVoidFunction (*PFN_vkGetInstanceProcAddr)(VkInstance instance, const char* name);
#endif
${glfwRenameBefore}
#include "include/GLFW/glfw3.h"
${glfwRenameAfter}
#include "include/glad/gl.h"
${glUndefs}
${alPrelude}`);
c.push(`typedef void* HMODULE; typedef int BOOL; typedef unsigned long DWORD; typedef void* LPVOID;\n#define LSX_EXPORT __declspec(dllexport)\n__declspec(dllimport) HMODULE LoadLibraryA(const char*);\n__declspec(dllimport) void* GetProcAddress(HMODULE,const char*);\n__declspec(dllimport) BOOL FreeLibrary(HMODULE);\nstatic HMODULE g_glfw; static HMODULE g_openal; int _fltused = 0;`);

for (const f of glfw) {
  if (f.specialCursor) {
    c.push(`typedef void (*LSXPFN_glfwGetCursorPos_native)(GLFWwindow*, double*, double*); static LSXPFN_glfwGetCursorPos_native p_glfwGetCursorPos_native;\nLSX_EXPORT void glfwGetCursorPos(void* window, float* xpos, float* ypos) { double x=0.0,y=0.0; if(p_glfwGetCursorPos_native) p_glfwGetCursorPos_native((GLFWwindow*)window,&x,&y); if(xpos)*xpos=(float)x; if(ypos)*ypos=(float)y; }`);
  } else c.push(emitPointerAndWrapper(f, 'glfw'));
}
for (const f of openal) c.push(emitPointerAndWrapper(f, 'openal'));
for (const f of gl) {
  c.push(`static ${f.pfn} p_${f.name};`);
  const exportParams = f.params.length ? f.params.map(p => `${cExportType(p.type)} ${p.name}`).join(', ') : 'void';
  const args = f.params.map(p => castArg(p.type, p.name)).join(', ');
  let body;
  if (abiKind(f.ret) === 'void') body = `if(!p_${f.name}) return; p_${f.name}(${args});`;
  else body = `if(!p_${f.name}) return ${defaultReturn(f.ret)}; ${castReturn(f.ret, `p_${f.name}(${args})`)}`;
  c.push(`LSX_EXPORT ${cExportType(f.ret, true)} ${f.name}(${exportParams}) { ${body} }`);
}

c.push(`LSX_EXPORT int lsxLoadLibraries(void) { int loaded=0; if(!g_glfw) g_glfw=LoadLibraryA("glfw3.dll"); if(!g_openal) g_openal=LoadLibraryA("OpenAL32.dll"); if(!g_glfw) return -1;`);
for (const f of glfw) {
  if (f.specialCursor) c.push(`    p_glfwGetCursorPos_native=(LSXPFN_glfwGetCursorPos_native)GetProcAddress(g_glfw,"glfwGetCursorPos"); if(p_glfwGetCursorPos_native) loaded++;`);
  else c.push(emitResolve(f, 'g_glfw'));
}
c.push(`    if(g_openal) {`);
for (const f of openal) c.push(emitResolve(f, 'g_openal'));
c.push(`    } return loaded; }`);

c.push(`LSX_EXPORT int lsxLoadOpenGL(void) { int loaded=0; if(!p_glfwGetProcAddress) return -1;`);
for (const f of gl) c.push(`    p_${f.name}=(${f.pfn})p_glfwGetProcAddress("${f.name}"); if(p_${f.name}) loaded++;`);
c.push(`    return loaded; }`);
c.push(`LSX_EXPORT unsigned int lsxCompileShader(unsigned int type, const char* source) { unsigned int shader; const char* list[1]; int ok=0; if(!p_glCreateShader||!p_glShaderSource||!p_glCompileShader||!p_glGetShaderiv||!source) return 0; shader=p_glCreateShader((GLenum)type); if(!shader) return 0; list[0]=source; p_glShaderSource(shader,1,(const GLchar* const*)list,0); p_glCompileShader(shader); p_glGetShaderiv(shader,0x8B81,&ok); if(!ok){ if(p_glDeleteShader)p_glDeleteShader(shader); return 0; } return shader; }
LSX_EXPORT unsigned int lsxCreateProgram(const char* vertexSource, const char* fragmentSource) { unsigned int vs,fs,program; int ok=0; if(!p_glCreateProgram||!p_glAttachShader||!p_glLinkProgram||!p_glGetProgramiv) return 0; vs=lsxCompileShader(0x8B31,vertexSource); fs=lsxCompileShader(0x8B30,fragmentSource); if(!vs||!fs){ if(vs&&p_glDeleteShader)p_glDeleteShader(vs); if(fs&&p_glDeleteShader)p_glDeleteShader(fs); return 0; } program=p_glCreateProgram(); p_glAttachShader(program,vs); p_glAttachShader(program,fs); p_glLinkProgram(program); p_glGetProgramiv(program,0x8B82,&ok); if(p_glDeleteShader){p_glDeleteShader(vs);p_glDeleteShader(fs);} if(!ok){if(p_glDeleteProgram)p_glDeleteProgram(program);return 0;} return program; }
LSX_EXPORT unsigned int lsxCreateComputeProgram(const char* source) { unsigned int cs,program; int ok=0; if(!p_glCreateProgram||!p_glAttachShader||!p_glLinkProgram||!p_glGetProgramiv) return 0; cs=lsxCompileShader(0x91B9,source); if(!cs)return 0; program=p_glCreateProgram(); p_glAttachShader(program,cs); p_glLinkProgram(program); p_glGetProgramiv(program,0x8B82,&ok); if(p_glDeleteShader)p_glDeleteShader(cs); if(!ok){if(p_glDeleteProgram)p_glDeleteProgram(program);return 0;} return program; }`);

c.push(`LSX_EXPORT int lsxHasOpenAL(void) { return g_openal ? 1 : 0; }\nLSX_EXPORT void lsxUnloadLibraries(void) { if(g_openal){FreeLibrary(g_openal);g_openal=0;} if(g_glfw){FreeLibrary(g_glfw);g_glfw=0;} }\nBOOL DllMain(void* module, DWORD reason, LPVOID reserved) { (void)module;(void)reason;(void)reserved; return 1; }`);

fs.writeFileSync(path.join(root,'native/lsx_gamekit_bridge.c'), c.join('\n\n'));

// LSX bindings and constants.
const glfwLsx = [];
glfwLsx.push('-- Generated GLFW 3.4 API forwarding bindings. GLFW itself owns all windows, contexts, input and events.');
glfwLsx.push('export extern "LSXGameKit.dll" fn lsxLoadLibraries() -> i32');
glfwLsx.push('export extern "LSXGameKit.dll" fn lsxUnloadLibraries() -> void');
for (const [name, value] of collectDefines(glfwHeader, 'GLFW_')) glfwLsx.push(`export ${name} = ${value}`);
for (const f of glfw) glfwLsx.push(emitLsxFunction(f));
glfwLsx.push(fs.readFileSync(path.join(root, 'tools/templates/glfw_convenience.lsx'), 'utf8'));
fs.writeFileSync(path.join(root,'bindings/GLFW/GLFW.lsx'), glfwLsx.join('\n')+'\n');

const glLsx = [];
glLsx.push('-- Generated OpenGL 4.6 + extension bindings from the Khronos-derived GLAD registry header.');
glLsx.push('export extern "LSXGameKit.dll" fn lsxLoadOpenGL() -> i32');
glLsx.push('export extern "LSXGameKit.dll" fn lsxCompileShader(shader_type: u32, source: string) -> u32');
glLsx.push('export extern "LSXGameKit.dll" fn lsxCreateProgram(vertex_source: string, fragment_source: string) -> u32');
glLsx.push('export extern "LSXGameKit.dll" fn lsxCreateComputeProgram(source: string) -> u32');
for (const [name, value] of collectDefines(glHeader, 'GL_')) glLsx.push(`export ${name} = ${value}`);
for (const f of gl) glLsx.push(emitLsxFunction(f));
glLsx.push(fs.readFileSync(path.join(root, 'tools/templates/opengl_convenience.lsx'), 'utf8'));
fs.writeFileSync(path.join(root,'bindings/OpenGL/OpenGL46.lsx'), glLsx.join('\n')+'\n');

const alConstants = {
AL_FALSE:0, AL_TRUE:1, AL_NONE:0, AL_SOURCE_RELATIVE:0x202, AL_CONE_INNER_ANGLE:0x1001, AL_CONE_OUTER_ANGLE:0x1002,
AL_PITCH:0x1003, AL_POSITION:0x1004, AL_DIRECTION:0x1005, AL_VELOCITY:0x1006, AL_LOOPING:0x1007, AL_BUFFER:0x1009,
AL_GAIN:0x100A, AL_MIN_GAIN:0x100D, AL_MAX_GAIN:0x100E, AL_ORIENTATION:0x100F, AL_SOURCE_STATE:0x1010,
AL_INITIAL:0x1011, AL_PLAYING:0x1012, AL_PAUSED:0x1013, AL_STOPPED:0x1014, AL_BUFFERS_QUEUED:0x1015, AL_BUFFERS_PROCESSED:0x1016,
AL_REFERENCE_DISTANCE:0x1020, AL_ROLLOFF_FACTOR:0x1021, AL_CONE_OUTER_GAIN:0x1022, AL_MAX_DISTANCE:0x1023, AL_SEC_OFFSET:0x1024,
AL_SAMPLE_OFFSET:0x1025, AL_BYTE_OFFSET:0x1026, AL_SOURCE_TYPE:0x1027, AL_STATIC:0x1028, AL_STREAMING:0x1029, AL_UNDETERMINED:0x1030,
AL_FORMAT_MONO8:0x1100, AL_FORMAT_MONO16:0x1101, AL_FORMAT_STEREO8:0x1102, AL_FORMAT_STEREO16:0x1103,
AL_FREQUENCY:0x2001, AL_BITS:0x2002, AL_CHANNELS:0x2003, AL_SIZE:0x2004, AL_UNUSED:0x2010, AL_PENDING:0x2011, AL_PROCESSED:0x2012,
AL_NO_ERROR:0, AL_INVALID_NAME:0xA001, AL_INVALID_ENUM:0xA002, AL_INVALID_VALUE:0xA003, AL_INVALID_OPERATION:0xA004, AL_OUT_OF_MEMORY:0xA005,
AL_VENDOR:0xB001, AL_VERSION:0xB002, AL_RENDERER:0xB003, AL_EXTENSIONS:0xB004,
AL_DOPPLER_FACTOR:0xC000, AL_DOPPLER_VELOCITY:0xC001, AL_SPEED_OF_SOUND:0xC003, AL_DISTANCE_MODEL:0xD000,
AL_INVERSE_DISTANCE:0xD001, AL_INVERSE_DISTANCE_CLAMPED:0xD002, AL_LINEAR_DISTANCE:0xD003, AL_LINEAR_DISTANCE_CLAMPED:0xD004,
AL_EXPONENT_DISTANCE:0xD005, AL_EXPONENT_DISTANCE_CLAMPED:0xD006,
ALC_FALSE:0, ALC_TRUE:1, ALC_FREQUENCY:0x1007, ALC_REFRESH:0x1008, ALC_SYNC:0x1009, ALC_MONO_SOURCES:0x1010, ALC_STEREO_SOURCES:0x1011,
ALC_NO_ERROR:0, ALC_INVALID_DEVICE:0xA001, ALC_INVALID_CONTEXT:0xA002, ALC_INVALID_ENUM:0xA003, ALC_INVALID_VALUE:0xA004, ALC_OUT_OF_MEMORY:0xA005,
ALC_MAJOR_VERSION:0x1000, ALC_MINOR_VERSION:0x1001, ALC_ATTRIBUTES_SIZE:0x1002, ALC_ALL_ATTRIBUTES:0x1003, ALC_DEFAULT_DEVICE_SPECIFIER:0x1004,
ALC_DEVICE_SPECIFIER:0x1005, ALC_EXTENSIONS:0x1006, ALC_CAPTURE_DEVICE_SPECIFIER:0x310, ALC_CAPTURE_DEFAULT_DEVICE_SPECIFIER:0x311, ALC_CAPTURE_SAMPLES:0x312,
AL_DIRECT_FILTER:0x20005, AL_AUXILIARY_SEND_FILTER:0x20006, AL_EFFECTSLOT_EFFECT:0x0001, AL_EFFECTSLOT_GAIN:0x0002, AL_EFFECTSLOT_AUXILIARY_SEND_AUTO:0x0003,
AL_EFFECT_TYPE:0x8001, AL_EFFECT_NULL:0x0000, AL_EFFECT_REVERB:0x0001, AL_EFFECT_CHORUS:0x0002, AL_EFFECT_DISTORTION:0x0003, AL_EFFECT_ECHO:0x0004,
AL_EFFECT_FLANGER:0x0005, AL_EFFECT_FREQUENCY_SHIFTER:0x0006, AL_EFFECT_VOCAL_MORPHER:0x0007, AL_EFFECT_PITCH_SHIFTER:0x0008,
AL_EFFECT_RING_MODULATOR:0x0009, AL_EFFECT_AUTOWAH:0x000A, AL_EFFECT_COMPRESSOR:0x000B, AL_EFFECT_EQUALIZER:0x000C, AL_EFFECT_EAXREVERB:0x8000,
AL_FILTER_TYPE:0x8001, AL_FILTER_NULL:0x0000, AL_FILTER_LOWPASS:0x0001, AL_FILTER_HIGHPASS:0x0002, AL_FILTER_BANDPASS:0x0003,
AL_LOWPASS_GAIN:0x0001, AL_LOWPASS_GAINHF:0x0002, AL_HIGHPASS_GAIN:0x0001, AL_HIGHPASS_GAINLF:0x0002,
AL_BANDPASS_GAIN:0x0001, AL_BANDPASS_GAINLF:0x0002, AL_BANDPASS_GAINHF:0x0003,
};
const alLsx = ['-- OpenAL 1.1, ALC 1.1 and EFX forwarding bindings.'];
alLsx.push('export extern "LSXGameKit.dll" fn lsxHasOpenAL() -> i32');
for (const [name,value] of Object.entries(alConstants)) alLsx.push(`export ${name} = ${typeof value === 'number' ? '0x'+value.toString(16).toUpperCase() : value}`);
for (const f of openal) alLsx.push(emitLsxFunction(f));
alLsx.push(fs.readFileSync(path.join(root, 'tools/templates/openal_convenience.lsx'), 'utf8'));
fs.writeFileSync(path.join(root,'bindings/OpenAL/OpenAL.lsx'), alLsx.join('\n')+'\n');

const manifest = {
  generatedAt: new Date().toISOString(), glfwFunctions: glfw.length, glfwConstants: collectDefines(glfwHeader,'GLFW_').length,
  openGLFunctions: gl.length, openGLConstants: collectDefines(glHeader,'GL_').length, openALFunctions: openal.length,
};
fs.writeFileSync(path.join(root,'bindings/BINDING_MANIFEST.json'), JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
