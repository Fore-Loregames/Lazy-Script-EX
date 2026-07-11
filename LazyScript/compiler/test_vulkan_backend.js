'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { compileLsslSource } = require('./lssl');

const lazy = path.resolve(__dirname, '..');
const root = path.resolve(lazy, '..');
const compiler = path.join(__dirname, 'lazyscriptex.js');
const dllPath = path.join(lazy, 'native', 'LSXVulkan.dll');
const nativePath = path.join(lazy, 'native', 'lsx_vulkan.c');
const rawPath = path.join(lazy, 'bindings', 'Vulkan', 'VulkanRaw.lsx');
const wrapperPath = path.join(lazy, 'bindings', 'Vulkan', 'Vulkan.lsx');
const lsgPath = path.join(lazy, 'LSG.lsx');
const lsslRuntimePath = path.join(lazy, 'LSSL.lsx');
const lsslCompilerPath = path.join(__dirname, 'lssl.js');
const vulkanHeaderPath = path.join(lazy, 'native', 'vulkan', 'vulkan_min.h');
const lazyUiBatchShaderPath = path.join(lazy, 'bindings', 'UI', 'shaders', 'batch.lssl');
const lazyUiVectorFastShaderPath = path.join(lazy, 'bindings', 'UI', 'shaders', 'vector_fast.lssl');
const lazyUiVectorEffectShaderPath = path.join(lazy, 'bindings', 'UI', 'shaders', 'vector_effect.lssl');
const lazyUiRendererPath = path.join(lazy, 'bindings', 'UI', 'Renderer.lsx');

for (const file of [dllPath, nativePath, rawPath, wrapperPath, lsgPath, lsslRuntimePath, vulkanHeaderPath, lazyUiBatchShaderPath, lazyUiVectorFastShaderPath, lazyUiVectorEffectShaderPath, lazyUiRendererPath]) {
  assert(fs.existsSync(file), `Vulkan backend file missing: ${file}`);
}
const dll = fs.readFileSync(dllPath);

