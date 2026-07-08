#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const apiRoot = path.resolve(__dirname, '..', 'api');
const jsonPath = path.join(apiRoot, 'api-data.json');
const jsPath = path.join(apiRoot, 'api-data.js');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));

const MODULE_GUIDES = {
  'Language/Static objects': {
    level: 'beginner', title: 'Static managers and shared services',
    whatItIs: 'One persistent object with shared fields, methods, and an optional zero-argument constructor, initialized once before main() and called without .new().',
    whenToUse: 'Use it for one-per-program systems such as a window manager, renderer, input service, audio service, application state, or asset registry.',
    beginnerStart: 'Write export static const Name = { ... }, add constructor = fn() when startup setup is needed, use self inside methods, then call ModuleAlias.Name.Method(...).',
    requires: 'LazyScriptEX 0.18.5 or newer.',
    cleanup: 'Static storage lasts for the process. Add and call an explicit Shutdown method for native resources.'
  },
  'Language/Modules and files': {
    level: 'beginner', title: 'Imports, modules, and project roots',
    whatItIs: 'How LSX files import one another, expose public declarations, share source folders, and find the installed LazyScript API.',
    whenToUse: 'Use this whenever code is split across files or a project imports LazyScript bindings, shared Engine code, or third-party wrappers.',
    beginnerStart: 'Select the LazyScript/API folder once, then type inside use quotes and choose folders or .lsx files from autocomplete.',
    requires: 'A real .lsx target file and a configured named root when using @Name paths.',
    cleanup: 'Imports require no cleanup.'
  },
  'Language/Collection': {
    level: 'beginner', title: 'Ordinary LSX collections',
    whatItIs: 'The built-in growable collection used for lists of values and objects.',
    whenToUse: 'Use it for inventories, entity lists, vertices, indices, UI children, and any ordered data that can grow or shrink.',
    beginnerStart: 'Create one with { ... }, then use length(), push(), remove(), and index access. No explicit collection type is required.',
    requires: 'Nothing to initialize. The compiler manages the storage.',
    cleanup: 'Call destroy() when an owned long-lived collection is no longer needed.'
  },
  'Language/Packed literals': {
    level: 'beginner', title: 'Packed numeric literals',
    whatItIs: 'Normal LSX numeric lists that the compiler packs into native contiguous memory automatically.',
    whenToUse: 'Use them for mesh vertices, indices, texture pixels, audio samples, and native APIs that expect flat numeric buffers.',
    beginnerStart: 'Write local vertices = { ... } or local indices = { ... }. Do not add explicit front-end element types.',
    requires: 'Use one consistent numeric shape in the same list.',
    cleanup: 'The collection owns its storage and is cleaned up with destroy() when required.'
  },
  'UI/LazyUI': {
    level: 'beginner', title: 'LazyUI retained interface system',
    whatItIs: 'Native retained UI elements, layout, input, LSHTML/LSCSS, scrolling, canvas drawing, and event handling.',
    whenToUse: 'Use it for game HUDs, menus, inspectors, editors, forms, lists, and any interface rendered inside an LSX window.',
    beginnerStart: 'Start with LSHTML and LSCSS. Create a root element, pass it to UI.document(root), connect window input, and submit the root to UI/Renderer each frame.',
    requires: 'A GLFW window and the LazyUI renderer for on-screen rendering.',
    cleanup: 'Destroy window input, the document, retained state objects, and the renderer at shutdown.'
  },
  'LazyUI/LSHTML': {
    level: 'beginner', title: 'LSHTML declarations and bindings',
    whatItIs: 'Compiler-native retained UI markup written directly inside .lsx files.',
    whenToUse: 'Use it to declare game HUDs, menus, forms, editor panels, node tools, and reusable UI components without manually creating every element.',
    beginnerStart: 'Declare lshtml View(props) = { ... }, call View(props), pass the root to UI.document(root), then render that root each frame.',
    requires: 'LazyScriptEX inline UI lowering and the UI/LazyUI binding.',
    cleanup: 'The returned retained tree is owned by its Document. Destroy the document at shutdown.'
  },
  'LazyUI/LSHTML elements': {
    level: 'beginner', title: 'All supported LSHTML elements',
    whatItIs: 'The complete searchable set of element names accepted by the LSHTML compiler.',
    whenToUse: 'Search this section whenever choosing a layout, control, editor, game HUD, canvas, or semantic element tag.',
    beginnerStart: 'Place the tag inside an lshtml declaration, add id/class attributes, style it with LSCSS, and retrieve it later with document.find().',
    requires: 'An lshtml declaration in an .lsx module.',
    cleanup: 'Elements are retained and owned by the document tree.'
  },
  'LazyUI/LSHTML attributes': {
    level: 'beginner', title: 'LSHTML attributes and expression bindings',
    whatItIs: 'Every standard attribute recognized by LSHTML, including ids, classes, state, values, component props, and canvas geometry.',
    whenToUse: 'Use this section when configuring element identity, state, data, images, controls, component arguments, or canvas shapes.',
    beginnerStart: 'Use static values in quotes and dynamic LSX values in braces, such as class={props.class_name}.',
    requires: 'An LSHTML element that supports the selected attribute.',
    cleanup: 'Static attributes need no cleanup. Dynamic bindings live with the retained element.'
  },
  'LazyUI/Events': {
    level: 'beginner', title: 'LSHTML and runtime element events',
    whatItIs: 'Declarative on... handlers, UIEvent data, document.find(), and JavaScript-style runtime listener attachment.',
    whenToUse: 'Use it for clicks, edits, focus, keyboard input, pointer dragging, scrolling, and attaching behavior from normal LSX code.',
    beginnerStart: 'Use onclick={handler} in LSHTML or retrieve an element with document.find("#id") and call add_event_listener().',
    requires: 'A UI.document(root) receiving pointer/keyboard input.',
    cleanup: 'Listeners are destroyed with the element. Remove them earlier only when behavior must be detached.'
  },
  'LazyUI/LSCSS': {
    level: 'beginner', title: 'LSCSS declarations and dynamic styles',
    whatItIs: 'Compiler-native styling for retained LSHTML elements, including direct {expression} bindings.',
    whenToUse: 'Use it for layout, spacing, colors, borders, text, overflow, states, transforms, gradients, and editor/game styling.',
    beginnerStart: 'Declare lscss .class = { property = value }, then place that class on one or more LSHTML elements.',
    requires: 'LSHTML elements in the same compiled UI source tree.',
    cleanup: 'Styles are retained on elements and cleaned up with the document.'
  },
  'LazyUI/LSCSS properties': {
    level: 'beginner', title: 'All supported LSCSS properties',
    whatItIs: 'The complete searchable property list accepted by the LSCSS compiler and lowered to LazyUI Style operations.',
    whenToUse: 'Search this section whenever styling layout, colors, borders, text, scrolling, transforms, images, or transitions.',
    beginnerStart: 'Set a static value or bind an LSX expression with braces. Use hyphenated CSS-style property names.',
    requires: 'An lscss rule.',
    cleanup: 'Property storage belongs to the retained element style.'
  },
  'LazyUI/LSCSS selectors': {
    level: 'beginner', title: 'LSCSS selectors and state selectors',
    whatItIs: 'Tag, class, id, descendant, direct-child, grouped, and retained-state selector forms supported by LSCSS.',
    whenToUse: 'Use selectors to target one element, a reusable class, nested UI structure, or hover/focus/checked/disabled states.',
    beginnerStart: 'Prefer reusable .class selectors, use #id for one element, and add :hover or a nested hover block for state styling.',
    requires: 'Matching LSHTML tags, classes, or ids.',
    cleanup: 'Selectors are resolved during compiler lowering and require no runtime cleanup.'
  },
  'UI/Renderer': {
    level: 'intermediate', title: 'LazyUI OpenGL renderer',
    whatItIs: 'The renderer that turns a retained LazyUI tree into native OpenGL draw calls.',
    whenToUse: 'Create one for each UI rendering context, call begin(), submit(root), and flush() each frame.',
    beginnerStart: 'Most applications only need create(), begin(), submit(), flush(), and destroy().',
    requires: 'A current OpenGL 4.6 context and loaded OpenGL functions.',
    cleanup: 'Call renderer.destroy() before destroying the OpenGL window.'
  },
  'UI/ShaderSources': {
    level: 'advanced', title: 'Built-in LazyUI shader source',
    whatItIs: 'The shader text used internally by the LazyUI renderer.',
    whenToUse: 'Only inspect or replace it when building a custom renderer or debugging shader compilation.',
    beginnerStart: 'Normal UI code does not need this module.',
    requires: 'OpenGL shader compilation knowledge.',
    cleanup: 'No owned runtime object is created by reading the source constants.'
  },
  'Math/GLM': {
    level: 'beginner', title: 'Beginner-facing GLM math',
    whatItIs: 'LSX objects for vectors, matrices, quaternions, transforms, projections, interpolation, and decomposition, backed by native GLM.',
    whenToUse: 'Use it for positions, directions, colors, cameras, transforms, animation rotations, and projection math.',
    beginnerStart: 'Create values with GLM.vec3(...), GLM.mat4_identity(), or GLM.quat_identity(), then call methods such as normalized(), multiply(), or slerp().',
    requires: 'The bundled LSXMath native bridge, loaded automatically when the binding is used.',
    cleanup: 'Destroy long-lived GLM objects that own native storage when they are no longer needed.'
  },
  'Math/Camera': {
    level: 'beginner', title: 'Camera helpers',
    whatItIs: 'A high-level camera object that stores position, target, up direction, projection settings, and generated matrices.',
    whenToUse: 'Use it for 3D scene cameras instead of manually rebuilding view and projection matrices every frame.',
    beginnerStart: 'Create a camera, set its position and target, then request or update the view/projection matrices.',
    requires: 'Math/GLM.',
    cleanup: 'Destroy the camera and any matrices it owns at shutdown.'
  },
  'Math/GLMRaw': {
    level: 'advanced', title: 'Raw GLM bridge',
    whatItIs: 'Low-level ABI calls used by the typed Math/GLM wrapper.',
    whenToUse: 'Use only when extending the math binding itself. Game code should use Math/GLM.',
    beginnerStart: 'Prefer Math/GLM unless you are writing a new wrapper function.',
    requires: 'Native pointer and ABI knowledge.',
    cleanup: 'Follow the ownership rules of the typed wrapper or bridge allocation being called.'
  },
  'Math/OpenGL': {
    level: 'intermediate', title: 'GLM-to-OpenGL helpers',
    whatItIs: 'Helpers that expose GLM matrix data in the form expected by OpenGL uniforms.',
    whenToUse: 'Use when uploading camera or transform matrices to a shader.',
    beginnerStart: 'Create the matrix with Math/GLM, then pass it through the OpenGL helper to the matching uniform call.',
    requires: 'Math/GLM and a current OpenGL context.',
    cleanup: 'The original GLM object remains responsible for its lifetime.'
  },
  'GLFW': {
    level: 'intermediate', title: 'GLFW window and input API',
    whatItIs: 'Window creation, keyboard and mouse input, monitors, gamepads, timers, and graphics-context management.',
    whenToUse: 'Use it to create the game window, poll input, obtain framebuffer sizes, and control the application loop.',
    beginnerStart: 'Load libraries, call glfwInit(), set window hints, create a window, make its context current, then poll events each frame.',
    requires: 'Call GLFW.lsxLoadLibraries() and GLFW.glfwInit() before most functions.',
    cleanup: 'Destroy windows, call glfwTerminate(), then GLFW.lsxUnloadLibraries().' 
  },
  'OpenGL': {
    level: 'advanced', title: 'OpenGL 4.6 API',
    whatItIs: 'Direct OpenGL functions and constants for shaders, buffers, textures, drawing, compute, and GPU state.',
    whenToUse: 'Use it when writing renderers or GPU systems. Higher-level engine code should wrap repeated state and resource management.',
    beginnerStart: 'Create a GLFW OpenGL context first, call GL.lsxLoadOpenGL(), then begin with viewport, clear color, shaders, a vertex buffer, and a draw call.',
    requires: 'A current OpenGL context and GL.lsxLoadOpenGL() returning success.',
    cleanup: 'Delete every GPU object you create before destroying the window.'
  },
  'OpenGL/TextureUpload': {
    level: 'intermediate', title: 'Texture upload helpers',
    whatItIs: 'Convenience helpers for uploading LSX image and pixel collections to OpenGL textures.',
    whenToUse: 'Use it after loading an image or generating RGBA pixels in LSX.',
    beginnerStart: 'Load or create pixels, create a texture, upload once, then use the texture ID while rendering.',
    requires: 'A current OpenGL context and loaded OpenGL functions.',
    cleanup: 'Delete the OpenGL texture and destroy temporary pixel/image objects.'
  },
  'Graphics/Image': {
    level: 'beginner', title: 'Image loading compatibility API',
    whatItIs: 'Simple image-loading objects that expose width, height, channels, and RGBA pixel data.',
    whenToUse: 'Use it to load PNG/JPEG-style assets before uploading them to a texture.',
    beginnerStart: 'Load the image, check valid(), read its dimensions, upload its pixels, then destroy the image object.',
    requires: 'A valid asset path.',
    cleanup: 'Call destroy() on loaded images after their pixels are no longer needed.'
  },
  'Graphics/Media': {
    level: 'intermediate', title: 'Native media helpers',
    whatItIs: 'Native image and media utilities supplied by LSXMedia.',
    whenToUse: 'Use the typed graphics wrappers first; use this module when the higher-level wrapper exposes the operation you need.',
    beginnerStart: 'Prefer Graphics/Image and Graphics/Texture2D for normal asset loading.',
    requires: 'The bundled LSXMedia native library.',
    cleanup: 'Release any returned native media resource through its matching destroy/free call.'
  },
  'Graphics/STBImage': {
    level: 'advanced', title: 'Raw stb_image bridge',
    whatItIs: 'Low-level image decoder functions exposed from the native stb_image bridge.',
    whenToUse: 'Use only when extending the higher-level image loader.',
    beginnerStart: 'Prefer Graphics/Image for ordinary image assets.',
    requires: 'Native buffer ownership knowledge.',
    cleanup: 'Free decoded image memory with the matching stb_image free function.'
  },
  'Graphics/Texture2D': {
    level: 'beginner', title: '2D texture wrapper',
    whatItIs: 'An LSX object that owns an OpenGL 2D texture and tracks its dimensions and format.',
    whenToUse: 'Use it for sprites, UI images, material textures, font atlases, and generated pixel data.',
    beginnerStart: 'Create or load a Texture2D, bind it when drawing, and destroy it at shutdown.',
    requires: 'A current OpenGL context.',
    cleanup: 'Call destroy() to delete the owned GPU texture.'
  },
  'OpenAL': {
    level: 'advanced', title: 'OpenAL audio API',
    whatItIs: 'Direct OpenAL and ALC functions/constants for devices, contexts, buffers, sources, spatial sound, and effects.',
    whenToUse: 'Use it to build the engine audio layer or when you need low-level control over playback and 3D audio.',
    beginnerStart: 'Open a device, create a context, generate a buffer and source, attach audio data, then play the source.',
    requires: 'A valid OpenAL device and current context.',
    cleanup: 'Delete sources and buffers, destroy the context, and close the device.'
  },
  'OpenAL/WavPCM': {
    level: 'beginner', title: 'WAV PCM loading',
    whatItIs: 'A small wrapper for loading uncompressed PCM WAV files into data suitable for OpenAL buffers.',
    whenToUse: 'Use it for sound effects and test audio without writing a WAV parser.',
    beginnerStart: 'Load the WAV, verify it, upload its samples to an OpenAL buffer, then destroy the WAV object.',
    requires: 'A PCM WAV file and an OpenAL context for playback.',
    cleanup: 'Destroy the WAV data after uploading and delete the OpenAL buffer when finished.'
  },
  'Text/Font': {
    level: 'beginner', title: 'SDF font and text helpers',
    whatItIs: 'High-level font loading, glyph atlas generation, texture upload, and text mesh/instance creation.',
    whenToUse: 'Use it to render scalable text in games, tools, and LazyUI-compatible custom rendering.',
    beginnerStart: 'Open a font face, create an ASCII or custom atlas, upload it, then build text geometry or instances.',
    requires: 'A font file or system font and an OpenGL context for atlas upload.',
    cleanup: 'Destroy text meshes/instances, atlas textures, atlases, and font faces in reverse order.'
  },
  'Text/FreeType': {
    level: 'intermediate', title: 'Typed FreeType wrapper',
    whatItIs: 'LSX-friendly wrappers over FreeType font faces, glyph loading, metrics, and rasterization.',
    whenToUse: 'Use it when the high-level Text/Font API does not expose a font operation you need.',
    beginnerStart: 'Prefer Text/Font for SDF text. Use this wrapper for custom glyph processing.',
    requires: 'The bundled FreeType native bridge.',
    cleanup: 'Destroy faces, glyph objects, and library resources through their wrapper methods.'
  },
  'Text/FreeTypeRaw': {
    level: 'advanced', title: 'Raw FreeType API',
    whatItIs: 'Direct FreeType ABI calls used by the typed font wrapper.',
    whenToUse: 'Only when extending the FreeType binding or implementing a missing wrapper.',
    beginnerStart: 'Prefer Text/Font or Text/FreeType.',
    requires: 'FreeType and native pointer knowledge.',
    cleanup: 'Match every FreeType creation call with the documented disposal call.'
  },
  'Data/Json': {
    level: 'beginner', title: 'JSON documents and values',
    whatItIs: 'Native JSON parsing, value access, object/array construction, and serialization.',
    whenToUse: 'Use it for save files, settings, asset metadata, network payloads, and tool data.',
    beginnerStart: 'Parse text or a file, check valid(), read values by key/index, then destroy the document.',
    requires: 'Valid UTF-8 JSON text or a readable file.',
    cleanup: 'Destroy documents and owned serialized strings/buffers when finished.'
  },
  'System/File': {
    level: 'beginner', title: 'Files and directories',
    whatItIs: 'UTF-8 text, binary file, path, and directory operations.',
    whenToUse: 'Use it for saves, configuration, asset discovery, logs, and generated files.',
    beginnerStart: 'Check existence, read or write using a clear path, and inspect the returned result before using data.',
    requires: 'The process must have permission to access the path.',
    cleanup: 'Destroy returned file data or directory lists that own storage.'
  },
  'System/Log': {
    level: 'beginner', title: 'Persistent application logging',
    whatItIs: 'Flushed stage, information, warning, error, and success logging to a file.',
    whenToUse: 'Use it around initialization, asset loading, frame stages, and failure paths so crashes can be traced later.',
    beginnerStart: 'Open the log once, write meaningful stage messages, and close it during normal shutdown.',
    requires: 'A writable log folder.',
    cleanup: 'Close the log at shutdown so the final records are flushed.'
  },
  'System/Threading': {
    level: 'intermediate', title: 'Native threads and synchronization',
    whatItIs: 'Operating-system threads, atomics, mutexes, events, semaphores, condition variables, TLS, affinity, and priority.',
    whenToUse: 'Use it for background loading, worker jobs, networking, and CPU work that must not block the main game loop.',
    beginnerStart: 'Start with one worker function, one shared context object, and thread.start()/join(). Add locks only around shared writable state.',
    requires: 'Thread entry functions and shared data must remain valid until the worker exits.',
    cleanup: 'Join workers, close thread handles, and destroy synchronization objects.'
  },
  'Network/Http': {
    level: 'intermediate', title: 'HTTP and HTTPS client',
    whatItIs: 'Native HTTP requests and responses backed by WinHTTP.',
    whenToUse: 'Use it for web APIs, update checks, downloads, and online game services.',
    beginnerStart: 'Create a request/client, set timeouts and headers, send it, check the status, then read the response body.',
    requires: 'Network access and a valid URL.',
    cleanup: 'Close request/session handles and destroy response buffers.'
  },
  'Network/Sockets': {
    level: 'intermediate', title: 'Typed TCP and UDP sockets',
    whatItIs: 'LSX-friendly socket creation, connection, listening, sending, receiving, polling, and closure.',
    whenToUse: 'Use it for custom game protocols, local tools, servers, and low-level networking.',
    beginnerStart: 'Initialize networking, create a client or server socket, check every result, and close the socket on every exit path.',
    requires: 'Networking startup and an available address/port.',
    cleanup: 'Close sockets and shut down networking.'
  },
  'Network/WinSockRaw': {
    level: 'advanced', title: 'Raw WinSock API',
    whatItIs: 'Direct WinSock functions and constants used by Network/Sockets.',
    whenToUse: 'Only when implementing a socket feature missing from the typed wrapper.',
    beginnerStart: 'Prefer Network/Sockets.',
    requires: 'WinSock structures, error codes, byte order, and native buffer knowledge.',
    cleanup: 'Close sockets and balance WSA startup/cleanup calls.'
  },
  'Platform/Win32': {
    level: 'advanced', title: 'Windows platform API',
    whatItIs: 'Selected Win32 constants and functions for messages, files, memory, windows, and process integration.',
    whenToUse: 'Use only for Windows-specific features not already wrapped by GLFW or a typed LSX module.',
    beginnerStart: 'Prefer cross-platform wrappers. MessageBoxA is useful for simple startup errors.',
    requires: 'Windows and knowledge of the specific Win32 function contract.',
    cleanup: 'Release every handle or allocation with its matching Win32 cleanup function.'
  }
};

