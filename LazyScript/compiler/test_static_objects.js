'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const compiler = path.join(__dirname, 'lazyscriptex.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-static-'));

function write(relative, source) {
  const file = path.join(temp, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
}

function run(args, expected = 0) {
  const result = cp.spawnSync(process.execPath, [compiler, ...args], { encoding: 'utf8' });
  assert.strictEqual(result.status, expected, `command: ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

write('WindowManager.lsx', `
export static const WindowManager = {
    width = 1920
    height = 1080
    windowHandle = 0
    title = "Default"

    CreateWindow = fn(width,height,title)
        self.width = width
        self.height = height
        self.title = title
        self.windowHandle = width + height
        return self.windowHandle
    end

    Resize = fn(width,height)
        self.width = width
        self.height = height
    end

    CurrentWidth = fn()
        return self.width
    end
}
`);

const main = write('main.lsx', `
use "WindowManager.lsx" as WindowManagerMod

fn main()
    WindowManagerMod.WindowManager.width = 640
    local before = WindowManagerMod.WindowManager.width
    local handle = WindowManagerMod.WindowManager.CreateWindow(1280,720,"LazyEngine")
    WindowManagerMod.WindowManager.Resize(1600,900)
    local width = WindowManagerMod.WindowManager.CurrentWidth()
    return handle + before + width
end
`);

run(['check', main, '--diagnostics=json']);
for (const level of ['0', '6']) {
  const output = path.join(temp, `static-o${level}.exe`);
  run(['build', main, '-o', output, '--opt', level]);
  assert(fs.existsSync(output) && fs.statSync(output).size > 4096, `static object O${level} executable was not generated`);
}


write('Bindings.lsx', `
export const MOUSE_LEFT = 0
export const MOUSE_RIGHT = 1
export const KEY_A = 65
`);

write('Input.lsx', `
use "Bindings.lsx" as Native

export static const Input = {
    MouseButton = {
        Left = Native.MOUSE_LEFT
        Right = Native.MOUSE_RIGHT
    }

    Key = {
        A = Native.KEY_A
    }
}
`);

const nestedStatic = write('nested-static-main.lsx', `
use "Input.lsx" as InputMod

fn main()
    if InputMod.Input.MouseButton.Left != 0 then
        return 1
    end
    if InputMod.Input.MouseButton.Right != 1 then
        return 2
    end
    if InputMod.Input.Key.A != 65 then
        return 3
    end
    return 0
end
`);
run(['check', nestedStatic, '--diagnostics=json']);
for (const level of ['0', '6']) {
  const output = path.join(temp, `nested-static-o${level}.exe`);
  run(['build', nestedStatic, '-o', output, '--opt', level]);
  assert(fs.existsSync(output) && fs.statSync(output).size > 4096, `nested static object O${level} executable was not generated`);
}

const invalidNew = write('invalid-new.lsx', `
use "WindowManager.lsx" as WindowManagerMod
fn main()
    local manager = WindowManagerMod.WindowManager.new()
    return 0
end
`);
const invalid = run(['check', invalidNew, '--diagnostics=json'], 1);
const diagnosticLine = `${invalid.stdout}\n${invalid.stderr}`.trim().split(/\r?\n/).find(line => line.startsWith('{'));
const diagnostic = JSON.parse(diagnosticLine);
assert.strictEqual(diagnostic.code, 'LSX1251');
assert(diagnostic.message.includes('cannot be constructed'));
assert(diagnostic.hint.includes('directly'));

const normalObject = write('normal.lsx', `
const Player = {
    health = 10
    Damage = fn(amount)
        self.health = self.health - amount
    end
}
fn main()
    local player = Player.new()
    player.Damage(3)
    local result = player.health
    player.destroy()
    return result
end
`);
run(['check', normalObject]);

console.log('LazyScriptEX static object tests passed.');