const nativeSource = fs.readFileSync(nativePath, 'utf8');
const lsslCompilerSource = fs.readFileSync(lsslCompilerPath, 'utf8');
const lsslRuntimeSource = fs.readFileSync(lsslRuntimePath, 'utf8');
const vulkanHeaderSource = fs.readFileSync(vulkanHeaderPath, 'utf8');
const lazyUiBatchShaderSource = fs.readFileSync(lazyUiBatchShaderPath, 'utf8');
const lazyUiVectorFastShaderSource = fs.readFileSync(lazyUiVectorFastShaderPath, 'utf8');
const lazyUiVectorEffectShaderSource = fs.readFileSync(lazyUiVectorEffectShaderPath, 'utf8');
const lazyUiRendererSourceForClip = fs.readFileSync(lazyUiRendererPath, 'utf8');
assert(nativeSource.includes('viewport.y=(float)height;viewport.width=(float)width;viewport.height=-(float)height'), 'Vulkan negative-height viewport orientation fix missing');
assert(lsslCompilerSource.includes('gl_Position.z = (gl_Position.z + gl_Position.w) * 0.5;'), 'OpenGL-to-Vulkan clip depth conversion missing');
assert(lsslCompilerSource.includes('vec2 size=max(lsxViewport,vec2(1.0));'), 'ray scenes still use a hard-coded render size');
assert(lsslRuntimeSource.includes('self.auto_viewport then self.vector2("lsxViewport",LSG.frame_width(),LSG.frame_height())'), 'automatic ray viewport update missing');
assert(nativeSource.includes('VkDescriptorSet uniform_descriptor_sets[2];'), 'Vulkan dynamic uniform descriptor sets are missing');
assert(nativeSource.includes('VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC'), 'Vulkan automatic uniforms do not use dynamic offsets');
assert(nativeSource.includes('VkBuffer uniform_buffers[2]'), 'Vulkan per-frame uniform snapshot buffers are missing');
assert(nativeSource.includes('void* uniform_mapped[2]'), 'Vulkan per-frame uniform buffers are not persistently mapped');
assert(nativeSource.includes('c->uniform_mapped[uniform_frame]'), 'Vulkan uniform mapping is not retained for the life of the buffer');
assert(nativeSource.includes('uint32_t uniform_cursor[2]'), 'Vulkan per-frame uniform ring cursor is missing');
assert(nativeSource.includes('c->uniform_last_version[frame]==c->uniform_version'), 'Vulkan does not reuse unchanged automatic uniforms');
assert(nativeSource.includes('dynamic_offset=(uint32_t)(c->uniform_stride*uniform_slot)'), 'Vulkan does not bind per-draw dynamic uniform offsets');
assert(nativeSource.includes('uniform_copy_bytes') && nativeSource.includes('ls_copy_bytes(target,c->uniform_shadow,c->uniform_copy_bytes)'), 'Vulkan still copies the entire 1024-byte uniform block for every draw');
assert(nativeSource.includes('recording_uniform_offset'), 'Vulkan command-state cache does not track dynamic uniform offsets');
assert(!nativeSource.includes('uniform_hashes[2][LSVK_DRAW_UNIFORM_LIMIT]'), 'Vulkan still performs an O(n) uniform snapshot scan');
assert(nativeSource.includes('#define LSVK_DRAW_UNIFORM_LIMIT 4096'), 'Vulkan uniform snapshot capacity is too small for retained LazyUI stress scenes');
assert(nativeSource.includes('#define LSVK_RESOURCE_SET_LIMIT 512'), 'Vulkan resource descriptor cache capacity is missing');
assert(nativeSource.includes('VkDescriptorSet resource_descriptor_sets[2][LSVK_RESOURCE_SET_LIMIT]'), 'Vulkan resource descriptor cache is missing');
assert(nativeSource.includes('resource_texture_keys[2][LSVK_RESOURCE_SET_LIMIT][8]'), 'Vulkan texture resource keys are missing');
assert(nativeSource.includes('resource_storage_keys[2][LSVK_RESOURCE_SET_LIMIT][8]'), 'Vulkan storage resource keys are missing');
assert(nativeSource.includes('resource_hashes[2][LSVK_RESOURCE_SET_LIMIT]'), 'Vulkan resource binding hash acceleration is missing');
assert(nativeSource.includes('resource_hash_slots[2][LSVK_RESOURCE_HASH_TABLE_SIZE]'), 'Vulkan resource binding cache is not using an open-addressed lookup table');
assert(nativeSource.includes('resource_cached_version[2]') && nativeSource.includes('resource_cached_set[2]'), 'Vulkan resource fast cache is missing');
assert(!nativeSource.includes('c->resource_descriptor_count[f]=0;c->uniform_draw_count[f]=0'), 'Vulkan still destroys descriptor/uniform reuse every frame');
assert(nativeSource.includes('VkBuffer buffers[2]') && nativeSource.includes('void* mapped[2]'), 'Vulkan retained storage is not double-buffered and persistently mapped');
assert(nativeSource.includes('ls_copy_bytes(storage->mapped[frame],data'), 'Vulkan retained storage still maps and unmaps on every update');
assert(nativeSource.includes('recording_pipeline') && nativeSource.includes('recording_resource_set') && nativeSource.includes('recording_uniform_set') && nativeSource.includes('recording_uniform_offset'), 'Vulkan command-state cache is missing');
assert(nativeSource.includes('if(!resource_changed&&!uniform_changed)return 1'), 'Vulkan still rebinds identical descriptor sets for every run');
assert(nativeSource.includes('VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP'), 'Vulkan instanced quad strip topology is missing');
assert(nativeSource.includes('VkImage* depth_images;'), 'Vulkan swapchain images still share one depth target');
assert(nativeSource.includes('VkImageView views[2]={c->image_views[i],c->depth_views[i]}'), 'Vulkan framebuffers do not use per-image depth views');
assert(nativeSource.includes('VkFence* images_in_flight;'), 'Vulkan swapchain image fence ownership is missing');
assert(nativeSource.includes('c->images_in_flight[c->image_index]=c->in_flight[f]'), 'Vulkan acquired image is not assigned to its current frame fence');
assert(nativeSource.includes('LazyScriptEX-Vulkan.log'), 'Vulkan native flight recorder log is missing');
assert(nativeSource.includes('begin.image_fence_wait'), 'Vulkan image-fence trace stage is missing');
assert(nativeSource.includes('present.queue_present'), 'Vulkan present trace stage is missing');
assert(nativeSource.includes('vkGetPhysicalDeviceSurfacePresentModesKHR(c->physical_device,c->surface'), 'Vulkan swapchain does not query supported present modes');
assert(nativeSource.includes('if(has_immediate)return VK_PRESENT_MODE_IMMEDIATE_KHR'), 'Vulkan vsync-off path does not prefer immediate presentation');
assert(nativeSource.includes('if(has_mailbox)return VK_PRESENT_MODE_MAILBOX_KHR'), 'Vulkan vsync-off path has no mailbox fallback');
assert(nativeSource.includes('c->vsync_enabled=requested'), 'Vulkan runtime vsync request is not stored');
assert(nativeSource.includes('c->needs_resize=1'), 'Vulkan runtime vsync change does not request safe swapchain recreation');
assert(!nativeSource.includes('info.presentMode=VK_PRESENT_MODE_FIFO_KHR'), 'Vulkan swapchain is still hard-coded to FIFO vsync');
assert(vulkanHeaderSource.includes('#define VK_FORMAT_B8G8R8A8_UNORM (44)'), 'minimal Vulkan header is missing BGRA8 UNORM');
const bgraUnormPreference = nativeSource.indexOf('formats[i].format==VK_FORMAT_B8G8R8A8_UNORM');
const bgraSrgbFallback = nativeSource.indexOf('formats[i].format==VK_FORMAT_B8G8R8A8_SRGB');
assert(bgraUnormPreference >= 0 && bgraSrgbFallback > bgraUnormPreference, 'Vulkan swapchain does not prefer display-parity UNORM before the sRGB fallback');
assert(nativeSource.includes('format_count==1&&formats[0].format==VK_FORMAT_UNDEFINED'), 'Vulkan does not handle the choose-any surface format case');
assert(nativeSource.includes('swapchain.format.bgra8_unorm'), 'Vulkan swapchain format trace is missing');
assert(nativeSource.includes('c->trace_present_count>=3'), 'Vulkan native trace is not capped after the diagnostic startup frames');
assert(nativeSource.includes('c->trace_draw_count<=2||c->trace_draw_count%64U==0U'), 'Vulkan native trace still records every retained UI draw');
assert(!nativeSource.includes('lsx_trace_line(c,"draw.resources.begin")'), 'Vulkan still emits a trace marker for every draw resource bind');
assert(nativeSource.includes('LSRayBVHNodeCPU'), 'Vulkan shared ray scenes do not build a CPU BVH');
assert(nativeSource.includes('lsx_ray_build_bvh'), 'Vulkan shared ray-scene BVH builder is missing');
assert(nativeSource.includes('ray_triangle_scratch') && nativeSource.includes('ray_bvh_scratch'), 'Vulkan dynamic ray scenes do not retain acceleration scratch memory');
assert(nativeSource.includes('lsx_ray_refit_bvh'), 'Vulkan dynamic ray scenes rebuild instead of refitting the existing BVH');
assert(nativeSource.includes('ray_topology_dirty'), 'Vulkan ray scene does not distinguish topology changes from transform/material updates');
assert(nativeSource.includes('lsx_ray_refresh_lighting_header'), 'Vulkan ray-light edits still rebuild and refit every triangle');
assert(nativeSource.includes('VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU'), 'Vulkan adapter selection does not prefer the discrete GPU');
assert(nativeSource.includes('vkGetPhysicalDeviceProperties'), 'Vulkan adapter selection cannot inspect actual device properties');
assert(nativeSource.includes('VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT'), 'Vulkan frame command buffers are missing one-time-submit optimization');
assert(nativeSource.includes('void* vertex_mapped'), 'Vulkan dynamic meshes are not persistently mapped');
assert(nativeSource.includes('lsx_wait_mesh_write_safe'), 'Vulkan dynamic mesh updates still require a full-device idle');
assert(!/LSX_EXPORT int LSX_CALL _lsxVKUpdateMesh[\s\S]{0,500}vkDeviceWaitIdle/.test(nativeSource), 'Vulkan mesh updates still drain the entire device');
assert(nativeSource.includes('ray_scene_storage->mapped[frame]'), 'Vulkan ray-scene upload still maps memory every frame');
assert(lsslCompilerSource.includes('bool lsx_rt_occluded'), 'LSSL ray shadows do not use an early-out any-hit traversal');
assert(lsslCompilerSource.includes('int stack[64]'), 'LSSL ray tracing does not traverse the shared BVH');
assert(lsslCompilerSource.includes('float nearStack[64]'), 'LSSL closest-hit traversal does not prune queued nodes after finding a nearer hit');
assert(lsslCompilerSource.includes('float lsx_rt_aabb_near'), 'LSSL BVH traversal does not order children by ray-box distance');

