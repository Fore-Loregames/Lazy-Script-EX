# 31 - Infinite draggable LazyUI node graph

This example is an interactive retained node editor rather than a click-to-position mockup.

It includes:

- unbounded world-space panning by dragging empty graph space;
- pointer-anchored mouse-wheel zoom through a custom `onscroll` surface without a finite native scroll range;
- continuous title-bar node dragging through implicit pointer capture and pointer-delta world positioning, so clicking never teleports a node;
- direct output-pin drag and drop onto matching input pins;
- typed pin validation and click-to-disconnect inputs;
- live three-segment preview and retained connection wires;
- a viewport grid that follows the pan offset;
- clear-wires, frame-all, auto-layout, compile, and add-node actions;
- independently scrollable palette and inspector panes;
- a minimap that floats over the graph viewport instead of moving inside graph world content;
- editable inspector controls, dropdowns, checkboxes, and status feedback.

Nodes and socket chrome use the shared instanced LazyUI surface batch. Text uses the shared SDF glyph batch, while grid and connection lines use declarative canvas instances.

Build with `build.bat`, then run `build/lazyui-node-graph.exe`.

The example maps GLFW window-space cursor coordinates into framebuffer-space LazyUI coordinates before hit testing. This keeps nodes, pins, wires, and the color-independent graph camera aligned on high-DPI displays.

This compiler-test copy invokes `verify_graph_interactions` and exits. The normal Example 31 does not inject synthetic gestures before opening its window.
