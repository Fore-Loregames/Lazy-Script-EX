'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'native', 'lsx_gamekit_bridge.c'), 'utf8');
for (const token of [
  'LoadLibraryA("glfw3.dll")',
  'GetProcAddress(g_glfw, "glfwCreateWindow")',
  'GetProcAddress(g_glfw, "glfwPollEvents")',
  'p_glfwGetProcAddress',
  'LoadLibraryA("OpenAL32.dll")',
  'GetProcAddress(g_openal, "alcOpenDevice")'
]) assert(bridge.includes(token), `${token} forwarding contract missing`);
for (const token of ['CreateWindowEx', 'RegisterClassEx', 'DefWindowProc', 'PeekMessage', 'DispatchMessage'])
  assert(!bridge.includes(token), `${token} custom window implementation found`);
console.log('GLFW/OpenGL/OpenAL forwarding-only native contract passed.');
