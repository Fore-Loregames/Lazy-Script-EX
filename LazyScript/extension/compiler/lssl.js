'use strict';

// Lazy Shader Language (LSSL)
// ---------------------------
// A deliberately small LSX-shaped shader language. It keeps the parts that
// describe GPU work and removes GLSL ceremony such as #version, layout numbers,
// matching stage locations, and explicit local variable types.

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
let glslangFactory = null;
let glslangInstance = null;

function glslang() {
  if (!glslangFactory) glslangFactory = require('./vendor/glslang/glslang.js');
  if (!glslangInstance) glslangInstance = glslangFactory();
  return glslangInstance;
}


const TYPE_MAP = new Map([
  ['Number', 'float'], ['Float', 'float'],
  ['Whole', 'int'], ['Integer', 'int'],
  ['Unsigned', 'uint'],
  ['Truth', 'bool'], ['Boolean', 'bool'],
  ['Vector2', 'vec2'], ['Vector3', 'vec3'], ['Vector4', 'vec4'],
  ['Color3', 'vec3'], ['Color4', 'vec4'],
  ['Matrix2', 'mat2'], ['Matrix3', 'mat3'], ['Matrix4', 'mat4'],
  ['Texture2D', 'sampler2D'], ['TextureCube', 'samplerCube'],
  ['Image2D', 'image2D'],
]);

const GLSL_TO_FRIENDLY = new Map([...TYPE_MAP].map(([friendly, glsl]) => [glsl, friendly]));
const CONSTRUCTOR_NAMES = [...TYPE_MAP.keys()].sort((a, b) => b.length - a.length);

function fail(filePath, line, message, hint = null) {
  const error = new Error(`${filePath || '<shader>'}:${line || 1}: ${message}${hint ? `\nHint: ${hint}` : ''}`);
  error.filePath = filePath || null;
  error.line = line || 1;
  error.hint = hint;
  throw error;
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (line.startsWith('--', i) || line.startsWith('//', i)) return line.slice(0, i);
  }
  return line;
}

function splitWords(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function parseFriendlyType(raw, filePath, line) {
  const text = String(raw || '').trim();
  if (TYPE_MAP.has(text)) return { friendly: text, glsl: TYPE_MAP.get(text) };
  if (/^(float|int|uint|bool|vec[234]|mat[234]|sampler2D|samplerCube|image2D)$/.test(text)) {
    return { friendly: GLSL_TO_FRIENDLY.get(text) || text, glsl: text };
  }
  fail(filePath, line, `unknown shader value shape '${text}'`, 'Use Number, Whole, Unsigned, Truth, Vector2, Vector3, Vector4, Color3, Color4, Matrix3, Matrix4, Texture2D, or TextureCube.');
}

function parseResourceLine(text, keyword, filePath, line) {
  const rest = text.slice(keyword.length).trim();
  const match = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+at\s+(\d+))?$/);
  if (!match) fail(filePath, line, `invalid ${keyword} declaration`, `Write: ${keyword} name = Vector3`);
  return { name: match[1], type: parseFriendlyType(match[2], filePath, line), binding: match[3] === undefined ? null : Number(match[3]), line };
}

function parseTextureLine(text, filePath, line) {
  const rest = text.slice('texture'.length).trim();
  const match = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(Texture2D|TextureCube|sampler2D|samplerCube))?(?:\s+at\s+(\d+))?$/);
  if (!match) fail(filePath, line, 'invalid texture declaration', 'Write: texture albedo  or  texture sky = TextureCube');
  const type = parseFriendlyType(match[2] || 'Texture2D', filePath, line);
  return { name: match[1], type, binding: match[3] === undefined ? null : Number(match[3]), line };
}

function parseImageLine(text, filePath, line) {
  // image output = rgba16f write at 0
  const rest = text.slice('image'.length).trim();
  const match = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z0-9_]+)(?:\s+(read|write|readwrite))?(?:\s+at\s+(\d+))?$/);
  if (!match) fail(filePath, line, 'invalid image declaration', 'Write: image output = rgba16f write at 0');
  return { name: match[1], format: match[2], access: match[3] || 'readwrite', binding: match[4] === undefined ? null : Number(match[4]), line, type: { friendly: 'Image2D', glsl: 'image2D' } };
}

function parseStorageLine(text, filePath, line) {
  // storage values = Number at 0
  const rest = text.slice('storage'.length).trim();
  const match = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+at\s+(\d+))?$/);
  if (!match) fail(filePath, line, 'invalid storage declaration', 'Write: storage values = Number at 0');
  return { name: match[1], elementType: parseFriendlyType(match[2], filePath, line), binding: match[3] === undefined ? null : Number(match[3]), line };
}

function parseWorkers(text, filePath, line) {
  const match = text.match(/^workers\s*=\s*\{\s*(\d+)\s*(?:,\s*(\d+)\s*)?(?:,\s*(\d+)\s*)?\}$/);
  if (!match) fail(filePath, line, 'invalid workers declaration', 'Write: workers = {8, 8, 1}');
  const values = [Number(match[1]), Number(match[2] || 1), Number(match[3] || 1)];
  if (values.some((value) => value < 1 || value > 1024)) fail(filePath, line, 'worker counts must be between 1 and 1024');
  return values;
}

function createStage(kind, line) {
  return {
    kind, line,
    inputs: [], outputs: [], uniforms: [], textures: [], images: [], storage: [],
    workers: [1, 1, 1],
    body: [],
  };
}

