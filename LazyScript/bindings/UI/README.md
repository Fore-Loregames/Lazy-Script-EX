# LazyUI: native LSHTML and LSCSS

LazyUI is the retained user-interface layer built directly into LazyScriptEX. It does not load separate HTML or CSS files and it does not embed a browser, JavaScript runtime, virtual DOM, reflection binder, or managed UI framework.

`lshtml` and `lscss` are first-class declarations inside ordinary `.lsx` source files:

```lsx
const InspectorProps = {
    title = "Inspector"
    status = "Ready"
}

lscss .inspector = {
    width = 320px
    padding = 12px
    gap = 8px
    background = #181b22
    border = 1px solid #303746
    border_radius = 8px
    box_shadow = 0px 8px 24px 0px #00000066
}

lshtml inspector_view(props) = {(
    <panel id="inspector" class="inspector">
        <h2>{props.title}</h2>
        <button onclick={save_clicked} context={props}>Save</button>
        <status-bar>{props.status}</status-bar>
    </panel>
)}
```

The compiler lowers the declarations to normal LSX element functions. The resulting tree is created once and retained. At runtime LSX reads and updates ordinary objects; the markup is not reparsed and there is no tree diff.

## Current pre-ECS architecture

The engine ECS and final `LSHTMLRunner` do not exist yet, so every element is currently an ordinary LSX function returning a lightweight `UI.Element` object. Every element carries:

- `ui_marker`
- `creation_kind`
- `runner_ready`
- `runner_attached`
- `template_root`
- `template_id`
- `source_tag`

Those fields allow the same elements to be attached to a future GameObject, `LSHTMLRunner`, or ECS entity without changing LSHTML source or the public element functions. Native references used internally by the renderer and event dispatcher are private implementation details. User-written LSX uses objects and functions only.

## Element functions

The public API includes structural, text, media, form, data, editor, graph, profiler, and game UI elements. Representative groups are:

- Structure: `ui`, `root`, `panel`, `section`, `row`, `column`, `stack`, `grid`, `split`, `scroll`, `viewport`, `overlay`, `modal`, `window`
- Editor chrome: `dock_space`, `dock_panel`, `toolbar`, `status_bar`, `menu_bar`, `tabs`, `foldout`, `context_menu`, `command_palette`
- Text/media: `label`, `span`, `paragraph`, `h1`–`h6`, `text_node`, `icon`, `image`, `video`, `audio`, `badge`, `tooltip`, `toast`
- Inputs: `button`, `toggle`, `checkbox`, `radio`, `input`, `textarea`, `number`, `range`, `slider`, `select`, `combobox`, `color`, `file`, `search`, `date`, `time`, `keybind`
- Data: `table`, `list`, `tree`, `data_grid`, `list_view`, `tree_view`, `virtual_list`, `pagination`
- Engine editor: `hierarchy`, `inspector`, `property`, `property_group`, `content_browser`, `asset_field`, `object_field`, `texture_field`, `material_field`, `transform_field`, `scene_view`, `game_view`, `project_browser`, `asset_browser`, `property_editor`, `component_header`, `transform_gizmo`
- Specialized tools: `node_editor`, `timeline`, `console`, `profiler`, `code_editor`, `material_editor`, `shader_editor`, `shader_graph`, `behavior_graph`, `animation_editor`, `sprite_editor`, `tilemap_editor`, `terrain_editor`, `particle_editor`, `audio_mixer`, `build_window`, `settings_panel`
- Game UI: `hud`, `safe_area`, `health_bar`, `mana_bar`, `minimap`, `crosshair`, `inventory`, `inventory_slot`, `hotbar`, `quest_log`, `dialogue`, `subtitle`, `notification`, `radial_menu`, `joystick`, `touch_area`
- Custom drawing: `canvas`

Kebab-case LSHTML tags map to underscore element functions, for example `<status-bar>` to `UI.status_bar()` and `<scene-view>` to `UI.scene_view()`.

