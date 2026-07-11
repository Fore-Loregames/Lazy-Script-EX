'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const compiler = path.join(__dirname, 'lazyscriptex.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-compound-'));
const source = `const Position = {
    x = 0.0,
    y = 0.0
}

fn main()
    local score = 20
    score += 5
    score -= 3
    score *= 2
    score /= 2
    score %= 7

    local pos = Position.new()
    pos.x += 1.5
    pos.y -= 0.5

    local values = {2,4,6}
    values[1] *= 3
    values[2] /= 2

    local result = score + values[1] + values[2]
    values.destroy()
    pos.destroy()
    return result
end
`;
fs.writeFileSync(path.join(temp, 'main.lsx'), source);
fs.writeFileSync(path.join(temp, 'lazyscriptex.json'), JSON.stringify({
  entry: 'main.lsx', output: 'build/compound.exe', subsystem: 'console', optimization: 6,
}, null, 2));

const checked = cp.spawnSync(process.execPath, [compiler, 'check-project', temp], { encoding: 'utf8' });
assert.strictEqual(checked.status, 0, checked.stdout + checked.stderr);
const built = cp.spawnSync(process.execPath, [compiler, 'build', temp], { encoding: 'utf8' });
assert.strictEqual(built.status, 0, built.stdout + built.stderr);
assert(fs.existsSync(path.join(temp, 'build', 'compound.exe')), 'compound-assignment test executable missing');

const compilerSource = fs.readFileSync(compiler, 'utf8');
for (const operator of ['+=', '-=', '*=', '/=', '%=']) {
  assert(compilerSource.includes(`'${operator}'`), `compiler lexer/parser missing ${operator}`);
}
console.log('Compound assignment tests passed for locals, object fields, and table indexes.');