function parseLssl(source, filePath = '<shader>') {
  const lines = String(source || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  let shader = null;
  let stage = null;
  let inMain = false;
  let bodyDepth = 0;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const original = lines[index];
    const clean = stripComment(original).trim();
    if (!clean) continue;

    if (!shader) {
      const match = clean.match(/^shader\s+([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!match) fail(filePath, lineNumber, "an LSSL file must begin with 'shader Name'");
      shader = { name: match[1], filePath, line: lineNumber, stages: new Map(), requireVulkan: false, rayTracing: null, raySurface: false, rayManualApply: false, rayModelOffset: -1, overlay: false, triangleStrip: false, syntheticRayVertex: false };
      continue;
    }

    if (inMain) {
      if (/^(if\b.*\bthen|while\b.*\bdo|for\b.*\bdo)$/.test(clean)) {
        stage.body.push({ text: clean, line: lineNumber });
        bodyDepth++;
        continue;
      }
      if (clean === 'else' || clean.startsWith('else if ')) {
        stage.body.push({ text: clean, line: lineNumber });
        continue;
      }
      if (clean === 'end') {
        if (bodyDepth > 0) {
          stage.body.push({ text: clean, line: lineNumber });
          bodyDepth--;
        } else {
          inMain = false;
        }
        continue;
      }
      stage.body.push({ text: clean, line: lineNumber });
      continue;
    }

    if (stage) {
      if (clean === 'end') { stage = null; continue; }
      if (/^main\s*=\s*fn\s*\(\s*\)\s*$/.test(clean) || /^fn\s+main\s*\(\s*\)\s*$/.test(clean)) {
        inMain = true;
        bodyDepth = 0;
        continue;
      }
      if (clean.startsWith('flat input ')) {
        const item = parseResourceLine(clean.slice(5), 'input', filePath, lineNumber);
        item.flat = true;
        stage.inputs.push(item);
        continue;
      }
      if (clean.startsWith('flat output ')) {
        const item = parseResourceLine(clean.slice(5), 'output', filePath, lineNumber);
        item.flat = true;
        stage.outputs.push(item);
        continue;
      }
      if (clean.startsWith('input ')) { stage.inputs.push(parseResourceLine(clean, 'input', filePath, lineNumber)); continue; }
      if (clean.startsWith('output ')) { stage.outputs.push(parseResourceLine(clean, 'output', filePath, lineNumber)); continue; }
      if (clean.startsWith('uniform ')) { stage.uniforms.push(parseResourceLine(clean, 'uniform', filePath, lineNumber)); continue; }
      if (clean.startsWith('texture ')) { stage.textures.push(parseTextureLine(clean, filePath, lineNumber)); continue; }
      if (clean.startsWith('image ')) { stage.images.push(parseImageLine(clean, filePath, lineNumber)); continue; }
      if (clean.startsWith('storage ')) { stage.storage.push(parseStorageLine(clean, filePath, lineNumber)); continue; }
      if (clean.startsWith('workers ')) {
        if (stage.kind !== 'compute') fail(filePath, lineNumber, 'workers can only be used in a compute stage');
        stage.workers = parseWorkers(clean, filePath, lineNumber);
        continue;
      }
      fail(filePath, lineNumber, `unknown ${stage.kind} stage statement '${clean}'`, 'Use input, output, flat input, flat output, uniform, texture, image, storage, workers, or main = fn().');
    }

    const rayMatch = clean.match(/^raytracing\s+(.+)$/);
    if (rayMatch) {
      if (shader.rayTracing) fail(filePath, lineNumber, 'raytracing features are already declared');
      const allowed = new Map([['shadows', 1], ['ao', 2], ['gi', 4], ['reflections', 8]]);
      const requested = rayMatch[1].split(/[\s,]+/).filter(Boolean);
      if (requested.length === 0) fail(filePath, lineNumber, 'raytracing needs at least one feature', 'Use: raytracing all, or list shadows, ao, gi, and reflections.');
      const features = [];
      for (const feature of requested) {
        if (feature === 'all') {
          for (const name of allowed.keys()) features.push(name);
        } else {
          features.push(feature);
        }
      }
      let mask = 0;
      const unique = [];
      for (const feature of features) {
        if (!allowed.has(feature)) fail(filePath, lineNumber, `unknown raytracing feature '${feature}'`, 'Use all, shadows, ao, gi, and/or reflections.');
        if (!unique.includes(feature)) unique.push(feature);
        mask |= allowed.get(feature);
      }
      shader.rayTracing = { features: unique, mask, line: lineNumber };
      shader.requireVulkan = true;
      continue;
    }

    if (clean === 'vulkan') {
      shader.requireVulkan = true;
      continue;
    }

    if (clean === 'overlay') {
      shader.overlay = true;
      continue;
    }

    if (clean === 'strip') {
      shader.triangleStrip = true;
      continue;
    }

    if (clean === 'vertex' || clean === 'fragment' || clean === 'compute') {
      if (shader.stages.has(clean)) fail(filePath, lineNumber, `shader already has a ${clean} stage`);
      stage = createStage(clean, lineNumber);
      shader.stages.set(clean, stage);
      continue;
    }

    if (clean === 'end') {
      // End of shader. Anything after this must be trivia.
      for (let tail = index + 1; tail < lines.length; tail++) {
        if (stripComment(lines[tail]).trim()) fail(filePath, tail + 1, 'nothing may appear after the shader end');
      }
      break;
    }

    fail(filePath, lineNumber, `expected vertex, fragment, compute, or end; found '${clean}'`);
  }

  if (!shader) fail(filePath, 1, 'empty LSSL file');
  if (inMain) fail(filePath, lines.length, `unterminated main function in ${stage.kind} stage`);
  if (stage) fail(filePath, lines.length, `unterminated ${stage.kind} stage`);
  if (shader.stages.size === 0) fail(filePath, shader.line, 'shader has no stages');
  if (shader.stages.has('compute') && shader.stages.size > 1) fail(filePath, shader.stages.get('compute').line, 'a compute shader must live by itself; move vertex and fragment stages to another .lssl file');
  for (const current of shader.stages.values()) {
    if (current.body.length === 0) fail(filePath, current.line, `${current.kind} stage has no main function`);
  }
  return shader;
}

function replaceWordOperators(text) {
  return text
    .replace(/\s+and\s+/g, ' && ')
    .replace(/\s+or\s+/g, ' || ')
    .replace(/\bnot\s+/g, '!')
    .replace(/~=/g, '!=');
}

function replaceConstructors(text) {
  let out = text;
  for (const name of CONSTRUCTOR_NAMES) {
    const glsl = TYPE_MAP.get(name);
    out = out.replace(new RegExp(`\\b${name}\\s*\\(`, 'g'), `${glsl}(`);
  }
  return out;
}

function replaceRayMethods(text) {
  const source = String(text || '');
  const pattern = /\bray\.(render|color|debug|debug_color|mix|apply)\s*\(/g;
  let cursor = 0;
  let output = '';

  while (cursor < source.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (!match) {
      output += source.slice(cursor);
      break;
    }

    output += source.slice(cursor, match.index);
    const open = pattern.lastIndex - 1;
    let depth = 1;
    let quote = null;
    let close = -1;
    for (let index = open + 1; index < source.length; index++) {
      const ch = source[index];
      if (quote) {
        if (ch === '\\') { index++; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) { close = index; break; }
      }
    }

    // Leave malformed calls untouched so the normal GLSL diagnostic can point
    // at the original expression instead of silently changing its meaning.
    if (close < 0) {
      output += source.slice(match.index);
      break;
    }

    const args = splitTopLevelArgs(source.slice(open + 1, close)).map((value) => replaceRayMethods(value));
    const method = match[1];
    let replacement = null;
    if (method === 'render' || method === 'color') {
      if (args.length <= 1) replacement = `lsx_rt_render(${args[0] || 'gl_FragCoord.xy'}, false)`;
    } else if (method === 'debug' || method === 'debug_color') {
      if (args.length <= 1) replacement = `lsx_rt_render(${args[0] || 'gl_FragCoord.xy'}, true)`;
    } else if (method === 'apply') {
      if (args.length === 1) replacement = `lsx_rt_apply(${args[0]}, lsxRayWorldPosition, lsxRayWorldNormal)`;
      else if (args.length === 3) replacement = `lsx_rt_apply(${args[0]}, ${args[1]}, ${args[2]})`;
    } else if (method === 'mix') {
      if (args.length === 2) replacement = `mix(${args[0]}, lsx_rt_render(gl_FragCoord.xy, false), ${args[1]})`;
      else if (args.length === 3) replacement = `mix(${args[0]}, lsx_rt_render(${args[1]}, false), ${args[2]})`;
    }

    output += replacement || source.slice(match.index, close + 1);
    cursor = close + 1;
  }

  return output;
}

function replaceBuiltins(text, target = 'opengl') {
  const vertexId = target === 'vulkan' ? 'gl_VertexIndex' : 'gl_VertexID';
  const instanceId = target === 'vulkan' ? 'gl_InstanceIndex' : 'gl_InstanceID';
  const replaced = text
    .replace(/\bscreen\.position\b/g, 'gl_Position')
    .replace(/\bscreen\.depth\b/g, 'gl_FragDepth')
    .replace(/\bscreen\.pixel\b/g, 'gl_FragCoord')
    .replace(/\bray\.position\b/g, 'lsxRayWorldPosition')
    .replace(/\bray\.normal\b/g, 'lsxRayWorldNormal')
    .replace(/\bvertex\.id\b/g, vertexId)
    .replace(/\binstance\.id\b/g, instanceId)
    .replace(/\bworker\.id\b/g, 'gl_GlobalInvocationID')
    .replace(/\bworker\.local_id\b/g, 'gl_LocalInvocationID')
    .replace(/\bworker\.group\b/g, 'gl_WorkGroupID')
    .replace(/\bworker\.index\b/g, 'gl_LocalInvocationIndex');
  return replaceRayMethods(replaced);
}

function replaceTextureMethods(text) {
  let out = text;
  // image.store(pixel, value) -> imageStore(image, pixel, value)
  out = out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.store\s*\(([^,]+),\s*(.+)\)$/g, 'imageStore($1, $2, $3)');
  // texture.sample(uv) -> texture(texture, uv)
  out = out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.sample\s*\(([^)]+)\)/g, 'texture($1, $2)');
  // texture.pixel(pixel) -> texelFetch(texture, pixel, 0)
  out = out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.pixel\s*\(([^)]+)\)/g, 'texelFetch($1, ivec2($2), 0)');
  return out;
}

function translateExpression(text, target = 'opengl') {
  return replaceTextureMethods(replaceBuiltins(replaceConstructors(replaceWordOperators(text.trim())), target));
}

function vectorSize(type) {
  const match = String(type || '').match(/vec([234])/);
  return match ? Number(match[1]) : 0;
}

