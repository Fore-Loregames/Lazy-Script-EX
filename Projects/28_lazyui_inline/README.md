# 28 - LazyUI instanced hierarchy stress test

This project exercises native inline `lshtml` and `lscss` with the retained LazyUI renderer.

It validates:

- collapsed static and dynamic LSHTML text surviving lowering and rendering;
- one instanced box draw for visible retained panels, rounded rectangles, circles, ellipses, borders, and hierarchy rows;
- one instanced SDF glyph draw for all visible text;
- direct glyph appending into the persistent renderer batch without a temporary text mesh per label;
- a 500-row retained hierarchy inside a collapsible foldout;
- viewport culling so offscreen rows do not enter the box or glyph instance batches;
- a visible draggable vertical scrollbar plus automatic mouse-wheel and Page Up/Page Down scrolling for the hierarchy viewport;
- retained-frame caching so unchanged frames reuse CPU tables and GPU buffer contents;
- dirty propagation, unchanged-pointer rejection, and fast off-pointer leaf hit testing;
- an allocation-free persistent FPS text buffer updated once per second;
- uncapped rendering so the hierarchy can be used as an actual throughput stress test.

Build with `build.bat`, then run `build/lazyui-inline.exe`.
