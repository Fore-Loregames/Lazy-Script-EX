'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const { compileInlineUiSource, scanDeclarations, TAG_FUNCTIONS, LSHTML_EVENT_HELPERS, LSHTML_ATTRIBUTES, LSCSS_PROPERTIES, LSCSS_STATE_SELECTORS, LSCSS_SELECTOR_FORMS } = require('./inline_ui');

const source = `
const Props = {
    title = "Inspector"
    status = "Ready"
    width = 320.0
    accent = 4294922308
}

lscss .inspector > #save, status-bar = {
    display = flex
    box_sizing = border-box
    width = {props.width}
    padding = 12px
    background = linear-gradient(90deg,#181b22,#283149)
    border = 1px solid #40506a
    border_radius = 10px
    box_shadow = 0px 8px 24px 0px #00000066
    hover = {
        background = #33415f
    }
}

lscss .orb = {
    background = {props.accent}
}

lshtml inspector(props) = {(
    <panel id="inspector" class="panel inspector">
        <h2>{props.title}</h2>
        <button id="save" onclick={save_clicked} context={props}>Save</button>
        <input id="name" maxlength=64 value="Player" />
        <textarea id="notes" maxlength=128>line one
line two</textarea>
        <status-bar>{props.status}</status-bar>
        <canvas id="preview">
            <rect class="card" x=10 y=10 width=200 height=100 />
            <circle class="orb" cx=80 cy=60 r=24 />
            <polygon class="shape" points="10,90 100,25 190,90" />
            <canvas-text class="caption" x=20 y=35>{props.title}</canvas-text>
        </canvas>
    </panel>
)}

fn save_clicked(element,event,props)
    props.status = "Saved"
    return 0
end
`;

assert(!/\bmemory\./.test(source), 'front-facing LSX source exposed memory operations');
assert(!/\bfnptr\b/.test(source), 'front-facing LSX source exposed function pointers');
assert.strictEqual(scanDeclarations(source, 'inline-test.lsx').length, 3, 'expected two LSCSS and one LSHTML declaration');
assert(!source.includes('selector ='), 'front-facing LSCSS must place the selector after the lscss keyword');
assert(source.includes('lscss .orb = {'), 'class selector declaration syntax is missing');
assert(source.includes('lshtml inspector(props)'), 'dot parameter type syntax is missing');

const lowered = compileInlineUiSource(source, 'inline-test.lsx').source;
assert(lowered.includes('.panel()'), 'panel tag did not lower to an element function');
assert(lowered.includes('.button()'), 'button tag did not lower to an element function');
assert(lowered.includes('.status_bar()'), 'kebab-case status-bar did not lower to status_bar');
assert(lowered.includes('.canvas()'), 'canvas tag did not lower to the canvas element function');
assert(lowered.includes('.canvas_rect()'), 'declarative canvas rect did not lower');
assert(lowered.includes('.canvas_circle()'), 'declarative canvas circle did not lower');
assert(lowered.includes('.canvas_polygon()'), 'declarative canvas polygon did not lower');
assert(lowered.includes('.canvas_text()'), 'declarative canvas text did not lower');
assert(lowered.includes('.canvas_width = 200.0'), 'canvas geometry attributes did not lower');
assert(lowered.includes('.add_canvas_point(100,25)'), 'canvas point list did not lower');
assert(lowered.includes('css_width') && lowered.includes('props.width'), 'LSCSS {var} width did not lower in LSHTML scope');
assert(lowered.includes('css_background') && lowered.includes('props.accent'), 'LSCSS {var} color did not lower in LSHTML scope');
assert(lowered.includes('style.normal.width') && lowered.includes('style.normal.background'), 'dynamic LSCSS bindings were not marked for the future runner');
assert(lowered.includes('.set_id("save")'), 'ID attribute did not lower');
assert(lowered.includes('.set_class("panel inspector")'), 'class attribute did not lower');
assert(lowered.includes('STATE_HOVER'), 'hover state did not lower');
assert(lowered.includes('GRADIENT_LINEAR'), 'linear gradient did not lower');
assert(lowered.includes('css_box_sizing'), 'box sizing did not lower');
assert(lowered.includes('_bind_click'), 'normal object context did not lower to the hidden event/context bridge');
assert(lowered.includes('fn save_clicked'), 'handler declared after LSHTML was not preserved');
assert(lowered.includes('.text = props.title'), 'single dynamic text content was not collapsed into its styled parent element');
assert(lowered.includes('.text = "Save"'), 'single static text content was not collapsed into its styled parent element');
assert(lowered.includes('.max_length = 64'), 'input maxlength did not lower to the native control state');
assert(lowered.includes('.max_length = 128'), 'textarea maxlength did not lower to the native control state');
assert(lowered.includes('.set_value("Player")'), 'input value did not initialize through the real text buffer path');
assert(lowered.includes('.set_value("line one\\nline two")'), 'textarea authoring newlines were not preserved in its editable value');




