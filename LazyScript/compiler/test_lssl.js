'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { compileLsslSource } = require('./lssl');

const source = `shader FriendlyLighting
vertex
input position = Vector3
input normal = Vector3
output worldNormal = Vector3
uniform model = Matrix4
uniform viewProjection = Matrix4
main = fn()
    local worldPosition = model * Vector4(position, 1.0)
    worldNormal = normalize(normal)
    screen.position = viewProjection * worldPosition
end
end
fragment
input worldNormal = Vector3
output finalColor = Color4
texture albedo
main = fn()
    local light = max(dot(normalize(worldNormal), Vector3(0.0, 1.0, 0.0)), 0.0)
    finalColor = Color4(Vector3(light), 1.0)
end
end
end`;

const compiled = compileLsslSource(source, 'FriendlyLighting.lssl');
assert(compiled.generated.vertex.startsWith('#version 460 core'));
assert(compiled.generated.fragment.startsWith('#version 460 core'));
assert.match(compiled.generated.vertex, /layout\(location = 0\) in vec3 position;/);
assert.match(compiled.generated.vertex, /layout\(location = 1\) in vec3 normal;/);
assert.match(compiled.generated.vertex, /layout\(location = 0\) out vec3 worldNormal;/);
assert.match(compiled.generated.fragment, /layout\(location = 0\) in vec3 worldNormal;/);
assert.match(compiled.generated.fragment, /layout\(location = 0\) out vec4 finalColor;/);
assert.match(compiled.generated.fragment, /layout\(binding = 0\) uniform sampler2D albedo;/);
assert(!/location = null|binding = null/.test(compiled.generated.vertex + compiled.generated.fragment));
assert.match(compiled.lsxSource, /export const vertex_layout = 51/);
assert.match(compiled.lsxSource, /export const vertex_components = 6/);
assert.match(compiled.lsxSource, /export const vertex_attributes = 2/);

const flatInterface = compileLsslSource(`shader FlatInterface
vulkan
vertex
flat output commandKind = Number
flat output payload = Vector4
output uv = Vector2
main = fn()
    commandKind = 2.0
    payload = Vector4(1.0, 2.0, 3.0, 4.0)
    uv = Vector2(0.25, 0.75)
    screen.position = Vector4(0.0, 0.0, 0.0, 1.0)
end
end
fragment
flat input commandKind = Number
flat input payload = Vector4
input uv = Vector2
output finalColor = Color4
main = fn()
    finalColor = Color4(payload.rgb * commandKind + Vector3(uv, 0.0) * 0.0, 1.0)
end
end
end`, 'FlatInterface.lssl');
assert.match(flatInterface.generated.vertex, /layout\(location = 0\) flat out float commandKind;/);
assert.match(flatInterface.generated.vertex, /layout\(location = 1\) flat out vec4 payload;/);
assert.match(flatInterface.generated.fragment, /layout\(location = 0\) flat in float commandKind;/);
assert.match(flatInterface.generated.fragment, /layout\(location = 1\) flat in vec4 payload;/);
assert.strictEqual(flatInterface.spirv.vertex[0], 0x07230203);
assert.strictEqual(flatInterface.spirv.fragment[0], 0x07230203);
assert.throws(() => compileLsslSource(`shader FlatMismatch
vertex
flat output value = Number
main = fn()
    value = 1.0
    screen.position = Vector4(0.0, 0.0, 0.0, 1.0)
end
end
fragment
input value = Number
output finalColor = Color4
main = fn()
    finalColor = Color4(value)
end
end
end`, 'FlatMismatch.lssl'), /same flat interpolation qualifier/);

const compute = compileLsslSource(`shader RayWork
compute
workers = {8, 4, 1}
image result = rgba16f write
storage triangles = Vector4
main = fn()
    local index = worker.id.x
    triangles[index] = Vector4(1.0, 0.0, 0.0, 1.0)
end
end
end`, 'RayWork.lssl');
assert.match(compute.generated.compute, /layout\(local_size_x = 8, local_size_y = 4, local_size_z = 1\) in;/);
assert.match(compute.generated.compute, /layout\(rgba16f, binding = 0\) uniform writeonly image2D result;/);
assert.match(compute.generated.compute, /layout\(std430, binding = 0\) buffer TrianglesBuffer \{ vec4 triangles\[\]; \};/);


