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

const modules = new Set(data.entries.map(entry => entry.module));
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
