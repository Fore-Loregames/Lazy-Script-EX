# 31 - Source-matched infinite LazyUI node graph

This example ports the graph camera and navigator behavior from the supplied JavaScript/HTML/CSS editor source into LSX, LSHTML, and LSCSS. It is not a finite absolute canvas and it does not use the retained layout scroll range as a camera.

Implemented behavior:

- MMB drag, or Space + left drag, pans the camera without bounds.
- Wheel input zooms around the pointer from 30% to 250%.
- Node title bars drag continuously through the real `UI.Document` pointer path.
- Output pins capture a wire preview and connect on release over a matching input pin.
- The graph grid wraps with camera movement instead of ending at a scroll boundary.
- Top-right zoom/reset/frame controls and keyboard `F`, `+`, and `-` controls mirror the source controller.
- The floating navigator draws every visible node, active connection, and the current camera viewport; dragging it recenters the graph.
- Palette and inspector panes may scroll independently, while the graph itself explicitly keeps `scroll_x`, `scroll_y`, and both scroll maxima at zero.

`main.lsx` keeps the normal application startup free of synthetic input. The compiler test copy invokes `verify_graph_interactions` before closing and validates the exact same retained document event path at O0 and O6.

Build with `build.bat`, then run `build/lazyui-node-graph.exe`.