// Preserve every module guide already generated by the beginner guide pass.
// This enrichment tool adds deeper per-symbol help; it must not rename or
// discard current language categories such as Language/Tables.
for (const [moduleName, guide] of Object.entries(data.moduleGuides || {})) {
  if (!MODULE_GUIDES[moduleName]) MODULE_GUIDES[moduleName] = guide;
}

const SPECIAL_OBJECTS = {
  'UI/LazyUI|CanvasCommand': {
    level: 'internal',
    friendlyDescription: 'One recorded canvas drawing instruction, such as “draw this rectangle,” “draw this line,” or “draw this text.”',
    whatItIs: 'CanvasContext converts friendly calls such as fill_rect(), stroke_line(), fill_text(), and image() into CanvasCommand records. The renderer later reads those records in order and draws them.',
    whenToUse: 'Normally you do not create CanvasCommand yourself. You use CanvasContext drawing methods. Inspect CanvasCommand only when debugging the canvas queue or writing a custom canvas renderer.',
    beginnerNote: 'This is an internal command record, not the main canvas API. Start with UI.canvas(), UI.canvas_context(element), and CanvasContext.fill_rect()/fill_text()/stroke_line().',
    howToGet: 'CanvasContext creates these automatically whenever you call a drawing method. Normal game/UI code should not call CanvasCommand.new().',
    workflow: 'Create a canvas element, get its CanvasContext, call a drawing method, and let UI/Renderer consume the generated command list. Inspect CanvasCommand only when diagnosing or extending that last renderer step.',
    commonMistake: 'Do not create a CanvasCommand and guess which fields must be filled. A partially filled command can render incorrectly. Use CanvasContext methods so the correct kind, geometry, color, text, and texture fields are recorded together.',
    memberSummary: 'kind chooses the drawing operation; x/y/x2/y2/x3/y3 store positions; width/height/radius store shape size; line_width and font_size store drawing settings; color/color2 store packed colors; text stores text payload; texture stores an OpenGL texture ID.',
    related: ['UI/LazyUI.CanvasContext', 'UI/LazyUI.canvas', 'UI/LazyUI.canvas_context']
  },
  'UI/LazyUI|CanvasContext': {
    level: 'beginner',
    friendlyDescription: 'The friendly drawing surface used to record rectangles, circles, paths, text, and images for a LazyUI canvas element.',
    whatItIs: 'A retained command recorder similar to a browser 2D canvas context, but implemented in native LSX. It stores drawing state and a list of CanvasCommand records.',
    whenToUse: 'Use it when a normal LSHTML element is not enough and you need custom shapes, graph lines, minimaps, editor overlays, or procedural HUD drawing.',
    beginnerNote: 'Get it from UI.canvas_context(canvasElement). Do not manually construct CanvasCommand records unless you are extending the renderer.',
    howToGet: 'Create a <canvas> element with LSHTML or UI.canvas(), then call UI.canvas_context(canvasElement).',
    workflow: 'Create the canvas element, get its CanvasContext once, clear or update its recorded drawing commands when the visual changes, then submit the containing LazyUI root through UI/Renderer each frame.',
    commonMistake: 'Do not recreate the context every frame. Keep the canvas element/context and update its commands only when the custom visual changes.',
    memberSummary: 'State: canvas width/height, fill and stroke colors, line width, font size, alpha, translation/scale/rotation, current path, command queue, saved-state stack, and dirty flag. Drawing methods: clear(), fill_rect()/fill_box(), stroke_rect(), line(), circle(), ellipse(), triangle(), draw_text()/fill_text(), image(), plus path and transform methods.',
    related: ['UI/LazyUI.canvas', 'UI/LazyUI.canvas_context', 'UI/LazyUI.CanvasCommand']
  },
  'UI/LazyUI|CanvasState': {
    level: 'internal',
    friendlyDescription: 'A saved copy of the current canvas colors, line width, text size, alpha, and transform.',
    whatItIs: 'CanvasContext.save() creates this record and CanvasContext.restore() applies it later.',
    whenToUse: 'Use save() and restore(); direct CanvasState construction is rarely needed.',
    beginnerNote: 'Prefer canvas.save() and canvas.restore() instead of editing this object yourself.'
  },
  'UI/LazyUI|CanvasPoint': {
    level: 'internal',
    friendlyDescription: 'One transformed X/Y point stored in the current canvas path.',
    whatItIs: 'CanvasContext builds CanvasPoint records when you call move_to(), line_to(), curve methods, or arc().',
    whenToUse: 'Usually never directly. Use the path methods on CanvasContext.',
    beginnerNote: 'This is path storage used behind the friendly canvas API.'
  },
  'UI/LazyUI|Element': {
    level: 'beginner',
    friendlyDescription: 'One retained UI item: a panel, button, text label, input, image, canvas, or other LSHTML element.',
    whatItIs: 'The central LazyUI object. It stores hierarchy, layout, style, text/value state, event handlers, scrolling, and optional canvas/image data.',
    whenToUse: 'LSHTML creates Elements for you. Access one when you need to update text, find an ID, change a class/style, handle input, or mark layout dirty.',
    beginnerNote: 'Prefer LSHTML for building trees; use Element methods for runtime changes.'
  },
  'UI/LazyUI|Document': {
    level: 'beginner',
    friendlyDescription: 'The controller for a complete LazyUI tree, including layout, focus, pointer input, keyboard input, and scrolling.',
    whatItIs: 'A Document owns the interaction state around one root Element and turns window input into UI events.',
    whenToUse: 'Create one for every rendered LazyUI root. Resize it to the framebuffer and forward pointer, button, wheel, key, and text input.',
    beginnerNote: 'The normal setup is local document = UI.document(root).' 
  },
  'UI/LazyUI|UIEvent': {
    level: 'beginner',
    friendlyDescription: 'The event information passed to LazyUI callbacks for clicks, pointer movement, scrolling, keys, and text input.',
    whatItIs: 'It tells the handler what happened, where it happened, which key/button was involved, and which Element is the target/current target.',
    whenToUse: 'Read it inside onclick, oninput, onkeydown, onpointermove, onscroll, and similar handlers.',
    beginnerNote: 'Do not create it yourself. LazyUI creates it and passes it to your handler.',
    howToGet: 'Declare an LSHTML event such as onclick={handler}. LazyUI passes UIEvent to the handler automatically.'
  },
  'UI/LazyUI|Binding': {
    level: 'internal',
    friendlyDescription: 'Compiler-generated information that connects an LSHTML/LSCSS expression to a retained UI property.',
    whatItIs: 'It stores the property name, source expression, and hashed property ID used by generated UI update code.',
    whenToUse: 'Only when extending the LSHTML/LSCSS compiler or binding runtime.',
    beginnerNote: 'Normal LSHTML users never need to construct this.'
  },
  'UI/LazyUI|Attribute': {
    level: 'internal',
    friendlyDescription: 'A parsed LSHTML attribute name/value pair used while constructing retained elements.',
    whatItIs: 'It stores an attribute name, its string value, and a hash for faster lookup.',
    whenToUse: 'Only when extending the LSHTML lowering/runtime.',
    beginnerNote: 'Write attributes directly in LSHTML instead.'
  },
  'Math/GLM|Vec2': { level: 'beginner', friendlyDescription: 'A two-number vector for 2D positions, sizes, directions, UVs, and screen coordinates.', whatItIs: 'A native-backed value containing x and y plus common vector operations.', whenToUse: 'Use for 2D movement, UI coordinates, texture coordinates, and planar math.' },
  'Math/GLM|Vec3': { level: 'beginner', friendlyDescription: 'A three-number vector for 3D positions, directions, scales, normals, and RGB-style values.', whatItIs: 'A native-backed value containing x, y, and z plus common 3D vector operations.', whenToUse: 'Use throughout 3D gameplay, cameras, lighting, physics, transforms, and mesh calculations.' },
  'Math/GLM|Vec4': { level: 'beginner', friendlyDescription: 'A four-number vector for homogeneous positions, RGBA values, shader data, and planes.', whatItIs: 'A native-backed value containing x, y, z, and w.', whenToUse: 'Use when an operation or shader needs four components.' },
  'Math/GLM|Mat4': { level: 'intermediate', friendlyDescription: 'A 4×4 matrix used to move, rotate, scale, view, and project 3D geometry.', whatItIs: 'A column-major native GLM matrix with transform, inverse, multiply, interpolation, and vector-transform helpers.', whenToUse: 'Use for model, view, projection, and combined MVP matrices.' },
  'Math/GLM|Quat': { level: 'intermediate', friendlyDescription: 'A quaternion rotation that avoids Euler-angle gimbal lock and interpolates smoothly.', whatItIs: 'Four values representing 3D rotation with conversion and interpolation helpers.', whenToUse: 'Use for object/bone rotations, camera orientation, and animation blending.' },
  'UI/Renderer|Renderer': {
    level: 'intermediate',
    friendlyDescription: 'The GPU renderer that draws a complete LazyUI element tree into the current OpenGL framebuffer.',
    whatItIs: 'It owns LazyUI shaders, buffers, font resources, batching state, clipping/scissor state, and the draw queue needed to turn retained Elements into pixels.',
    whenToUse: 'Create one after GLFW/OpenGL startup. Each frame call begin(framebufferWidth, framebufferHeight), submit(root), then flush().',
    howToGet: 'Call UIRenderer.create(fontPath, fontPixelHeight). Pass null for the bundled/default font when that is appropriate.',
    workflow: 'GLFW window → OpenGL loader → UIRenderer.create() → document/input update → renderer.begin() → renderer.submit(root) → renderer.flush() → swap buffers.',
    commonMistake: 'Do not create the renderer before the OpenGL context is current and loaded. Check renderer.ready/error_message before entering the frame loop.'
  },
  'Network/Http|Response': {
    level: 'intermediate',
    friendlyDescription: 'The completed result of one HTTP request: transport state, HTTP status, response body, and error details.',
    whatItIs: 'Client.get()/post()/request() returns this object. A transport can succeed while the server still returns an error status such as 404 or 500, so both succeeded() and status must be checked.',
    whenToUse: 'Use it immediately after an HTTP request to inspect success, status, and body text/bytes, then close and destroy it.',
    howToGet: 'Create an Http.Client, then call a request method such as client.get(host, path, secure). The request method returns Response.',
    workflow: 'Create one reusable Client → configure timeouts/headers → send a request → check response.succeeded() → check response.status → read response.text()/body → close/destroy response.',
    commonMistake: 'Do not treat response.succeeded() as proof that the server accepted the request. Also check the HTTP status code before using the body.'
  },
  'OpenAL/WavPCM|WavPCM': {
    level: 'beginner',
    friendlyDescription: 'Decoded PCM samples from a .wav file, ready to copy into an OpenAL buffer.',
    whatItIs: 'It owns the file bytes and points at the PCM sample region while also storing sample byte count, sample rate, OpenAL format, and a readable error string.',
    whenToUse: 'Use it to load short uncompressed WAV sound effects before uploading them to OpenAL.',
    howToGet: 'Call WavPCM.load(path), then verify sound.error == "OK" before using sound.data, sound.data_size, sound.format, and sound.sample_rate.',
    workflow: 'Load WAV → check error → create OpenAL buffer → upload PCM → call sound.release()/destroy() → play through an OpenAL source.',
    commonMistake: 'Do not destroy/release the WAV before alBufferData has copied the samples. Do not pass the whole file byte count when data_size already identifies only the PCM sample bytes.',
    memberSummary: 'bytes owns the file memory; data points to PCM samples; data_size is the PCM byte count; sample_rate is samples per second; format is the matching AL_FORMAT_* value; error explains load failure; release() frees owned bytes.'
  },
  'Text/Font|TextMesh': {
    level: 'beginner',
    friendlyDescription: 'Ready-to-upload text geometry for one string, plus the measured width and height.',
    whatItIs: 'Font.build_text() uses a font face and glyph atlas to create vertex data for the requested string. It does not draw by itself; your text renderer uploads/submits the vertices with the atlas texture.',
    whenToUse: 'Build it when text content changes and your renderer expects ordinary text vertices rather than instanced glyph quads.',
    howToGet: 'Open a font Face, create an Atlas, then call Font.build_text(face, atlas, text, x, y, scale).',
    workflow: 'Open face → build atlas → upload atlas texture → build TextMesh → submit mesh vertices with the text shader/atlas texture → destroy old mesh when text changes.',
    commonMistake: 'Do not rebuild the mesh every frame when the text did not change. Cache it and rebuild only after the string, font, atlas, position, or scale changes.',
    memberSummary: 'vertices is the flat text vertex collection consumed by the renderer; width and height are the measured bounds; valid() checks that usable geometry exists; destroy() releases the vertex collection.'
  },
  'Data/Json|Document': { level: 'beginner', friendlyDescription: 'An owned parsed JSON document and its root value.', whatItIs: 'The document keeps parsed JSON values alive and exposes validity, errors, object/array access, and serialization.', whenToUse: 'Use for save files, configuration, metadata, and network JSON.' },
  'Math/Camera|Camera': { level: 'beginner', friendlyDescription: 'A ready-to-use 3D camera with position, target, projection settings, and view/projection matrices.', whatItIs: 'The camera combines common GLM values and rebuilds matrices from easy-to-understand settings.', whenToUse: 'Use for a gameplay, editor, preview, or cinematic camera.' }
};