const lazyUiBatch = compileLsslSource(lazyUiBatchShaderSource, lazyUiBatchShaderPath);
assert.strictEqual(lazyUiBatch.spirv.vertex[0], 0x07230203, 'LazyUI batch vertex SPIR-V magic missing');
assert.strictEqual(lazyUiBatch.spirv.fragment[0], 0x07230203, 'LazyUI batch fragment SPIR-V magic missing');
assert.match(lazyUiBatch.vulkanGenerated.vertex, /layout\(std430, set = 0, binding = 8\) buffer CommandDataBuffer/);
assert.match(lazyUiBatch.vulkanGenerated.vertex, /flat out vec4 payload13/);
const lazyUiVaryingComponents = [...lazyUiBatch.vulkanGenerated.vertex.matchAll(/layout\(location = \d+\) (?:flat )?out (float|int|uint|vec2|vec3|vec4) /g)]
  .reduce((total, match) => total + ({ float: 1, int: 1, uint: 1, vec2: 2, vec3: 3, vec4: 4 }[match[1]] || 0), 0);
assert.strictEqual(lazyUiVaryingComponents, 62, 'LazyUI flat payload changed unexpectedly');
assert(lazyUiVaryingComponents <= 64, 'LazyUI vertex outputs exceed Vulkan minimum guaranteed output components');
assert(!/\bbuffer\s+[A-Za-z_]/.test(lazyUiBatch.vulkanGenerated.fragment), 'LazyUI fragment stage still performs per-pixel storage-buffer reads');
assert.match(lazyUiBatch.vulkanGenerated.fragment, /flat in vec4 payload13/);
assert.match(lazyUiBatch.vulkanGenerated.fragment, /bodyCombinedAlpha/);
assert.match(lazyUiBatch.vulkanGenerated.fragment, /borderCombinedAlpha/);
assert.match(lazyUiBatch.vulkanGenerated.fragment, /shadowSafeHalf/);
assert.match(lazyUiBatch.vulkanGenerated.fragment, /else if \(textureSlot < 2\.5\)/);
assert.strictEqual((lazyUiBatch.vulkanGenerated.fragment.match(/texture\(/g) || []).length, 8, 'LazyUI batch shader should sample only its selected atlas/image path');
const lazyUiBatchFragmentSource = lazyUiBatchShaderSource.slice(lazyUiBatchShaderSource.indexOf('\nfragment\n'));
assert(!/^\s*storage\s+/m.test(lazyUiBatchFragmentSource), 'LazyUI batch fragment source unexpectedly regained storage declarations');

const lazyUiVectorFast = compileLsslSource(lazyUiVectorFastShaderSource, lazyUiVectorFastShaderPath);
const lazyUiVectorEffect = compileLsslSource(lazyUiVectorEffectShaderSource, lazyUiVectorEffectShaderPath);
assert.strictEqual(lazyUiVectorFast.spirv.vertex[0], 0x07230203, 'analytic fast vertex SPIR-V magic missing');
assert.strictEqual(lazyUiVectorFast.spirv.fragment[0], 0x07230203, 'analytic fast fragment SPIR-V magic missing');
assert.strictEqual(lazyUiVectorEffect.spirv.vertex[0], 0x07230203, 'analytic effect vertex SPIR-V magic missing');
assert.strictEqual(lazyUiVectorEffect.spirv.fragment[0], 0x07230203, 'analytic effect fragment SPIR-V magic missing');
assert.match(lazyUiVectorFast.vulkanGenerated.vertex, /layout\(std430, set = 0, binding = 8\) buffer CommandDataBuffer/);
assert(!/\bbuffer\s+[A-Za-z_]/.test(lazyUiVectorFast.vulkanGenerated.fragment), 'analytic fast fragment still performs per-pixel storage reads');
assert(!/\bbuffer\s+[A-Za-z_]/.test(lazyUiVectorEffect.vulkanGenerated.fragment), 'analytic effect fragment still performs per-pixel storage reads');
const lazyUiAnalyticComponents = [...lazyUiVectorFast.vulkanGenerated.vertex.matchAll(/layout\(location = \d+\) (?:flat )?out (float|int|uint|vec2|vec3|vec4) /g)]
  .reduce((total, match) => total + ({ float: 1, int: 1, uint: 1, vec2: 2, vec3: 3, vec4: 4 }[match[1]] || 0), 0);
assert.strictEqual(lazyUiAnalyticComponents, 48, 'analytic fast payload is no longer eleven flat vec4 values plus UV/pixel coordinates');
assert(lazyUiAnalyticComponents < lazyUiVaryingComponents, 'analytic fast path did not reduce varying/register pressure below the compatibility shader');
assert.strictEqual((lazyUiVectorFast.vulkanGenerated.fragment.match(/texture\(/g) || []).length, 8, 'analytic fast shader should expose one SDF atlas and seven image slots');
assert(lazyUiVectorFastShaderSource.includes('local command = commandData[instance.id]') && lazyUiVectorFastShaderSource.includes('local offset = item * 5') && lazyUiVectorFastShaderSource.includes('local offset = item * 4'), 'analytic fast shader is not using compact command headers with type-specific retained records');
assert(lazyUiVectorFastShaderSource.includes('clipRadius = clipRadii.y') && lazyUiVectorFastShaderSource.includes('clipRadius = clipRadii.z') && lazyUiVectorFastShaderSource.includes('clipRadius = clipRadii.w'), 'analytic clip shader does not evaluate all four corners');
assert(/fn submit_tree\(renderer:Renderer,element:UI\.Element,parentClipX:f32,parentClipY:f32,parentClipWidth:f32,parentClipHeight:f32\)/.test(lazyUiRendererSourceForClip), 'LazyUI tree still passes four rounded radii through every recursive call');
assert(!/fn submit_tree\([^\n]*parentClipTopLeft/.test(lazyUiRendererSourceForClip), 'LazyUI recursive signature still carries individual corner radii');
assert(lazyUiRendererSourceForClip.includes('set_active_clip_radii(renderer,childTopLeft,childTopRight,childBottomRight,childBottomLeft)'), 'LazyUI does not restore all four child clip radii before recursive submission');
assert(lazyUiRendererSourceForClip.includes('renderer.image_data.push(renderer.active_clip_top_left)') &&
       lazyUiRendererSourceForClip.includes('renderer.image_data.push(renderer.active_clip_top_right)') &&
       lazyUiRendererSourceForClip.includes('renderer.image_data.push(renderer.active_clip_bottom_right)') &&
       lazyUiRendererSourceForClip.includes('renderer.image_data.push(renderer.active_clip_bottom_left)'), 'LazyUI image records do not retain all four rounded clip corners');

for (const name of [
  '_lsxVKCreate', '_lsxVKReady', '_lsxVKBegin', '_lsxVKPresent', '_lsxVKDraw',
  '_lsxVKCreateMesh', '_lsxVKCreateIndexedMesh', '_lsxVKMeshReady', '_lsxVKUpdateMesh', '_lsxVKMeshError', '_lsxVKDrawMesh', '_lsxVKDestroyMesh',
  '_lsxVKCreateTexture', '_lsxVKTextureReady', '_lsxVKBindTexture', '_lsxVKDestroyTexture',
  '_lsxVKCreateFramebuffer', '_lsxVKFramebufferReady', '_lsxVKBeginFramebuffer', '_lsxVKFramebufferShow', '_lsxVKDestroyFramebuffer',
  '_lsxVKCreateStorage', '_lsxVKStorageReady', '_lsxVKBindStorage', '_lsxVKReadStorage', '_lsxVKDestroyStorage',
  '_lsxVKUniform1f', '_lsxVKUniform1i', '_lsxVKUniform2f', '_lsxVKUniform3f', '_lsxVKUniform4f', '_lsxVKUniformMat4',
  '_lsxVKCreateShader', '_lsxVKBindShader', '_lsxVKDestroyShader',
  '_lsxVKSetVsync', '_lsxVKVsyncEnabled', '_lsxVKPresentMode',
  '_lsxVKRayQuerySupported', '_lsxVKRayPipelineSupported', '_lsxVKEnableTrace', '_lsxVKTraceMarker', '_lsxVKDestroy',
]) {
  assert(dll.includes(Buffer.from(`${name}\0`, 'ascii')), `LSXVulkan.dll export missing: ${name}`);
}

const shader = compileLsslSource(`shader VulkanTest
vulkan
vertex
output color = Color3
main = fn()
    local position = Vector2(-0.5, 0.5)
    if vertex.id == 0 then
        position = Vector2(0.0, -0.5)
    end
    if vertex.id == 1 then
        position = Vector2(0.5, 0.5)
    end
    color = Color3(1.0, 0.3, 0.1)
    screen.position = Vector4(position, 0.0, 1.0)
end
end
fragment
input color = Color3
output finalColor = Color4
main = fn()
    finalColor = Color4(color, 1.0)
end
end
end`, 'VulkanTest.lssl');
assert.strictEqual(shader.spirv.vertex[0], 0x07230203, 'vertex SPIR-V magic missing');
assert.strictEqual(shader.spirv.fragment[0], 0x07230203, 'fragment SPIR-V magic missing');
assert(shader.lsxSource.includes('export fn create()'), 'generated LSSL module has no backend-neutral create function');
assert(shader.lsxSource.includes('memory.embed_binary('), 'generated SPIR-V binary embedding bridge missing');
assert(!shader.lsxSource.includes('vertex_words = {'), 'generated SPIR-V still expands into runtime table literals');
assert(shader.lsxSource.includes('vertex_layout'), 'generated Vulkan shader does not carry its vertex layout');
assert(!shader.lsxSource.includes('export const vertex_spirv'), 'SPIR-V should not be exposed as a public shader table');

for (const project of [
  '34_vulkan_window', '35_vulkan_triangle', '36_vulkan_animated_frame',
  '37_vulkan_raytraced_shadows', '38_vulkan_indexed_cube_depth',
  '39_vulkan_procedural_checkerboard', '40_vulkan_instanced_drawing',
  '41_vulkan_input_polling', '42_vulkan_window_icon', '43_vulkan_multiple_windows',
  '44_vulkan_raytraced_reflections', '45_vulkan_raytraced_gi', '46_vulkan_raytraced_ao',
  '47_vulkan_image_loading', '49_vulkan_full_game_loop', '50_vulkan_monitor_device',
  '51_vulkan_compute_storage', '52_vulkan_framebuffer_blit', '53_vulkan_glm_camera',
  '54_vulkan_sdf_text', '55_vulkan_shader_diagnostics', '56_vulkan_gamepad_polling',
  '57_vulkan_lazyui_inline', '58_vulkan_lazyui_controls_gallery',
  '59_vulkan_lazyui_editor_workspace', '60_vulkan_lazyui_node_graph',
  '61_vulkan_lazyui_runtime_hud', '62_vulkan_lazyui_text_image_clip',
  '63_vulkan_universal_modular_ray',
]) {
  const dir = path.join(root, 'Projects', project);
  const representativeChecks = new Set(['34_vulkan_window','35_vulkan_triangle','37_vulkan_raytraced_shadows','38_vulkan_indexed_cube_depth','39_vulkan_procedural_checkerboard','51_vulkan_compute_storage','52_vulkan_framebuffer_blit','53_vulkan_glm_camera','54_vulkan_sdf_text','63_vulkan_universal_modular_ray']);
  if (representativeChecks.has(project)) {
    const checked = cp.spawnSync(process.execPath, [compiler, 'check-project', dir], { encoding: 'utf8', timeout: 180000 });
    assert.strictEqual(checked.status, 0, checked.stdout + checked.stderr);
  }
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'lazyscriptex.json'), 'utf8'));
  const source = fs.readFileSync(path.join(dir, 'main.lsx'), 'utf8');
  assert(source.includes('LSG.use_vulkan()'), `${project} does not select the Vulkan backend through LSG`);
  if (!new Set(['34_vulkan_window','41_vulkan_input_polling','42_vulkan_window_icon','43_vulkan_multiple_windows','50_vulkan_monitor_device','55_vulkan_shader_diagnostics','56_vulkan_gamepad_polling','57_vulkan_lazyui_inline','58_vulkan_lazyui_controls_gallery','59_vulkan_lazyui_editor_workspace','60_vulkan_lazyui_node_graph','61_vulkan_lazyui_runtime_hud','62_vulkan_lazyui_text_image_clip']).has(project)) {
    assert(source.includes('.create()'), `${project} does not use the backend-neutral shader create API`);
  }
  const output = path.resolve(dir, config.output);
  if (fs.existsSync(output)) {
    assert(fs.existsSync(path.join(path.dirname(output), 'LSXVulkan.dll')), `${project} did not stage LSXVulkan.dll`);
    assert(!fs.existsSync(path.join(path.dirname(output), 'lssl')), `${project} exposed generated GLSL in a normal build`);
  }
}


