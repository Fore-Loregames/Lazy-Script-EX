'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { checkFile, compilerDiagnostic, formatHumanDiagnostic } = require('./lazyscriptex');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-diagnostics-'));
const source = path.join(root, 'main.lsx');
fs.writeFileSync(source, `fn main()\n    local value = { x = 1, 2 }\n    return 0\nend\n`);

let diagnostic;
try {
  checkFile(source);
  assert.fail('invalid source unexpectedly passed');
} catch (error) {
  diagnostic = compilerDiagnostic(error);
}
assert.strictEqual(diagnostic.code, 'LSX1200');
assert.strictEqual(diagnostic.line, 2);
assert.strictEqual(diagnostic.column, 28);
assert(diagnostic.sourceLine.includes('local value'));
assert(diagnostic.hint.includes('either a list'));
const human = formatHumanDiagnostic(diagnostic);
assert(human.includes('^'));
assert(human.includes('Hint:'));

const result = cp.spawnSync(process.execPath, [path.join(__dirname, 'lazyscriptex.js'), 'check', source, '--diagnostics=json'], { encoding: 'utf8' });
assert.strictEqual(result.status, 1);
const parsed = JSON.parse(result.stderr.trim());
assert.strictEqual(parsed.kind, 'diagnostic');
assert.strictEqual(parsed.code, 'LSX1200');
assert.strictEqual(parsed.file, source);

fs.rmSync(root, { recursive: true, force: true });
console.log('LazyScriptEX structured diagnostic and source-range tests passed.');