const vulkan = compileLsslSource(`shader VulkanFriendly
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
    color = Color3(1.0, 0.0, 0.0)
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
end`, 'VulkanFriendly.lssl');
assert.strictEqual(vulkan.spirv.vertex[0], 0x07230203);
assert.strictEqual(vulkan.spirv.fragment[0], 0x07230203);
assert.match(vulkan.vulkanGenerated.vertex, /#version 450/);
assert.match(vulkan.vulkanGenerated.vertex, /gl_VertexIndex/);
assert.match(vulkan.lsxSource, /export const vulkan_ready = true/);
assert.match(vulkan.lsxSource, /export fn create\(\)/);
assert.match(vulkan.lsxSource, /memory\.embed_binary\(/);
assert(!/vertex_words|fragment_words/.test(vulkan.lsxSource));
assert(!/export const vertex_spirv/.test(vulkan.lsxSource));

const stripShader = compileLsslSource(`shader VulkanStrip
vulkan
overlay
strip
vertex
main = fn()
    local corner = Vector2(0.0, 0.0)
    if vertex.id == 1 then
        corner = Vector2(1.0, 0.0)
    end
    if vertex.id == 2 then
        corner = Vector2(0.0, 1.0)
    end
    if vertex.id == 3 then
        corner = Vector2(1.0, 1.0)
    end
    screen.position = Vector4(corner, 0.0, 1.0)
end
end
fragment
output finalColor = Color4
main = fn()
    finalColor = Color4(1.0)
end
end
end`, 'VulkanStrip.lssl');
assert.strictEqual(stripShader.shader.triangleStrip, true);
assert.match(stripShader.lsxSource, /export const pipeline_flags = 3/);

const composableRay = compileLsslSource(`shader ComposableRay
vulkan
raytracing shadows
fragment
output finalColor = Color4
main = fn()
    local base = Color4(0.1, 0.2, 0.3, 1.0)
    local rayColor = ray.color()
    local debugColor = ray.debug_color(Vector2(10.0, 20.0))
    finalColor = ray.mix(base, screen.pixel.xy, 0.5) + rayColor * 0.0 + debugColor * 0.0
end
end
end`, 'ComposableRay.lssl');
assert.strictEqual(composableRay.shader.syntheticRayVertex, true);
assert.deepStrictEqual([...composableRay.shader.stages.keys()], ['vertex', 'fragment']);
assert.match(composableRay.generated.vertex, /gl_VertexID/);
assert.match(composableRay.vulkanGenerated.vertex, /gl_VertexIndex/);
assert.match(composableRay.generated.fragment, /lsx_rt_render\(gl_FragCoord\.xy, false\)/);
assert.match(composableRay.generated.fragment, /lsx_rt_render\(vec2\(10\.0, 20\.0\), true\)/);
assert.match(composableRay.generated.fragment, /mix\(base, lsx_rt_render\(gl_FragCoord\.xy, false\), 0\.5\)/);
assert.match(composableRay.lsxSource, /export const ray_fullscreen_vertex = true/);
assert.strictEqual(composableRay.spirv.vertex[0], 0x07230203);
assert.strictEqual(composableRay.spirv.fragment[0], 0x07230203);

const explicitRayVertex = compileLsslSource(`shader ExplicitRayVertex
vulkan
raytracing ao
vertex
main = fn()
    screen.position = Vector4(0.0, 0.0, 0.0, 1.0)
end
end
fragment
output finalColor = Color4
main = fn()
    finalColor = ray.debug()
end
end
end`, 'ExplicitRayVertex.lssl');
assert.strictEqual(explicitRayVertex.shader.syntheticRayVertex, false);
assert.match(explicitRayVertex.lsxSource, /export const ray_fullscreen_vertex = false/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-lssl-'));
const shaderPath = path.join(temp, 'simple.lssl');
fs.writeFileSync(shaderPath, `shader Simple\nfragment\noutput color = Color4\nmain = fn()\ncolor = Color4(1.0)\nend\nend\nend\n`);
const compiler = path.join(__dirname, 'lazyscriptex.js');
const lazyRoot = path.resolve(__dirname, '..');
const checked = cp.spawnSync(process.execPath, [compiler, 'check', shaderPath], { encoding: 'utf8' });
assert.strictEqual(checked.status, 0, checked.stdout + checked.stderr);

const projectDir = path.join(temp, 'project');
fs.mkdirSync(projectDir);
fs.writeFileSync(path.join(projectDir, 'simple.lssl'), `shader Simple
vertex
input position = Vector2
input tint = Color3
output color = Color3
main = fn()
color = tint
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
end
`);
fs.writeFileSync(path.join(projectDir, 'main.lsx'), `use "simple.lssl" as Simple
fn main() return Simple.vertex_layout end
`);
fs.writeFileSync(path.join(projectDir, 'lazyscriptex.json'), JSON.stringify({ entry: 'main.lsx', output: 'build/test.exe', subsystem: 'console', optimization: 6 }, null, 2));
const built = cp.spawnSync(process.execPath, [compiler, 'build', projectDir, '--lazy-script-root', lazyRoot], { encoding: 'utf8' });
assert.strictEqual(built.status, 0, built.stdout + built.stderr);
assert(!fs.existsSync(path.join(projectDir, 'build', 'lssl')), 'normal builds must not expose generated GLSL');
const emitted = cp.spawnSync(process.execPath, [compiler, 'build', projectDir, '--emit-lssl', '--lazy-script-root', lazyRoot], { encoding: 'utf8' });
assert.strictEqual(emitted.status, 0, emitted.stdout + emitted.stderr);
assert(fs.existsSync(path.join(projectDir, 'build', 'lssl', 'simple.vertex.glsl')), '--emit-lssl must remain available for explicit developer debugging');
const rebuiltHidden = cp.spawnSync(process.execPath, [compiler, 'build', projectDir, '--lazy-script-root', lazyRoot], { encoding: 'utf8' });
assert.strictEqual(rebuiltHidden.status, 0, rebuiltHidden.stdout + rebuiltHidden.stderr);
assert(!fs.existsSync(path.join(projectDir, 'build', 'lssl')), 'a later normal build must remove stale generated GLSL');

console.log('LSSL parser, flat interface qualifiers, inference, composable ray fragments, synthetic full-screen vertices, OpenGL GLSL, embedded Vulkan SPIR-V, backend-neutral shader creation, hidden normal builds, optional debug emission, bindings, compute layout, and compiler integration tests passed.');
