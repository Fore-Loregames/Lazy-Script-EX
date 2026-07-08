# 30 - LazyUI editor workspace

A practical editor-oriented composition with a menu bar, transform toolbar, hierarchy, scene view, project browser, console, inspector, vector fields, toggles, sliders, selects, asset pickers, and status information.

The hierarchy, project browser, console, and inspector are four independent retained scroll panes. Each keeps its own horizontal and vertical scroll offsets, wheel target, and draggable scrollbar state.

Mesh, material, script, and audio references are displayed as proper asset-picker rows with an icon, asset name, metadata, hover treatment, and browse button instead of pretending to be disabled text inputs.

Build with `build.bat`, then run `build/lazyui-editor-workspace.exe`.