const FIELD_SPECIAL = {
  'UI/LazyUI|CanvasCommand|kind': ['Identifies which canvas operation this command represents.', 'The renderer compares this value with constants such as CANVAS_FILL_RECT, CANVAS_LINE, CANVAS_TEXT, or CANVAS_IMAGE.'],
  'UI/LazyUI|CanvasCommand|x': ['The first X coordinate for the command.', 'For rectangles/images/text it is the left/start X position; for lines/triangles it is the first point.'],
  'UI/LazyUI|CanvasCommand|y': ['The first Y coordinate for the command.', 'For rectangles/images/text it is the top/start Y position; for lines/triangles it is the first point.'],
  'UI/LazyUI|CanvasCommand|x2': ['The second X coordinate for a line or triangle command.', 'It is unused by commands that need only one position.'],
  'UI/LazyUI|CanvasCommand|y2': ['The second Y coordinate for a line or triangle command.', 'It is unused by commands that need only one position.'],
  'UI/LazyUI|CanvasCommand|x3': ['The third X coordinate for a triangle command.', 'It is unused by rectangles, circles, lines, text, and images.'],
  'UI/LazyUI|CanvasCommand|y3': ['The third Y coordinate for a triangle command.', 'It is unused by rectangles, circles, lines, text, and images.'],
  'UI/LazyUI|CanvasCommand|width': ['The command width or horizontal radius.', 'Rectangles/images use it as width; ellipse commands use it as the horizontal radius.'],
  'UI/LazyUI|CanvasCommand|height': ['The command height or vertical radius.', 'Rectangles/images use it as height; ellipse commands use it as the vertical radius.'],
  'UI/LazyUI|CanvasCommand|radius': ['The radius for circle or rounded-rectangle commands.', 'It is ignored by command kinds that do not use rounded geometry.'],
  'UI/LazyUI|CanvasCommand|line_width': ['The stroke thickness used by outlined shapes and lines.', 'CanvasContext copies its current line width into stroke commands.'],
  'UI/LazyUI|CanvasCommand|font_size': ['The text size captured when a text command is recorded.', 'It is read only by text drawing commands.'],
  'UI/LazyUI|CanvasCommand|color': ['The main packed RGBA color for this command.', 'CanvasContext applies global alpha before storing the value.'],
  'UI/LazyUI|CanvasCommand|color2': ['An optional second packed color reserved for commands that need two colors.', 'Most current commands use color and leave color2 unused.'],
  'UI/LazyUI|CanvasCommand|text': ['The text payload for a canvas text command.', 'It is null for shapes and images.'],
  'UI/LazyUI|CanvasCommand|texture': ['The OpenGL texture ID used by an image command.', 'It is zero for non-image commands.']
};

const PARAM_DOCS = {
  x: 'Horizontal coordinate.', y: 'Vertical coordinate.', x2: 'Second horizontal coordinate.', y2: 'Second vertical coordinate.', x3: 'Third horizontal coordinate.', y3: 'Third vertical coordinate.',
  width: 'Width in pixels or local units.', height: 'Height in pixels or local units.', radius: 'Radius in pixels or local units.',
  color: 'Packed RGBA color.', color2: 'Optional second packed RGBA color.', lineWidth: 'Stroke thickness.', value: 'The value to read, write, or apply.',
  index: 'Zero-based position in the collection.', count: 'Number of values or items.', size: 'Size in bytes or elements, depending on the function.',
  text: 'UTF-8 LSX text.', path: 'UTF-8 file or asset path.', filename: 'UTF-8 file name or path.',
  window: 'A GLFW window handle created earlier.', monitor: 'A GLFW monitor handle.', device: 'An audio or platform device handle.', context: 'A context object or native context handle.',
  texture: 'An OpenGL texture ID or texture object.', buffer: 'A buffer handle or data collection.', source: 'An audio source handle or input value.',
  target: 'The API target/category being changed.', mode: 'The named operating mode.', flags: 'One or more named bit flags combined together.',
  radians: 'Angle in radians.', degrees: 'Angle in degrees.', minimum: 'Lowest allowed value.', maximum: 'Highest allowed value.',
  nearPlane: 'Near clipping distance.', farPlane: 'Far clipping distance.', aspect: 'Viewport width divided by height.', fov: 'Field of view, normally in radians.',
  element: 'An existing LazyUI Element.', event: 'The UIEvent created by LazyUI for this callback.', props: 'Your ordinary state/context object.'
};