function inferExpressionType(expression, symbols) {
  const original = expression.trim();
  const text = translateExpression(original);

  let match = text.match(/^(vec[234]|mat[234]|float|int|uint|bool)\s*\(/);
  if (match) return match[1];
  if (/^(true|false)$/.test(text)) return 'bool';
  if (/^gl_(?:VertexID|InstanceID)(?:\b|\s*[+\-*/%])/.test(text)) return 'int';
  if (/^gl_(?:GlobalInvocationID|LocalInvocationID|WorkGroupID)\.[xyz]$/.test(text)) return 'uint';
  if (/^gl_LocalInvocationIndex$/.test(text)) return 'uint';
  if (/^[+-]?\d+$/.test(text)) return 'int';
  if (/^[+-]?(?:\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?[fF]?$/.test(text)) return 'float';

  match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  if (match && symbols.has(match[1])) return symbols.get(match[1]);

  match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([xyzwrgba]{1,4})$/);
  if (match && symbols.has(match[1])) {
    const size = match[2].length;
    if (size > 1) return `vec${size}`;
    const baseType = symbols.get(match[1]);
    if (/^uvec/.test(baseType)) return 'uint';
    if (/^ivec/.test(baseType)) return 'int';
    if (/^bvec/.test(baseType)) return 'bool';
    return 'float';
  }

  // Swizzles also work on function results, for example texture(...).rgb.
  match = text.match(/\.([xyzwrgba]{1,4})$/);
  if (match) return match[1].length === 1 ? 'float' : `vec${match[1].length}`;

  match = text.match(/^(?:normalize|reflect|refract|abs|sin|cos|tan|floor|ceil|fract|fwidth|dFdx|dFdy)\s*\((.+)\)$/);
  if (match) return inferExpressionType(match[1], symbols);
  if (/^(?:dot|length|distance)\s*\(/.test(text)) return 'float';
  if (/^cross\s*\(/.test(text)) return 'vec3';
  if (/^(?:texture|texelFetch)\s*\(/.test(text)) return 'vec4';
  if (/^imageLoad\s*\(/.test(text)) return 'vec4';
  if (/^lsx_rt_render\s*\(/.test(text)) return 'vec4';
  if (/^lsx_rt_apply\s*\(/.test(text)) return 'vec4';

  match = text.match(/^(?:max|min|clamp|mix|smoothstep|step|pow)\s*\((.+)\)$/);
  if (match) {
    const first = splitTopLevelArgs(match[1])[0];
    if (first) return inferExpressionType(first, symbols);
  }

  // Indexing a declared storage array.
  match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\[/);
  if (match && symbols.has(`${match[1]}[]`)) return symbols.get(`${match[1]}[]`);

  // Binary math: keep the widest vector/matrix shape found in the expression.
  const identifiers = [...text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)].map((item) => item[1]);
  const known = identifiers.map((name) => symbols.get(name)).filter(Boolean);
  if (known.some((type) => /^mat[234]$/.test(type))) {
    const vector = known.find((type) => /^vec[234]$/.test(type));
    if (vector) return vector;
    return known.find((type) => /^mat[234]$/.test(type));
  }
  const vectors = known.filter((type) => /^vec[234]$/.test(type));
  if (vectors.length) return vectors.sort((a, b) => vectorSize(b) - vectorSize(a))[0];
  if (known.includes('float') || /\d+\.\d/.test(text)) return 'float';
  if (known.includes('uint')) return 'uint';
  if (known.includes('int')) return 'int';

  if (/[<>]=?|==|!=|&&|\|\|/.test(text)) return 'bool';
  return null;
}

function splitTopLevelArgs(text) {
  const result = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      result.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}

function validateNames(items, filePath) {
  const seen = new Map();
  for (const item of items) {
    if (seen.has(item.name)) fail(filePath, item.line, `shader name '${item.name}' is declared twice`, `The first declaration is on line ${seen.get(item.name)}.`);
    seen.set(item.name, item.line);
  }
}

function addSyntheticRayVertex(shader) {
  if (!shader.rayTracing || !shader.stages.has('fragment') || shader.stages.has('vertex')) return;
  const vertex = createStage('vertex', shader.line);
  vertex.body.push(
    { text: 'local corner = Vector2(Number((vertex.id << 1) & 2), Number(vertex.id & 2))', line: shader.line },
    { text: 'screen.position = Vector4(corner * 2.0 - 1.0, 0.0, 1.0)', line: shader.line },
  );
  shader.stages = new Map([['vertex', vertex], ...shader.stages]);
  shader.syntheticRayVertex = true;
}


function configureRaySurface(shader) {
  if (!shader.rayTracing || !shader.stages.has('vertex') || !shader.stages.has('fragment') || shader.syntheticRayVertex) return;
  const vertex = shader.stages.get('vertex');
  const fragment = shader.stages.get('fragment');
  const position = vertex.inputs.find((item) => item.name === 'position');
  // An input-free explicit vertex stage is the older full-screen ray-demo form.
  // Keep it compatible, but all ordinary geometry shaders use the universal
  // shared-scene path below.
  if (!position && vertex.inputs.length === 0) return;
  if (!position || position.type.glsl !== 'vec3') {
    fail(shader.filePath, vertex.line, "a universal ray-traced surface shader needs 'input position = Vector3' in its vertex stage", 'Keep position as a Vector3 vertex input. LSG meshes and model loaders use it to feed the shared ray scene.');
  }
  if (vertex.inputs[0] !== position) {
    fail(shader.filePath, position.line, "the universal ray position must be the first vertex input", 'Declare input position = Vector3 before normals, UVs, colors, and other vertex attributes so LSG and model loaders can share one geometry layout with the ray backend.');
  }
  const normal = vertex.inputs.find((item) => item.name === 'normal');
  if (normal && normal.type.glsl !== 'vec3') fail(shader.filePath, normal.line, "ray-traced vertex input 'normal' must be Vector3");
  const finalColor = fragment.outputs.find((item) => item.name === 'finalColor');
  if (!finalColor || finalColor.type.glsl !== 'vec4') {
    fail(shader.filePath, fragment.line, "a universal ray-traced surface shader needs 'output finalColor = Color4'", 'Your shader still owns finalColor; LSSL applies the selected ray features after your fragment main finishes.');
  }
  if (fragment.storage.some((item) => item.binding === 7 || item.name === 'lsxRaySceneData')) {
    fail(shader.filePath, fragment.line, 'storage slot 7 is reserved by universal ray tracing', 'Use storage slots 0 through 6 in ray-traced graphics shaders.');
  }
  const vector3 = parseFriendlyType('Vector3', shader.filePath, shader.line);
  const vector4 = parseFriendlyType('Vector4', shader.filePath, shader.line);
  vertex.outputs.push({ name: 'lsxRayWorldPosition', type: vector3, binding: null, line: shader.line });
  vertex.outputs.push({ name: 'lsxRayWorldNormal', type: vector3, binding: null, line: shader.line });
  fragment.inputs.push({ name: 'lsxRayWorldPosition', type: vector3, binding: null, line: shader.line });
  fragment.inputs.push({ name: 'lsxRayWorldNormal', type: vector3, binding: null, line: shader.line });
  fragment.storage.push({ name: 'lsxRaySceneData', elementType: vector4, binding: 7, line: shader.line, internalRayScene: true });

  const model = vertex.uniforms.find((item) => item.name === 'model' && item.type.glsl === 'mat4');
  const writesPosition = vertex.body.some((item) => /^ray\.position\s*=/.test(item.text.trim()) || /^lsxRayWorldPosition\s*=/.test(item.text.trim()));
  const writesNormal = vertex.body.some((item) => /^ray\.normal\s*=/.test(item.text.trim()) || /^lsxRayWorldNormal\s*=/.test(item.text.trim()));
  if (!writesPosition) {
    vertex.body.push({ text: model ? 'lsxRayWorldPosition = (model * Vector4(position,1.0)).xyz' : 'lsxRayWorldPosition = position', line: shader.line });
  }
  if (!writesNormal) {
    if (normal) vertex.body.push({ text: model ? 'lsxRayWorldNormal = normalize((model * Vector4(normal,0.0)).xyz)' : 'lsxRayWorldNormal = normalize(normal)', line: shader.line });
    else vertex.body.push({ text: 'lsxRayWorldNormal = Vector3(0.0,0.0,0.0)', line: shader.line });
  }
  shader.rayManualApply = fragment.body.some((item) => /\bray\.apply\s*\(/.test(item.text));
  shader.raySurface = true;
}

function stageLocations(shader) {
  const vertex = shader.stages.get('vertex');
  const fragment = shader.stages.get('fragment');
  if (!vertex || !fragment) return;

  let next = 0;
  const byName = new Map();
  for (const item of vertex.outputs) {
    if (item.binding !== null) {
      byName.set(item.name, item.binding);
      next = Math.max(next, item.binding + 1);
    }
  }
  for (const item of vertex.outputs) {
    if (!byName.has(item.name)) byName.set(item.name, next++);
    item.binding = byName.get(item.name);
  }
  for (const item of fragment.inputs) {
    if (byName.has(item.name)) item.binding = byName.get(item.name);
    else if (item.binding === null) item.binding = next++;
    const matching = vertex.outputs.find((output) => output.name === item.name);
    if (matching && matching.type.glsl !== item.type.glsl) {
      fail(shader.filePath, item.line, `fragment input '${item.name}' is ${item.type.friendly}, but the vertex stage outputs ${matching.type.friendly}`);
    }
    if (matching && Boolean(matching.flat) !== Boolean(item.flat)) {
      fail(shader.filePath, item.line, `fragment input '${item.name}' must use the same flat interpolation qualifier as the vertex output`);
    }
  }
}

function assignSequentialBindings(items) {
  const used = new Set(items.filter((item) => item.binding !== null).map((item) => item.binding));
  let next = 0;
  for (const item of items) {
    if (item.binding !== null) continue;
    while (used.has(next)) next++;
    item.binding = next;
    used.add(next);
    next++;
  }
}

function compileBody(stage, shader, target = 'opengl') {
  const symbols = new Map();
  for (const item of [...stage.inputs, ...stage.outputs, ...stage.uniforms, ...stage.textures, ...stage.images]) symbols.set(item.name, item.type.glsl);
  for (const item of stage.storage) {
    symbols.set(item.name, item.elementType.glsl);
    symbols.set(`${item.name}[]`, item.elementType.glsl);
  }
  symbols.set('gl_VertexID', 'int');
  symbols.set('gl_InstanceID', 'int');
  symbols.set('gl_GlobalInvocationID', 'uvec3');
  symbols.set('gl_LocalInvocationID', 'uvec3');
  symbols.set('gl_WorkGroupID', 'uvec3');
  symbols.set('gl_LocalInvocationIndex', 'uint');
  symbols.set('gl_FragCoord', 'vec4');

  const output = [];
  let indent = '    ';
  let controlDepth = 0;

  for (const statement of stage.body) {
    const raw = statement.text.trim();
    if (!raw) continue;

    if (raw === 'end') {
      if (controlDepth <= 0) fail(shader.filePath, statement.line, 'unexpected end inside shader main');
      controlDepth--;
      indent = '    ' + '    '.repeat(controlDepth);
      output.push(`${indent}}`);
      continue;
    }

    if (raw === 'else') {
      if (controlDepth <= 0) fail(shader.filePath, statement.line, 'else does not have a matching if');
      const level = '    ' + '    '.repeat(controlDepth - 1);
      output.push(`${level}} else {`);
      continue;
    }

    const elseIf = raw.match(/^else if\s+(.+)\s+then$/);
    if (elseIf) {
      if (controlDepth <= 0) fail(shader.filePath, statement.line, 'else if does not have a matching if');
      const level = '    ' + '    '.repeat(controlDepth - 1);
      output.push(`${level}} else if (${translateExpression(elseIf[1], target)}) {`);
      continue;
    }

    const ifMatch = raw.match(/^if\s+(.+)\s+then$/);
    if (ifMatch) {
      output.push(`${indent}if (${translateExpression(ifMatch[1], target)}) {`);
      controlDepth++;
      indent = '    ' + '    '.repeat(controlDepth);
      continue;
    }

    const whileMatch = raw.match(/^while\s+(.+)\s+do$/);
    if (whileMatch) {
      output.push(`${indent}while (${translateExpression(whileMatch[1], target)}) {`);
      controlDepth++;
      indent = '    ' + '    '.repeat(controlDepth);
      continue;
    }

    const localMatch = raw.match(/^local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (localMatch) {
      const name = localMatch[1];
      const expression = localMatch[2];
      const type = inferExpressionType(expression, symbols);
      if (!type) fail(shader.filePath, statement.line, `could not infer the GPU shape of local '${name}'`, `Wrap the value in Number(...), Whole(...), Unsigned(...), Vector2(...), Vector3(...), Vector4(...), Color3(...), Color4(...), or Matrix4(...).`);
      symbols.set(name, type);
      output.push(`${indent}${type} ${name} = ${translateExpression(expression, target)}; // LSSL line ${statement.line}`);
      continue;
    }

    if (raw === 'return') { output.push(`${indent}return;`); continue; }
    if (raw === 'discard') { output.push(`${indent}discard;`); continue; }
    const returnMatch = raw.match(/^return\s+(.+)$/);
    if (returnMatch) { output.push(`${indent}return ${translateExpression(returnMatch[1], target)};`); continue; }

    // A method-style image store becomes a complete statement.
    if (/^[A-Za-z_][A-Za-z0-9_]*\.store\s*\(/.test(raw)) {
      output.push(`${indent}${translateExpression(raw, target)}; // LSSL line ${statement.line}`);
      continue;
    }

    const assignment = raw.match(/^(.+?)\s*(\+=|-=|\*=|\/=|=)\s*(.+)$/);
    if (assignment) {
      output.push(`${indent}${translateExpression(assignment[1], target)} ${assignment[2]} ${translateExpression(assignment[3], target)}; // LSSL line ${statement.line}`);
      continue;
    }

    // Permit ordinary function calls such as barrier().
    if (/^[A-Za-z_][A-Za-z0-9_.]*\s*\(.*\)$/.test(raw)) {
      output.push(`${indent}${translateExpression(raw, target)}; // LSSL line ${statement.line}`);
      continue;
    }

    fail(shader.filePath, statement.line, `cannot translate shader statement '${raw}'`);
  }

  if (controlDepth !== 0) fail(shader.filePath, stage.line, `${stage.kind} main has an unterminated control block`);
  return output;
}

function legacyRayTracingLibrary(mode) {
  const common = `
struct LSXRayHit { float t; vec3 p; vec3 n; vec3 albedo; float mirror; float roughness; float metallic; float emissive; };
float lsx_saturate(float value) { return clamp(value,0.0,1.0); }
vec3 lsx_tonemap(vec3 color) {
    color=max(color,vec3(0.0));
    return clamp((color*(2.51*color+0.03))/(color*(2.43*color+0.59)+0.14),0.0,1.0);
}
vec3 lsx_finish(vec3 color) { return pow(lsx_tonemap(color),vec3(1.0/2.2)); }
vec3 lsx_sky(vec3 direction) {
    float amount=lsx_saturate(direction.y*0.5+0.5);
    vec3 horizon=vec3(0.62,0.72,0.86);
    vec3 zenith=vec3(0.075,0.14,0.28);
    vec3 color=mix(horizon,zenith,pow(amount,0.7));
    float sun=pow(max(dot(direction,normalize(vec3(-0.35,0.72,0.58))),0.0),512.0);
    return color+vec3(1.0,0.82,0.58)*sun*8.0;
}
vec3 lsx_camera_ray(vec2 pixel,vec3 eye,vec3 target,float fov) {
    vec2 size=max(lsxViewport,vec2(1.0));
    vec2 point=pixel/size*2.0-1.0;
    point.y=-point.y;
    point.x*=size.x/size.y;
    vec3 forward=normalize(target-eye);
    vec3 right=normalize(cross(forward,vec3(0.0,1.0,0.0)));
    vec3 up=cross(right,forward);
    float scale=tan(radians(fov)*0.5);
    return normalize(forward+point.x*scale*right+point.y*scale*up);
}
void lsx_write_hit(inout LSXRayHit hit,float t,vec3 p,vec3 n,vec3 albedo,float mirror,float roughness,float metallic,float emissive) {
    hit.t=t;hit.p=p;hit.n=normalize(n);hit.albedo=albedo;hit.mirror=mirror;hit.roughness=roughness;hit.metallic=metallic;hit.emissive=emissive;
}
bool lsx_sphere(vec3 ro,vec3 rd,vec3 center,float radius,vec3 albedo,float mirror,float roughness,float metallic,float emissive,inout LSXRayHit hit) {
    vec3 oc=ro-center;float b=dot(oc,rd);float c=dot(oc,oc)-radius*radius;float h=b*b-c;
    if(h<0.0)return false;h=sqrt(h);float t=-b-h;if(t<0.001)t=-b+h;if(t<0.001||t>=hit.t)return false;
    vec3 p=ro+rd*t;lsx_write_hit(hit,t,p,p-center,albedo,mirror,roughness,metallic,emissive);return true;
}
bool lsx_plane(vec3 ro,vec3 rd,vec3 normal,float distance,vec3 albedo,float mirror,float roughness,float metallic,inout LSXRayHit hit) {
    float denominator=dot(normal,rd);if(abs(denominator)<0.00001)return false;float t=-(dot(normal,ro)+distance)/denominator;
    if(t<0.001||t>=hit.t)return false;vec3 n=denominator<0.0?normal:-normal;lsx_write_hit(hit,t,ro+rd*t,n,albedo,mirror,roughness,metallic,0.0);return true;
}
bool lsx_box(vec3 ro,vec3 rd,vec3 center,vec3 halfSize,vec3 albedo,float mirror,float roughness,float metallic,inout LSXRayHit hit) {
    vec3 safeDirection=sign(rd)*max(abs(rd),vec3(0.000001));vec3 inverse=1.0/safeDirection;
    vec3 t0=(center-halfSize-ro)*inverse;vec3 t1=(center+halfSize-ro)*inverse;vec3 low=min(t0,t1);vec3 high=max(t0,t1);
    float nearT=max(max(low.x,low.y),low.z);float farT=min(min(high.x,high.y),high.z);if(farT<max(nearT,0.001))return false;
    float t=nearT>0.001?nearT:farT;if(t>=hit.t)return false;vec3 p=ro+rd*t;vec3 q=(p-center)/halfSize;vec3 absoluteQ=abs(q);vec3 n;
    if(absoluteQ.x>absoluteQ.y&&absoluteQ.x>absoluteQ.z)n=vec3(sign(q.x),0.0,0.0);else if(absoluteQ.y>absoluteQ.z)n=vec3(0.0,sign(q.y),0.0);else n=vec3(0.0,0.0,sign(q.z));
    lsx_write_hit(hit,t,p,n,albedo,mirror,roughness,metallic,0.0);return true;
}
vec2 lsx_disk_sample(int index,int count) {
    float fi=float(index)+0.5;float radius=sqrt(fi/float(count));float angle=fi*2.39996323;
    return vec2(cos(angle),sin(angle))*radius;
}
vec3 lsx_cosine_direction(vec3 normal,int index,int count) {
    float fi=float(index)+0.5;float radius=sqrt(fi/float(count));float angle=fi*2.39996323;float z=sqrt(max(0.0,1.0-radius*radius));
    vec3 local=vec3(cos(angle)*radius,sin(angle)*radius,z);vec3 helper=abs(normal.z)<0.999?vec3(0.0,0.0,1.0):vec3(1.0,0.0,0.0);
    vec3 tangent=normalize(cross(helper,normal));vec3 bitangent=cross(normal,tangent);return normalize(tangent*local.x+bitangent*local.y+normal*local.z);
}
vec3 lsx_surface_light(LSXRayHit hit,vec3 viewDirection,vec3 lightDirection,vec3 radiance,float visibility) {
    float ndl=max(dot(hit.n,lightDirection),0.0);if(ndl<=0.0)return vec3(0.0);
    vec3 halfway=normalize(lightDirection-viewDirection);float ndh=max(dot(hit.n,halfway),0.0);float vdh=max(dot(-viewDirection,halfway),0.0);
    float rough=max(hit.roughness,0.045);float power=mix(512.0,8.0,rough);float specularShape=pow(ndh,power)*(power+2.0)/8.0;
    vec3 f0=mix(vec3(0.04),hit.albedo,hit.metallic);vec3 fresnel=f0+(1.0-f0)*pow(1.0-vdh,5.0);
    vec3 diffuse=hit.albedo*(1.0-hit.metallic)*ndl/3.14159265;vec3 specular=fresnel*specularShape*ndl;
    return (diffuse+specular)*radiance*visibility;
}
`;
  const scenes = {
    shadows: `
bool lsx_scene(vec3 ro,vec3 rd,inout LSXRayHit hit) {
    bool any=false;
    any=lsx_plane(ro,rd,vec3(0.0,1.0,0.0),1.0,vec3(0.48,0.52,0.58),0.0,0.72,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(0.0,0.0,1.0),4.2,vec3(0.20,0.25,0.33),0.0,0.85,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(-1.35,-0.05,-0.20),vec3(0.88,0.95,0.88),vec3(0.95,0.28,0.11),0.0,0.28,0.0,hit)||any;
    any=lsx_sphere(ro,rd,vec3(1.05,0.10,0.25),1.10,vec3(0.08,0.45,0.95),0.05,0.18,0.0,0.0,hit)||any;
    return any;
}
float lsx_shadow_visibility(vec3 point,vec3 normal) {
    vec3 center=vec3(-2.8,5.5,3.1);float visible=0.0;
    for(int sampleIndex=0;sampleIndex<8;++sampleIndex){vec2 disk=lsx_disk_sample(sampleIndex,8)*0.95;vec3 samplePosition=center+vec3(disk.x,0.0,disk.y);vec3 toLight=samplePosition-point;float distanceToLight=length(toLight);vec3 direction=toLight/distanceToLight;LSXRayHit shadowHit;shadowHit.t=distanceToLight-0.025;if(!lsx_scene(point+normal*0.006,direction,shadowHit))visible+=1.0;}
    return visible/8.0;
}
vec3 lsx_shadow_sample(vec2 pixel,bool debugView) {
    vec3 eye=vec3(0.0,2.25,7.0);vec3 direction=lsx_camera_ray(pixel,eye,vec3(0.0,-0.05,-0.15),46.0);LSXRayHit hit;hit.t=1e20;
    if(!lsx_scene(eye,direction,hit))return lsx_sky(direction);
    float visibility=lsx_shadow_visibility(hit.p,hit.n);if(debugView)return vec3(visibility);
    vec3 lightPosition=vec3(-2.8,5.5,3.1);vec3 toLight=lightPosition-hit.p;float distanceToLight=length(toLight);vec3 radiance=vec3(20.0,17.5,14.0)/(1.0+0.12*distanceToLight*distanceToLight);
    vec3 color=lsx_surface_light(hit,direction,toLight/distanceToLight,radiance,visibility);color+=hit.albedo*(0.055+0.085*max(hit.n.y,0.0));
    return color;
}
vec4 lsx_rt_render(vec2 pixel,bool debugView) {vec3 color=lsx_shadow_sample(pixel,debugView);return vec4(debugView?color:lsx_finish(color),1.0);}
`,
    reflections: `
bool lsx_scene(vec3 ro,vec3 rd,inout LSXRayHit hit) {
    bool any=false;
    any=lsx_plane(ro,rd,vec3(0.0,1.0,0.0),1.0,vec3(0.055,0.16,0.22),0.72,0.12,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(0.0,0.0,1.0),4.4,vec3(0.30,0.34,0.42),0.08,0.48,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(1.0,0.0,0.0),4.0,vec3(0.18,0.21,0.28),0.0,0.75,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(-1.0,0.0,0.0),4.0,vec3(0.18,0.21,0.28),0.0,0.75,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(-1.45,-0.05,-0.55),vec3(0.72,0.95,0.72),vec3(0.96,0.20,0.075),0.08,0.24,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(1.45,-0.25,-1.35),vec3(0.82,0.75,0.82),vec3(0.08,0.80,0.42),0.10,0.20,0.0,hit)||any;
    any=lsx_sphere(ro,rd,vec3(0.15,0.05,0.65),1.03,vec3(0.92),0.96,0.035,1.0,0.0,hit)||any;
    return any;
}
float lsx_reflection_shadow(vec3 point,vec3 normal,vec3 lightPosition) {vec3 toLight=lightPosition-point;float distanceToLight=length(toLight);LSXRayHit blocker;blocker.t=distanceToLight-0.03;return lsx_scene(point+normal*0.006,toLight/distanceToLight,blocker)?0.12:1.0;}
vec3 lsx_reflection_lighting(LSXRayHit hit,vec3 rayDirection) {vec3 light=vec3(-2.6,5.4,2.8);vec3 toLight=light-hit.p;float distanceToLight=length(toLight);float visibility=lsx_reflection_shadow(hit.p,hit.n,light);vec3 radiance=vec3(18.0,15.5,13.0)/(1.0+0.10*distanceToLight*distanceToLight);return lsx_surface_light(hit,rayDirection,toLight/distanceToLight,radiance,visibility)+hit.albedo*0.045;}
vec3 lsx_reflection_sample(vec2 pixel,bool debugView) {
    vec3 eye=vec3(0.0,1.7,6.7);vec3 direction=lsx_camera_ray(pixel,eye,vec3(0.0,-0.12,-0.45),47.0);LSXRayHit hit;hit.t=1e20;
    if(!lsx_scene(eye,direction,hit))return lsx_sky(direction);vec3 base=lsx_reflection_lighting(hit,direction);vec3 reflectedContribution=vec3(0.0);
    if(hit.mirror>0.01){vec3 normal=hit.n;if(hit.n.y>0.92)normal=normalize(hit.n+vec3(sin(hit.p.x*3.8+hit.p.z*1.4)*0.025,0.0,cos(hit.p.z*4.2-hit.p.x)*0.025));vec3 reflected=reflect(direction,normal);LSXRayHit second;second.t=1e20;reflectedContribution=lsx_sky(reflected);if(lsx_scene(hit.p+normal*0.008,reflected,second)){reflectedContribution=lsx_reflection_lighting(second,reflected);if(second.mirror>0.55){vec3 thirdDirection=reflect(reflected,second.n);LSXRayHit third;third.t=1e20;vec3 thirdColor=lsx_sky(thirdDirection);if(lsx_scene(second.p+second.n*0.008,thirdDirection,third))thirdColor=lsx_reflection_lighting(third,thirdDirection);reflectedContribution=mix(reflectedContribution,thirdColor,second.mirror*0.65);}}float facing=lsx_saturate(dot(-direction,normal));float fresnel=0.04+0.96*pow(1.0-facing,5.0);base=mix(base,reflectedContribution,max(hit.mirror,fresnel));}
    if(debugView)return reflectedContribution;return base;
}
vec4 lsx_rt_render(vec2 pixel,bool debugView) {vec3 color=lsx_reflection_sample(pixel,debugView);return vec4(lsx_finish(color),1.0);}
`,
    gi: `
bool lsx_scene(vec3 ro,vec3 rd,inout LSXRayHit hit) {
    bool any=false;
    /* A clean Cornell-cave room: neutral floor/ceiling/back, warm left wall,
       cool right wall, and two differently sized blocks that visibly receive
       the wall colors through one-bounce indirect light. */
    any=lsx_plane(ro,rd,vec3(0.0,1.0,0.0),1.35,vec3(0.76,0.74,0.70),0.0,0.72,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(0.0,-1.0,0.0),3.55,vec3(0.70,0.69,0.67),0.0,0.82,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(1.0,0.0,0.0),3.20,vec3(0.82,0.075,0.035),0.0,0.74,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(-1.0,0.0,0.0),3.20,vec3(0.035,0.11,0.82),0.0,0.74,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(0.0,0.0,1.0),4.55,vec3(0.67,0.66,0.63),0.0,0.86,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(-1.15,-0.33,-0.88),vec3(0.76,1.02,0.76),vec3(0.72,0.69,0.63),0.0,0.58,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(1.08,-0.66,0.18),vec3(0.70,0.69,0.70),vec3(0.62,0.66,0.72),0.0,0.48,0.0,hit)||any;
    any=lsx_sphere(ro,rd,vec3(0.0,2.78,-1.20),0.24,vec3(1.0,0.72,0.38),0.0,0.18,0.0,15.0,hit)||any;
    return any;
}
float lsx_gi_visibility(vec3 point,vec3 normal,vec3 samplePosition) {
    vec3 toLight=samplePosition-point;float distanceToLight=length(toLight);LSXRayHit blocker;blocker.t=distanceToLight-0.27;
    return lsx_scene(point+normal*0.008,toLight/distanceToLight,blocker)?0.0:1.0;
}
vec3 lsx_gi_direct_soft(LSXRayHit hit,vec3 rayDirection) {
    vec3 lightCenter=vec3(0.0,2.78,-1.20);vec3 total=vec3(0.0);
    for(int lightSample=0;lightSample<3;++lightSample){vec2 disk=lsx_disk_sample(lightSample,3)*0.42;vec3 samplePosition=lightCenter+vec3(disk.x,0.0,disk.y);vec3 toLight=samplePosition-hit.p;float distanceToLight=length(toLight);float visibility=lsx_gi_visibility(hit.p,hit.n,samplePosition);vec3 radiance=vec3(38.0,29.0,18.0)/(1.0+0.13*distanceToLight*distanceToLight);total+=lsx_surface_light(hit,rayDirection,toLight/distanceToLight,radiance,visibility);}
    return total/3.0+hit.albedo*hit.emissive;
}
vec3 lsx_gi_direct_fast(LSXRayHit hit,vec3 rayDirection) {
    vec3 light=vec3(0.0,2.78,-1.20);vec3 toLight=light-hit.p;float distanceToLight=length(toLight);float visibility=lsx_gi_visibility(hit.p,hit.n,light);vec3 radiance=vec3(36.0,27.0,16.0)/(1.0+0.13*distanceToLight*distanceToLight);
    return lsx_surface_light(hit,rayDirection,toLight/distanceToLight,radiance,visibility)+hit.albedo*hit.emissive;
}
vec3 lsx_gi_sample(vec2 pixel,bool debugView) {
    vec3 eye=vec3(0.0,0.78,7.15);vec3 direction=lsx_camera_ray(pixel,eye,vec3(0.0,0.38,-0.82),49.0);LSXRayHit hit;hit.t=1e20;
    if(!lsx_scene(eye,direction,hit))return vec3(0.008,0.010,0.016);
    vec3 direct=lsx_gi_direct_soft(hit,direction);vec3 indirect=vec3(0.0);
    /* Cosine-weighted fixed samples are stable from frame to frame. There is
       no animated grain, so the color bounce reads clearly without a temporal
       denoiser. */
    for(int sampleIndex=0;sampleIndex<6;++sampleIndex){vec3 bounceDirection=lsx_cosine_direction(hit.n,sampleIndex,6);LSXRayHit bounce;bounce.t=7.5;if(lsx_scene(hit.p+hit.n*0.009,bounceDirection,bounce)){vec3 incoming=lsx_gi_direct_fast(bounce,bounceDirection);incoming+=bounce.albedo*(0.035+0.10*max(bounce.n.y,0.0));indirect+=incoming;}else{indirect+=vec3(0.012,0.016,0.026);}}
    indirect=(indirect/6.0)*hit.albedo*1.72;
    /* A small diffuse floor keeps totally hidden corners readable without
       washing out the red/blue bounce that this scene is meant to teach. */
    if(debugView)return indirect*1.45;
    return direct+indirect+hit.albedo*0.012;
}
vec4 lsx_rt_render(vec2 pixel,bool debugView) {
    vec3 color=lsx_gi_sample(pixel,debugView);
    return vec4(lsx_finish(color),1.0);
}
`,
    ao: `
bool lsx_scene(vec3 ro,vec3 rd,inout LSXRayHit hit) {
    bool any=false;
    any=lsx_plane(ro,rd,vec3(0.0,1.0,0.0),1.0,vec3(0.72),0.0,0.82,0.0,hit)||any;
    any=lsx_plane(ro,rd,vec3(0.0,0.0,1.0),4.6,vec3(0.34,0.38,0.46),0.0,0.85,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(-2.05,-0.68,-0.95),vec3(0.43,0.32,0.70),vec3(0.93,0.29,0.12),0.0,0.58,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(-1.03,-0.40,-0.52),vec3(0.49,0.60,0.70),vec3(0.95,0.60,0.13),0.0,0.58,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(0.02,-0.10,-0.08),vec3(0.53,0.90,0.70),vec3(0.18,0.66,0.96),0.0,0.52,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(1.10,0.20,-0.52),vec3(0.56,1.20,0.70),vec3(0.30,0.85,0.38),0.0,0.52,0.0,hit)||any;
    any=lsx_box(ro,rd,vec3(2.23,0.50,-0.95),vec3(0.59,1.50,0.70),vec3(0.69,0.34,0.92),0.0,0.52,0.0,hit)||any;
    return any;
}
float lsx_ambient_visibility(LSXRayHit hit) {float occlusion=0.0;float radius=1.65;for(int sampleIndex=0;sampleIndex<8;++sampleIndex){vec3 direction=lsx_cosine_direction(hit.n,sampleIndex,8);LSXRayHit blocker;blocker.t=radius;if(lsx_scene(hit.p+hit.n*0.007,direction,blocker))occlusion+=1.0-blocker.t/radius;}return 1.0-occlusion/8.0;}
vec3 lsx_ao_sample(vec2 pixel,bool debugView) {vec3 eye=vec3(0.20,2.40,7.9);vec3 direction=lsx_camera_ray(pixel,eye,vec3(0.0,0.10,-0.58),47.0);LSXRayHit hit;hit.t=1e20;if(!lsx_scene(eye,direction,hit))return lsx_sky(direction);float visibility=lsx_ambient_visibility(hit);if(debugView)return vec3(visibility);vec3 light=vec3(-3.2,6.2,4.2);vec3 toLight=light-hit.p;float distanceToLight=length(toLight);LSXRayHit blocker;blocker.t=distanceToLight-0.03;float shadow=lsx_scene(hit.p+hit.n*0.007,toLight/distanceToLight,blocker)?0.18:1.0;vec3 radiance=vec3(14.0)/(1.0+0.08*distanceToLight*distanceToLight);vec3 color=lsx_surface_light(hit,direction,toLight/distanceToLight,radiance,shadow);color+=hit.albedo*(0.035+0.18*visibility);return color*(0.35+0.65*visibility);}
vec4 lsx_rt_render(vec2 pixel,bool debugView) {vec3 color=lsx_ao_sample(pixel,debugView);return vec4(debugView?color:lsx_finish(color),1.0);}
`
  };
  return common + (scenes[mode] || scenes.shadows);
}



function raySurfaceLibrary(shader) {
  const mask = shader.rayTracing.mask;
  const uniformNames = new Set(shader.vulkanUniformLayout.entries.map((item) => item.name));
  let cameraExpression = 'vec3(0.0,0.0,5.0)';
  if (uniformNames.has('cameraPosition')) cameraExpression = 'cameraPosition';
  else if (uniformNames.has('camera_position')) cameraExpression = 'camera_position';
  else if (uniformNames.has('view')) cameraExpression = 'inverse(view)[3].xyz';
  return `
#define LSX_RT_SHADOWS 1
#define LSX_RT_AO 2
#define LSX_RT_GI 4
#define LSX_RT_REFLECTIONS 8
const int LSX_RT_MASK = ${mask};
const int LSX_RT_HEADER_VECS = 19;
const int LSX_RT_TRIANGLE_VECS = 5;
struct LSXSceneHit { float t; vec3 position; vec3 normal; vec3 albedo; float roughness; float metallic; float emissive; };
float lsx_rt_saturate(float value){return clamp(value,0.0,1.0);}
vec3 lsx_rt_camera_position(){return ${cameraExpression};}
void lsx_rt_basis(vec3 normal,out vec3 tangent,out vec3 bitangent){vec3 helper=abs(normal.y)<0.999?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);tangent=normalize(cross(helper,normal));bitangent=cross(normal,tangent);}
vec3 lsx_rt_hemisphere(vec3 normal,int index,int count){float fi=float(index)+0.5;float radius=sqrt(fi/float(count));float angle=fi*2.39996323;float z=sqrt(max(0.0,1.0-radius*radius));vec3 t,b;lsx_rt_basis(normal,t,b);return normalize(t*(cos(angle)*radius)+b*(sin(angle)*radius)+normal*z);}
bool lsx_rt_triangle(vec3 ro,vec3 rd,vec3 v0,vec3 e1,vec3 e2,float maxT,out float t){vec3 p=cross(rd,e2);float determinant=dot(e1,p);if(abs(determinant)<0.0000001)return false;float inverse=1.0/determinant;vec3 s=ro-v0;float u=dot(s,p)*inverse;if(u<0.0||u>1.0)return false;vec3 q=cross(s,e1);float v=dot(rd,q)*inverse;if(v<0.0||u+v>1.0)return false;t=dot(e2,q)*inverse;return t>0.001&&t<maxT;}
float lsx_rt_aabb_near(vec3 ro,vec3 inverseDirection,vec3 minimum,vec3 maximum,float maxT){vec3 first=(minimum-ro)*inverseDirection;vec3 second=(maximum-ro)*inverseDirection;vec3 nearValues=min(first,second);vec3 farValues=max(first,second);float nearT=max(max(nearValues.x,nearValues.y),max(nearValues.z,0.0));float farT=min(min(farValues.x,farValues.y),farValues.z);return farT>=nearT&&nearT<maxT?nearT:-1.0;}
void lsx_rt_load_hit(int triangle,vec3 ro,vec3 rd,float t,out LSXSceneHit hit){int base=LSX_RT_HEADER_VECS+triangle*LSX_RT_TRIANGLE_VECS;vec4 a=lsxRaySceneData[base+0];vec4 b=lsxRaySceneData[base+1];vec4 c=lsxRaySceneData[base+2];vec4 d=lsxRaySceneData[base+3];vec4 material=lsxRaySceneData[base+4];hit.t=t;hit.position=ro+rd*t;hit.normal=normalize(d.xyz);if(dot(hit.normal,rd)>0.0)hit.normal=-hit.normal;hit.albedo=material.rgb;hit.roughness=clamp(a.w,0.02,1.0);hit.metallic=clamp(b.w,0.0,1.0);hit.emissive=max(c.w,0.0);}
bool lsx_rt_trace(vec3 ro,vec3 rd,float maxT,out LSXSceneHit hit){int triangleCount=max(int(lsxRaySceneData[0].x+0.5),0);int nodeCount=max(int(lsxRaySceneData[0].y+0.5),0);hit.t=maxT;bool found=false;if(nodeCount<=0){for(int triangle=0;triangle<triangleCount;++triangle){int base=LSX_RT_HEADER_VECS+triangle*LSX_RT_TRIANGLE_VECS;float t;if(lsx_rt_triangle(ro,rd,lsxRaySceneData[base].xyz,lsxRaySceneData[base+1].xyz,lsxRaySceneData[base+2].xyz,hit.t,t)){lsx_rt_load_hit(triangle,ro,rd,t,hit);found=true;}}return found;}int nodeBase=LSX_RT_HEADER_VECS+triangleCount*LSX_RT_TRIANGLE_VECS;vec3 inverseDirection=1.0/rd;vec4 rootMinimum=lsxRaySceneData[nodeBase];vec4 rootMaximum=lsxRaySceneData[nodeBase+1];float rootNear=lsx_rt_aabb_near(ro,inverseDirection,rootMinimum.xyz,rootMaximum.xyz,hit.t);if(rootNear<0.0)return false;int stack[64];float nearStack[64];int top=0;stack[top]=0;nearStack[top++]=rootNear;while(top>0){--top;int node=stack[top];float nodeNear=nearStack[top];if(nodeNear>=hit.t)continue;vec4 minimum=lsxRaySceneData[nodeBase+node*2];vec4 maximum=lsxRaySceneData[nodeBase+node*2+1];int second=int(maximum.w);if(second<0){int first=max(int(minimum.w),0);int count=-second;for(int local=0;local<4;++local){if(local>=count)break;int triangle=first+local;int base=LSX_RT_HEADER_VECS+triangle*LSX_RT_TRIANGLE_VECS;float t;if(lsx_rt_triangle(ro,rd,lsxRaySceneData[base].xyz,lsxRaySceneData[base+1].xyz,lsxRaySceneData[base+2].xyz,hit.t,t)){lsx_rt_load_hit(triangle,ro,rd,t,hit);found=true;}}}else{int left=max(int(minimum.w),0);int right=second;vec4 leftMinimum=lsxRaySceneData[nodeBase+left*2];vec4 leftMaximum=lsxRaySceneData[nodeBase+left*2+1];vec4 rightMinimum=lsxRaySceneData[nodeBase+right*2];vec4 rightMaximum=lsxRaySceneData[nodeBase+right*2+1];float leftNear=lsx_rt_aabb_near(ro,inverseDirection,leftMinimum.xyz,leftMaximum.xyz,hit.t);float rightNear=lsx_rt_aabb_near(ro,inverseDirection,rightMinimum.xyz,rightMaximum.xyz,hit.t);if(leftNear>=0.0&&rightNear>=0.0&&top<62){if(leftNear<rightNear){stack[top]=right;nearStack[top++]=rightNear;stack[top]=left;nearStack[top++]=leftNear;}else{stack[top]=left;nearStack[top++]=leftNear;stack[top]=right;nearStack[top++]=rightNear;}}else if(leftNear>=0.0&&top<64){stack[top]=left;nearStack[top++]=leftNear;}else if(rightNear>=0.0&&top<64){stack[top]=right;nearStack[top++]=rightNear;}}}return found;}
bool lsx_rt_occluded(vec3 ro,vec3 rd,float maxT){int triangleCount=max(int(lsxRaySceneData[0].x+0.5),0);int nodeCount=max(int(lsxRaySceneData[0].y+0.5),0);if(nodeCount<=0){for(int triangle=0;triangle<triangleCount;++triangle){int base=LSX_RT_HEADER_VECS+triangle*LSX_RT_TRIANGLE_VECS;float t;if(lsx_rt_triangle(ro,rd,lsxRaySceneData[base].xyz,lsxRaySceneData[base+1].xyz,lsxRaySceneData[base+2].xyz,maxT,t))return true;}return false;}int nodeBase=LSX_RT_HEADER_VECS+triangleCount*LSX_RT_TRIANGLE_VECS;vec3 inverseDirection=1.0/rd;vec4 rootMinimum=lsxRaySceneData[nodeBase];vec4 rootMaximum=lsxRaySceneData[nodeBase+1];float rootNear=lsx_rt_aabb_near(ro,inverseDirection,rootMinimum.xyz,rootMaximum.xyz,maxT);if(rootNear<0.0)return false;int stack[64];int top=0;stack[top++]=0;while(top>0){int node=stack[--top];vec4 minimum=lsxRaySceneData[nodeBase+node*2];vec4 maximum=lsxRaySceneData[nodeBase+node*2+1];int second=int(maximum.w);if(second<0){int first=max(int(minimum.w),0);int count=-second;for(int local=0;local<4;++local){if(local>=count)break;int triangle=first+local;int base=LSX_RT_HEADER_VECS+triangle*LSX_RT_TRIANGLE_VECS;float t;if(lsx_rt_triangle(ro,rd,lsxRaySceneData[base].xyz,lsxRaySceneData[base+1].xyz,lsxRaySceneData[base+2].xyz,maxT,t))return true;}}else{int left=max(int(minimum.w),0);int right=second;vec4 leftMinimum=lsxRaySceneData[nodeBase+left*2];vec4 leftMaximum=lsxRaySceneData[nodeBase+left*2+1];vec4 rightMinimum=lsxRaySceneData[nodeBase+right*2];vec4 rightMaximum=lsxRaySceneData[nodeBase+right*2+1];float leftNear=lsx_rt_aabb_near(ro,inverseDirection,leftMinimum.xyz,leftMaximum.xyz,maxT);float rightNear=lsx_rt_aabb_near(ro,inverseDirection,rightMinimum.xyz,rightMaximum.xyz,maxT);if(leftNear>=0.0&&rightNear>=0.0&&top<62){if(leftNear<rightNear){stack[top++]=right;stack[top++]=left;}else{stack[top++]=left;stack[top++]=right;}}else if(leftNear>=0.0&&top<64)stack[top++]=left;else if(rightNear>=0.0&&top<64)stack[top++]=right;}}return false;}
float lsx_rt_visibility(vec3 position,vec3 normal,vec3 direction,float maximum){return lsx_rt_occluded(position+normal*0.004,direction,maximum)?0.0:1.0;}
float lsx_rt_shadow(vec3 position,vec3 normal){vec4 sun=lsxRaySceneData[1];vec3 direction=normalize(-sun.xyz);float sunWeight=max(sun.w,0.001);float sunFacing=max(dot(normal,direction),0.0);float total=(sunFacing>0.0001?lsx_rt_visibility(position,normal,direction,100000.0):1.0)*sunWeight;float weight=sunWeight;int pointCount=clamp(int(lsxRaySceneData[0].z+0.5),0,8);for(int light=0;light<pointCount;++light){vec4 point=lsxRaySceneData[3+light*2];vec4 pointColor=lsxRaySceneData[4+light*2];vec3 delta=point.xyz-position;float distanceToLight=length(delta);if(distanceToLight<point.w){vec3 pointDirection=delta/max(distanceToLight,0.0001);float pointFacing=max(dot(normal,pointDirection),0.0);float falloff=1.0-distanceToLight/max(point.w,0.0001);float lightWeight=max(pointColor.w*falloff*falloff,0.001);total+=(pointFacing>0.0001?lsx_rt_visibility(position,normal,pointDirection,distanceToLight-0.01):1.0)*lightWeight;weight+=lightWeight;}}return total/max(weight,0.001);}
float lsx_rt_ao(vec3 position,vec3 normal){float open=0.0;const int samples=8;for(int i=0;i<samples;++i){vec3 direction=lsx_rt_hemisphere(normal,i,samples);LSXSceneHit hit;if(!lsx_rt_trace(position+normal*0.004,direction,2.25,hit))open+=1.0;else open+=clamp(hit.t/2.25,0.0,1.0);}return open/float(samples);}
vec3 lsx_rt_direct_hit(LSXSceneHit hit){vec4 sun=lsxRaySceneData[1];vec4 sunColor=lsxRaySceneData[2];vec3 lightDirection=normalize(-sun.xyz);float ndl=max(dot(hit.normal,lightDirection),0.0);float visibility=ndl>0.0001?lsx_rt_visibility(hit.position,hit.normal,lightDirection,100000.0):0.0;vec3 result=hit.albedo*(sunColor.w+ndl*sun.w*visibility)*sunColor.rgb;int pointCount=clamp(int(lsxRaySceneData[0].z+0.5),0,8);for(int light=0;light<pointCount;++light){vec4 point=lsxRaySceneData[3+light*2];vec4 pointColor=lsxRaySceneData[4+light*2];vec3 delta=point.xyz-hit.position;float distanceToLight=length(delta);if(distanceToLight<point.w){vec3 pointDirection=delta/max(distanceToLight,0.0001);float pointNdl=max(dot(hit.normal,pointDirection),0.0);if(pointNdl>0.0001){float falloff=1.0-distanceToLight/max(point.w,0.0001);float pointVisibility=lsx_rt_visibility(hit.position,hit.normal,pointDirection,distanceToLight-0.01);result+=hit.albedo*pointColor.rgb*(pointColor.w*falloff*falloff*pointNdl*pointVisibility);}}}result+=hit.albedo*hit.emissive;return result;}
vec3 lsx_rt_gi(vec3 position,vec3 normal,vec3 base){vec3 indirect=vec3(0.0);const int samples=4;for(int i=0;i<samples;++i){vec3 direction=lsx_rt_hemisphere(normal,i,samples);LSXSceneHit bounce;if(lsx_rt_trace(position+normal*0.005,direction,8.0,bounce))indirect+=lsx_rt_direct_hit(bounce)*bounce.albedo;else indirect+=lsxRaySceneData[2].rgb*lsxRaySceneData[2].w;}return indirect*(base/float(samples))*0.55;}
vec3 lsx_rt_reflection(vec3 position,vec3 normal,vec3 viewDirection,vec3 base){vec3 reflected=reflect(-viewDirection,normal);LSXSceneHit hit;if(!lsx_rt_trace(position+normal*0.006,reflected,1000.0,hit))return lsxRaySceneData[2].rgb*0.12;vec3 color=lsx_rt_direct_hit(hit);float facing=lsx_rt_saturate(dot(normal,viewDirection));float fresnel=0.04+0.96*pow(1.0-facing,5.0);return mix(base,color,clamp(0.18+fresnel*0.42,0.0,0.72));}
vec4 lsx_rt_apply(vec4 source,vec3 position,vec3 suppliedNormal){if(lsxRaySceneData[0].w<0.5)return source;vec3 camera=lsx_rt_camera_position();vec3 viewDirection=normalize(camera-position);vec3 normal=suppliedNormal;if(dot(normal,normal)<0.01)normal=normalize(cross(dFdx(position),dFdy(position)));else normal=normalize(normal);if(dot(normal,viewDirection)<0.0)normal=-normal;vec3 color=source.rgb;if((LSX_RT_MASK&LSX_RT_SHADOWS)!=0){float shadow=lsx_rt_shadow(position,normal);color*=mix(0.16,1.0,shadow);}if((LSX_RT_MASK&LSX_RT_AO)!=0){float ao=lsx_rt_ao(position,normal);color*=0.32+0.68*ao;}if((LSX_RT_MASK&LSX_RT_GI)!=0)color+=lsx_rt_gi(position,normal,source.rgb);if((LSX_RT_MASK&LSX_RT_REFLECTIONS)!=0)color=lsx_rt_reflection(position,normal,viewDirection,color);return vec4(max(color,vec3(0.0)),source.a);}
`;
}

function alignTo(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function std140TypeInfo(glsl, filePath, line) {
  const table = {
    float: [4, 4], int: [4, 4], uint: [4, 4], bool: [4, 4],
    vec2: [8, 8], vec3: [16, 16], vec4: [16, 16],
    mat2: [16, 32], mat3: [16, 48], mat4: [16, 64],
  };
  const info = table[glsl];
  if (!info) fail(filePath, line, `uniform type '${glsl}' is not supported by the Vulkan automatic uniform block`, 'Use Number, Whole, Unsigned, Truth, Vector2, Vector3, Vector4, Color3, Color4, Matrix2, Matrix3, or Matrix4.');
  return { alignment: info[0], size: info[1] };
}

function collectVulkanUniforms(shader) {
  const result = [];
  const byName = new Map();
  let offset = 0;
  for (const kind of ['vertex', 'fragment']) {
    const stage = shader.stages.get(kind);
    if (!stage) continue;
    for (const item of stage.uniforms) {
      const existing = byName.get(item.name);
      if (existing) {
        if (existing.type.glsl !== item.type.glsl) fail(shader.filePath, item.line, `uniform '${item.name}' has different shapes in two shader stages`);
        continue;
      }
      const info = std140TypeInfo(item.type.glsl, shader.filePath, item.line);
      offset = alignTo(offset, info.alignment);
      const entry = { ...item, offset, size: info.size };
      result.push(entry);
      byName.set(item.name, entry);
      offset += info.size;
    }
  }
  const bytes = alignTo(offset, 16);
  if (bytes > 1024) fail(shader.filePath, shader.line, `Vulkan automatic uniforms need ${bytes} bytes but LSG currently allows 1024`, 'Move large data into a storage buffer.');
  return { entries: result, bytes };
}

function compileStage(stage, shader, target = 'opengl') {
  validateNames([...stage.inputs, ...stage.outputs, ...stage.uniforms, ...stage.textures, ...stage.images, ...stage.storage], shader.filePath);
  assignSequentialBindings(stage.inputs);
  assignSequentialBindings(stage.outputs);
  assignSequentialBindings(stage.textures);
  assignSequentialBindings(stage.images);
  assignSequentialBindings(stage.storage);

  const version = target === 'vulkan' ? '#version 450' : '#version 460 core';
  const lines = [version, '', `// Generated from ${path.basename(shader.filePath)} by LazyScriptEX LSSL for ${target}.`];
  if (stage.kind === 'compute') {
    lines.push(`layout(local_size_x = ${stage.workers[0]}, local_size_y = ${stage.workers[1]}, local_size_z = ${stage.workers[2]}) in;`);
  }
  for (const item of stage.inputs) lines.push(`layout(location = ${item.binding}) ${item.flat ? 'flat ' : ''}in ${item.type.glsl} ${item.name};`);
  for (const item of stage.outputs) lines.push(`layout(location = ${item.binding}) ${item.flat ? 'flat ' : ''}out ${item.type.glsl} ${item.name};`);
  if (target === 'vulkan' && stage.kind !== 'compute' && shader.vulkanUniformLayout.entries.length > 0) {
    lines.push('layout(std140, set = 1, binding = 0) uniform LSXAutomaticUniforms {');
    for (const item of shader.vulkanUniformLayout.entries) lines.push(`    layout(offset = ${item.offset}) ${item.type.glsl} ${item.name};`);
    lines.push('};');
  } else {
    for (const item of stage.uniforms) lines.push(`uniform ${item.type.glsl} ${item.name};`);
  }
  for (const item of stage.textures) {
    const binding = target === 'vulkan' ? `set = 0, binding = ${item.binding}` : `binding = ${item.binding}`;
    lines.push(`layout(${binding}) uniform ${item.type.glsl} ${item.name};`);
  }
  for (const item of stage.images) {
    const access = item.access === 'read' ? 'readonly ' : item.access === 'write' ? 'writeonly ' : '';
    const binding = target === 'vulkan' ? `set = 0, binding = ${item.binding}` : `binding = ${item.binding}`;
    lines.push(`layout(${item.format}, ${binding}) uniform ${access}image2D ${item.name};`);
  }
  for (const item of stage.storage) {
    const blockName = `${item.name[0].toUpperCase()}${item.name.slice(1)}Buffer`;
    const vulkanBinding = stage.kind === 'compute' ? item.binding : item.binding + 8;
    const binding = target === 'vulkan' ? `set = 0, binding = ${vulkanBinding}` : `binding = ${item.binding}`;
    lines.push(`layout(std430, ${binding}) buffer ${blockName} { ${item.elementType.glsl} ${item.name}[]; };`);
  }
  if (shader.rayTracing && stage.kind === 'fragment') lines.push('', shader.raySurface ? raySurfaceLibrary(shader) : legacyRayTracingLibrary(shader.rayTracing.features[0]));
  lines.push('', 'void main()', '{');
  lines.push(...compileBody(stage, shader, target));
  if (shader.raySurface && stage.kind === 'fragment' && !shader.rayManualApply) lines.push('    finalColor = lsx_rt_apply(finalColor, lsxRayWorldPosition, lsxRayWorldNormal);');
  if (target === 'vulkan' && stage.kind === 'vertex') lines.push('    gl_Position.z = (gl_Position.z + gl_Position.w) * 0.5;');
  lines.push('}', '');
  return lines.join('\n');
}

function escapeRawForLsx(text) {
  // LSX backtick strings are raw except for interpolation. Avoid accidental
  // interpolation in generated shader comments/source.
  return String(text).replace(/\$\{/g, '$\\{').replace(/`/g, '\\`');
}

const SPIRV_CACHE_VERSION = 'lsx-lssl-spirv-0.21.6-extension-intelligence-v1';
const spirvMemoryCache = new Map();

function spirvCacheKey(source, kind) {
  // File names occur only in generated comments and must not force identical
  // shaders in two projects to pay the glslang cost twice.
  const canonical = String(source).replace(/^\/\/ Generated from .* by LazyScriptEX LSSL for (?:opengl|vulkan)\.$/m, '// Generated by LazyScriptEX LSSL.');
  return crypto.createHash('sha256').update(SPIRV_CACHE_VERSION).update('\0').update(kind).update('\0').update(canonical).digest('hex');
}

function readSpirvCache(cacheFile) {
  try {
    const words = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (Array.isArray(words) && words.length > 4 && Number(words[0]) === 0x07230203 && words.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) return words;
  } catch (_) {}
  return null;
}

function writeSpirvCache(cacheFile, words) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const temporary = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(words), 'utf8');
    try { fs.renameSync(temporary, cacheFile); }
    catch (_) { fs.rmSync(temporary, { force: true }); }
  } catch (_) {
    // Shader compilation must never fail merely because the optional cache is
    // unavailable or the temporary directory is read-only.
  }
}

function spirvCacheDirectory() {
  return process.env.LSX_LSSL_CACHE_DIR || path.join(os.tmpdir(), 'lazyscriptex-lssl-cache');
}

function ensureSpirvBinary(source, kind, words) {
  const cacheFile = path.join(spirvCacheDirectory(), `${spirvCacheKey(source, kind)}.spv`);
  const expectedBytes = words.length * 4;
  try {
    const stat = fs.statSync(cacheFile);
    if (stat.isFile() && stat.size === expectedBytes) return cacheFile;
  } catch (_) {}
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const bytes = Buffer.allocUnsafe(expectedBytes);
  words.forEach((word, index) => bytes.writeUInt32LE(Number(word >>> 0), index * 4));
  const temporary = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, bytes);
  try { fs.renameSync(temporary, cacheFile); }
  catch (_) { fs.rmSync(temporary, { force: true }); }
  return cacheFile;
}

function escapeLsxStringValue(value) {
  // Forward slashes are accepted by Windows and avoid introducing accidental
  // LSX string escapes into generated compiler-only paths.
  return String(value).replace(/\\/g, '/').replace(/"/g, '\\"');
}

function compileSpirv(source, kind, filePath) {
  const key = spirvCacheKey(source, kind);
  if (spirvMemoryCache.has(key)) return spirvMemoryCache.get(key).slice();
  const cacheDirectory = spirvCacheDirectory();
  const cacheFile = path.join(cacheDirectory, `${key}.json`);
  const cached = readSpirvCache(cacheFile);
  if (cached) {
    spirvMemoryCache.set(key, cached);
    return cached.slice();
  }

  const messages = [];
  const oldWarn = console.warn;
  console.warn = (...parts) => messages.push(parts.join(' '));
  try {
    const result = glslang().compileGLSL(source, kind);
    const words = Array.from(result, (value) => Number(value >>> 0));
    spirvMemoryCache.set(key, words);
    writeSpirvCache(cacheFile, words);
    return words.slice();
  } catch (error) {
    const detail = messages.join('\n').trim();
    const reason = detail || error.message || String(error);
    const wrapped = new Error(`${filePath}: Vulkan ${kind} shader compilation failed: ${reason}`);
    wrapped.filePath = filePath;
    throw wrapped;
  } finally {
    console.warn = oldWarn;
  }
}

function compileLsslSource(source, filePath = '<shader>') {
  const shader = parseLssl(source, filePath);
  addSyntheticRayVertex(shader);
  configureRaySurface(shader);
  if (shader.rayTracing && !shader.raySurface && shader.rayTracing.features.length > 1) {
    fail(filePath, shader.rayTracing.line, 'multiple ray-tracing features require a normal geometry vertex/fragment shader', 'The fragment-only procedural diagnostic form supports one mode. Add input position = Vector3 to a normal vertex stage to combine shadows, AO, GI, and reflections on shared LSG geometry.');
  }
  // Ray scenes always know the current render size without making beginners
  // declare or update a viewport uniform themselves.
  if (shader.rayTracing && !shader.raySurface && shader.stages.has('fragment')) {
    const fragment = shader.stages.get('fragment');
    if (!fragment.uniforms.some((item) => item.name === 'lsxViewport')) {
      fragment.uniforms.push({ name: 'lsxViewport', type: parseFriendlyType('Vector2', filePath, shader.line), binding: null, line: shader.line });
    }
  }
  stageLocations(shader);
  shader.vulkanUniformLayout = collectVulkanUniforms(shader);
  const rayModelUniform = shader.vulkanUniformLayout.entries.find((item) => item.name === 'model' && item.type.glsl === 'mat4');
  // Every graphics shader reports its model-matrix offset. That lets ordinary
  // non-ray material passes keep the shared ray scene transforms current too;
  // ray-enabled shaders are not required to be the pass that last drew a mesh.
  shader.rayModelOffset = rayModelUniform ? rayModelUniform.offset : -1;

  const generated = {};
  const vulkanGenerated = {};
  const spirv = {};
  for (const [kind, stage] of shader.stages) {
    generated[kind] = compileStage(stage, shader, 'opengl');
    try {
      vulkanGenerated[kind] = compileStage(stage, shader, 'vulkan');
      spirv[kind] = compileSpirv(vulkanGenerated[kind], kind, filePath);
    } catch (error) {
      if (shader.requireVulkan) throw error;
      vulkanGenerated[kind] = null;
      spirv[kind] = [];
    }
  }

  const spirvBinaries = {};
  for (const [kind, words] of Object.entries(spirv)) {
    if (words && words.length > 0) spirvBinaries[kind] = ensureSpirvBinary(vulkanGenerated[kind], kind, words);
  }

  const lsx = [];
  lsx.push(`-- Generated in memory from ${path.basename(filePath)}.`);
  lsx.push(`export const name = "${shader.name}"`);
  lsx.push(`export const has_vertex = ${generated.vertex ? 'true' : 'false'}`);
  lsx.push(`export const has_fragment = ${generated.fragment ? 'true' : 'false'}`);
  lsx.push(`export const has_compute = ${generated.compute ? 'true' : 'false'}`);
  lsx.push(`export const requires_ray_tracing = ${shader.rayTracing ? 'true' : 'false'}`);
  lsx.push(`export const ray_tracing_mode = "${shader.rayTracing ? shader.rayTracing.features.join(' ') : ''}"`);
  lsx.push(`export const ray_tracing_mask = ${shader.rayTracing ? shader.rayTracing.mask : 0}`);
  lsx.push(`export const ray_surface = ${shader.raySurface ? 'true' : 'false'}`);
  lsx.push(`export const ray_fullscreen_vertex = ${shader.syntheticRayVertex ? 'true' : 'false'}`);
  if (generated.vertex) {
    const vertexStage = shader.stages.get('vertex');
    const attributeSizes = [];
    for (const input of vertexStage.inputs) {
      const type = input.type.glsl;
      const vector = type.match(/^vec([234])$/);
      const matrix = type.match(/^mat([234])$/);
      if (vector) attributeSizes.push(Number(vector[1]));
      else if (matrix) {
        const size = Number(matrix[1]);
        for (let column = 0; column < size; column++) attributeSizes.push(size);
      } else if (type === 'float' || type === 'int' || type === 'uint' || type === 'bool') attributeSizes.push(1);
      else fail(filePath, input.line, `vertex input '${input.name}' cannot be stored in a mesh`, 'Use Number, Whole, Unsigned, Truth, Vector2, Vector3, Vector4, Matrix2, Matrix3, or Matrix4 for vertex inputs.');
    }
    if (attributeSizes.length > 15) fail(filePath, vertexStage.line, 'a vertex stage may use at most 15 attribute locations');
    let layout = 0n;
    let components = 0;
    attributeSizes.forEach((size, index) => {
      layout |= BigInt(size) << BigInt(index * 4);
      components += size;
    });
    lsx.push(`export const vertex_layout = ${layout.toString()}`);
    lsx.push(`export const vertex_components = ${components}`);
    lsx.push(`export const vertex_attributes = ${attributeSizes.length}`);
  } else {
    lsx.push('export const vertex_layout = 0');
    lsx.push('export const vertex_components = 0');
    lsx.push('export const vertex_attributes = 0');
  }
  lsx.push(`export const uniform_bytes = ${shader.vulkanUniformLayout.bytes}`);
  lsx.push(`export const uniform_count = ${shader.vulkanUniformLayout.entries.length}`);
  lsx.push(`export const pipeline_flags = ${((shader.overlay || shader.syntheticRayVertex) ? 1 : 0) | (shader.triangleStrip ? 2 : 0)}`);
  if (generated.vertex) lsx.push(`export const vertex = \`${escapeRawForLsx(generated.vertex)}\``);
  if (generated.fragment) lsx.push(`export const fragment = \`${escapeRawForLsx(generated.fragment)}\``);
  if (generated.compute) lsx.push(`export const compute = \`${escapeRawForLsx(generated.compute)}\``);
  const vulkanGraphicsReady = Boolean(spirv.vertex && spirv.vertex.length > 0 && spirv.fragment && spirv.fragment.length > 0);
  const vulkanComputeReady = Boolean(spirv.compute && spirv.compute.length > 0);
  const vulkanReady = vulkanGraphicsReady || vulkanComputeReady;
  lsx.push(`export const vulkan_ready = ${vulkanReady ? 'true' : 'false'}`);
  if (generated.vertex && generated.fragment) {
    lsx.unshift('use "@LazyScript/LSSL.lsx" as LSSL');
    lsx.push('export fn create()');
    if (shader.rayTracing) {
      lsx.push('    if not LSSL.ray_tracing_enabled() then return LSSL.unavailable("Call LSG.set_ray_tracing(true) before creating this ray-tracing shader.") end');
    }
    lsx.push('    if LSSL.using_vulkan() then');
    if (vulkanGraphicsReady) {
      lsx.push(`        local vertex_binary = memory.embed_binary("${escapeLsxStringValue(spirvBinaries.vertex)}")`);
      lsx.push(`        local fragment_binary = memory.embed_binary("${escapeLsxStringValue(spirvBinaries.fragment)}")`);
      lsx.push(`        local shader = LSSL.create_graphics(vertex,fragment,vertex_binary,${(spirv.vertex || []).length},fragment_binary,${(spirv.fragment || []).length},vertex_layout,pipeline_flags,${shader.rayTracing ? shader.rayTracing.mask : 0},${shader.rayModelOffset})`);
      for (const uniform of shader.vulkanUniformLayout.entries) lsx.push(`        shader.register_uniform("${uniform.name}",${uniform.offset})`);
      if (shader.rayTracing && !shader.raySurface) lsx.push('        shader.auto_viewport = true');
      lsx.push('        memory.free(vertex_binary)');
      lsx.push('        memory.free(fragment_binary)');
      lsx.push('        return shader');
    } else {
      lsx.push(`        return LSSL.unavailable("${shader.name} cannot be used by Vulkan because its LSSL source could not be compiled to SPIR-V.")`);
    }
    lsx.push('    end');
    if (shader.rayTracing) lsx.push('    return LSSL.unavailable("Shared ray tracing currently requires the Vulkan backend.")');
    else lsx.push('    return LSSL.create(vertex,fragment)');
    lsx.push('end');
  }
  if (generated.compute && !generated.vertex && !generated.fragment) {
    lsx.unshift('use "@LazyScript/LSSL.lsx" as LSSL');
    lsx.push('export fn create()');
    lsx.push('    if LSSL.using_vulkan() then');
    if (vulkanComputeReady) {
      lsx.push(`        local compute_binary = memory.embed_binary("${escapeLsxStringValue(spirvBinaries.compute)}")`);
      lsx.push(`        local shader = LSSL.create_compute_embedded(compute,compute_binary,${(spirv.compute || []).length})`);
      lsx.push('        memory.free(compute_binary)');
      lsx.push('        return shader');
    } else {
      lsx.push(`        return LSSL.unavailable("${shader.name} cannot be used by Vulkan because its LSSL compute source could not be compiled to SPIR-V.")`);
    }
    lsx.push('    end');
    lsx.push('    return LSSL.create_compute(compute)');
    lsx.push('end');
  }
  lsx.push('');

  return { shader, generated, vulkanGenerated, spirv, lsxSource: lsx.join('\n') };
}

module.exports = {
  TYPE_MAP,
  parseLssl,
  compileLsslSource,
  translateExpression,
  inferExpressionType,
  compileStage,
};
