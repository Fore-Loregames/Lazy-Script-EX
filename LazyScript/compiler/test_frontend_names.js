'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const compiler = path.join(__dirname, 'lazyscriptex.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-frontend-names-'));
const source = path.join(temp, 'main.lsx');

fs.writeFileSync(source, `const Frame = {
    finished = false

    begin = fn()
        self.finished = false
    end

    end = fn()
        self.finished = true
        return self.finished
    end

    present = fn()
        return self.end()
    end
}

fn main()
    local frame = Frame.new()
    frame.begin()
    if not frame.end() then return 1 end
    frame.begin()
    if not frame.present() then return 2 end
    frame.destroy()
    return 0
end
`);

function run(args) {
  const result = cp.spawnSync(process.execPath, [compiler, ...args], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `command: ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

run(['check', source, '--diagnostics=json']);
for (const level of ['0', '6']) {
  const output = path.join(temp, `frontend-names-o${level}.exe`);
  run(['build', source, '-o', output, '--opt', level]);
  assert(fs.existsSync(output) && fs.statSync(output).size > 4096, `front-end naming O${level} executable was not generated`);
}

console.log('Front-end member naming tests passed for end(), begin(), and compatibility aliases.');
