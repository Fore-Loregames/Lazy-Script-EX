'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const lazy = path.resolve(__dirname, '..');
const rawPath = path.join(lazy, 'bindings', 'Math', 'GLMRaw.lsx');
const publicPath = path.join(lazy, 'bindings', 'Math', 'GLM.lsx');
const cameraPath = path.join(lazy, 'bindings', 'Math', 'Camera.lsx');
const dllPath = path.join(lazy, 'native', 'LSXMath.dll');
const sourcePath = path.join(lazy, 'native', 'lsx_glm_bridge.cpp');
const licensePath = path.join(lazy, 'licenses', 'GLM-LICENSE.txt');

const raw = fs.readFileSync(rawPath, 'utf8');
const front = fs.readFileSync(publicPath, 'utf8');
const camera = fs.readFileSync(cameraPath, 'utf8');
const dll = fs.readFileSync(dllPath);
const source = fs.readFileSync(sourcePath, 'utf8');
const names = [...raw.matchAll(/export\s+extern\s+"LSXMath\.dll"\s+fn\s+(_lsxGLM\w+)/g)].map(m => m[1]);
assert(names.length >= 140, `expected complete GLM bridge, found ${names.length} raw functions`);
for (const name of names) {
  assert(dll.includes(Buffer.from(`${name}\0`, 'ascii')), `LSXMath.dll export missing: ${name}`);
  assert(source.includes(name), `native GLM source implementation missing: ${name}`);
}
assert(!/->\s*ptr\b/.test(front), 'public GLM wrapper exposes a pointer return');
assert(!/export\s+extern/.test(front), 'public GLM wrapper exposes native externs');
assert(!/\bptr\b/.test(camera), 'camera wrapper exposes native pointers');
for (const feature of ['Vec2','Vec3','Vec4','Mat2','Mat3','Mat4','Quat','DualQuat','Decomposition']) {
  assert(front.includes(`export const ${feature}`), `public GLM feature missing: ${feature}`);
}
for (const feature of ['trs','inverse_trs','look_at_rh','look_at_lh','perspective','ortho','decompose','pick_matrix','project_no','project_zo','unproject_no','unproject_zo','project','unproject','infinite_perspective','look_at']) {
  assert(front.includes(`export fn ${feature}`), `public GLM function missing: ${feature}`);
}
assert(fs.existsSync(licensePath), 'GLM license missing');
assert(fs.existsSync(path.join(lazy, 'native', 'include', 'glm', 'glm.hpp')), 'vendored GLM headers missing');
console.log(`GLM wrapper/export audit passed (${names.length} native bridge exports).`);