assert(rawPath && fs.readFileSync(rawPath, 'utf8').includes('_lsxVKSetVsync'), 'Vulkan raw binding has no vsync setter');
assert(fs.readFileSync(wrapperPath, 'utf8').includes('export fn set_vsync(context,enabled)'), 'Vulkan wrapper has no vsync setter');
const lsgSource = fs.readFileSync(lsgPath, 'utf8');
const vsyncBody = lsgSource.slice(lsgSource.indexOf('    set_vsync = fn(value)'), lsgSource.indexOf('    -- Compatibility alias. New code should use set_vsync().'));
assert(vsyncBody.includes('Vulkan.set_vsync(self.graphics_context,value)'), 'Window.set_vsync still ignores Vulkan');
assert(!vsyncBody.includes('if self.graphics_backend == VULKAN then return end'), 'Window.set_vsync still early-returns for Vulkan');

const lazyUiSource = fs.readFileSync(path.join(lazy, 'bindings', 'UI', 'LazyUI.lsx'), 'utf8');
const lazyUiRendererSource = fs.readFileSync(path.join(lazy, 'bindings', 'UI', 'Renderer.lsx'), 'utf8');
assert(lazyUiSource.includes('texture:LSG.Texture = null'), 'LazyUI image commands are not backend-neutral LSG textures');
assert(lazyUiRendererSource.includes('_flush_vulkan'), 'LazyUI renderer has no Vulkan submission path');
assert(lazyUiRendererSource.includes('LSG.draw_vertices_from'), 'LazyUI Vulkan renderer does not preserve painter-order draw ranges');
assert(lazyUiRendererSource.includes('vulkan_box_storage.update'), 'LazyUI Vulkan renderer does not update retained storage through LSG');
assert(lazyUiRendererSource.includes('LSG.set_vulkan_trace(true)'), 'LazyUI diagnostics do not enable the native Vulkan flight recorder');
assert(lazyUiRendererSource.includes('lazyui.flush.complete'), 'LazyUI Vulkan flush trace completion marker is missing');
assert(lazyUiSource.includes('static const WindowInputRegistry'), 'LazyUI has no HWND-to-input registry for Vulkan windows');
assert(lazyUiSource.includes('find_window_input(window)'), 'LazyUI Vulkan window procedure does not resolve input from its HWND');
const wndProcBody = lazyUiSource.slice(lazyUiSource.indexOf('fn lazyui_window_proc'), lazyUiSource.indexOf('fn lazyui_key_callback'));
assert(!wndProcBody.includes('GLFW.glfwGetCurrentContext('), 'LazyUI window procedure still depends on an OpenGL current context');
assert(lazyUiRendererSource.includes('vulkan_upload_frames_remaining = 2'), 'LazyUI Vulkan retained data is not staged to both frame slots');
assert(lazyUiRendererSource.includes('_finish_diagnostics()'), 'LazyUI Vulkan diagnostics do not advance and stop after startup');
assert(!lazyUiRendererSource.includes('lazyui.run.begin'), 'LazyUI Vulkan still traces every individual paint run');
assert(lazyUiRendererSource.includes('build_vulkan_analytic_plan') && lazyUiRendererSource.includes('append_vulkan_command(renderer,currentPlan,batchKind,start + itemOffset,textureSlot)'), 'Vulkan LazyUI does not lower retained elements into compact analytic command headers');
assert(lazyUiRendererSource.includes('if kind == RENDER_RUN_VECTOR_EFFECT then') && lazyUiRendererSource.includes('add_vulkan_direct_plan(renderer,2,start,count)'), 'shadow/outline surfaces are not isolated from the fast analytic batch');
assert(lazyUiRendererSource.includes('renderer.vulkan_command_storage.bind()') && lazyUiRendererSource.includes('renderer.vulkan_vector_fast_shader.bind()'), 'compact analytic command storage is not bound to the fast shader');
for (const shaderName of ['box.lssl','text.lssl','image.lssl','solid.lssl','vector_fast.lssl','vector_effect.lssl'])
  assert(fs.existsSync(path.join(lazy, 'bindings', 'UI', 'shaders', shaderName)), `LazyUI Vulkan LSSL shader missing: ${shaderName}`);