const booleanStyleSource = `
lscss .mouse-through = {
    pointer_events = false
    visibility = false
}
lscss .mouse-through-css = {
    pointer_events = none
    visibility = hidden
}
lshtml boolean_styles = {(<panel><panel class="mouse-through" /><panel class="mouse-through-css" /></panel>)}
`;
const booleanStyleLowered = compileInlineUiSource(booleanStyleSource, 'boolean-styles.lsx').source;
const disabledPointerCalls = booleanStyleLowered.match(/css_pointer_events\([^\n]*,false\)/g) || [];
const hiddenVisibilityCalls = booleanStyleLowered.match(/css_visibility\([^\n]*,false\)/g) || [];
assert.strictEqual(disabledPointerCalls.length, 2, 'pointer_events=false/none must lower to false instead of intercepting pointer input');
assert.strictEqual(hiddenVisibilityCalls.length, 2, 'visibility=false/hidden must lower to false');
assert(!/css_pointer_events\([^\n]*,true\)/.test(booleanStyleLowered), 'disabled pointer-event styles were inverted to true');

const explicitImgCloseSource = `
lshtml image_close = {(<panel><img id="preview" src="checker.png" alt="checker"></img><span>after image</span></panel>)}
`;
const explicitImgCloseLowered = compileInlineUiSource(explicitImgCloseSource, 'image-close.lsx').source;
assert(explicitImgCloseLowered.includes('.image()'), 'explicitly closed img tag did not lower to the image element');
assert(explicitImgCloseLowered.includes('.set_source("checker.png")'), 'img src did not lower');
assert(explicitImgCloseLowered.includes('.text = "after image"'), 'closing a void img tag incorrectly popped its parent content');


const htmlEntitySource = `
lshtml html_entities = {(
    <panel title="A &amp; B">
        <span>Health &lt; 25 &amp;&amp; Mana &gt; 10</span>
        <span>&#65;&#x42;&quot;&apos;</span>
        <textarea>left &lt; right</textarea>
    </panel>
)}
`;
const htmlEntityLowered = compileInlineUiSource(htmlEntitySource, 'html-entities.lsx').source;
assert(htmlEntityLowered.includes('.text = "Health < 25 && Mana > 10"'), 'static LSHTML text did not decode named HTML entities');
assert(htmlEntityLowered.includes('.text = "AB\\\"\'"'), 'static LSHTML text did not decode numeric or quoted HTML entities');
assert(htmlEntityLowered.includes('.set_title("A & B")'), 'LSHTML string attributes did not decode HTML entities');
assert(htmlEntityLowered.includes('.set_value("left < right")'), 'textarea text did not decode HTML entities');
assert(!htmlEntityLowered.includes('&lt;') && !htmlEntityLowered.includes('&amp;'), 'encoded HTML entities leaked into generated LSX text');

const gridAliasSource = `
lscss .grid-alias = {
    display = grid
    grid_columns = 12
    grid_rows = 8
}
lshtml grid_alias = {(<grid class="grid-alias"><panel /><panel /></grid>)}
`;
const gridAliasLowered = compileInlineUiSource(gridAliasSource, 'grid-alias.lsx').source;
assert(gridAliasLowered.includes('css_grid_columns') && gridAliasLowered.includes(',12)'), 'grid_columns alias did not lower to a twelve-column grid');
assert(gridAliasLowered.includes('css_grid_rows') && gridAliasLowered.includes(',8)'), 'grid_rows alias did not lower to an eight-row grid');

