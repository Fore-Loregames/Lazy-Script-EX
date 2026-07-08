# LazyUI, LSHTML, and LSCSS

LazyUI is the retained native user-interface library included with LazyScriptEX. UI structure and styling are declared directly inside `.lsx` files with `lshtml` and `lscss`.

LazyUI does not embed a browser, JavaScript runtime, DOM, virtual DOM, or managed UI framework. The compiler lowers LSHTML and LSCSS into ordinary LSX functions, objects, style calls, events, and renderer data.

## Minimal component

```lsx
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI

const WelcomeProps = {
    title = "Welcome"
    message = "Native UI written in LSX."
}

lscss .welcome-card = {
    width = "420px"
    padding = "24px"
    gap = "12px"
    background = "#111a29"
    border = "1px solid #2d4668"
    border_radius = "12px"
}

lscss .primary-button = {
    padding = "10px 16px"
    background = "#3478f6"
    border_radius = "8px"
}

lshtml welcome_view(props) = {(
    <panel class="welcome-card">
        <h1>{props.title}</h1>
        <paragraph>{props.message}</paragraph>
        <button class="primary-button" onclick={continue_clicked} context={props}>
            Continue
        </button>
    </panel>
)}

fn continue_clicked(element, event, props)
    props.message = "The button was pressed."
    return 0
end
```

This declares a reusable component. A complete application must still create a native window, create a `UI.document`, connect input, initialize the LazyUI renderer, run the frame loop, and destroy owned resources. The offline API contains complete runnable files for each lesson rather than setup placeholders.

## How retained UI works

The component function creates the UI tree once. Later code updates the same objects and fields. The tree is not reparsed every frame and there is no virtual-DOM diff pass.

The document handles:

- layout;
- hit testing;
- focus;
- pointer events;
- keyboard and text input;
- editable controls;
- scrolling;
- clipping;
- retained state;
- rendering data collection.

The renderer submits retained boxes, text, images, and canvas geometry through OpenGL.

## Structural elements

Common structural tags include:

```text
ui
root
panel
section
row
column
stack
grid
split
scroll
viewport
overlay
modal
window
```

Kebab-case tags map to underscore LSX functions. For example, `<status-bar>` maps to `UI.status_bar()`.

## Text and media

```text
label
span
paragraph
h1
h2
h3
h4
h5
h6
text-node
icon
image
badge
tooltip
toast
```

Example:

```lsx
<panel>
    <h2>Character</h2>
    <paragraph>{props.description}</paragraph>
    <image src={props.portrait} />
</panel>
```

## Inputs and controls

```text
button
input
textarea
number
search
password
checkbox
radio
toggle
switch
range
slider
select
combobox
color
file
date
time
keybind
```

Editable controls support focus, caret movement, selection, clipboard actions, keyboard navigation, input events, and change events.

Example:

```lsx
<column class="form">
    <label>Name</label>
    <input value={props.name} placeholder="Enter a name" oninput={name_changed} context={props} />

    <label>Volume</label>
    <range min="0" max="100" step="1" value={props.volume} onchange={volume_changed} context={props} />

    <checkbox checked={props.fullscreen} onchange={fullscreen_changed} context={props}>
        Fullscreen
    </checkbox>
</column>
```

## IDs, classes, and expressions

Static values:

```lsx
<panel id="inspector" class="panel inspector" />
```

Dynamic values:

```lsx
<panel id={props.id} class={props.class_name} />
<label>{selected.name}</label>
<input value={selected.name} />
```

LSX expressions can be used in text, attributes, and supported LSCSS properties.

## Reusable components

```lsx
const PropertyProps = {
    name = "Property"
    value = ""
}

lshtml property_row(props) = {(
    <row class="property-row">
        <label>{props.name}</label>
        <input value={props.value} />
    </row>
)}
```

A custom tag or explicit component element can call a normal LSX component function.

## Events

Supported event categories include:

- click;
- input and change;
- focus and blur;
- key down and key up;
- pointer down, move, and up;
- scrolling.

```lsx
<button
    onclick={save_clicked}
    onpointerdown={begin_drag}
    onpointermove={drag_item}
    onpointerup={end_drag}
    context={props}>
    Save
</button>
```

Handlers use ordinary LSX functions:

```lsx
fn save_clicked(element, event, props)
    props.status = "Saved"
    return 0
end
```

Handlers may be declared later in the file.

## LSCSS

LSCSS styles are declared inside `.lsx` files:

```lsx
lscss .card = {
    width = "360px"
    padding = "16px"
    gap = "8px"
    background = "#151d2a"
    border = "1px solid #2b3e5a"
    border_radius = "10px"
    box_shadow = "0 8px 24px 0 #00000066"
}
```