## IDs, classes, props, and LSX values

Static and dynamic IDs and classes are supported:

```lsx
<panel id="object-inspector" class="panel inspector" />
<panel id={props.id} class={props.class_name} />
```

LSX values can be placed in text and attributes:

```lsx
<label>{selected.name}</label>
<input value={selected.name} />
<progress number-value={loading.progress} />
```

Reusable functions receive normal props objects:

```lsx
lshtml property_row(props) = {(
    <row class="property-row">
        <label>{props.name}</label>
        <input value={props.value} />
    </row>
)}
```

Custom tags call normal LSX functions. `<PropertyRow props={rowProps} />` calls `PropertyRow(rowProps)`. `<component function={build_row} props={rowProps} />` provides the explicit equivalent.

## Events

LSHTML event attributes accept normal LSX functions:

```lsx
<button
    onclick={save_clicked}
    onpointerdown={begin_drag}
    onpointermove={drag}
    onpointerup={end_drag}
    context={props}>
    Save
</button>
```

Supported events include click, change, input, focus, blur, key down/up, pointer down/up/move, and scroll. Handlers can be written later in the file; LSX does not require forward declarations.

```lsx
fn save_clicked(element,event,props)
    props.status = "Saved"
    return 0
end
```

The compiler hides the internal callback/context representation during lowering. No pointer syntax is required in front-facing LSX.

### Finding LSHTML elements from normal LSX

A `Document` exposes the retained LSHTML tree to ordinary LSX with simple CSS-style selectors:

```lsx
local save_button = document.find("#save")
local first_toolbar_button = document.find(".toolbar-button")
local first_button = document.find("button")
```

`#id` returns the first matching ID, `.class` returns the first element carrying that class, and a bare name returns the first matching tag. Tag lookup is ASCII case-insensitive and accepts kebab-case or underscore aliases such as `status-bar` and `status_bar`. Missing selectors return `null`.

Use `find_all()` when code needs every matching element:

```lsx
local toolbar_buttons = document.find_all(".toolbar-button")

for button in toolbar_buttons do
    button.disabled = false
end

toolbar_buttons.destroy()
```

The returned collection owns only its list storage. The document still owns the retained elements.

Runtime listeners use the same event names as LSHTML:

```lsx
fn save_clicked(element,event,editor)
    editor.save_scene()
end

local save_button = document.find("#save")
if save_button ~= null then
    save_button.add_event_listener_with_context("click",save_clicked,editor)
end
```

Use `add_event_listener()` for a two-parameter callback, or `add_event_listener_with_context()` when the callback also needs an ordinary LSX context object. Multiple listeners may be attached to the same event. `remove_event_listener()` removes one matching callback and `clear_event_listeners()` removes all runtime listeners for an event name.

## Real controls, text editing, and scrolling

LazyUI form elements are retained interactive controls rather than decorative boxes. `UI.connect_window_input(window, document)` attaches keyboard, character, clipboard, focus, and native Windows mouse-wheel routing to the document.

Single-line `input`, `search`, `email`, `url`, `tel`, `password`, `number`, `date`, `time`, and `keybind` elements support:

- insertion and deletion at the caret;
- click/drag selection;
- Left/Right, Home/End, Backspace/Delete, and Tab focus traversal;
- Ctrl+A, Ctrl+C, Ctrl+X, and Ctrl+V through the GLFW clipboard;
- `maxlength`, placeholder text, focus/change/input handlers, horizontal caret tracking, and password masking.

`textarea` preserves author-written newlines during LSHTML lowering and adds multiline Enter, Up/Down, Page Up/Page Down, internal vertical scrolling, clipping, mouse-wheel input, and a visible draggable scrollbar. Overflowing panels, lists, inspectors, and hierarchy views use the same scroll state and can show vertical and horizontal scrollbar tracks/thumbs.

