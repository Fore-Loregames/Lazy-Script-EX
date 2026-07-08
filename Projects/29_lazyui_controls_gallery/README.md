# 29 - LazyUI complete controls gallery

This project exercises the interactive HTML-style control layer rather than static placeholders.

It includes:

- editable text, search, email, password, number, date, time, and keybind fields;
- caret movement, drag selection, Home/End, Ctrl+A/C/X/V, Backspace/Delete, Tab focus, and password masking;
- a multiline textarea with selection, clipboard editing, Page Up/Down, mouse-wheel scrolling, clipping, and its own draggable scrollbar;
- working checkboxes, radio buttons, toggles, switches, buttons, range inputs, and sliders;
- select, combobox, dropdown, progress, status, and disabled-control visuals;
- a continuous editor-style HSV picker with one saturation/value plane, a full rainbow hue strip, an alpha strip, draggable cursors, current/previous swatches, saved colors, and numeric channels;
- a visible checkerboard loaded through `Texture2D` and rendered by an explicitly closed LSHTML `<img src="assets/checkerboard.png"></img>` element; only its width is specified, while `set_texture()` preserves the intrinsic source aspect ratio;
- the same checkerboard image beneath the alpha strip;
- two independently scrollable columns with separate retained offsets and draggable LazyUI scrollbars.

The picker uses layered instanced gradients rather than dozens of fake color-cell controls. All control chrome, selections, carets, slider tracks/thumbs, checks, switches, scrollbars, picker layers, images, and SDF glyphs remain in shared retained batches.

Build with `build.bat`, then run `build/lazyui-controls.exe`.

Pointer coordinates are converted from GLFW window coordinates into framebuffer pixels, so the picker, sliders, text selection, and scrollbars remain accurate under Windows display scaling.
