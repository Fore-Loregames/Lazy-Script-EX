#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { compileWithClang, compileWithMsvc, verifyNativeDll } = require('../compiler/native_bindings');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'native', 'lsx_freetype_bridge.c');
const output = path.join(root, 'native', 'LSXFreeType.dll');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-freetype-'));
let result = null;
const errors = [];
try {
  if (process.platform === 'win32') {
    try { result = compileWithMsvc(source, output, temp); } catch (error) { errors.push(error.message); }
  }
  if (!result) {
    try { result = compileWithClang(source, output, temp); } catch (error) { errors.push(error.message); }
  }
  if (!result) throw new Error(errors.join('\n'));
  verifyNativeDll(output, [
    '_lsxFTReady', '_lsxFTCreateFace', '_lsxFTLoadGlyph',
    '_lsxFTCopyBitmap', '_lsxFTDestroyFace'
  ]);
  console.log(`Built ${output}`);
  console.log(`Toolchain: ${result.toolchain}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