Checkboxes, radio buttons, toggles, and switches update retained checked state and dispatch change events. `range` and `slider` controls support click/drag and keyboard adjustment through their min/max/step values. Color controls retain a native color value and `#RRGGBB` text representation; Example 29 combines that field with H/S/V ranges for a live picker.

Control visuals do not create individual geometry resources. Fields, selections, carets, checks, radio dots, switch tracks/thumbs, slider tracks/fills/thumbs, color swatches, and scrollbars append to the same instanced box batch, while all visible characters append to the shared SDF glyph batch. Unchanged frames continue to reuse cached CPU tables and GPU buffer contents.

Example setup:

```lsx
local document = UI.document(root)
local windowInput = UI.connect_window_input(window, document)

while GLFW.glfwWindowShouldClose(window) == 0 do
    cursor.refresh(window)
    document.pointer_move(cursor.x, cursor.y)
    -- Route left-button transitions through pointer_down_button/pointer_up_button.
    -- Keyboard, characters, clipboard, and mouse wheel are handled by windowInput.
end

windowInput.destroy()
document.destroy()
```

## Direct declaration syntax

LSHTML parameters use normal inference, and the LSCSS selector is written directly after `lscss`:

```lsx
lshtml inspector(props) = {(
    <panel id="inspector" class="inspector" />
)}

lscss .inspector = {
    width = {props.width}
}

lscss #inspector = {
    border_radius = 8px
}
```

There is no `selector` member stored in a style object. Class, ID, tag, combined, descendant, child, comma-separated, and state selectors are compile-time declaration syntax.

## LSCSS selectors and states

LSCSS supports element, class, ID, descendant, child, and comma-separated selectors:

```lsx
lscss .inspector > .property-row, #save = {
    gap = 6px
}
```

State selectors and nested state blocks are supported:

```lsx
lscss .primary = {
    background = #3977ff
    hover = {
        background = #4f8bff
        box_shadow = 0px 0px 14px 1px #4880ff88
    }
    active = {
        translate_y = 1px
    }
}

lscss #save:focus = {
    outline = 2px solid #9bb8ff
}
```

States are retained style objects on the element; the document input controller changes element state instead of rebuilding the tree.

## LSX values inside LSCSS

LSCSS accepts the same `{expression}` form as LSHTML. The expression is evaluated in the component scope when the retained tree is created, and the compiler records style-binding metadata for the future `LSHTMLRunner` update path.

```lsx
const PreviewProps = {
    width = 330.0
    accent = 0
}

lscss .inspector = {
    width = {props.width}
}

lscss .accent-shape = {
    background = {props.accent}
}
```

Normal CSS values remain CSS values. Colors, gradients, borders, radii, and shadows stay in LSCSS rather than being moved into drawing functions:

```lsx
lscss .preview-card = {
    background = "linear-gradient(135deg, #26344c, #151e2e)"
    border = "3px solid #6f94dc"
    border_radius = "18px"
    box_shadow = "0 10px 28px 0 rgba(0,0,0,0.35)"
}
```

Dynamic values can be direct variables, object fields, props fields, constants, or LSX function results whose return type matches the target style property. There is no runtime CSS string evaluator. Static CSS syntax is compiled once; dynamic LSX expressions are emitted as direct native style calls.

## Styling surface

The current native style object covers:

- display, position, width/height, min/max size, aspect ratio, box sizing
- margins, padding, gaps, absolute offsets
- flex direction/wrap/grow/shrink/basis, justify and alignment
- grid row/column counts and gaps
- background colors, linear gradients, radial gradients, opacity
- per-side border widths and colors
- independent corner radii
- shadows, outlines, outline offsets
- font size/weight, line height, letter/word spacing, text and vertical alignment
- white space and text overflow
- overflow/clip/scroll state
- z-index, cursor, pointer events, visibility
- translation, scale, rotation, transform origin
- image tint and object fit
- transition duration metadata

CSS-style kebab names and LSX-style underscore names both lower to the same properties.

