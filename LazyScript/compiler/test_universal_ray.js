'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { compileLsslSource } = require('./lssl');

const source = `shader UniversalSurface
vulkan
raytracing all
vertex
    input position = Vector3
    input normal = Vector3
    output tint = Color3
    uniform model = Matrix4
    uniform view = Matrix4
    uniform projection = Matrix4
    main = fn()
        tint = position * 0.5 + 0.5
        screen.position = projection * view * model * Vector4(position,1.0)
    end
end
fragment
    input tint = Color3
    output finalColor = Color4
    main = fn()
        finalColor = Color4(tint,1.0)
    end
end
end`;

const result = compileLsslSource(source, 'UniversalSurface.lssl');
assert.strictEqual(result.shader.raySurface, true);
assert.strictEqual(result.shader.rayTracing.mask, 15);
assert.deepStrictEqual(result.shader.rayTracing.features, ['shadows', 'ao', 'gi', 'reflections']);
assert.match(result.vulkanGenerated.vertex, /out vec3 lsxRayWorldPosition/);
assert.match(result.vulkanGenerated.vertex, /lsxRayWorldPosition = \(model \* vec4\(position,1\.0\)\)\.xyz/);
assert.match(result.vulkanGenerated.fragment, /layout\(std430, set = 0, binding = 15\) buffer LsxRaySceneDataBuffer/);
assert.match(result.vulkanGenerated.fragment, /const int LSX_RT_MASK = 15/);
assert.match(result.vulkanGenerated.fragment, /finalColor = lsx_rt_apply\(finalColor, lsxRayWorldPosition, lsxRayWorldNormal\)/);
assert.match(result.lsxSource, /export const ray_tracing_mask = 15/);
assert.match(result.lsxSource, /export const ray_surface = true/);
assert.match(result.lsxSource, /LSSL\.create_graphics\([^\n]+,15,0\)/);
assert.match(result.lsxSource, /Shared ray tracing currently requires the Vulkan backend/);
assert.strictEqual(result.spirv.vertex[0], 0x07230203);
assert.strictEqual(result.spirv.fragment[0], 0x07230203);

const selected = compileLsslSource(source.replace('raytracing all', 'raytracing shadows ao'), 'SelectedFeatures.lssl');
assert.strictEqual(selected.shader.rayTracing.mask, 3);
assert.deepStrictEqual(selected.shader.rayTracing.features, ['shadows', 'ao']);


const normalOnly = compileLsslSource(source.replace('raytracing all\n', ''), 'NormalSurface.lssl');
assert.strictEqual(normalOnly.shader.rayTracing, null);
assert.strictEqual(normalOnly.shader.rayModelOffset, 0);
assert.match(normalOnly.lsxSource, /LSSL\.create_graphics\([^\n]+,0,0\)/);

assert.throws(
  () => compileLsslSource(`shader InvalidLegacy\nvulkan\nraytracing shadows ao\nfragment\noutput finalColor = Color4\nmain = fn()\nfinalColor = ray.color()\nend\nend\nend`, 'InvalidLegacy.lssl'),
  /multiple ray-tracing features require a normal geometry vertex\/fragment shader/,
);

assert.throws(
  () => compileLsslSource(source.replace('input position = Vector3\n    input normal = Vector3', 'input normal = Vector3\n    input position = Vector3'), 'PositionOrder.lssl'),
  /universal ray position must be the first vertex input/,
);

const manual = compileLsslSource(source.replace('finalColor = Color4(tint,1.0)', 'finalColor = ray.apply(Color4(tint,1.0))'), 'UniversalSurfaceManual.lssl');
const applyCount = (manual.vulkanGenerated.fragment.match(/lsx_rt_apply\(/g) || []).length;
// One function declaration and one explicit call. Automatic post-main application must be disabled.
assert.strictEqual(applyCount, 2);

const root = path.resolve(__dirname, '..');
const native = fs.readFileSync(path.join(root, 'native', 'lsx_vulkan.c'), 'utf8');
const lsg = fs.readFileSync(path.join(root, 'LSG.lsx'), 'utf8');
const raw = fs.readFileSync(path.join(root, 'bindings', 'Vulkan', 'VulkanRaw.lsx'), 'utf8');
assert.match(native, /LSVKStorage\* ray_scene_storage/);
assert.match(native, /lsx_ray_rebuild_cpu_scene/);
assert.match(native, /_lsxVKSetMeshRayTransform/);
assert.match(native, /_lsxVKSetMeshRayMaterial/);
assert.match(native, /_lsxVKSetRaySun/);
assert.match(native, /_lsxVKAddRayPointLight/);
assert.match(native, /lsx_set_bound_storage\(c,7,c->ray_scene_storage\)/);
assert.match(native, /Model transforms are captured for every graphics shader/);
assert.match(lsg, /set_ray_transform = fn\(matrix:GLM\.Mat4\)/);
assert.match(lsg, /set_ray_material = fn/);
assert.match(lsg, /export fn set_ray_sun/);
assert.match(lsg, /export fn add_ray_point_light/);
assert.match(lsg, /mode ~= TRIANGLES then result\.set_ray_visible\(false\)/);
assert.match(raw, /_lsxVKCreateShader\([^\n]+pipelineFlags:i32\) -> ptr/);
assert.match(raw, /_lsxVKCreateShaderEx\([^\n]+rayFlags:i32,modelOffset:i32\)/);
assert.match(raw, /_lsxVKCreateMeshEx\([^\n]+positionComponents:i32\)/);

const universalProject = path.join(root, '..', 'Projects', '63_vulkan_universal_modular_ray');
const universalMain = fs.readFileSync(path.join(universalProject, 'main.lsx'), 'utf8');
const universalMaterial = fs.readFileSync(path.join(universalProject, 'shaders', 'material.lssl'), 'utf8');
assert.match(universalMaterial, /raytracing all/);
assert.match(universalMaterial, /^vertex$/m);
assert.match(universalMaterial, /^fragment$/m);
assert(!universalMaterial.includes('ray.color'), 'universal custom material must not depend on the procedural ray scene API');
assert(!/intersect|raySphere|rayBox|rayPlane/.test(universalMaterial), 'universal custom material must not embed scene intersection functions');
for (const token of ['LSG.indexed_mesh', '.set_ray_transform(', '.set_ray_material(', 'LSG.set_ray_sun(', 'LSG.add_ray_point_light('])
  assert(universalMain.includes(token), `universal project is missing ${token}`);
assert(!universalMain.includes('LSG.set_vulkan_trace(true)'), 'universal example must not enable diagnostic tracing during normal performance runs');
assert.match(native, /lsx_ray_refit_bvh/);
assert.match(native, /ray_topology_dirty/);

console.log('Universal LSG geometry ray scene, multi-feature LSSL opt-in, automatic surface composition, transforms, materials, lights, and Vulkan bindings passed.');