Supported styling areas include:

- width, height, minimum size, and maximum size;
- margin, padding, and gap;
- border and independent corner radii;
- background colors and gradients;
- opacity;
- shadows and outlines;
- text size, alignment, and wrapping;
- flex and grid layout;
- absolute positioning and insets;
- clipping and overflow;
- transforms;
- images, tint, and fit modes;
- hover, focus, and active states.

## Selectors

```lsx
lscss panel = {
    gap = "8px"
}

lscss .property-row = {
    height = "32px"
}

lscss #save = {
    background = "#3478f6"
}

lscss .inspector > .property-row = {
    padding = "4px 8px"
}
```

Class, ID, element, combined, descendant, child, comma-separated, and state selectors are supported.

## States

```lsx
lscss .primary = {
    background = "#3478f6"

    hover = {
        background = "#4f8bff"
    }

    active = {
        translate_y = "1px"
    }
}

lscss #name:focus = {
    outline = "2px solid #9bb8ff"
}
```

## LSX values inside LSCSS

```lsx
const PanelProps = {
    width = 360.0
    accent = 0
}

lscss .dynamic-panel = {
    width = {props.width}
    background = {props.accent}
}
```

The expression is evaluated from the component scope and connected to the retained style value.

## Scrolling

A scrollable container needs a constrained size and overflow enabled:

```lsx
lscss .inventory-list = {
    height = "280px"
    overflow_y = "auto"
    gap = "6px"
}

lscss .inventory-row = {
    height = "44px"
    flex_shrink = 0
}

lshtml inventory_view(props) = {(
    <panel class="inventory-list">
        <row class="inventory-row"><label>Sword</label></row>
        <row class="inventory-row"><label>Shield</label></row>
        <row class="inventory-row"><label>Potion</label></row>
    </panel>
)}
```

Important points:

- The scrolling container must have a fixed or otherwise constrained height.
- Use `overflow_y = "auto"` to show a scrollbar only when needed.
- Use `overflow_y = "scroll"` to keep the scrollbar visible.
- Child rows should usually use `flex_shrink = 0` so they remain taller than the viewport.
- Window input must be connected so mouse-wheel events reach the document.

The document provides mouse-wheel, Page Up, Page Down, track clicking, and draggable scrollbar thumbs.

## Scrollbar styling

Scrollbar tracks and thumbs can be styled through the documented scrollbar properties in the offline API. Keep the container’s overflow enabled; a decorative bar drawn with canvas elements does not control document scrolling.

## Images

```lsx
<image src={props.texture_path} class="preview-image" />
```

```lsx
lscss .preview-image = {
    width = "200px"
    object_fit = "contain"
}
```

Setting only one image dimension can preserve its source aspect ratio when the other dimension remains automatic.

## Canvas

The retained canvas supports declarative shapes:

```lsx
<canvas class="preview-canvas">
    <rect class="preview-card" x="24" y="24" width="300" height="180" />
    <circle class="preview-orb" cx="420" cy="114" r="62" />
    <canvas-text class="preview-title" x="48" y="70">LazyUI canvas</canvas-text>
</canvas>
```

Appearance remains in LSCSS:

```lsx
lscss .preview-card = {
    background = "linear-gradient(135deg, #26344c, #151e2e)"
    border = "3px solid #6f94dc"
    border_radius = "18px"
}
```

Normal UI code does not need pointer-facing drawing commands.

## Data and tool layouts

Additional elements include lists, trees, tables, data grids, pagination, tabs, foldouts, dock panels, toolbars, menus, inspectors, property rows, content browsers, scene views, timelines, profilers, code editors, node editors, material editors, and HUD controls.

These tags provide semantic element names and retained state. Their behavior still depends on the events, data, and application logic connected by the LSX program.

## Document and input setup

The normal application flow is:

```lsx
local root = welcome_view(props)
local document = UI.document(root)
local window_input = UI.connect_window_input(window, document)
```

During the frame loop, update pointer position and button transitions, run layout, then render the document. The complete setup depends on the bundled renderer and window bindings, so use a full example rather than copying only these three lines.

Complete programs are available in:

- `Projects/28_lazyui_inline`
- `Projects/29_lazyui_controls_gallery`
- `Projects/30_lazyui_editor_workspace`
- `Projects/32_lazyui_runtime_hud`

The offline API also includes complete runnable files for welcome panels, forms, tabs, scrolling lists, and HUD layouts.

## Ownership and cleanup

Destroy owned resources in reverse setup order. A complete application normally destroys:

- renderer resources;
- connected window input;
- the UI document;
- props and other owned LSX objects;
- the native window and GLFW state.

Use the complete examples for exact cleanup calls.
