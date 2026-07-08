'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
const compiler = path.join(__dirname, 'lazyscriptex.js');
const examples = path.resolve(root, '..', 'Projects');
const folders = fs.readdirSync(examples, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(examples, entry.name, 'lazyscriptex.json')))
  .map((entry) => entry.name)
  .sort();
for (const folder of folders) {
  const project = path.join(examples, folder, 'lazyscriptex.json');
  const result = cp.spawnSync(process.execPath, [compiler, 'build', project], { encoding: 'utf8', env: { ...process.env, LSX_USE_PREBUILT_NATIVE: '1' } });
  if (result.status !== 0) {
    process.stderr.write(`Example failed: ${folder}\n${result.stdout}${result.stderr}`);
    process.exit(result.status || 1);
  }
  process.stdout.write(`PASS ${folder}\n`);
}
console.log(`Built ${folders.length} Native GameKit Windows examples with the generated binding bridge.`);