const galleryDir = path.join(root, 'Projects', '48_vulkan_rt_gallery');
assert(fs.existsSync(path.join(galleryDir, 'lazyscriptex.json')), '48_vulkan_rt_gallery example missing');
for (const file of ['shadows.lssl','reflections.lssl','gi.lssl','ao.lssl']) {
  const shaderPath = path.join(galleryDir, 'shaders', file);
  assert(fs.existsSync(shaderPath), `RT gallery shader missing: ${file}`);
  assert(!/^\s*vertex\s*$/m.test(fs.readFileSync(shaderPath, 'utf8')), `RT gallery shader still duplicates a full-screen vertex stage: ${file}`);
}
for (const project of ['37_vulkan_raytraced_shadows','44_vulkan_raytraced_reflections','45_vulkan_raytraced_gi','46_vulkan_raytraced_ao']) {
  const shaderPath = path.join(root, 'Projects', project, 'shaders', 'scene.lssl');
  assert(!/^\s*vertex\s*$/m.test(fs.readFileSync(shaderPath, 'utf8')), `${project} still duplicates a full-screen vertex stage`);
}
const galleryMain = fs.readFileSync(path.join(galleryDir, 'main.lsx'), 'utf8');
assert(galleryMain.includes('shader.number("debugView"'), 'RT gallery does not switch final/debug output through one shader per scene');

const ray = compileLsslSource(`shader RayFriendly
vulkan
raytracing shadows
fragment
output finalColor = Color4
main = fn()
    finalColor = ray.render()
end
end
end`, 'RayFriendly.lssl');
assert(ray.lsxSource.includes('requires_ray_tracing = true'));
assert(ray.lsxSource.includes('ray_fullscreen_vertex = true'));
assert(ray.vulkanGenerated.vertex.includes('gl_VertexIndex'));
assert(ray.vulkanGenerated.fragment.includes('lsx_rt_render'));
assert(ray.vulkanGenerated.fragment.includes('uniform LSXAutomaticUniforms'));
assert(ray.vulkanGenerated.fragment.includes('lsxViewport'));
assert(ray.lsxSource.includes('shader.auto_viewport = true'));
assert.strictEqual(ray.spirv.fragment[0], 0x07230203);


console.log('Vulkan orientation, UNORM display parity, runtime present-mode switching, compact analytic LazyUI commands, storage-free fragment paths, four-corner rounded clipping, improved LSSL ray scenes, hidden pipelines, and Vulkan examples passed static validation.');
