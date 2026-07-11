#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const apiPath = path.join(root, 'api', 'api-data.json');
const data = JSON.parse(fs.readFileSync(apiPath, 'utf8').replace(/^\uFEFF/, ''));
assert(Array.isArray(data.entries) && data.entries.length > 0, 'API entries are missing');

const required = ['friendlyDescription', 'whatItIs', 'whenToUse', 'workflow', 'example'];
for (const entry of data.entries) {
  const qualified = `${entry.module}.${entry.owner ? `${entry.owner}.` : ''}${entry.name}`;
  for (const field of required) assert(String(entry[field] || '').trim(), `${qualified} is missing ${field}`);
  assert(!/Give root to|renderer here|TODO|your code here/i.test(entry.example), `${qualified} contains a placeholder example`);
  assert(!/\btable\s*</.test(entry.example), `${qualified} exposes typed-table syntax in a user-facing example`);
  assert(!/\b\w+:[A-Za-z_]\w*\(/.test(entry.example), `${qualified} uses colon method syntax in a user-facing example`);
  assert(!/CanvasCommand\.new\(\)/.test(entry.example), `${qualified} teaches direct CanvasCommand construction`);
  assert(!/glUniformMatrix\w+\([^\n]*null/.test(entry.example), `${qualified} uses a null matrix upload example`);
}


assert(data.audienceStats && data.audienceStats.frontend > 0 && data.audienceStats.backend > 0, 'API audience split is missing');
const frontendEntries = data.entries.filter(entry => entry.audience === 'frontend');
const backendEntries = data.entries.filter(entry => entry.audience === 'backend');
assert(frontendEntries.length === data.audienceStats.frontend, 'Front-end audience count is stale');
assert(backendEntries.length === data.audienceStats.backend, 'Backend audience count is stale');
for (const entry of frontendEntries) {
  const qualified = `${entry.module}.${entry.owner ? `${entry.owner}.` : ''}${entry.name}`;
  assert(!/(:\s*(?:u\d+|i\d+|f\d+|bool|string|fnptr|ptr)\b|extern\s+")/.test(entry.publicSignature || ''), `${qualified} exposes a backend type in the front-end call shape`);
}
const inheritanceNames = new Set(data.entries.filter(entry => entry.module === 'Language/Inheritance' && entry.audience === 'frontend').map(entry => entry.name));
for (const name of ['base object declaration', 'inherited fields and methods', 'derived constructor', 'base constructor call', 'method override', 'GetTypeName', 'IsType']) {
  assert(inheritanceNames.has(name), `Front-end inheritance API is missing ${name}`);
}
const lazyUiStart = data.entries.filter(entry => entry.module === 'LazyUI/Start here' && entry.audience === 'frontend');
assert(lazyUiStart.length >= 5, 'LazyUI beginner start workflows are missing');
const programmaticElements = data.entries.filter(entry => entry.module === 'LazyUI/Programmatic elements' && entry.audience === 'frontend');
assert(programmaticElements.length >= 200, 'Programmatic LazyUI element factories are missing from the beginner API');
assert(programmaticElements.every(entry => entry.sourceModule === 'UI/LazyUI'), 'Programmatic element metadata lost its real source module');
const beginnerLazyUi = frontendEntries.filter(entry => entry.module === 'UI/LazyUI');
for (const entry of beginnerLazyUi) {
  const qualified = `${entry.module}.${entry.owner ? `${entry.owner}.` : ''}${entry.name}`;
  assert(!/^Runs the .* operation provided by UI\/LazyUI\.$/.test(entry.friendlyDescription || ''), `${qualified} still has a meaningless generated description`);
  assert(String(entry.example || '').trim() !== String(entry.signature || '').trim(), `${qualified} still shows its backend declaration as the beginner example`);
}
const propertyHash = data.entries.find(entry => entry.module === 'UI/LazyUI' && entry.owner === 'Binding' && entry.name === 'property_hash');
assert(propertyHash && propertyHash.audience === 'backend', 'Binding.property_hash must stay in the Backend tab');
const apiIndex = fs.readFileSync(path.join(root, 'api', 'index.html'), 'utf8');
const apiApp = fs.readFileSync(path.join(root, 'api', 'app.js'), 'utf8');
assert(apiIndex.includes('Front-end API') && apiIndex.includes('Backend'), 'API audience tabs are missing from the documentation');
assert(apiApp.includes("apiMode === 'backend'"), 'API application does not switch between front-end and backend entries');
assert(!apiApp.includes('find_id(UI.hash'), 'Beginner LazyUI lessons still use internal hash-based element lookup');
assert(!apiApp.includes('id_hash'), 'Beginner LazyUI lessons still read internal element hash fields');
assert(!apiApp.includes('mark_visual_dirty') && !apiApp.includes('mark_layout_dirty'), 'Beginner LazyUI lessons still call internal dirty-state methods');


const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'compiler', 'package.json'), 'utf8'));
assert.strictEqual(data.version, packageInfo.version, 'API version does not match the compiler package version');
assert.strictEqual(data.generated?.beginnerMetadata, packageInfo.version, 'API metadata version is stale');

const frontendKeys = new Set(frontendEntries.map(entry => `${entry.module}|${entry.owner || ''}|${entry.name}`));
for (const key of [
  'LSG||use_vulkan', 'LSG||use_opengl', 'LSG||open', 'LSG||open_shared_window',
  'LSG|Window|begin', 'LSG|Window|end', 'LSG|Window|activate', 'LSG|Window|set_vsync',
  'LSG|Window|set_title', 'LSG|Window|is_key_down', 'LSG|Window|is_mouse_down',
  'LSG|Mesh|draw_instances', 'LSG|Mesh|update_vertices', 'LSG|Mesh|set_ray_transform',
  'LSG|Framebuffer|display', 'LSG||set_ray_tracing', 'LSG||set_ray_sun',
  'LSSL||shader declaration', 'LSSL||vertex stage', 'LSSL||fragment stage',
  'LSSL||compute stage', 'LSSL||uniform resource', 'LSSL||texture resource',
  'LSSL||storage resource', 'LSSL||image resource', 'LSSL||raytracing features'
]) assert(frontendKeys.has(key), `Front-end API is missing ${key}`);

const backendKeys = new Set(backendEntries.map(entry => `${entry.module}|${entry.owner || ''}|${entry.name}`));
for (const key of [
  'LSG|Window|present', 'LSG|Window|make_current', 'LSG|Window|vsync',
  'LSG|Mesh|draw_many', 'LSG|Framebuffer|show', 'LSG||enable_ray_tracing',
  'LSG||backend', 'LSG||poll', 'LSG||clear'
]) assert(backendKeys.has(key), `Compatibility/backend API is missing ${key}`);

const modules = new Set(data.entries.map(entry => entry.module));
assert(modules.has('Vulkan/Vulkan') && modules.has('Vulkan/VulkanRaw'), 'Vulkan backend modules are missing from the API');
assert(data.entries.some(entry => entry.module === 'Vulkan/Vulkan' && entry.audience === 'backend'), 'Vulkan backend declarations are not isolated in the Backend tab');
for (const moduleName of ['GLFW', 'OpenGL', 'Math/OpenGL', 'OpenGL/TextureUpload', 'System/Parallel', 'System/KernelRuntime']) {
  const entries = data.entries.filter(entry => entry.module === moduleName);
  assert(entries.length > 0, `${moduleName} is missing from the API`);
  assert(entries.every(entry => entry.audience === 'backend'), `${moduleName} must stay in the Backend tab`);
}
assert.strictEqual(Object.keys(data.stats?.modules || {}).length, modules.size, 'API module statistics are stale');
for (const module of modules) assert(data.moduleGuides?.[module], `Missing module guide for ${module}`);
assert.strictEqual(Object.keys(data.moduleGuides || {}).length, modules.size, 'Module guide count does not match the API module count');

const canvas = data.entries.find(entry => entry.module === 'UI/LazyUI' && !entry.owner && entry.name === 'CanvasCommand');
assert(canvas, 'CanvasCommand API entry is missing');
assert.strictEqual(canvas.level, 'internal', 'CanvasCommand must be labeled internal');
assert(canvas.memberSummary.includes('kind chooses the drawing operation'), 'CanvasCommand does not explain what it stores');
assert(canvas.howToGet.includes('CanvasContext creates these automatically'), 'CanvasCommand does not explain its real creation path');
assert(canvas.example.includes('UI.canvas_context'), 'CanvasCommand example does not use the public CanvasContext path');

const extensionApiPath = path.join(root, 'extension', 'api', 'api-data.json');
if (fs.existsSync(extensionApiPath)) {
  const extensionApi = fs.readFileSync(extensionApiPath);
  const mainApi = fs.readFileSync(apiPath);
  assert(extensionApi.equals(mainApi), 'VS Code extension API metadata is not synchronized with LazyScript/api');
}

console.log(`Beginner API validation passed: ${data.entries.length} declarations across ${modules.size} modules.`);