const stateCascadeSource = `
lscss input = {
    focus = { border = 2px #ffffff }
}
lscss .grow = {
    width = 100%
    flex_grow = 1
    min_width = 0px
}
lshtml state_cascade = {(<input class="grow" />)}
`;
const stateCascadeLowered = compileInlineUiSource(stateCascadeSource, 'state-cascade.lsx').source;
function generatedStyleFunctionBefore(text, token) {
  const tokenAt = text.indexOf(token);
  if (tokenAt < 0) return null;
  const functionAt = text.lastIndexOf('fn __lsx_lscss_', tokenAt);
  if (functionAt < 0) return null;
  const match = text.slice(functionAt).match(/^fn (__lsx_lscss_[^(]+)/);
  return match ? match[1] : null;
}
const focusFunctionName = generatedStyleFunctionBefore(stateCascadeLowered, 'STATE_FOCUS');
const growFunctionName = generatedStyleFunctionBefore(stateCascadeLowered, 'css_flex_grow');
assert(focusFunctionName && growFunctionName, 'could not locate generated focus/base style functions');
const templateBody = stateCascadeLowered.slice(stateCascadeLowered.indexOf('fn state_cascade'));
assert(templateBody.indexOf(`${growFunctionName}(`) < templateBody.indexOf(`${focusFunctionName}(`), 'state styles are copied before the final base cascade and can shrink focused controls');

const dynamicTextAt = lowered.indexOf('.text = props.title');
const dynamicAttachAt = lowered.indexOf('.add(__ui_');
assert(dynamicTextAt >= 0 && dynamicAttachAt >= 0, 'dynamic text or parent attachment was not emitted');
assert(dynamicTextAt < lowered.indexOf('.add(__ui_', dynamicTextAt), 'collapsed dynamic text must be assigned before parent attachment');
assert(!lowered.includes('.inherit_style = true'), 'single-child text should not need a separate inherited-style node');

const compilerDir = __dirname;
const toolkit = path.resolve(compilerDir, '../..');
const project = path.resolve(compilerDir, '../../Projects/28_lazyui_inline/lazyscriptex.json');
const result = childProcess.spawnSync(process.execPath, [path.join(compilerDir, 'lazyscriptex.js'), 'check-project', project], {
  cwd: compilerDir,
  encoding: 'utf8',
});
if (result.status !== 0) process.stderr.write(result.stdout + result.stderr);
assert.strictEqual(result.status, 0, 'inline LazyUI example failed compiler validation');

// Compile every supported LSHTML tag and the complete LSCSS property surface in one generated audit project.
const inlineCompilerText = fs.readFileSync(path.join(compilerDir, 'inline_ui.js'), 'utf8');
const tagsMatch = inlineCompilerText.match(/const TAG_FUNCTIONS = new Set\(\[(.*?)\]\);/s);
assert(tagsMatch, 'could not locate the built-in LazyUI tag list');
const tags = [...tagsMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
assert(tags.length >= 250, 'the packaged LazyUI tag surface is unexpectedly small');
const tagMarkup = tags.filter(tag => tag !== 'root').map(tag => `        <${tag} />`).join('\n');
const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-ui-audit-'));
const auditSource = `
lscss #style-audit = {
    display = flex
    position = absolute
    box_sizing = border-box
    width = 80%
    height = 40vh
    min_width = 10px
    min_height = 10px
    max_width = 100vw
    max_height = 100vh
    left = 1px
    right = 2px
    top = 3px
    bottom = 4px
    margin = 1px 2px 3px 4px
    padding = 4px 3px 2px 1px
    gap = 6px
    row_gap = 7px
    column_gap = 8px
    flex_direction = row-reverse
    flex_wrap = wrap
    flex_grow = 1.0
    flex_shrink = 1.0
    flex_basis = 32px
    justify_content = space-between
    align_items = center
    align_self = stretch
    align_content = space-around
    order = 2
    grid_template_columns = repeat(3,1fr)
    grid_template_rows = repeat(2,1fr)
    background = linear-gradient(90deg,#102040,#305080)
    background_end = #5080a0
    background_gradient_mode = linear
    gradient_angle = 45deg
    color = #f0f4ff
    opacity = 0.9
    border = 2px solid #8090a0
    border_width = 1px 2px 3px 4px
    border_top_color = #ff0000
    border_right_color = #00ff00
    border_bottom_color = #0000ff
    border_left_color = #ffffff
    border_radius = 4px 6px 8px 10px
    box_shadow = 2px 4px 12px 1px #00000088
    outline = 1px solid #c0d0ff
    outline_offset = 2px
    font_size = 16px
    font_weight = 600
    line_height = 20px
    letter_spacing = 1px
    word_spacing = 2px
    text_align = center
    vertical_align = middle
    white_space = nowrap
    text_overflow = ellipsis
    overflow = auto
    overflow_x = hidden
    overflow_y = scroll
    z_index = 10
    cursor = pointer
    pointer_events = auto
    visibility = visible
    aspect_ratio = 1.777777
    translate_x = 2px
    translate_y = 3px
    scale_x = 1.1
    scale_y = 0.9
    rotate = 5deg
    transform_origin = 50% 50%
    object_fit = cover
    image_tint = #ffffffff
    transform = translate(1px,2px) scale(1.0) rotate(3deg)
    transition_duration = 0.2s
    hover = { background = #405070 }
    active = { translate_y = 1px }
    focus = { outline = 2px solid #ffffff }
    disabled = { opacity = 0.4 }
    checked = { background = #3a7f55 }
    selected = { background = #415f90 }
}

lshtml all_elements = {(
    <root id="style-audit">
${tagMarkup}
    </root>
)}

fn main()
    local view = all_elements()
    view.destroy()
    return 0
end
`;
fs.writeFileSync(path.join(auditDir, 'main.lsx'), auditSource);
fs.writeFileSync(path.join(auditDir, 'lazyscriptex.json'), JSON.stringify({
  name: 'lazyui-surface-audit',
  entry: 'main.lsx',
  output: 'build/lazyui-surface-audit.exe',
  optimization: 6,
  subsystem: 'console',
  moduleRoots: { LazyScript: path.join(toolkit, 'LazyScript') },
}, null, 2));
const audit = childProcess.spawnSync(process.execPath, [path.join(compilerDir, 'lazyscriptex.js'), 'check-project', path.join(auditDir, 'lazyscriptex.json')], {
  cwd: compilerDir,
  encoding: 'utf8',
});
if (audit.status !== 0) process.stderr.write(audit.stdout + audit.stderr);
assert.strictEqual(audit.status, 0, 'complete LazyUI tag/style surface audit failed compiler validation');

assert(TAG_FUNCTIONS.size >= 250, 'exported LSHTML tag metadata is incomplete');
assert(LSHTML_EVENT_HELPERS.size === 22, 'exported LSHTML event metadata is incomplete');
assert(LSHTML_ATTRIBUTES.length >= 70, 'exported LSHTML attribute metadata is incomplete');
assert(LSCSS_PROPERTIES.length >= 100, 'exported LSCSS property metadata is incomplete');
assert(LSCSS_STATE_SELECTORS.length >= 6 && LSCSS_SELECTOR_FORMS.length >= 6, 'exported LSCSS selector metadata is incomplete');

const selectorProject = path.join(toolkit, 'CompilerTests', 'ui-document-find', 'lazyscriptex.json');
const selectorCheck = childProcess.spawnSync(process.execPath, [path.join(compilerDir, 'lazyscriptex.js'), 'check-project', selectorProject], {
  cwd: compilerDir,
  encoding: 'utf8',
});
if (selectorCheck.status !== 0) process.stderr.write(selectorCheck.stdout + selectorCheck.stderr);
assert.strictEqual(selectorCheck.status, 0, 'Document.find/find_all and runtime event listener project failed compiler validation');

for (const relative of [
  'LazyScript/bindings/UI/LazyUI.lsx',
  'LazyScript/bindings/UI/Renderer.lsx',
  'Projects/28_lazyui_inline/main.lsx',
]) {
  const text = fs.readFileSync(path.join(toolkit, relative), 'utf8');
  assert(!/\btable\s*</.test(text), `${relative} exposed typed collection syntax`);
}

const rendererSource = fs.readFileSync(path.join(toolkit, 'LazyScript/bindings/UI/Renderer.lsx'), 'utf8');
assert(!rendererSource.includes('const BoxInstance'), 'renderer exposed typed box instance objects');
assert(!rendererSource.includes('const ImageDraw'), 'renderer exposed typed image draw records');
assert(rendererSource.includes('box_data = {}') && rendererSource.includes('box_geometry = {}'), 'box submission is not stored in ordinary flat LSX tables');
assert(!rendererSource.includes('box_indices') && !rendererSource.includes('box_index_buffer'), 'box renderer still depends on the broken numeric index-table path');
assert(rendererSource.includes('GL.glBindBuffer(GL.GL_SHADER_STORAGE_BUFFER,self.box_data_buffer)'), 'box instance table is not uploaded through the internal GPU buffer');
assert(rendererSource.includes('GL.glDrawArraysInstancedBaseInstance(GL.GL_TRIANGLE_STRIP,0,4,count,start)'), 'box renderer is not using base-instance four-corner painter runs');
assert(!rendererSource.includes('GL.glDrawElements('), 'box renderer still interprets ordinary numeric LSX values as native integer indices');
assert(rendererSource.includes('renderer.box_data.push(color_rg_pair(style.border_top_color))'), 'per-side border colors are not stored in the flat box data table');
assert(rendererSource.includes('box_geometry = {}') && rendererSource.includes('while geometryIndex < 14 do') && rendererSource.includes('fn submit_prepared_box(renderer:Renderer,style:UI.Style)'), 'box submission does not use the reusable flat geometry table');
assert(!rendererSource.includes('fn submit_style_box('), 'obsolete long mixed-argument box submission remains');
assert(rendererSource.includes('text_data = {}') && rendererSource.includes('text_glyph_count'), 'text glyph instances are not stored in a flat LSX table');
assert(!rendererSource.includes('Font.build_text_instances'), 'renderer still allocates a temporary text instance table for every label');
assert(rendererSource.includes('Font.append_text_instances') && rendererSource.includes('record_render_run(renderer,RENDER_RUN_TEXT') && rendererSource.includes('GL.glDrawArraysInstancedBaseInstance(GL.GL_TRIANGLE_STRIP,0,4,count,start)'), 'SDF text is not rendered as allocation-free painter-ordered instanced atlas quads');
assert(rendererSource.includes('image_textures = {}') && rendererSource.includes('image_data = {}') && rendererSource.includes('image_batch_counts = {}'), 'image instance batching is missing');
assert(rendererSource.includes('GL.glDrawArraysInstancedBaseInstance('), 'image batches are not drawing instanced quads with a base instance');
assert(rendererSource.includes('next_buffer_capacity') && rendererSource.includes('GL.glBufferSubData'), 'dynamic UI buffers still reallocate for every draw');
assert(!/style\.opacity\s*<=\s*0\.0/.test(rendererSource), 'transparent retained elements are still removed from box submission');
assert(rendererSource.includes('Every retained element gets geometry even when its current alpha is zero'), 'transparent-retention contract is undocumented');
assert(rendererSource.includes('enable_diagnostics = fn()') && rendererSource.includes('LazyUI frame summary'), 'staged LazyUI diagnostics are missing');
assert(rendererSource.includes('cache_valid:bool') && rendererSource.includes('gpu_upload_dirty:bool'), 'retained renderer cache state is missing');
assert(rendererSource.includes('if not rebuild then') && rendererSource.includes('self.cache_hits = self.cache_hits + 1'), 'unchanged retained frames still rebuild CPU instance tables');
assert(rendererSource.includes('if self.gpu_upload_dirty then') && rendererSource.includes('self.gpu_upload_dirty = false'), 'unchanged retained frames still re-upload GPU instance buffers');
assert(rendererSource.includes('local elementVisible =') && rendererSource.includes('renderer.culled_count = renderer.culled_count + 1'), 'viewport culling is missing from retained tree submission');
assert(rendererSource.includes('local visibleLeft = parentClipX') && rendererSource.includes('if element.x > visibleLeft then visibleLeft = element.x end'), 'viewport culling does not use O6-safe inline scalar bounds');
assert(!rendererSource.includes('local visibleLeft = maximum(parentClipX,element.x)') && !rendererSource.includes('local visibleRight = minimum(parentRight,element.x + element.width)'), 'viewport culling reintroduced helper-call float-bound corruption');
assert(rendererSource.includes('clear_visual_dirty_tree(root)'), 'renderer does not clear retained visual dirtiness after rebuilding its cache');
assert(!rendererSource.includes('local visible = color_alpha(style.background)'), 'renderer still uses compound CPU visibility rejection');
assert(rendererSource.includes('submit_control_visual') && rendererSource.includes('submit_input_text'), 'HTML-style control rendering is missing');
assert(rendererSource.includes('submit_select_popup') && rendererSource.includes('select_overlays.push(element)'), 'working dropdown popup overlay submission is missing');
assert(rendererSource.includes('render_run_types = {}') && rendererSource.includes('record_render_run') && rendererSource.includes('while runIndex < self.render_run_types.length() do'), 'DOM painter-order render runs are missing');
assert(rendererSource.includes('Popups are submitted after the regular tree'), 'dropdown popups are not appended after the normal retained tree');
assert(rendererSource.includes('if element.focused then') && rendererSource.includes('A focused empty field still owns a caret'), 'empty focused input fields do not render a caret');
assert(rendererSource.includes('submit_checkbox_visual') && rendererSource.includes('submit_radio_visual') && rendererSource.includes('submit_switch_visual'), 'checkbox/radio/toggle visuals are incomplete');
assert(rendererSource.includes('submit_range_visual') && rendererSource.includes('submit_color_visual'), 'range and color picker visuals are incomplete');
assert(rendererSource.includes('submit_scrollbars') && rendererSource.includes('UI.effective_scroll_max_y(element)'), 'visible panel/textarea scrollbar submission is missing');
assert(rendererSource.includes('element.password_display_value()'), 'password glyph masking is not wired into the text renderer');
assert(rendererSource.includes('fn submit_declarative_canvas'), 'declarative canvas renderer is missing');
assert(rendererSource.includes('CANVAS_SHAPE_RECT') && rendererSource.includes('CANVAS_SHAPE_ELLIPSE'), 'declarative canvas shape dispatch is incomplete');
const lazyUiRuntime = fs.readFileSync(path.join(toolkit, 'LazyScript/bindings/UI/LazyUI.lsx'), 'utf8');
assert(lazyUiRuntime.includes('mark_visual_dirty = fn()') && lazyUiRuntime.includes('mark_layout_dirty = fn()'), 'retained dirty propagation helpers are missing');
assert(lazyUiRuntime.includes('if self.pointer_valid and self.pointer_x == x and self.pointer_y == y') && lazyUiRuntime.includes('self.scroll_drag_target == null') && lazyUiRuntime.includes('not self.pointer_hit_dirty') && lazyUiRuntime.includes('not self.root.layout_dirty'), 'unchanged pointer positions ignore layout/scroll invalidation and can leave stale hover targets');
assert(lazyUiRuntime.includes('if x < element.x then return false end') && lazyUiRuntime.includes('if y > element.y + element.height then return false end'), 'hit testing does not use O6-safe sequential float comparisons');
assert(!lazyUiRuntime.includes('return x >= element.x and y >= element.y'), 'hit testing reintroduced a compound float comparison');
assert(lazyUiRuntime.includes('if childInside or (child.children.length() > 0 and childCanOverflow) then'), 'large retained hierarchy hit testing does not reject off-pointer leaf rows');
assert(lazyUiRuntime.includes('export const TextBuffer'), 'real editable UTF-8 input storage is missing');
assert(lazyUiRuntime.includes('password_display_value = fn()'), 'password fields do not mask their displayed value');
assert(lazyUiRuntime.includes('set_color = fn(value:u32)'), 'color controls do not expose a retained color value update');
assert(lazyUiRuntime.includes('effective_scroll_max_y') && lazyUiRuntime.includes('input_visual_line_count'), 'textarea scrolling is not based on its multiline text extent');
assert(lazyUiRuntime.includes('pointer_hit_dirty:bool = true') && lazyUiRuntime.includes('self._refresh_hover(true)') && lazyUiRuntime.includes('scrollable element owns its own scroll_x/scroll_y state'), 'multiple independent scroll panes are not routed from fresh pointer hit tests');
assert(lazyUiRuntime.includes('Win32.SetWindowLongPtrW') && lazyUiRuntime.includes('Win32.WM_MOUSEWHEEL'), 'native mouse-wheel routing to LazyUI scroll containers is missing');
assert(lazyUiRuntime.includes('connect_window_input'), 'window keyboard/character input bridge is missing');
assert(lazyUiRuntime.includes('select_popup_index_at') && lazyUiRuntime.includes('select_set_index'), 'select controls do not have real popup hit testing and selection state');
assert(lazyUiRuntime.includes('glfwGetWin32Window(window)') && lazyUiRuntime.includes('SetWindowLongPtrW(self.native_window'), 'mouse wheel bridge is not attached to the real native GLFW window');
assert(lazyUiRuntime.includes('shift_layout_subtree(layoutChild,absoluteTargetX-layoutChild.x,absoluteTargetY-layoutChild.y)'), 'absolute editor/HUD descendants are not moved with their positioned parent');
assert(lazyUiRuntime.includes('absoluteTargetX = element.content_x - absoluteScrollX') && lazyUiRuntime.includes('absoluteTargetY = element.content_y - absoluteScrollY'), 'absolute children do not follow independent parent scrolling');
assert(lazyUiRuntime.includes('scrollable_at(self.root,self.pointer_x,self.pointer_y)'), 'wheel routing does not resolve the scrollable pane under the pointer');
assert(lazyUiRuntime.includes('if self.active ~= null and self.active._on_pointer_move ~= null then moveTarget = self.active end'), 'pointer movement is not captured by the pressed element for continuous drags');
assert(lazyUiRuntime.includes('pointer_move_scaled = fn') && lazyUiRuntime.includes('x * self.width / window_width'), 'LazyUI does not convert GLFW window-space pointers into framebuffer-space coordinates');
assert(lazyUiRuntime.includes('set_texture = fn(texture_id:u32,intrinsic_width:f32,intrinsic_height:f32)') && lazyUiRuntime.includes('self.style.aspect_ratio = intrinsic_width / intrinsic_height'), 'image elements cannot preserve intrinsic aspect ratio from loaded texture dimensions');
const elementAddBody = lazyUiRuntime.match(/add = fn\(child:Element\)[\s\S]*?\n    end,/)?.[0] || '';
assert(elementAddBody.includes('self.children.push(child)') && !elementAddBody.includes('memory.release_object(child)')
  && elementAddBody.includes('return self.children.at(self.children.length()-1)'),
'Element.add must retain the original child pointer without releasing or copying the object');
assert(lazyUiRuntime.includes('Event targets are borrowed references') && lazyUiRuntime.includes('self.current_target = null'), 'UIEvent destruction can recursively free borrowed retained elements');
assert(lazyUiRuntime.includes('find = fn(selector:string) -> Element') && lazyUiRuntime.includes('find_all = fn(selector:string)'), 'Document.find/find_all selector APIs are missing');
assert(lazyUiRuntime.includes('add_event_listener = fn(type:string,handler) -> Element') && lazyUiRuntime.includes('add_event_listener_with_context = fn(type:string,handler,context_handle:u64) -> Element'), 'runtime element event listener APIs are missing');
assert(lazyUiRuntime.includes('dispatch_ui_event(self._on_click,self,event,self._event_context)') && lazyUiRuntime.includes('dispatch_ui_event(self._on_change,self,event,self._event_context)') && lazyUiRuntime.includes('dispatch_ui_event(self._on_input,self,event,self._event_context)'), 'programmatic element emitters do not dispatch runtime listeners');
assert(lazyUiRuntime.includes('Custom surfaces such as infinite node graphs can consume wheel input') && lazyUiRuntime.includes('dispatch_ui_event(customTarget._on_scroll'), 'custom infinite surfaces do not receive wheel input before native finite scrolling');
assert(lowered.includes('.mark_layout_dirty()'), 'lowered LSHTML text mutations do not propagate dirtiness to the retained root');
const lazyUiExample = fs.readFileSync(path.join(toolkit, 'Projects/28_lazyui_inline/main.lsx'), 'utf8');
assert(!/draw_preview\s*\(/.test(lazyUiExample), 'example still requires an imperative draw function');
assert(!/canvas_context|context\.(?:clear|set_fill|fill_|stroke_)/.test(lazyUiExample), 'example still exposes imperative CanvasContext commands');
assert(lazyUiExample.includes('<rect class="canvas-card"') && lazyUiExample.includes('<canvas-text'), 'example is missing declarative canvas elements');
assert(lazyUiExample.includes('width = {props.inspector_width}') && lazyUiExample.includes('background = {props.accent}'), 'example is missing LSCSS {var} expressions');
assert(lazyUiExample.includes('populate_hierarchy(root,500)') && lazyUiExample.includes('while index < count'), 'example is not creating the requested 500-row retained hierarchy stress list');
assert(lazyUiExample.includes('UI.counter_text("FPS: ",32)') && lazyUiExample.includes('fps_text.set_i64(frame_count)'), 'example is missing the persistent allocation-free FPS counter');
assert(lazyUiExample.includes('GLFW.glfwSwapInterval(0)'), 'stress example is still capped to display refresh');
assert(lazyUiExample.includes('id="stress-foldout"') && lazyUiExample.includes('toggle_hierarchy'), 'stress hierarchy is not contained in a working foldout');
assert(lazyUiExample.includes('row.text = hierarchy_label(index)') && lazyUiExample.includes('list.add(row)'), 'runtime hierarchy rows are not retaining text before attachment');
assert(lazyUiExample.includes('overflow_y = "auto"'), 'hierarchy stress list is missing its visible vertical scrollbar');
const controlsExamplePath = path.join(toolkit, 'Projects/29_lazyui_controls_gallery/main.lsx');
const controlsExample = fs.readFileSync(controlsExamplePath, 'utf8');
const controlsLowered = compileInlineUiSource(controlsExample, controlsExamplePath).source;
assert((controlsLowered.match(/css_pointer_events\([^\n]*,false\)/g) || []).length >= 8, 'color picker visual overlays still intercept the plane, hue, alpha, or image pointer targets');
assert(controlsLowered.includes('_bind_pointer_down') && controlsLowered.includes('color_plane_down') && controlsLowered.includes('hue_strip_down') && controlsLowered.includes('alpha_strip_down'), 'continuous color picker pointer handlers did not lower onto their interactive parent surfaces');
assert(controlsLowered.includes('color_picker()') && controlsLowered.includes('_bind_input') && controlsLowered.includes('hex_color_input'), 'editable hex color control did not lower through the text-input event path');
assert(controlsExample.includes('<textarea') && controlsExample.includes('<checkbox') && controlsExample.includes('<toggle checked'), 'controls gallery is missing textarea, checkbox, or toggle coverage');
assert(controlsExample.includes('<colorpicker') && controlsExample.includes('id="color-plane"') && controlsExample.includes('color_plane_down') && controlsExample.includes('hue_strip_down') && controlsExample.includes('alpha_strip_down') && controlsExample.includes('preset_clicked'), 'controls gallery is missing the continuous editor-style HSV color picker');
assert(controlsExample.includes('<range') && controlsExample.includes('<slider'), 'controls gallery is missing range/slider coverage');
assert(controlsExample.includes('UI.connect_window_input(window,document)'), 'controls gallery is not connected to real keyboard and wheel input');
assert(controlsExample.includes('<img id="image-demo"') && controlsExample.includes('</img>') && controlsExample.includes('Texture2D.load_ui("assets/checkerboard.png")'), 'controls gallery is missing the real explicitly closed img-element checkerboard test');
assert(controlsExample.includes('imageDemo.set_texture(checkerTexture.id,checkerTexture.width,checkerTexture.height)') && controlsExample.includes('width = "200px"'), 'img example does not preserve intrinsic aspect ratio from a width-only layout');
assert(controlsExample.includes('pointer_move_scaled(cursor.x,cursor.y,windowSize.width,windowSize.height)'), 'controls gallery still feeds unscaled GLFW cursor coordinates into framebuffer-space LazyUI');
assert(controlsExample.includes('color_channel_input') && controlsExample.includes('hex_color_input'), 'editor color picker channels and hex field are not wired back into HSV state');
assert(controlsExample.includes('maxlength=9') && controlsExample.includes('value="#BF9C9CFF"'), 'editable color picker does not expose a complete #RRGGBBAA text value');
assert(controlsExample.includes('verify_color_picker_interactions') && controlsExample.includes('document.input_text("#00FF00FF")'), 'color picker example lacks a startup interaction test through the real Document pointer/keyboard path');
assert(controlsExample.includes('hsv_to_color(120.0,100.0,100.0)') && controlsExample.includes('hsv_to_color(180.0,100.0,100.0)') && controlsExample.includes('hsv_to_color(240.0,100.0,100.0)'), 'color picker self-test does not cover the green, cyan, and blue HSV sectors');
assert(lazyUiRuntime.includes('if tag == hash("colorpicker") then return true end'), 'colorpicker is not handled by the native text editing path');
assert(rendererSource.includes('fn submit_color_visual') && rendererSource.includes('element.selection_start()') && rendererSource.includes('element.cursor_index'), 'colorpicker renderer is missing selection or caret rendering');
assert(controlsExample.includes('<option value="Low Quality"') && controlsExample.includes('<option value="Orthographic"'), 'controls gallery dropdowns do not contain selectable options');
assert(controlsExample.includes('min_height = "0px"'), 'controls gallery flex scroll panes can still expand instead of scrolling');
const editorExample = fs.readFileSync(path.join(toolkit, 'Projects/30_lazyui_editor_workspace/main.lsx'), 'utf8');
assert(editorExample.includes('class="axis-label">X</span><number') && editorExample.includes('class="axis-label">Y</span><number') && editorExample.includes('class="axis-label">Z</span><number'), 'editor example still uses a single comma-separated vector field');
assert(editorExample.includes('class="asset-picker"') && editorExample.includes('class="asset-subtitle"'), 'editor mesh/material assets still look like disabled text inputs');
assert(editorExample.includes('class="hierarchy"') && editorExample.includes('class="asset-scroll"') && editorExample.includes('class="console-list"') && editorExample.includes('class="inspector"'), 'editor example does not expose several independent scroll panes');
assert(!editorExample.includes('value="0.0, 35.0, 0.0"'), 'editor example retained the broken single-field vector input');
const nodeExamplePath = path.join(toolkit, 'Projects/31_lazyui_node_graph/main.lsx');
const nodeExample = fs.readFileSync(nodeExamplePath, 'utf8');
const nodeLowered = compileInlineUiSource(nodeExample, nodeExamplePath).source;
assert((nodeLowered.match(/css_pointer_events\([^\n]*,false\)/g) || []).length >= 2, 'graph canvas or minimap canvas still intercepts interaction from the graph/minimap surfaces');
assert(nodeLowered.includes('graph_pan_start') && nodeLowered.includes('node_drag_start') && nodeLowered.includes('port_drag_start') && nodeLowered.includes('minimap_pan_start'), 'node graph drag, pan, pin, or minimap callbacks did not lower');
assert(nodeExample.includes('<select value="Less Than"><option'), 'node graph condition dropdown has no real options');
assert(nodeExample.includes('onpointermove={node_drag_move}') && nodeExample.includes('onpointerdown={port_drag_start}') && nodeExample.includes('UI.hit_test(props.root,event.x,event.y)'), 'node graph is missing continuous node dragging or pin drag-and-drop connection logic');
assert(nodeExample.includes('props.drag_offset_x = event.x') && nodeExample.includes('props.drag_world_x = node.world_x') && nodeExample.includes('props.dragging_node.world_x = props.drag_world_x+deltaX/zoom') && /if absoluteX < [23]\.0 and absoluteY < [23]\.0 then return/.test(nodeExample), 'node dragging does not use a stable pointer-delta origin with click-jitter protection');
assert(nodeExample.includes('const GraphNode = {') && nodeExample.includes('element = null') && nodeExample.includes('mini = null') && nodeExample.includes('find_graph_node(props,nodeElement)') && !nodeExample.includes('element:UI.Element'), 'node graph retained-element fields are not using inference-only syntax');
assert(nodeExample.includes('pointer_move_scaled(cursor.x,cursor.y,windowSize.width,windowSize.height)') && nodeExample.includes('props.pointer_x = document.pointer_x'), 'node graph pointer and wire preview coordinates are not DPI-correct');
assert(nodeExample.includes('class="graph-shell"') && nodeExample.includes('id="minimap"') && nodeExample.includes('props.pan_x') && nodeExample.includes('event.prevent_default()'), 'node graph is missing floating minimap or unbounded custom panning');
assert(nodeExample.includes('onpointerdown={minimap_pan_start}') && (nodeExample.includes('minimap_pan_to_pointer') || nodeExample.includes('minimap_pan_to_xy')), 'floating graph minimap cannot recenter or drag the camera');
assert(nodeExample.includes('verify_graph_interactions') && /document\.scroll\(0\.0,[+-]?1\.0\)/.test(nodeExample) && nodeExample.includes('find_connection_to(props,input)'), 'node graph lacks a Document-path interaction test for drag, pan, wheel, minimap, and pin connections');
assert(nodeExample.includes('node.element = null') && nodeExample.includes('node.mini = null') && nodeExample.includes('connection.output = null') && nodeExample.includes('connection.input = null'), 'node graph helper records still destroy borrowed retained elements after typed-table insertion');
assert(nodeExample.includes('props.root = null') && nodeExample.includes('props.dragging_node = null') && nodeExample.includes('props.pending_output = null'), 'node graph cleanup does not clear borrowed tree aliases before GraphProps destruction');
assert(nodeExample.includes('pointer_events = false'), 'node graph visual overlays are not explicitly mouse-transparent');
for (const [folder, token] of [
  ['29_lazyui_controls_gallery', '<toggle checked'],
  ['30_lazyui_editor_workspace', '<propertyeditor class='],
  ['31_lazyui_node_graph', '<nodeeditor class='],
  ['32_lazyui_runtime_hud', '<hotbar class='],
]) {
  const example = fs.readFileSync(path.join(toolkit, 'Projects', folder, 'main.lsx'), 'utf8');
  assert(example.includes(token), `${folder} is missing its advanced LazyUI surface`);
  assert(example.includes('UIRenderer.create(null,64)'), `${folder} is not using the shared instanced LazyUI renderer`);
}
const shaderRoot = path.join(toolkit, 'LazyScript/bindings/UI/shaders');
const boxVertex = fs.readFileSync(path.join(shaderRoot, 'lazyui.vert'), 'utf8');
const boxFragment = fs.readFileSync(path.join(shaderRoot, 'lazyui.frag'), 'utf8');
assert(boxVertex.includes('layout(std430,binding=0) readonly buffer LazyUISurfaceBuffer'), 'vertex shader does not read the packed surface SSBO');
assert(boxVertex.includes('SurfaceData surface = surfaces[gl_BaseInstance + gl_InstanceID]'), 'vertex shader does not select the surface through base-instance-aware instancing');
assert(boxVertex.includes('int cornerIndex = gl_VertexID'), 'vertex shader does not use the four strip vertices directly');
assert(rendererSource.includes('GL.glDrawArraysInstancedBaseInstance(GL.GL_TRIANGLE_STRIP,0,4,count,start)'), 'box renderer does not use the instanced four-corner painter-run path');
assert(boxFragment.includes('unpackColorPairs'), 'fragment shader does not unpack float-safe border color pairs');
assert(boxFragment.includes('selectedBorderColor'), 'fragment shader does not select independent side colors');
assert(boxFragment.includes('innerMinimum') && boxFragment.includes('innerMaximum'), 'fragment shader does not compute asymmetric inner border bounds');
const textVertex = fs.readFileSync(path.join(shaderRoot, 'lazyui_text.vert'), 'utf8');
const imageVertex = fs.readFileSync(path.join(shaderRoot, 'lazyui_image.vert'), 'utf8');
assert(textVertex.includes('layout(std430,binding=0) readonly buffer LazyUITextBuffer') && textVertex.includes('glyphs[gl_BaseInstance + gl_InstanceID]'), 'text shader is not reading one glyph record per base-instance-aware glyph');
assert(imageVertex.includes('layout(std430,binding=0) readonly buffer LazyUIImageBuffer') && imageVertex.includes('gl_BaseInstance + gl_InstanceID'), 'image shader is not reading batched image instances');
const embedded = fs.readFileSync(path.join(toolkit, 'LazyScript/bindings/UI/ShaderSources.lsx'), 'utf8');
for (const [name, file] of [
  ['BOX_VERTEX', 'lazyui.vert'], ['BOX_FRAGMENT', 'lazyui.frag'],
  ['TEXT_VERTEX', 'lazyui_text.vert'], ['TEXT_FRAGMENT', 'lazyui_text.frag'],
  ['IMAGE_VERTEX', 'lazyui_image.vert'], ['IMAGE_FRAGMENT', 'lazyui_image.frag'],
  ['SOLID_VERTEX', 'lazyui_solid.vert'], ['SOLID_FRAGMENT', 'lazyui_solid.frag'],
]) {
  const shader = fs.readFileSync(path.join(shaderRoot, file), 'utf8');
  assert(embedded.includes(`export const ${name} = \`${shader}\``), `${file} is not synchronized into ShaderSources.lsx`);
}

console.log('Inline LSHTML/LSCSS, dynamic style bindings, declarative canvas elements, and LazyUI project checks passed.');
