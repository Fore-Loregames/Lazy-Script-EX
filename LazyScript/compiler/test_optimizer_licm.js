'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('./lazyscriptex.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-licm-'));
fs.writeFileSync(path.join(temp, 'main.lsx'), `fn main()
    local total = 0
    local outer = 0
    while outer < 10 do
        local inner = 0
        while inner < 4 do
            total = total + 1
            inner = inner + 1
        end
        outer = outer + 1
    end
    if total == 40 then return 0 end
    return 1
end
`);

for (const optimization of [5, 6]) {
  fs.writeFileSync(path.join(temp, 'lazyscriptex.json'), JSON.stringify({
    entry: 'main.lsx',
    output: `build/licm_o${optimization}.exe`,
    subsystem: 'console',
    optimization,
  }, null, 2));
  const result = build(temp);
  const outerLoop = result.entry.body.find((statement) => statement.kind === 'while');
  assert(outerLoop, `O${optimization} outer loop missing after optimization`);
  assert.strictEqual(outerLoop.body[0]?.kind, 'local', `O${optimization} moved the loop-local initializer out of its loop`);
  assert.strictEqual(outerLoop.body[0]?.name, 'inner', `O${optimization} no longer resets the inner counter per outer iteration`);
  assert(!result.entry.body.some((statement) => statement.kind === 'local' && statement.name === 'inner'),
    `O${optimization} hoisted the inner counter into function scope`);
}

console.log('O5/O6 LICM preserves reassigned loop-local initializers inside their loop.');