## LazyUI shader

`Renderer.lsx` uses dedicated OpenGL shaders under `bindings/UI/shaders/`. The main shader performs analytical rounded rectangle coverage and supports:

- independent corner radii
- filled panels and controls
- independent per-side border widths and colors
- outer shadows with offset, spread, and softness
- outlines
- linear and radial backgrounds
- opacity and tint
- circle, ellipse, and line primitives
- clip rectangles

Boxes, circles, ellipses, lines, SDF glyphs, and images all use a shader-generated four-corner quad. Their rectangles, UVs, colors, clip rectangles, borders, gradients, shadows, and shape parameters are stored in ordinary flat LSX tables and selected with `gl_InstanceID`. Boxes and text therefore render in one instanced draw each. Consecutive images using the same texture are collapsed into an instanced batch while preserving painter order. Free-form triangles, polygons, polylines, and paths use one compact solid-geometry batch. GPU buffers grow geometrically and update with `glBufferSubData`, so stable UI sizes do not cause a buffer allocation every frame. Transparent retained elements remain in the instance tables; opacity changes never delete them from the renderer.

## Declarative canvas

Canvas content uses LSHTML elements, not user-written drawing commands. The canvas is a retained container and each child is a normal lightweight LazyUI shape object:

```lsx
lshtml preview(props) = {(
    <canvas id="preview">
        <rect class="canvas-card" x="24" y="24" width="600" height="330" />
        <circle class="blue-orb" cx="170" cy="160" r="62" />
        <ellipse class="purple-orb" cx="360" cy="160" rx="100" ry="62" />
        <line class="guide" x1="50" y1="260" x2="540" y2="260" />
        <triangle class="warning" x1="90" y1="285" x2="270" y2="225" x3="470" y3="300" />
        <polygon class="green-shape" points="90,285 270,225 470,300" />
        <polyline class="graph-line" points="20,180 100,90 180,150 260,40" />
        <path class="path-shape" d="M 20 20 L 160 20 L 90 120 Z" />
        <canvas-text class="canvas-title" x="55" y="70">LazyUI canvas</canvas-text>
        <canvas-image class="preview-image" x="480" y="40" width="96" height="96" texture={props.icon} />
    </canvas>
)}
```

All visual appearance comes from LSCSS:

```lsx
lscss .canvas-card = {
    background = "linear-gradient(135deg, #26344c, #151e2e)"
    border = "3px solid #6f94dc"
    border_radius = "18px"
    box_shadow = "0 10px 28px 0 rgba(0,0,0,0.35)"
}

lscss .blue-orb = {
    background = {props.accent}
    border = "2px solid #8fb0ff"
}

lscss .guide, .graph-line = {
    stroke = "#8fb0ff"
    stroke_width = "3px"
}
```

Supported declarative canvas elements are `rect`, `circle`, `ellipse`, `line`, `triangle`, `polygon`, `polyline`, `path`, `canvas-text`, and `canvas-image`. Coordinates are local to the canvas. Shapes support IDs, classes, CSS states, opacity, transforms, clipping, borders/strokes, shadows, and CSS backgrounds. Rectangle, circle, and ellipse shapes use the same analytical LazyUI shader as normal panels, including rounded corners and linear/radial gradients.

The older retained `CanvasContext` implementation remains inside the runtime as a low-level compatibility backend, but normal LSX UI code does not need to call it.

## Files

- `LazyUI.lsx`: elements, styles, document/input state, layout, canvas
- `Renderer.lsx`: retained batching and OpenGL submission
- `ShaderSources.lsx`: embedded generated shader text
- `shaders/lazyui.*`: panel/control shader
- `shaders/lazyui_text.*`: text shader
- `shaders/lazyui_image.*`: image shader
- `shaders/lazyui_solid.*`: canvas solid geometry shader

See `Projects/28_lazyui_inline` for a complete GLFW/OpenGL example.