function humanize(name) {
  return String(name || '')
    .replace(/^glfw/, '').replace(/^gl(?=[A-Z])/, '').replace(/^alc(?=[A-Z])/, '').replace(/^al(?=[A-Z])/, '').replace(/^FT_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseCallable(signature) {
  const match = String(signature || '').match(/^[^(]*\((.*)\)\s*(?:->\s*(.+))?$/);
  if (!match) return { parameters: [], returnType: '' };
  const parts = [];
  let current = '', depth = 0;
  for (const ch of match[1]) {
    if ('<([{'.includes(ch)) depth++;
    if ('>)]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { if (current.trim()) parts.push(current.trim()); current = ''; }
    else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return {
    parameters: parts.map(raw => {
      const colon = raw.match(/^([A-Za-z_]\w*)\s*:\s*(.+)$/);
      const dot = raw.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/);
      return { name: colon?.[1] || dot?.[1] || raw, type: colon?.[2] || dot?.[2] || 'inferred' };
    }),
    returnType: (match[2] || '').trim()
  };
}

function moduleRequirement(module) {
  return MODULE_GUIDES[module]?.requires || '';
}

function levelFor(entry) {
  if (entry.name?.startsWith('_')) return 'internal';
  if (entry.module.includes('Raw') || entry.kind === 'raw function' || entry.module === 'OpenGL' || entry.module === 'OpenAL' || entry.module === 'Platform/Win32') return 'advanced';
  if (entry.module === 'System/Threading' || entry.module.startsWith('Network/') || entry.module === 'UI/Renderer' || entry.module === 'Math/OpenGL') return 'intermediate';
  return 'beginner';
}

function objectKey(entry) { return `${entry.module}|${entry.name}`; }
function fieldKey(entry) { return `${entry.module}|${entry.owner}|${entry.name}`; }

function genericObjectInfo(entry, members) {
  const name = entry.name;
  const fields = members.filter(item => item.kind === 'field');
  const methods = members.filter(item => item.kind === 'method' || item.kind === 'compiler method');
  const publicMethods = methods.filter(item => !item.name.startsWith('_'));
  const fieldNames = fields.slice(0, 14).map(item => item.name).join(', ');
  const methodNames = publicMethods.slice(0, 14).map(item => `${item.name}()`).join(', ');
  const base = {
    level: levelFor(entry),
    friendlyDescription: `An LSX ${humanize(name)} object that groups its related data and operations together.`,
    whatItIs: `${name} belongs to ${entry.module}. It keeps the values needed by that feature in one reusable object.`,
    whenToUse: `Create or receive a ${name} when working with the ${MODULE_GUIDES[entry.module]?.title || entry.module} feature.`,
    memberSummary: [fieldNames && `Stored values: ${fieldNames}.`, methodNames && `Operations: ${methodNames}.`].filter(Boolean).join(' ')
  };

  if (entry.module === 'GLFW') {
    if (/^(WindowPosition|WindowSize|FramebufferSize|FrameSize|CursorPosition|ContentScale|MonitorPosition|MonitorWorkArea|MonitorPhysicalSize)$/.test(name)) {
      return { ...base, level: 'beginner', friendlyDescription: `A reusable GLFW ${humanize(name)} snapshot.`, whatItIs: `This object stores the values returned by GLFW without allocating a new object every frame. Call refresh() with the matching window or monitor, then read its fields.`, whenToUse: 'Create it once before the game loop, refresh it whenever you need current values, and destroy it at shutdown.', beginnerNote: 'Do not recreate this object every frame. Reuse the same instance.' };
    }
    if (/^(Version|ErrorInfo|VideoMode|GamepadState|ImageRGBA)$/.test(name)) {
      return { ...base, friendlyDescription: `A GLFW ${humanize(name)} data record.`, whatItIs: `A typed LSX record containing the values GLFW returns for ${humanize(name)}.`, whenToUse: 'Receive or fill it through the matching GLFW helper, then read the named fields instead of dealing with raw pointers.' };
    }
    if (/List$|Joystick/.test(name)) {
      return { ...base, friendlyDescription: `A reusable GLFW ${humanize(name)} result collection.`, whatItIs: 'It owns a copied list of values returned by GLFW so normal LSX code can index and inspect them safely.', whenToUse: 'Use the matching refresh/query helper, check the count, then read the values. Destroy it when finished.' };
    }
  }
  if (entry.module === 'System/Threading') {
    const descriptions = {
      Thread: ['A running operating-system worker thread.', 'Use for background loading or CPU work. Start it with a worker function, join it before shutdown, then close/destroy it.'],
      Mutex: ['A lock that lets only one thread enter a protected section at a time.', 'Use only around shared writable data. Keep the locked section short and always unlock it.'],
      Semaphore: ['A counter-based synchronization gate.', 'Use to limit how many workers may enter a resource or to signal available work.'],
      Event: ['A signal one thread can set and another can wait for.', 'Use for one-time or repeated worker notifications without busy-waiting.'],
      CriticalSection: ['A lightweight Windows lock for threads in the same process.', 'Use for short internal critical sections when Windows-only behavior is acceptable.'],
      RWLock: ['A reader/writer lock that allows many readers or one writer.', 'Use when shared data is read often but changed rarely.'],
      ConditionVariable: ['A wait/signal primitive used with a lock.', 'Use for worker queues where threads sleep until state changes. Always recheck the condition after waking.'],
      AtomicI32: ['A 32-bit integer that supports thread-safe read/modify/write operations.', 'Use for counters, flags, and small shared state without a full lock.'],
      AtomicI64: ['A 64-bit integer that supports thread-safe read/modify/write operations.', 'Use for large counters and shared 64-bit state without a full lock.'],
      ThreadLocal: ['One storage slot with a separate value for each thread.', 'Use for per-thread scratch data or context that must not be shared.']
    };
    if (descriptions[name]) return { ...base, level: 'intermediate', friendlyDescription: descriptions[name][0], whatItIs: descriptions[name][0], whenToUse: descriptions[name][1] };
  }
  if (entry.module === 'Network/Http') {
    if (name === 'Client') return { ...base, level: 'intermediate', friendlyDescription: 'A reusable native HTTP client/session.', whatItIs: 'It keeps WinHTTP session settings, timeouts, headers, and connection state together.', whenToUse: 'Create one for a group of requests, configure it once, send requests, inspect Response objects, then close it.' };
    if (name === 'Response') return { ...base, level: 'intermediate', friendlyDescription: 'The status, headers, body, and error information returned by an HTTP request.', whatItIs: 'A completed HTTP result. The status code tells whether the server accepted the request; the body contains the returned bytes/text.', whenToUse: 'Check transport success first, then inspect status and body. Treat non-2xx status codes as server-side failures your code must handle.' };
  }
  if (entry.module === 'Network/Sockets') {
    if (name === 'Socket') return { ...base, level: 'intermediate', friendlyDescription: 'An owned TCP or UDP socket.', whatItIs: 'It stores the native socket handle plus connection and error state behind LSX methods.', whenToUse: 'Create a client/server socket, check each operation, send or receive data, then close it on every exit path.' };
    if (name === 'Datagram') return { ...base, level: 'intermediate', friendlyDescription: 'One received UDP packet and its sender address.', whatItIs: 'It groups packet bytes, byte count, source address, and source port.', whenToUse: 'Read it after a UDP receive operation, process only the reported byte count, then reuse or destroy it.' };
    if (name === 'PollDescriptor') return { ...base, level: 'intermediate', friendlyDescription: 'One socket and the events you want to poll for.', whatItIs: 'It pairs a socket handle with requested/readable/writable/error event flags.', whenToUse: 'Place one descriptor per socket in a collection before calling the socket poll helper.' };
    if (/Box$|AddrInfo/.test(name)) return { ...base, level: 'advanced', friendlyDescription: `A small native networking result holder for ${humanize(name)}.`, whatItIs: 'This wrapper exists so a native socket function can write a value into LSX-owned storage.', whenToUse: 'Most game code receives it from a typed socket helper. Use it directly only while extending the networking wrapper.' };
  }
  if (entry.module === 'System/File') {
    if (name === 'Bytes') return { ...base, level: 'beginner', friendlyDescription: 'Owned bytes read from a file.', whatItIs: 'It keeps the byte collection, length, validity, and error information from a file read.', whenToUse: 'Use for binary assets and save data. Check success/length before indexing, then destroy it when finished.' };
    if (name === 'WriteResult') return { ...base, level: 'beginner', friendlyDescription: 'The success state and byte count from a file write.', whatItIs: 'It tells you whether writing succeeded and how many bytes were written.', whenToUse: 'Check it after every save or generated-file write so failures are not silently ignored.' };
  }
  if (entry.module === 'System/Log' && name === 'Logger') return { ...base, level: 'beginner', friendlyDescription: 'An open persistent log file.', whatItIs: 'It writes flushed stage, info, warning, error, and success messages so initialization and crashes can be traced later.', whenToUse: 'Open one during startup, log meaningful stages and failures, and close it at normal shutdown.' };
  if (entry.module === 'Graphics/Texture2D' && name === 'Texture') return { ...base, level: 'beginner', friendlyDescription: 'An owned OpenGL 2D texture with its size and format.', whatItIs: 'The object stores the GPU texture ID, width, height, channel/format information, validity, and destruction logic.', whenToUse: 'Load it for sprites, UI images, materials, font atlases, or generated pixels. Check valid(), use its ID while rendering, then destroy it.' };
  if (entry.module === 'Graphics/STBImage' && name === 'Image') return { ...base, level: 'intermediate', friendlyDescription: 'Decoded image pixels and dimensions.', whatItIs: 'It owns CPU-side pixels returned by stb_image along with width, height, channel count, validity, and error information.', whenToUse: 'Load an image, check valid(), upload/copy the pixels, then destroy the image data.' };
  if (entry.module === 'OpenAL/WavPCM' && name === 'WavPCM') return { ...base, level: 'beginner', friendlyDescription: 'Decoded uncompressed WAV audio ready for an OpenAL buffer.', whatItIs: 'It stores the owned WAV file bytes, a pointer to the PCM samples, PCM byte count, sample rate, OpenAL format, and an error string.', whenToUse: 'Load a .wav sound effect, confirm error == "OK", upload data/data_size with format and sample_rate to OpenAL, then call release().', memberSummary: 'bytes owns the loaded file memory; data points at the PCM samples inside it; data_size is the sample byte count; sample_rate is playback rate; format is an AL_FORMAT_* value; error explains failure; release() frees the owned bytes.' };
  if (entry.module === 'Text/FreeType' && name === 'Face') return { ...base, level: 'intermediate', friendlyDescription: 'An opened font face used to read metrics and rasterize glyphs.', whatItIs: 'It owns the native FreeType face and exposes font size, glyph loading, and metrics through LSX methods.', whenToUse: 'Use Text/Font for normal SDF text. Use Face directly for custom glyph processing.' };
  if (entry.module === 'Text/Font') {
    const docs = {
      Glyph: ['One glyph’s atlas rectangle, bearing, advance, and SDF metrics.', 'Read it while laying out or rendering a character from an Atlas.'],
      Atlas: ['A generated SDF glyph atlas and its glyph lookup data.', 'Create it from a font face, upload it once, then use it to build text meshes or instances.'],
      TextMesh: ['Vertex data plus measured width and height for a string of text.', 'Build it when text changes, upload/submit its vertices through your text renderer, then destroy it when replaced.'],
      TextInstances: ['Per-character instance data for batched SDF text rendering.', 'Use with an instanced text pipeline when many glyphs share one atlas and quad mesh.'],
      Texture: ['The OpenGL texture created from a font atlas.', 'Bind/use it while rendering text and destroy it after all text using that atlas is finished.']
    };
    if (docs[name]) return { ...base, level: name === 'Glyph' ? 'intermediate' : 'beginner', friendlyDescription: docs[name][0], whatItIs: docs[name][0], whenToUse: docs[name][1] };
  }
  if (entry.module === 'UI/Renderer' && name === 'Renderer') return { ...base, level: 'intermediate', friendlyDescription: 'The batched OpenGL renderer for a LazyUI element tree.', whatItIs: 'It owns UI shaders, buffers, font atlas resources, batches, and frame submission state.', whenToUse: 'Create it after OpenGL is loaded, call begin()/submit()/flush() each frame, and destroy it before the window.' };
  if (entry.module === 'UI/LazyUI') {
    const docs = {
      Style: ['Computed visual and layout settings for one element state.', 'LSCSS usually creates and applies it. Access it when implementing custom element behavior or debugging style resolution.'],
      CounterText: ['A small helper that formats a label and changing numeric value.', 'Use for counters such as ammunition, inventory amounts, FPS, or scores.'],
      TextBuffer: ['Editable UTF-8 text plus cursor and selection state.', 'Use behind inputs, text areas, code fields, and other editable text controls.'],
      WindowInput: ['The connection between GLFW callbacks and one LazyUI Document.', 'Create it after the document, keep it alive while the window is active, and destroy it before the document/window.']
    };
    if (docs[name]) return { ...base, friendlyDescription: docs[name][0], whatItIs: docs[name][0], whenToUse: docs[name][1] };
  }
  if (entry.module === 'OpenGL' && /^(UIntValue|Int64Value|Int2|Float2)$/.test(name)) return { ...base, level: 'advanced', friendlyDescription: `Reusable output storage for an OpenGL query returning ${humanize(name)}.`, whatItIs: 'The raw OpenGL function writes into this LSX-owned record instead of requiring pointer syntax in front-end code.', whenToUse: 'Use the matching typed query helper, refresh/fill the record, then read its fields.' };
  if (entry.module === 'Network/Http' && name === 'U32Box') return { ...base, level: 'advanced', friendlyDescription: 'One writable 32-bit value used by the native HTTP wrapper.', whatItIs: 'WinHTTP uses output pointers; this object hides that pointer behind ordinary LSX storage.', whenToUse: 'Only while extending the typed HTTP wrapper.' };
  return base;
}
const COMMON_OPERATIONS = {
  valid: ['Checks whether this value was created or loaded successfully.', 'Call it immediately after creation/loading before reading data or using the native resource.'],
  ready: ['Checks whether the module or resource is initialized and ready.', 'Use it after setup and before the first operation that depends on the resource.'],
  error: ['Returns a human-readable explanation of the most recent failure.', 'Read it when valid()/ready() is false or another operation reports failure.'],
  length: ['Returns the number of items currently stored.', 'Use it for loops, empty checks, and bounds-aware indexing.'],
  count: ['Returns the number of available items.', 'Use it before indexing or allocating output storage.'],
  clear: ['Removes the currently stored items or recorded work while keeping the object reusable.', 'Use it before rebuilding the contents or starting a fresh frame/batch.'],
  destroy: ['Releases resources owned by this object.', 'Call it once when the object is no longer needed; do not use the object afterward.'],
  copy: ['Creates a separate copy of the current value.', 'Use it when the result must be changed without modifying the original.'],
  clone: ['Creates a separate copy of the current value.', 'Use it when the result must be changed without modifying the original.'],
  normalize: ['Changes the vector/quaternion to unit length.', 'Use before operations that require a direction or normalized rotation.'],
  normalized: ['Returns a unit-length copy without changing the original.', 'Use for directions, normals, and calculations that assume length 1.'],
  inverse: ['Returns the inverse of this value.', 'Use to undo a transform or convert in the opposite direction.'],
  transposed: ['Returns a matrix with rows and columns swapped.', 'Use when changing matrix convention or when a math operation requires a transpose.'],
  determinant: ['Returns the matrix determinant.', 'Use to test invertibility or inspect how a matrix changes volume/orientation.'],
  projection: ['Returns the camera projection matrix.', 'Use when uploading the camera projection to a shader or combining it with a view matrix.'],
  view: ['Returns the camera view matrix.', 'Use when uploading the camera view to a shader or building a view-projection matrix.'],
  view_projection: ['Returns the combined camera view-projection matrix.', 'Use when the shader expects one matrix that transforms world positions to clip space.'],
  bind: ['Makes this resource active for following native graphics/audio operations.', 'Call it before commands that read from or modify this resource.'],
  unbind: ['Stops using this resource as the current binding.', 'Use when explicit state cleanup makes later rendering easier to reason about.'],
  save: ['Saves the current state so it can be restored later.', 'Use before temporarily changing state or writing the current object to storage.'],
  restore: ['Restores a previously saved state.', 'Call after the temporary state changes are finished.'],
};

const GLM_METHOD_INFO = {
  add: ['Adds the matching components and returns a new value.', 'Use for vector addition or combining like-sized values.'],
  sub: ['Subtracts the matching components and returns a new value.', 'Use for offsets, direction vectors, and differences.'],
  mul: ['Multiplies matching components and returns a new value.', 'Use for component-wise scaling, not matrix composition.'],
  div: ['Divides matching components and returns a new value.', 'Use when each component has its own divisor; divisors must not be zero.'],
  scale: ['Multiplies every component by one scalar.', 'Use to change magnitude while preserving direction.'],
  scaled: ['Returns a copy with every component/matrix cell multiplied by one scalar.', 'Use when the original value must remain unchanged.'],
  dot: ['Returns the dot product.', 'Use for angles, projection, facing tests, and measuring alignment.'],
  cross: ['Returns a vector perpendicular to both input vectors.', 'Use for surface normals, camera axes, and orientation.'],
  length: ['Returns the vector magnitude.', 'Use when actual distance/magnitude is needed.'],
  length_squared: ['Returns magnitude squared without a square root.', 'Use for faster distance comparisons.'],
  distance: ['Returns the distance to another point/vector.', 'Use for ranges, proximity checks, and movement.'],
  reflect: ['Returns the direction reflected around a normal.', 'Use for bounce directions and reflection math.'],
  refract: ['Returns the direction refracted through a surface.', 'Use for glass/water direction calculations with a refraction ratio.'],
  lerp: ['Linearly blends from this value to another.', 'Use for smooth numeric/vector transitions where constant angular speed is not required.'],
  slerp: ['Spherically blends between rotations.', 'Use for smooth quaternion rotation interpolation.'],
  nlerp: ['Quickly blends and normalizes two rotations.', 'Use when a faster approximate quaternion blend is sufficient.'],
  multiply: ['Multiplies this matrix by another matrix and returns the combined transform.', 'Order matters: use it to compose model, view, and projection transforms.'],
  transform_point: ['Transforms a 3D point including translation.', 'Use for positions. Use transform_direction() for directions/normals that must ignore translation.'],
  transform_direction: ['Transforms a direction without applying translation.', 'Use for directions, velocities, and normals.'],
  to_mat3: ['Converts the quaternion rotation to a 3×3 matrix.', 'Use for rotation-only matrix work.'],
  to_mat4: ['Converts the quaternion rotation to a 4×4 matrix.', 'Use when composing it with 3D transforms or uploading to a shader.'],
};

function functionInfo(entry) {
  const n = entry.name;
  const lower = n.toLowerCase();
  const readable = humanize(n);
  const common = COMMON_OPERATIONS[lower];
  const glm = entry.module === 'Math/GLM' ? GLM_METHOD_INFO[lower] : null;
  let action = (glm || common)?.[0] || `Runs the ${readable} operation provided by ${entry.module}.`;
  let when = (glm || common)?.[1] || `Use it for the ${readable} operation shown in the example.`;

  if (!glm && !common && (lower.includes('create') || lower.startsWith('new') || lower.startsWith('gen'))) { action = `Creates or allocates ${readable.replace(/^(create|new|gen)\s*/, '') || 'a new resource'}.`; when = 'Call it during setup, store the returned object/handle, and release it during cleanup.'; }
  else if (!glm && !common && (lower.includes('destroy') || lower.includes('delete') || lower.includes('free') || lower.includes('close'))) { action = `Releases the resource handled by ${n}.`; when = 'Call it once when the resource is no longer used, including failure paths after partial setup.'; }
  else if (!glm && !common && (lower.includes('load'))) { action = `Loads ${readable.replace(/^load\s*/, '') || 'data'} into an LSX or native object.`; when = 'Call it during asset/setup work, verify the result, then use the loaded data.'; }
  else if (!glm && !common && (lower.includes('bind'))) { action = `Makes the selected ${readable.replace(/.*bind\s*/, '') || 'resource'} active for later API calls.`; when = 'Call it before operations that affect or use that resource.'; }
  else if (!glm && !common && (lower.includes('draw'))) { action = `Submits a ${readable} drawing operation.`; when = 'Call it after all required render state, buffers, shaders, and resources are ready.'; }
  else if (!glm && !common && (lower.includes('get'))) { action = `Reads ${readable.replace(/^get\s*/, '') || 'a value'} from the API.`; when = 'Use it when you need the current value instead of changing state.'; }
  else if (!glm && !common && (lower.includes('set'))) { action = `Changes ${readable.replace(/^set\s*/, '') || 'a value'} for this object or API.`; when = 'Call it when initializing or updating that setting.'; }
  else if (!glm && !common && (lower.includes('read') || lower.includes('receive') || lower.includes('recv'))) { action = `Reads incoming ${readable.replace(/^(read|receive|recv)\s*/, '') || 'data'}.`; when = 'Check the returned count/status before using the destination data.'; }
  else if (!glm && !common && (lower.includes('write') || lower.includes('send'))) { action = `Writes or sends ${readable.replace(/^(write|send)\s*/, '') || 'data'}.`; when = 'Check the returned status/count and handle partial or failed operations.'; }

  if (entry.module === 'Data/Json') {
    if (lower === 'make_number') { action = 'Creates a JSON number value owned by this document.'; when = 'Use while building a JSON object/array in memory before serialization.'; }
    else if (lower === 'make_string') { action = 'Creates a JSON string value owned by this document.'; when = 'Use while building a JSON object/array in memory before serialization.'; }
    else if (lower === 'make_object') { action = 'Creates an empty JSON object value owned by this document.'; when = 'Use when constructing key/value JSON data in memory.'; }
    else if (lower === 'make_array') { action = 'Creates an empty JSON array value owned by this document.'; when = 'Use when constructing an ordered JSON list in memory.'; }
    else if (lower.includes('parse')) { action = 'Parses UTF-8 JSON into an owned document.'; when = 'Check document.valid() before reading the root or values.'; }
  }
  if (entry.module === 'Math/Camera') {
    if (lower === 'projection') { action = 'Returns the camera projection matrix from its field-of-view/orthographic settings.'; when = 'Upload it to the shader or combine it with the view matrix.'; }
    else if (lower === 'view') { action = 'Returns the camera view matrix from position, target, and up direction.'; when = 'Use it to transform world-space geometry into camera space.'; }
    else if (lower === 'look_at') { action = 'Points the camera from its position toward a target using the supplied up direction.'; when = 'Use when aiming a camera at a player, object, or editor pivot.'; }
  }
  if (entry.module === 'UI/LazyUI' && entry.owner === 'CanvasContext') {
    if (lower === 'fill_rect') { action = 'Records a filled rectangle command.'; when = 'Use for backgrounds, bars, boxes, and simple custom HUD/editor drawing.'; }
    else if (lower === 'stroke_line' || lower === 'line') { action = 'Records a line command between two points.'; when = 'Use for graph connections, guides, separators, and custom outlines.'; }
    else if (lower === 'fill_text' || lower === 'draw_text') { action = 'Records a text drawing command using the current or supplied color.'; when = 'Use for custom canvas labels when normal LSHTML text is not appropriate.'; }
    else if (lower === 'image' || lower === 'draw_image') { action = 'Records an image command using an OpenGL texture ID.'; when = 'Use for minimap tiles, icons, thumbnails, and custom textured canvas content.'; }
  }
  if (entry.module === 'OpenGL') {
    if (n === 'glClearColor') { action = 'Sets the RGBA color OpenGL will use the next time the color buffer is cleared.'; when = 'Set it before GL.glClear(GL.GL_COLOR_BUFFER_BIT), usually once per frame or when the background changes.'; }
    else if (n === 'glClear') { action = 'Clears one or more framebuffer buffers, such as color, depth, or stencil.'; when = 'Call near the beginning of a render pass after setting the clear values.'; }
    else if (/^glCreateShader/.test(n)) { action = 'Creates an empty shader object of a named stage such as vertex or fragment.'; when = 'Create it during renderer setup, attach source, compile it, inspect errors, then attach it to a program.'; }
    else if (/^glCompileShader/.test(n)) { action = 'Compiles the source currently attached to a shader object.'; when = 'Call after glShaderSource, then read GL_COMPILE_STATUS and the info log before continuing.'; }
    else if (/^glLinkProgram/.test(n)) { action = 'Links attached compiled shaders into an executable GPU program.'; when = 'Call after attaching shaders, then check GL_LINK_STATUS and the program info log.'; }
    else if (/^glUseProgram/.test(n)) { action = 'Makes one linked shader program active for following draw/dispatch calls.'; when = 'Call before uniforms and drawing that belong to that program.'; }
    else if (/^glViewport/.test(n)) { action = 'Maps normalized device coordinates to a rectangular area of the framebuffer.'; when = 'Set it after window/framebuffer resize and before drawing.'; }
    else if (/^glDraw/.test(n)) { action = 'Draws vertices using the currently bound pipeline state, shader, vertex input, and resources.'; when = 'Call only after all required OpenGL objects and state are valid.'; }
  }
  if (entry.module === 'GLFW') {
    if (n === 'glfwInit') { action = 'Initializes GLFW before window, monitor, input, and timer functions are used.'; when = 'Call once near program startup and stop if it returns 0.'; }
    else if (n === 'glfwCreateWindow') { action = 'Creates a window and its requested graphics context.'; when = 'Call after glfwInit() and window hints; check for a zero handle before continuing.'; }
    else if (n === 'glfwPollEvents') { action = 'Processes pending window and input events without waiting.'; when = 'Call once per frame in a normal real-time game loop.'; }
    else if (n === 'glfwWaitEvents' || n.startsWith('glfwWaitEventsTimeout')) { action = 'Sleeps until a window/input event arrives instead of spinning continuously.'; when = 'Use in tools or paused applications that do not need to render every frame.'; }
    else if (n === 'glfwSwapBuffers') { action = 'Presents the completed back buffer in a double-buffered window.'; when = 'Call once after finishing the frame’s rendering.'; }
    else if (n === 'glfwWindowShouldClose') { action = 'Checks whether the window has been asked to close.'; when = 'Use as the main game-loop condition.'; }
    else if (n === 'glfwSetWindowShouldClose') { action = 'Changes the window close flag.'; when = 'Set it when an in-game Quit action should leave the main loop.'; }
    else if (/^glfwGetKey/.test(n)) { action = 'Reads the current pressed/released state of one keyboard key for a window.'; when = 'Use for simple polling input. For typed text, use character callbacks instead.'; }
    else if (/^glfwGetMouseButton/.test(n)) { action = 'Reads the current state of one mouse button.'; when = 'Use during the frame loop or forward the state into LazyUI input handling.'; }
    else if (/^glfwGetCursorPos/.test(n)) { action = 'Writes the current mouse cursor position for a window.'; when = 'Use for picking, camera control, drag operations, and UI pointer movement.'; }
    else if (/^glfwSet.*Callback/.test(n)) { action = `Registers the ${readable.replace(/^set\s*/, '')} callback for future GLFW events.`; when = 'Keep the callback function valid for as long as GLFW may call it; pass 0/null to remove it when supported.'; }
    else if (/^glfwGetWindow|^glfwGetFramebuffer|^glfwGetMonitor/.test(n)) { action = `Queries ${readable.replace(/^get\s*/, '')}.`; when = 'Use the typed reusable result objects when one exists so front-end LSX code does not need output pointers.'; }
    else if (/^glfwSetWindow/.test(n)) { action = `Changes ${readable.replace(/^set\s*/, '')}.`; when = 'Call only with a valid window handle, usually in response to settings or editor actions.'; }
  }
  if (entry.module === 'OpenGL') {
    if (/^glGen/.test(n) || /^glCreate(?!Shader)/.test(n)) { action = `Creates one or more OpenGL ${readable.replace(/^(gen|create)\s*/, '')} objects.`; when = 'Create during resource setup, keep the returned IDs, and delete them during cleanup.'; }
    else if (/^glDelete/.test(n)) { action = `Deletes OpenGL ${readable.replace(/^delete\s*/, '')} objects.`; when = 'Call when the GPU resource is no longer referenced. Set your stored ID to 0 afterward.'; }
    else if (/^glBind/.test(n)) { action = `Binds an OpenGL ${readable.replace(/^bind\s*/, '')} object to the selected target.`; when = 'Bind the intended object before upload, configuration, or drawing calls that use that target.'; }
    else if (/^glBuffer(Data|Storage|SubData)/.test(n)) { action = 'Allocates or updates the data store of the currently bound OpenGL buffer.'; when = 'Bind the correct buffer first, pass the actual byte size, and keep source storage valid until the call returns.'; }
    else if (/^glTex(Image|SubImage|Storage|Parameter)/.test(n)) { action = 'Allocates, uploads, or configures the currently bound OpenGL texture.'; when = 'Bind the correct texture and target first; ensure dimensions, format, type, and pixel byte count agree.'; }
    else if (/^glFramebuffer|^glNamedFramebuffer/.test(n)) { action = 'Creates, attaches, checks, or configures framebuffer state.'; when = 'Use for render targets, shadow maps, picking buffers, and post-processing. Check completeness before rendering.'; }
    else if (/^glUniform|^glProgramUniform/.test(n)) { action = `Uploads ${readable.replace(/^(program )?uniform\s*/, '')} data to a shader uniform.`; when = 'Use a valid uniform location from the linked program and call the variant matching the GLSL type.'; }
    else if (/^glGet/.test(n)) { action = `Queries OpenGL for ${readable.replace(/^get\s*/, '')}.`; when = 'Use the matching typed output helper or reusable result object; check documented result counts before reading.'; }
    else if (n === 'glEnable' || n === 'glDisable') { action = `${n === 'glEnable' ? 'Enables' : 'Disables'} one OpenGL capability.`; when = 'Pass a capability constant such as GL_DEPTH_TEST or GL_BLEND. This state remains active until changed.'; }
    else if (/^glDispatchCompute/.test(n)) { action = 'Launches compute-shader work groups.'; when = 'Bind a linked compute program and all required buffers/images first, then use the correct memory barrier before consuming results.'; }
    else if (/^glMemoryBarrier/.test(n)) { action = 'Makes selected GPU writes visible to later GPU operations.'; when = 'Call after compute/image/storage writes and before a later stage reads those results.'; }
    else if (/^glVertexAttribPointer/.test(n)) { action = 'Describes how one vertex attribute is read from the currently bound vertex buffer.'; when = 'Bind the VAO and buffer first; make size, type, stride, and offset match the packed vertex layout.'; }
    else if (/^glMap/.test(n)) { action = 'Maps GPU buffer storage into CPU-addressable memory.'; when = 'Use only when the mapping flags and synchronization are understood; unmap before the resource is used incompatibly.'; }
    else if (/^glUnmap/.test(n)) { action = 'Ends a previous OpenGL buffer mapping.'; when = 'Call after CPU reads/writes are complete and check the returned success state.'; }
  }
  if (entry.module === 'OpenAL') {
    if (/^(al|alc)Gen/.test(n) || /^create/.test(lower)) { action = `Creates ${readable.replace(/^(gen|create)\s*/, '') || 'an OpenAL resource'}.`; when = 'Create after an OpenAL device/context is ready, check errors, and delete it during cleanup.'; }
    else if (/^(al|alc)Delete|Destroy|Close/.test(n)) { action = `Releases ${readable.replace(/^(delete|destroy|close)\s*/, '') || 'an OpenAL resource'}.`; when = 'Call once after playback/work has stopped and before destroying the parent context/device.'; }
    else if (/^alBufferData/.test(n)) { action = 'Copies PCM sample data into an OpenAL audio buffer.'; when = 'Use a format matching channel count/bit depth and pass the exact byte count and sample rate.'; }
    else if (/^alSourcePlay/.test(n)) { action = 'Starts or resumes playback from an OpenAL source.'; when = 'Attach a valid buffer or queue buffers first, then check the source state or OpenAL error if no sound plays.'; }
    else if (/^alSourceStop/.test(n)) { action = 'Stops playback on an OpenAL source.'; when = 'Use before reusing/deleting a source or when gameplay explicitly stops a sound.'; }
    else if (/^alSource/.test(n)) { action = `Changes or queries ${readable.replace(/^source\s*/, '')} on an audio source.`; when = 'Use the variant matching the value type and an appropriate AL_* property constant.'; }
    else if (/^alListener/.test(n)) { action = `Changes ${readable.replace(/^listener\s*/, '')} for the 3D audio listener.`; when = 'Update from the active camera/player transform when using spatial audio.'; }
    else if (/^(al|alc)Get/.test(n)) { action = `Queries ${readable.replace(/^get\s*/, '')} from OpenAL.`; when = 'Read errors/status after setup or when diagnosing playback/device problems.'; }
  }
  if (entry.module === 'Platform/Win32') {
    if (n === 'MessageBoxA') { action = 'Displays a native Windows message box.'; when = 'Use for simple fatal startup errors when no console or UI renderer is available yet.'; }
    else if (/CreateFile/.test(n)) { action = 'Opens or creates a Windows file handle.'; when = 'Prefer System/File for normal LSX code. Use this only when implementing a missing low-level file feature.'; }
    else if (/CloseHandle/.test(n)) { action = 'Closes an owned Windows handle.'; when = 'Call exactly once for handles whose documentation requires CloseHandle.'; }
    else if (/ReadFile/.test(n)) { action = 'Reads bytes from an open Windows file/device handle into supplied storage.'; when = 'Prefer System/File. At this level, check both the success flag and actual bytes read.'; }
    else if (/WriteFile/.test(n)) { action = 'Writes bytes from supplied storage to an open Windows handle.'; when = 'Prefer System/File. Check both the success flag and actual bytes written.'; }
  }
  return { friendlyDescription: action, whatItIs: action, whenToUse: when };
}

function fieldInfo(entry, ownerInfo) {
  const special = FIELD_SPECIAL[fieldKey(entry)];
  if (special) return { friendlyDescription: special[0], whatItIs: special[1], whenToUse: `Read this field only when inspecting an existing ${entry.owner} record.` };
  const n = entry.name;
  const readable = humanize(n);
  let meaning = `The ${readable} value stored on ${entry.owner}.`;
  if (['x','y','z','w'].includes(n)) meaning = `The ${n.toUpperCase()} component of ${entry.owner}.`;
  else if (n === 'width') meaning = `The current width stored on ${entry.owner}.`;
  else if (n === 'height') meaning = `The current height stored on ${entry.owner}.`;
  else if (n === 'valid' || n === 'ok') meaning = `Whether ${entry.owner} is currently valid and safe to use.`;
  else if (n.includes('count') || n === 'length') meaning = `The number of ${readable.replace(/count|length/g,'').trim() || 'items'} represented by ${entry.owner}.`;
  else if (n === 'text') meaning = `The UTF-8 text currently stored on ${entry.owner}.`;
  else if (n === 'error' || n === 'error_message') meaning = `The most recent error information stored on ${entry.owner}.`;
  return {
    friendlyDescription: meaning,
    whatItIs: `${meaning} It is one part of the larger ${entry.owner} object.`,
    whenToUse: `Read it from an existing ${entry.owner} after the operation that fills or updates that object.`,
    beginnerNote: ownerInfo?.beginnerNote || ''
  };
}

function methodInfo(entry, ownerInfo) {
  if (entry.module === 'UI/LazyUI' && entry.owner === 'CanvasContext' && entry.name === 'push') {
    return {
      level: 'internal',
      friendlyDescription: 'Adds one already-built CanvasCommand to the context command queue.',
      whatItIs: 'The low-level queue operation used by CanvasContext drawing methods after they have filled every required command field.',
      whenToUse: 'Only when extending CanvasContext with a new drawing command. Normal UI code should call fill_rect(), line(), circle(), draw_text(), image(), and the other public drawing methods.',
      beginnerNote: 'Skip this method unless you are implementing a new canvas primitive.',
      commonMistake: 'Pushing a partially initialized command can produce incorrect geometry, colors, text, or texture state.'
    };
  }
  const base = functionInfo(entry);
  base.whatItIs = `${base.whatItIs} It operates on the current ${entry.owner} instance.`;
  base.whenToUse = base.whenToUse.replace(/^Use it/, `Use ${entry.owner}.${entry.name}()`);
  if (entry.name === 'destroy') base.beginnerNote = `After destroy(), do not use the ${entry.owner} again.`;
  if (ownerInfo?.level === 'internal') base.beginnerNote = ownerInfo.beginnerNote || `This belongs to an internal ${entry.owner} object.`;
  return base;
}

function constantInfo(entry) {
  const readable = humanize(entry.name);
  let friendly = `Named ${entry.module} value for ${readable}.`;
  let when = `Pass ${entry.name} to functions that ask for this setting instead of typing its numeric value.`;
  if (entry.module === 'OpenGL') {
    friendly = `OpenGL constant representing ${readable}.`;
    when = 'Use it only with OpenGL parameters that document this exact category of value; constants are not interchangeable just because they are numbers.';
  } else if (entry.module === 'GLFW') {
    friendly = `GLFW constant representing ${readable}.`;
    when = 'Use it with the matching GLFW window hint, input query, monitor, or status function.';
  } else if (entry.module === 'OpenAL') {
    friendly = `OpenAL constant representing ${readable}.`;
    when = 'Use it with the matching OpenAL source, buffer, listener, context, format, or effect function.';
  }
  return { friendlyDescription: friendly, whatItIs: friendly, whenToUse: when };
}

function returnDescription(entry, returnType) {
  if (!returnType || returnType === 'void') return '';
  const lower = entry.name.toLowerCase();
  if (returnType === 'bool' || lower.startsWith('is_') || lower.startsWith('has_') || lower.includes('valid') || lower.includes('ready')) return 'true when the check succeeds; false otherwise.';
  if (lower.includes('create') || lower.includes('load') || lower.startsWith('new')) return 'the created/loaded value or handle. Check it before use when the API can fail.';
  if (lower.includes('count') || lower === 'length') return 'the number of available items.';
  if (lower.includes('error')) return 'the current error code or message.';
  return 'the result of this operation.';
}

function exampleForCanvasCommand(entry) {
  let draw = 'canvas.fill_rect(20.0,20.0,160.0,48.0,UI.rgba(65,133,239,255))';
  if (['x2','y2','line_width'].includes(entry.name)) draw = 'canvas.line(20.0,24.0,180.0,24.0,3.0,UI.rgba(230,235,245,255))';
  if (['x3','y3'].includes(entry.name)) draw = 'canvas.triangle(24.0,110.0,96.0,20.0,168.0,110.0,UI.rgba(90,180,125,255))';
  if (entry.name === 'radius') draw = 'canvas.circle(90.0,70.0,42.0,UI.rgba(110,145,240,255))';
  if (['font_size','text'].includes(entry.name)) draw = 'canvas.set_font_size(22.0)\ncanvas.draw_text("Quest updated",20.0,42.0,UI.rgba(245,235,180,255))';
  if (entry.name === 'texture') draw = 'local texture = Texture2D.load_ui("Assets/icon.png")\ncanvas.image(texture.id,20.0,20.0,64.0,64.0)';
  const textureImport = entry.name === 'texture' ? '\nuse "@LazyScript/bindings/Graphics/Texture2D.lsx" as Texture2D' : '';
  const field = entry.kind === 'field' ? `\nlocal value = command.${entry.name}` : '';
  const cleanup = entry.name === 'texture' ? '\ntexture.destroy()' : '';
  return `use "@LazyScript/bindings/UI/LazyUI.lsx" as UI${textureImport}\n\nlocal canvas_element = UI.canvas()\nlocal canvas = UI.canvas_context(canvas_element)\n${draw}\n\n-- CanvasContext created this record for the renderer.\nlocal command = canvas.commands[0]${field}${cleanup}`;
}


function entryKey(entry) { return `${entry.module}|${entry.owner || ''}|${entry.name}`; }

function practicalExample(entry) {
  const key = entryKey(entry);
  const examples = {
    'Data/Json||parse_text': 'use "@LazyScript/bindings/Data/Json.lsx" as Json\n\nlocal document = Json.parse_text("{\\"player\\":\\"Luna\\",\\"level\\":12}")\nif document.valid() then\n    local player = document.get(document.root,"player")\nend\ndocument.destroy()',
    'Data/Json||load': 'use "@LazyScript/bindings/Data/Json.lsx" as Json\n\nlocal document = Json.load("Game/Assets/settings.json")\nif not document.valid() then\n    console.error_line(document.error())\nend\ndocument.destroy()',
    'Graphics/Image||load': 'use "@LazyScript/bindings/Graphics/Image.lsx" as Image\n\nlocal image = Image.load("Game/Assets/icon.png")\nif image.valid() then\n    local width = image.width\n    local height = image.height\nend\nimage.destroy()',
    'Graphics/STBImage||load': 'use "@LazyScript/bindings/Graphics/STBImage.lsx" as STBImage\n\nlocal image = STBImage.load("Game/Assets/icon.png")\nif image.valid() then\n    local pixels = image.pixels\nend\nimage.destroy()',
    'Graphics/Texture2D||create_rgba32': 'use "@LazyScript/bindings/Graphics/Texture2D.lsx" as Texture2D\n\nlocal red_pixel = {255,0,0,255}\nlocal texture = Texture2D.create_rgba32(1,1,red_pixel,true,true)\nif texture.valid() then\n    local texture_id = texture.id\nend\ntexture.destroy()',
    'Graphics/Texture2D||load_ui': 'use "@LazyScript/bindings/Graphics/Texture2D.lsx" as Texture2D\n\nlocal texture = Texture2D.load_ui("Game/Assets/icon.png")\nif not texture.valid() then console.error_line(texture.error()) end',
    'Math/OpenGL||uniform_mat2': 'use "@LazyScript/bindings/Math/GLM.lsx" as GLM\nuse "@LazyScript/bindings/Math/OpenGL.lsx" as GLMath\n\nlocal matrix = GLM.mat2_identity()\nGLMath.uniform_mat2(uniform_location,matrix)',
    'Math/OpenGL||uniform_mat3': 'use "@LazyScript/bindings/Math/GLM.lsx" as GLM\nuse "@LazyScript/bindings/Math/OpenGL.lsx" as GLMath\n\nlocal normal_matrix = GLM.mat3_identity()\nGLMath.uniform_mat3(uniform_location,normal_matrix)',
    'Math/OpenGL||uniform_mat4': 'use "@LazyScript/bindings/Math/GLM.lsx" as GLM\nuse "@LazyScript/bindings/Math/OpenGL.lsx" as GLMath\n\nlocal model = GLM.mat4_identity()\nGLMath.uniform_mat4(uniform_location,model)',
    'UI/LazyUI|CanvasContext|push': 'use "@LazyScript/bindings/UI/LazyUI.lsx" as UI\n\nlocal canvas_element = UI.canvas()\nlocal canvas = UI.canvas_context(canvas_element)\n\n-- Public drawing methods build and push a complete command for you.\ncanvas.fill_rect(20.0,20.0,160.0,48.0,UI.rgba(65,133,239,255))',
    'UI/LazyUI|Document|find': 'local save_button = document.find("#save")\nlocal first_toolbar_button = document.find(".toolbar-button")\nlocal first_button = document.find("button")\n\nif save_button ~= null then\n    save_button.text = "Save Scene"\n    save_button.mark_layout_dirty()\nend',
    'UI/LazyUI|Document|find_all': 'local buttons = document.find_all(".toolbar-button")\nfor button in buttons do\n    button.disabled = false\nend\nbuttons.destroy()',
    'UI/LazyUI|Element|add_event_listener': 'fn save_clicked(element,event)\n    console.write_line(event.type)\nend\n\nlocal save_button = document.find("#save")\nif save_button ~= null then\n    save_button.add_event_listener("click",save_clicked)\nend',
    'UI/LazyUI|Element|add_event_listener_with_context': 'fn save_clicked(element,event,editor)\n    editor.save_scene()\nend\n\nlocal save_button = document.find("#save")\nif save_button ~= null then\n    save_button.add_event_listener_with_context("click",save_clicked,editor)\nend',
    'UI/LazyUI|Element|remove_event_listener': 'save_button.remove_event_listener("click",save_clicked)',
    'UI/LazyUI|Element|clear_event_listeners': 'local removed = save_button.clear_event_listeners("click")',
    'UI/Renderer||create': 'use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer\n\n-- Create after GLFW/OpenGL initialization. null selects the bundled/default font.\nlocal renderer = UIRenderer.create(null,64)\nif not renderer.ready then\n    console.error_line(renderer.error_message)\nend',
    'OpenAL/WavPCM||load': 'use "@LazyScript/bindings/OpenAL/WavPCM.lsx" as WavPCM\n\nlocal sound = WavPCM.load("Game/Assets/click.wav")\nif sound.error == "OK" then\n    local sample_rate = sound.sample_rate\n    local byte_count = sound.data_size\nend\nsound.release()\nsound.destroy()', 
    'System/Log||open': 'use "@LazyScript/bindings/System/Log.lsx" as Log\n\nlocal logger = Log.open("build/game.log")\nlogger.info("Renderer initialization started")\nlogger.close()',
    'System/File||read_text': 'use "@LazyScript/bindings/System/File.lsx" as File\n\nlocal file = File.read_text("Game/Assets/dialogue.txt")\nif file.valid() then console.write_line(file.text) end\nfile.destroy()',
    'System/File||read_bytes': 'use "@LazyScript/bindings/System/File.lsx" as File\n\nlocal file = File.read_bytes("Game/Assets/model.bin")\nif file.valid() then local byte_count = file.length end\nfile.destroy()',
    'GLFW||glfwCreateWindow': 'use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW\n\nGLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR,4)\nGLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR,6)\nlocal window = GLFW.glfwCreateWindow(1000,700,"My LSX Game",0,0)\nif window == 0 then console.error_line("Window creation failed") end',
    'GLFW||glfwPollEvents': 'use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW\n\nwhile GLFW.glfwWindowShouldClose(window) == 0 do\n    -- update and render\n    GLFW.glfwSwapBuffers(window)\n    GLFW.glfwPollEvents()\nend',
    'OpenGL||glCreateShader': 'use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nlocal vertex_shader = GL.glCreateShader(GL.GL_VERTEX_SHADER)\nif vertex_shader == 0 then console.error_line("Shader creation failed") end',
    'OpenGL||glClearColor': 'use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.glClearColor(0.05,0.08,0.12,1.0)\nGL.glClear(GL.GL_COLOR_BUFFER_BIT+GL.GL_DEPTH_BUFFER_BIT)',
    'OpenGL||glViewport': 'use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.glViewport(0,0,framebuffer.width,framebuffer.height)',
    'OpenGL||glUseProgram': 'use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.glUseProgram(shader_program)',
    'OpenGL||glDrawArrays': 'use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.glBindVertexArray(vertex_array)\nGL.glDrawArrays(GL.GL_TRIANGLES,0,3)',
    'OpenGL||glDrawElements': 'use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.glBindVertexArray(vertex_array)\nGL.glDrawElements(GL.GL_TRIANGLES,index_count,GL.GL_UNSIGNED_INT,0)',
    'OpenAL||createBuffer': 'use "@LazyScript/bindings/OpenAL/OpenAL.lsx" as AL\n\nlocal buffer = AL.createBuffer()\nif buffer == 0 then console.error_line("OpenAL buffer creation failed") end',
  };
  if (examples[key]) return examples[key];
  if (entry.module === 'OpenGL') {
    const name = entry.name;
    const matrix = name.match(/^glUniformMatrix([234])fv$/);
    if (matrix) {
      const size = matrix[1];
      return `use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\nuse "@LazyScript/bindings/Math/GLM.lsx" as GLM\n\nlocal matrix = GLM.mat${size}_identity()\nGL.${name}(uniform_location,1,GL.GL_FALSE,matrix.data)`;
    }
    const floatMatrix = name.match(/^glUniformMatrix([234])(?:x([234]))?fv(?:ARB)?$/);
    if (floatMatrix) {
      const columns = Number(floatMatrix[1]);
      const rows = Number(floatMatrix[2] || floatMatrix[1]);
      const values = [];
      for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) values.push(column === row ? '1.0' : '0.0');
      return `use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\n-- Ordinary decimal tables are packed as contiguous f32 values.\nlocal matrix_values = {${values.join(',')}}\nGL.${name}(uniform_location,1,GL.GL_FALSE,matrix_values)`;
    }
    const doubleMatrix = name.match(/^glUniformMatrix([234])(?:x([234]))?dv(?:ARB)?$/);
    if (doubleMatrix) {
      const floatName = name.replace(/dv(ARB)?$/, 'fv$1');
      const columns = Number(doubleMatrix[1]);
      const rows = Number(doubleMatrix[2] || doubleMatrix[1]);
      const values = [];
      for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) values.push(column === row ? '1.0' : '0.0');
      return `use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\n-- Normal LSX decimal tables are f32, so use the matching float upload.\nlocal matrix_values = {${values.join(',')}}\nGL.${floatName}(uniform_location,1,GL.GL_FALSE,matrix_values)`;
    }
    const floatUniform = name.match(/^glUniform([1-4])f$/);
    if (floatUniform) {
      const count = Number(floatUniform[1]);
      const values = ['0.75','0.25','0.75','1.0'].slice(0,count).join(',');
      return `use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.${name}(uniform_location,${values})`;
    }
    const intUniform = name.match(/^glUniform([1-4])i$/);
    if (intUniform) {
      const count = Number(intUniform[1]);
      const values = ['0','1','2','3'].slice(0,count).join(',');
      return `use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.${name}(uniform_location,${values})`;
    }
    if (name === 'glGetUniformLocation') return 'use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nlocal uniform_location = GL.glGetUniformLocation(shader_program,"u_model")\nif uniform_location == -1 then console.error_line("u_model was not active in the linked shader") end';
    if (name === 'glEnable' || name === 'glDisable') return `use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.${name}(GL.GL_DEPTH_TEST)`;
    if (name === 'glBlendFunc') return 'use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL\n\nGL.glEnable(GL.GL_BLEND)\nGL.glBlendFunc(GL.GL_SRC_ALPHA,GL.GL_ONE_MINUS_SRC_ALPHA)';
  }
  return entry.example;
}

function objectExample(entry) {
  const key = `${entry.module}|${entry.name}`;
  const examples = {
    'UI/LazyUI|CanvasContext': 'use "@LazyScript/bindings/UI/LazyUI.lsx" as UI\n\nlocal canvas_element = UI.canvas()\nlocal canvas = UI.canvas_context(canvas_element)\ncanvas.set_fill(UI.rgba(45,95,180,255))\ncanvas.fill_box(16.0,16.0,180.0,44.0)\ncanvas.set_fill(UI.rgba(255,255,255,255))\ncanvas.fill_text("Quest updated",28.0,44.0)',
    'Graphics/Texture2D|Texture': 'use "@LazyScript/bindings/Graphics/Texture2D.lsx" as Texture2D\n\nlocal texture = Texture2D.load_ui("Game/Assets/portrait.png")\nif texture.valid() then\n    local id = texture.id\n    local width = texture.width\nend\ntexture.destroy()',
    'OpenAL/WavPCM|WavPCM': 'use "@LazyScript/bindings/OpenAL/WavPCM.lsx" as WavPCM\n\nlocal sound = WavPCM.load("Game/Assets/click.wav")\nif sound.error == "OK" then\n    local sample_rate = sound.sample_rate\n    local byte_count = sound.data_size\nend\nsound.release()\nsound.destroy()', 
    'Text/Font|Atlas': 'use "@LazyScript/bindings/Text/FreeType.lsx" as FreeType\nuse "@LazyScript/bindings/Text/Font.lsx" as Font\n\nlocal face = Font.system("Segoe UI",48)\nlocal atlas = Font.create_ascii_atlas(face)\nif atlas.valid() then local glyph_count = atlas.glyph_count end\natlas.destroy()\nface.destroy()', 
    'Text/Font|TextMesh': 'use "@LazyScript/bindings/Text/FreeType.lsx" as FreeType\nuse "@LazyScript/bindings/Text/Font.lsx" as Font\n\nlocal face = Font.system("Segoe UI",48)\nlocal atlas = Font.create_ascii_atlas(face)\nlocal mesh = Font.build_text(face,atlas,"Hello LSX",0.0,0.0,1.0)\nlocal float_count = mesh.vertices.length()\nmesh.destroy()\natlas.destroy()\nface.destroy()', 
    'Text/Font|TextInstances': 'use "@LazyScript/bindings/Text/FreeType.lsx" as FreeType\nuse "@LazyScript/bindings/Text/Font.lsx" as Font\n\nlocal face = Font.system("Segoe UI",48)\nlocal atlas = Font.create_ascii_atlas(face)\nlocal instances = Font.build_text_instances(face,atlas,"Score: 100",0.0,0.0,1.0)\nlocal quad_value_count = instances.quads.length()\ninstances.destroy()\natlas.destroy()\nface.destroy()', 
    'Text/Font|Texture': 'use "@LazyScript/bindings/Text/FreeType.lsx" as FreeType\nuse "@LazyScript/bindings/Text/Font.lsx" as Font\n\nlocal face = Font.system("Segoe UI",48)\nlocal atlas = Font.create_ascii_atlas(face)\nlocal texture = Font.upload_atlas(atlas)\nif texture.valid() then local texture_id = texture.id end\ntexture.destroy()\natlas.destroy()\nface.destroy()', 
    'UI/Renderer|Renderer': 'use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer\n\nlocal renderer = UIRenderer.create(null,64)\nif renderer.ready then\n    renderer.begin(framebuffer_width,framebuffer_height)\n    renderer.submit(root)\n    renderer.flush()\nend\nrenderer.destroy()',
    'Network/Http|Response': 'use "@LazyScript/bindings/Network/Http.lsx" as Http\n\nlocal client = Http.Client.create("My LSX Game/1.0")\nlocal response = client.get("example.com","/data.json",true)\nif response.succeeded() then local body = response.text() end\nresponse.close()\nresponse.destroy()\nclient.close()\nclient.destroy()', 
  };
  return examples[key] || null;
}

function parameterDescription(entry, parameter) {
  const name = parameter.name;
  const lower = name.toLowerCase();
  if (PARAM_DOCS[name]) return PARAM_DOCS[name];
  if (lower === 'type') {
    if (entry.name === 'glCreateShader') return 'Shader stage constant such as GL.GL_VERTEX_SHADER or GL.GL_FRAGMENT_SHADER.';
    return 'A named API constant that selects the kind of object or operation.';
  }
  if (lower === 'location') return 'Shader uniform/attribute location returned by the matching lookup function; -1 normally means the name was not active.';
  if (lower.includes('shader')) return 'An OpenGL shader object created by glCreateShader().';
  if (lower.includes('program')) return 'A linked OpenGL shader program handle.';
  if (lower.includes('vao') || lower.includes('vertexarray')) return 'A vertex-array object created earlier.';
  if (lower.includes('buffer')) return 'A native/GPU/audio buffer created earlier or an LSX collection holding data.';
  if (lower === 'share') return 'Another GLFW window whose OpenGL objects should be shared, or 0 when no sharing is needed.';
  if (lower.includes('callback')) return 'An LSX/native callback function compatible with this event signature.';
  if (lower.includes('format')) return 'A named format constant describing how the data is laid out.';
  if (lower.includes('usage')) return 'A named usage hint such as static, dynamic, or stream usage.';
  if (lower.includes('status')) return 'A status/result value returned by the previous operation.';
  if (lower.includes('timeout')) return 'Maximum wait time, normally in milliseconds unless this function states otherwise.';
  if (lower.includes('offset')) return 'Byte or element offset from the start of the resource.';
  if (lower.includes('stride')) return 'Distance in bytes between consecutive records; use 0 only when tightly packed is allowed.';
  if (lower === 'data' || lower.includes('pixels') || lower.includes('samples')) return 'The LSX collection or native storage containing the bytes/values used by this operation.';
  if (lower.includes('handle')) return 'A native handle returned by an earlier create/open operation.';
  if (lower.includes('result') || lower.includes('out')) return 'Reusable LSX-owned output storage that this call fills.';
  return `The ${humanize(name)} value required by this operation. See the practical example and module setup above for where it comes from.`;
}

function commonMistakeFor(entry) {
  if (entry.level === 'internal') return 'Do not build or edit this record directly unless you are extending the compiler/runtime/renderer. Use the public object or factory listed in Related.';
  if (entry.kind === 'field') return `Do not read this field before the ${entry.owner} has been created, loaded, refreshed, or filled by its owning operation.`;
  if (entry.name === 'destroy' || /delete|free|close/i.test(entry.name)) return 'Do not call cleanup twice, and do not use the resource after cleanup.';
  if (entry.module === 'OpenGL') return 'OpenGL state is global to the current context. Calling this before the context/function loader is ready, or with the wrong object bound, can fail or draw nothing.';
  if (entry.module === 'GLFW') return 'Most GLFW calls require successful library loading and glfwInit(). Window functions also require a valid nonzero window handle.';
  if (entry.module === 'OpenAL') return 'OpenAL calls require an open device and current context. Check errors after setup calls.';
  if (entry.module.includes('Raw') || entry.kind === 'raw function') return 'This is a low-level wrapper. Do not guess pointer/handle arguments; obtain them from the matching create/query function or use the typed wrapper.';
  if (/load|parse|create|open/i.test(entry.name)) return 'Do not assume creation/loading succeeded. Check valid(), ready, a returned status, or a nonzero handle before continuing.';
  return '';
}

const entriesByOwner = new Map();
for (const entry of data.entries) {
  if (!entry.owner) continue;
  const key = `${entry.module}|${entry.owner}`;
  if (!entriesByOwner.has(key)) entriesByOwner.set(key, []);
  entriesByOwner.get(key).push(entry);
}

const objectInfo = new Map();
for (const entry of data.entries.filter(item => item.kind === 'typed object' || item.kind === 'typed struct')) {
  const key = objectKey(entry);
  const info = { ...genericObjectInfo(entry, entriesByOwner.get(key) || []), ...(SPECIAL_OBJECTS[key] || {}) };
  objectInfo.set(key, info);
}

for (const entry of data.entries) {
  const owner = entry.owner ? objectInfo.get(`${entry.module}|${entry.owner}`) : null;
  let info;
  if (entry.kind === 'typed object' || entry.kind === 'typed struct') info = objectInfo.get(objectKey(entry));
  else if (entry.kind === 'field') info = fieldInfo(entry, owner);
  else if (entry.kind === 'method' || entry.kind === 'compiler method') info = methodInfo(entry, owner);
  else if (entry.kind === 'constant') info = constantInfo(entry);
  else if (entry.kind === 'typed function' || entry.kind === 'raw function') info = functionInfo(entry);
  else if (entry.kind === 'compiler feature') info = { friendlyDescription: entry.friendlyDescription || entry.description, whatItIs: entry.whatItIs || entry.description, whenToUse: entry.whenToUse || MODULE_GUIDES[entry.module]?.whenToUse || '', beginnerNote: entry.beginnerNote || '', memberSummary: entry.memberSummary || '', howToGet: entry.howToGet || '', cleanup: entry.cleanup || '', related: entry.related || [], workflow: entry.workflow || '', commonMistake: entry.commonMistake || '' };
  else info = { friendlyDescription: entry.friendlyDescription || entry.description, whatItIs: entry.description || '', whenToUse: '' };

  entry.level = info.level || owner?.level || levelFor(entry);
  entry.friendlyDescription = info.friendlyDescription || entry.friendlyDescription || entry.description;
  entry.whatItIs = info.whatItIs || entry.friendlyDescription;
  entry.whenToUse = info.whenToUse || MODULE_GUIDES[entry.module]?.whenToUse || '';
  entry.beginnerNote = info.beginnerNote || '';
  entry.memberSummary = info.memberSummary || '';
  entry.howToGet = info.howToGet || '';
  entry.requires = moduleRequirement(entry.module);
  entry.cleanup = info.cleanup || '';
  entry.related = info.related || (entry.owner ? [`${entry.module}.${entry.owner}`] : []);

  const parsed = parseCallable(entry.signature);
  entry.parameterDocs = {};
  for (const parameter of parsed.parameters) entry.parameterDocs[parameter.name] = parameterDescription(entry, parameter);
  entry.returnsDescription = returnDescription(entry, parsed.returnType);
  entry.workflow = info.workflow || owner?.workflow || MODULE_GUIDES[entry.module]?.beginnerStart || '';
  entry.commonMistake = info.commonMistake || owner?.commonMistake || commonMistakeFor(entry);
  entry.example = practicalExample(entry);

  if (entry.module === 'UI/LazyUI' && (entry.name === 'CanvasCommand' || entry.owner === 'CanvasCommand')) {
    entry.example = exampleForCanvasCommand(entry);
    entry.exampleNote = entry.kind === 'field'
      ? `Inspect ${entry.name} on a command that CanvasContext already recorded.`
      : 'Use CanvasContext to create commands; inspect the command queue only for debugging or custom rendering.';
  }
  if (entry.kind === 'field' && entry.owner) {
    entry.exampleNote = entry.exampleNote || `Read ${entry.owner}.${entry.name} from a real ${entry.owner} object after it has been filled.`;
  }
  if (entry.level === 'advanced' && !entry.beginnerNote) {
    entry.beginnerNote = `This is a low-level ${entry.module} entry. Start with the typed/high-level wrapper when one exists.`;
  }
}


const objects = data.entries.filter(entry => entry.kind === 'typed object' || entry.kind === 'typed struct');
const returnTypeOf = entry => parseCallable(entry.signature).returnType.split('.').pop();
const factoryPriority = ['create','load','open','parse_text','document','canvas_context','connect_window_input','system','vec2','vec3','vec4','mat2_identity','mat3_identity','mat4_identity','quat_identity','build_text','build_text_instances','upload_atlas','read_text','read_bytes'];
for (const object of objects) {
  const special = objectExample(object);
  if (special) object.example = special;
  const factories = data.entries.filter(entry => entry.module === object.module && !entry.owner && entry.kind === 'typed function' && returnTypeOf(entry) === object.name);
  factories.sort((left,right) => {
    const li = factoryPriority.indexOf(left.name), ri = factoryPriority.indexOf(right.name);
    return (li < 0 ? 999 : li) - (ri < 0 ? 999 : ri);
  });
  if (factories.length) {
    object.howToGet = object.howToGet || `Usually obtained from ${object.module}.${factories[0].name}(), whose full signature is ${factories[0].signature}.`;
    if (!special && /\.${object.name}\.new\(\)/.test(object.example || '') && factories[0].example) object.example = factories[0].example;
    object.related = [...new Set([...(object.related || []), `${object.module}.${factories[0].name}`])];
  } else {
    const methodFactories = data.entries.filter(entry => entry.module === object.module && entry.owner && (entry.kind === 'method' || entry.kind === 'compiler method') && returnTypeOf(entry) === object.name);
    methodFactories.sort((left,right) => {
      const li = factoryPriority.indexOf(left.name), ri = factoryPriority.indexOf(right.name);
      return (li < 0 ? 999 : li) - (ri < 0 ? 999 : ri);
    });
    if (!object.howToGet && methodFactories.length) {
      object.howToGet = `Returned by ${object.module}.${methodFactories[0].owner}.${methodFactories[0].name}(). Read that method’s example for the complete setup.`;
      object.related = [...new Set([...(object.related || []), `${object.module}.${methodFactories[0].owner}.${methodFactories[0].name}`])];
    } else if (!object.howToGet) {
      object.howToGet = `Create it with ${object.module}.${object.name}.new(), fill or refresh it through the documented methods, and destroy it when finished.`;
    }
  }
  if (object.level === 'internal') object.exampleNote = 'This example shows how the public API creates the internal record. You normally do not construct it yourself.';
  else object.exampleNote = 'A real creation/use path for this object, not just an empty constructor.';
}

for (const entry of data.entries) {
  if (!entry.example || !String(entry.example).trim()) {
    entry.example = entry.signature || entry.name;
    entry.exampleNote = 'Minimal focused usage. Read the module setup and parameter explanations above before calling it.';
  }
  if (entry.module === 'Text/Font' && String(entry.example || '').includes('use "@LazyScript/bindings/Text/Font.lsx" as Font') && !String(entry.example || '').includes('Text/FreeType.lsx')) {
    entry.example = String(entry.example).replace('use "@LazyScript/bindings/Text/Font.lsx" as Font', 'use "@LazyScript/bindings/Text/FreeType.lsx" as FreeType\nuse "@LazyScript/bindings/Text/Font.lsx" as Font');
    entry.exampleNote = `${entry.exampleNote || 'Practical Text/Font usage.'} FreeType is imported explicitly so the compiler can name the Face type returned through Font.`;
  }
  if (entry.level === 'advanced' && !entry.exampleNote) entry.exampleNote = 'Focused low-level call. The module guide explains the required context and the parameter list explains where each handle/value comes from.';
}

data.moduleGuides = MODULE_GUIDES;
data.generated = { ...(data.generated || {}), beginnerMetadata: '0.18.5' };

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
fs.writeFileSync(jsPath, `window.LSX_API_DATA=${JSON.stringify(data)};\n`);
console.log(`Enriched ${data.entries.length} API entries across ${Object.keys(MODULE_GUIDES).length} module guides.`);
