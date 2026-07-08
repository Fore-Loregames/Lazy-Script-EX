#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bindingsRoot = path.join(root, 'bindings');
const outputRoot = path.join(root, 'api');
fs.mkdirSync(outputRoot, { recursive: true });

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.lsx')) out.push(full);
  }
  return out;
}

function moduleName(file) {
  const rel = path.relative(bindingsRoot, file).replace(/\\/g, '/').replace(/\.lsx$/, '');
  if (rel === 'GLFW/GLFW') return 'GLFW';
  if (rel === 'OpenGL/OpenGL46') return 'OpenGL';
  if (rel === 'OpenAL/OpenAL') return 'OpenAL';
  return rel;
}

function commentBefore(lines, line) {
  const out = [];
  let i = line - 1;
  while (i >= 0 && /^\s*$/.test(lines[i])) i--;
  while (i >= 0 && /^\s*--(?!\[\[)/.test(lines[i])) {
    out.unshift(lines[i].replace(/^\s*--\s?/, '').trim());
    i--;
  }
  return out.join('\n');
}

function fallbackDescription(module, kind, name, owner = '', dll = '') {
  const qualified = owner ? `${owner}.${name}` : name;
  if (kind === 'constant') return `${module} constant ${name}.`;
  if (kind === 'field') return `Native field ${qualified} with a fixed compile-time layout.`;
  if (kind === 'typed object' || kind === 'typed struct') return `Packed native LSX type ${name} with fixed field offsets and direct method calls.`;
  if (module === 'OpenGL') return `OpenGL API binding for ${name}${dll ? ` imported through ${dll}` : ''}.`;
  if (module === 'GLFW') return `GLFW window, input, monitor, or context API binding for ${name}${dll ? ` imported through ${dll}` : ''}.`;
  if (module === 'OpenAL' || module.startsWith('OpenAL/')) return `OpenAL audio API binding for ${name}${dll ? ` imported through ${dll}` : ''}.`;
  if (module === 'System/Threading') return `Native operating-system threading or synchronization operation ${qualified}.`;
  if (module === 'System/File') return `Native UTF-8 file-system operation ${qualified}.`;
  if (module === 'System/Log') return `Thread-safe persistent text logging operation ${qualified}.`;
  if (module === 'Data/Json') return `LSX-native JSON DOM operation ${qualified}.`;
  if (module === 'Network/Sockets') return `Native WinSock2 networking operation ${qualified}.`;
  if (module === 'Network/Http') return `Native WinHTTP HTTP/HTTPS operation ${qualified}.`;
  if (module === 'Graphics/Media') return `Native media-runtime diagnostic operation ${qualified}.`;
  if (module === 'Graphics/STBImage') return `Direct stb_image operation ${qualified}.`;
  if (module === 'Graphics/Image') return `stb_image compatibility operation ${qualified}.`;
  if (module === 'Graphics/Texture2D') return `OpenGL texture loading and ownership operation ${qualified}.`;
  if (module === 'Text/FreeTypeRaw') return `Direct FreeType C API operation ${qualified}.`;
  if (module === 'Text/FreeType') return `Typed FreeType face or glyph operation ${qualified}.`;
  if (module === 'Text/Font') return `FreeType SDF atlas, upload, or text-mesh operation ${qualified}.`;
  if (module === 'Math/GLMRaw') return `Internal GLM native bridge operation ${qualified}; normal engine code should import Math/GLM instead.`;
  if (module === 'Math/GLM') return `GLM-backed LSX math operation ${qualified} with native C++ details hidden behind the typed wrapper.`;
  if (module === 'Math/Camera') return `Typed LSX camera operation ${qualified} built on the wrapped GLM transform and projection APIs.`;
  if (module === 'Math/OpenGL') return `Direct OpenGL uniform upload helper for wrapped GLM matrix data: ${qualified}.`;
  if (module === 'UI/LazyUI') return kind === 'method' ? `Retained LazyUI ${owner} operation ${qualified}.` : `Native LSHTML/LSCSS element, style, event, layout, or canvas operation ${qualified}.`;
  if (module === 'UI/Renderer') return `Batched LazyUI OpenGL renderer operation ${qualified}.`;
  if (module === 'UI/ShaderSources') return `Embedded LazyUI shader source ${qualified}.`;
  if (kind === 'method') return `Method ${qualified} on a packed native LSX object.`;
  return `${module} ${kind} ${qualified}.`;
}

function extractObject(lines, start, module, rel, owner) {
  let depth = 0;
  const selected = [];
  const members = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    selected.push(line);
    let inString = false;
    let escaped = false;
    for (const ch of line) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    let match;
    if ((match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*fn\s*\(([^)]*)\)\s*(?:->\s*([^\s,}]+))?/))) {
      if (match[1].startsWith('_')) continue;
      const returnType = match[3] ? ` -> ${match[3]}` : '';
      const signature = `${match[1]}(${match[2].trim()})${returnType}`;
      const description = commentBefore(lines, i) || fallbackDescription(module, 'method', match[1], owner);
      members.push({ module, kind: 'method', owner, name: match[1], signature, description, source: rel, line: i + 1 });
    } else if ((match = line.match(/^\s*([A-Za-z_]\w*)\s*:\s*([^=,]+?)\s*=/))) {
      if (match[1].startsWith('_')) continue;
      const signature = `${match[1]}: ${match[2].trim()}`;
      const description = commentBefore(lines, i) || fallbackDescription(module, 'field', match[1], owner);
      members.push({ module, kind: 'field', owner, name: match[1], signature, description, source: rel, line: i + 1 });
    }
    if (depth <= 0 && i > start) return { text: selected.join('\n'), end: i, members };
  }
  return { text: selected.join('\n'), end: lines.length - 1, members };
}

const entries = [];
for (const file of walk(bindingsRoot).sort()) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const module = moduleName(file);
  const rel = path.relative(root, file).replace(/\\/g, '/');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    let match;
    if ((match = trimmed.match(/^export\s+extern\s+"([^"]+)"\s+fn\s+([A-Za-z_]\w*)/))) {
      const description = commentBefore(lines, i) || fallbackDescription(module, 'raw function', match[2], '', match[1]);
      entries.push({ module, kind: 'raw function', name: match[2], signature: trimmed.replace(/^export\s+extern\s+"[^"]+"\s+fn\s+/, ''), description, dll: match[1], source: rel, line: i + 1 });
      continue;
    }
    if ((match = trimmed.match(/^export\s+fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([A-Za-z_][A-Za-z0-9_.<>]*))?/))) {
      if (match[1].startsWith('_')) continue;
      const description = commentBefore(lines, i) || fallbackDescription(module, 'typed function', match[1]);
      const signature = `${match[1]}(${match[2].trim()})${match[3] ? ` -> ${match[3]}` : ''}`;
      entries.push({ module, kind: 'typed function', name: match[1], signature, description, source: rel, line: i + 1 });
      continue;
    }
    if ((match = trimmed.match(/^export\s+const\s+([A-Za-z_]\w*)\s*=\s*\{/))) {
      const block = extractObject(lines, i, module, rel, match[1]);
      const description = commentBefore(lines, i) || fallbackDescription(module, 'typed object', match[1]);
      entries.push({ module, kind: 'typed object', name: match[1], signature: `const ${match[1]}`, description, source: rel, line: i + 1 });
      entries.push(...block.members);
      i = block.end;
      continue;
    }
    if ((match = trimmed.match(/^export\s+struct\s+([A-Za-z_]\w*)/))) {
      const selected = [lines[i]];
      const members = [];
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        selected.push(lines[j]); end = j;
        const field = lines[j].match(/^\s*([A-Za-z_]\w*)\s*:\s*(.+?)\s*$/);
        if (field && !field[1].startsWith('_')) members.push({ module, kind: 'field', owner: match[1], name: field[1], signature: `${field[1]}: ${field[2]}`, description: commentBefore(lines, j) || fallbackDescription(module, 'field', field[1], match[1]), source: rel, line: j + 1 });
        if (/^\s*end\s*$/.test(lines[j])) break;
      }
      const description = commentBefore(lines, i) || fallbackDescription(module, 'typed struct', match[1]);
      entries.push({ module, kind: 'typed struct', name: match[1], signature: `struct ${match[1]}`, description, source: rel, line: i + 1 });
      entries.push(...members);
      i = end;
      continue;
    }
    if ((match = trimmed.match(/^export\s+const\s+([A-Za-z_]\w*)\s*=\s*(.+)$/))) {
      const description = commentBefore(lines, i) || fallbackDescription(module, 'constant', match[1]);
      entries.push({ module, kind: 'constant', name: match[1], signature: trimmed, description, source: rel, line: i + 1 });
      continue;
    }
    if ((match = trimmed.match(/^export\s+([A-Za-z_]\w*)\s*=\s*(.+)$/))) {
      const description = commentBefore(lines, i) || fallbackDescription(module, 'constant', match[1]);
      entries.push({ module, kind: 'constant', name: match[1], signature: trimmed, description, source: rel, line: i + 1 });
      continue;
    }
  }
}

entries.push({
  module: 'Language/Packed literals',
  kind: 'compiler feature',
  name: 'numeric positional inference',
  signature: 'local vertices = {-1.0,0.0,1.0}  -- packed f32\nlocal indices = {0,1,2}          -- packed u32',
  description: 'Infers one homogeneous contiguous native element type for non-empty positional numeric literals. Decimal values become f32; non-negative integer literals that fit in 32 bits become u32.',
  source: 'docs/LANGUAGE.md',
  line: 87,
});

entries.push({
  module: 'Language/Collection',
  kind: 'compiler method',
  owner: 'collection',
  name: 'copy_from_ptr',
  signature: 'copy_from_ptr(source:ptr, byte_count:i64) -> bool',
  description: 'Copies a foreign native byte buffer into an already-sized compiler-inferred contiguous collection after validating destination capacity.',
  source: 'docs/LANGUAGE.md',
  line: 111,
});

for (const entry of [
  ['resize_bytes', 'resize_bytes(byte_count:i64) -> bool', 'Establishes annotation-free packed u8 storage and resizes it to an exact byte count.'],
  ['reserve_bytes', 'reserve_bytes(byte_capacity:i64) -> bool', 'Establishes annotation-free packed u8 storage and reserves byte capacity without changing length.'],
  ['byte_data', 'byte_data() -> ptr', 'Returns the native pointer for an inferred packed u8 collection.'],
  ['copy_bytes_from_ptr', 'copy_bytes_from_ptr(source:ptr, byte_count:i64) -> bool', 'Copies a foreign native byte block into an already-sized inferred packed u8 collection.'],
]) entries.push({
  module: 'Language/Collection', kind: 'compiler method', owner: 'collection',
  name: entry[0], signature: entry[1], description: entry[2], source: 'docs/LANGUAGE.md', line: 114,
});

const manifestPath = path.join(bindingsRoot, 'BINDING_MANIFEST.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const stats = entries.reduce((acc, e) => {
  acc.total++;
  acc.modules[e.module] = (acc.modules[e.module] || 0) + 1;
  acc.kinds[e.kind] = (acc.kinds[e.kind] || 0) + 1;
  return acc;
}, { total: 0, modules: {}, kinds: {} });

const data = { generatedAt: new Date().toISOString(), manifest, stats, entries };
fs.writeFileSync(path.join(outputRoot, 'api-data.json'), JSON.stringify(data, null, 2));

const safeJson = JSON.stringify(data).replace(/</g, '\\u003c').replace(/-->/g, '--\\>');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LazyScriptEX Native GameKit and LazyUI API</title>
<style>
:root{color-scheme:dark;--bg:#0b0e14;--panel:#121722;--panel2:#171e2b;--line:#273144;--text:#e8edf5;--muted:#9ca9bc;--accent:#78a9ff;--green:#76d7a5;--orange:#ffc078;--purple:#c7a0ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 Inter,Segoe UI,system-ui,sans-serif}header{position:sticky;top:0;z-index:5;background:rgba(11,14,20,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(14px)}.head{max-width:1500px;margin:auto;padding:18px 24px}.title{display:flex;gap:14px;align-items:center}.logo{width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#4b7bec,#8e6cef);display:grid;place-items:center;font-weight:800}.title h1{font-size:21px;margin:0}.title p{margin:1px 0 0;color:var(--muted)}.toolbar{display:grid;grid-template-columns:minmax(260px,1fr) 190px 190px auto;gap:10px;margin-top:15px}input,select,button{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:8px;padding:10px 12px;font:inherit}button{cursor:pointer}button:hover{border-color:var(--accent)}main{max-width:1500px;margin:auto;padding:22px 24px 50px}.notice{background:linear-gradient(135deg,#131b2a,#171a29);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:18px}.notice h2{font-size:18px;margin:0 0 8px}.notice code{color:var(--green)}.stats{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}.pill{background:var(--panel2);border:1px solid var(--line);padding:6px 10px;border-radius:999px;color:var(--muted)}.pill strong{color:var(--text)}#results{display:grid;gap:10px}.entry{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}.entry-head{display:flex;gap:12px;align-items:center;padding:12px 14px;background:var(--panel2)}.entry-name{font:600 15px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}.badge{margin-left:auto;font-size:12px;border-radius:999px;padding:3px 8px;border:1px solid var(--line)}.raw-function{color:var(--accent)}.typed-function,.typed-object{color:var(--green)}.constant{color:var(--orange)}pre{margin:0;padding:13px 14px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#0d1119;color:#dce7f7;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.description{padding:11px 14px;color:var(--muted);border-top:1px solid var(--line)}.meta{padding:7px 14px;color:var(--muted);font-size:12px;border-top:1px solid var(--line)}.empty{text-align:center;color:var(--muted);padding:60px}.pager{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:18px}.guides{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-bottom:18px}.guide{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}.guide h3{margin:0 0 6px;font-size:15px}.guide p{margin:0;color:var(--muted)}kbd{border:1px solid var(--line);background:#080b10;padding:1px 5px;border-radius:4px}@media(max-width:800px){.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1}.head,main{padding-left:14px;padding-right:14px}}
</style>
</head>
<body>
<header><div class="head"><div class="title"><div class="logo">LSX</div><div><h1>Native GameKit and LazyUI API</h1><p>Native LSX language, LazyUI LSHTML/LSCSS, canvas, GLM, GLFW, OpenGL 4.6, OpenAL, threading, files, JSON, images, SDF fonts, sockets, HTTP, and platform APIs.</p></div></div><div class="toolbar"><input id="q" autofocus placeholder="Search functions, constants, signatures… (Ctrl+K)"><select id="module"><option value="">All modules</option></select><select id="kind"><option value="">All entry types</option></select><button id="clear">Clear</button></div></div></header>
<main>
<section class="notice"><h2>Native objects, first-class LSHTML/LSCSS, and no front-end memory plumbing.</h2><p>Normal code uses compiler-inferred packed literals, packed LSX objects, and annotation-free contiguous collections. GLM vectors, matrices, quaternions, transforms, projections, and cameras are exposed through an LSX-first layer while the C++ ABI stays internal. Threading maps LSX functions to real OS workers, files map to native KERNEL32 operations, sockets map to WinSock2, and HTTP/HTTPS maps to WinHTTP. Raw memory remains an explicit interop escape hatch. LazyUI markup and styles live directly in <code>.lsx</code> files and lower to retained element functions without a browser or virtual DOM.</p><div class="stats" id="stats"></div></section>
<section class="guides"><article class="guide"><h3>Inline LSHTML and LSCSS</h3><p>Declare retained UI trees and styles directly in <code>.lsx</code> files. Elements are normal LSX functions, props are ordinary objects, and runtime code never reparses or diffs markup.</p></article><article class="guide"><h3>LazyUI canvas and shader</h3><p>Use the retained canvas for paths and custom drawing. The dedicated shader batches rounded corners, borders, shadows, outlines, gradients, text, and images.</p></article><article class="guide"><h3>Packed geometry literals</h3><p>Use normal <code>local vertices = {...}</code> and <code>local indices = {...}</code> syntax. Decimal lists compile as contiguous <code>f32</code>; non-negative 32-bit integer lists compile as contiguous <code>u32</code>.</p></article><article class="guide"><h3>GLM math and cameras</h3><p>Import <code>Math/GLM</code> and <code>Math/Camera</code> for typed vectors, matrices, quaternions, TRS, projections, decomposition, and camera view/projection matrices without native pointers.</p></article><article class="guide"><h3>Project layout</h3><p>Keep <code>LazyScript/</code> beside <code>Projects/</code>. Imports use <code>@LazyScript/...</code>, so copied projects do not need path rewrites.</p></article><article class="guide"><h3>Recursive VS Code indexing</h3><p>Open the toolkit root. The extension indexes every <code>.lsx</code> file below every workspace folder and watches changes.</p></article><article class="guide"><h3>No per-frame size allocations</h3><p>Create <code>GLFW.FramebufferSize.new()</code> once, call <code>refresh(window)</code>, and destroy it at shutdown.</p></article><article class="guide"><h3>Real worker threads</h3><p>Use <code>System/Threading</code> for native threads, atomics, locks, events, condition variables, TLS, priority, and affinity.</p></article><article class="guide"><h3>Persistent text logs</h3><p>Use <code>System/Log</code> for flushed stage, info, warning, error, and success records. Every executable also writes <code>LazyScriptEX-runtime.log</code> for start, clean exit, or native crash.</p></article><article class="guide"><h3>Files and JSON</h3><p>Use <code>System/File</code> for UTF-8/binary files and <code>Data/Json</code> for native LSX parsing, construction, and serialization.</p></article><article class="guide"><h3>Native networking</h3><p>Use <code>Network/Sockets</code> for TCP/UDP and <code>Network/Http</code> for HTTP/HTTPS without a Python, JavaScript, or managed runtime.</p></article><article class="guide"><h3>Exact low-level access</h3><p>The raw C-shaped APIs remain searchable for advanced interop while normal game code stays object-based.</p></article></section>
<div id="results"></div><div class="pager"><button id="prev">Previous</button><span id="page"></span><button id="next">Next</button></div>
</main>
<script id="api-data" type="application/json">${safeJson}</script>
<script>
const data=JSON.parse(document.getElementById('api-data').textContent);const q=document.getElementById('q'),moduleSel=document.getElementById('module'),kindSel=document.getElementById('kind'),results=document.getElementById('results'),pageLabel=document.getElementById('page');let page=0;const pageSize=100;
for(const name of Object.keys(data.stats.modules).sort()){const o=document.createElement('option');o.value=name;o.textContent=name+' ('+data.stats.modules[name]+')';moduleSel.appendChild(o)}for(const name of Object.keys(data.stats.kinds).sort()){const o=document.createElement('option');o.value=name;o.textContent=name+' ('+data.stats.kinds[name]+')';kindSel.appendChild(o)}
const s=document.getElementById('stats');const labels=[['Entries',data.stats.total],['GLFW raw functions',data.manifest.glfwFunctions],['OpenGL functions',data.manifest.openGLFunctions],['OpenAL functions',data.manifest.openALFunctions],['Threading APIs',data.stats.modules['System/Threading']||0],['File APIs',data.stats.modules['System/File']||0],['Logging APIs',data.stats.modules['System/Log']||0],['JSON APIs',data.stats.modules['Data/Json']||0],['Socket APIs',data.stats.modules['Network/Sockets']||0],['HTTP APIs',data.stats.modules['Network/Http']||0],['Media APIs',data.stats.modules['Graphics/Media']||0],['stb_image APIs',data.stats.modules['Graphics/STBImage']||0],['Image compatibility APIs',data.stats.modules['Graphics/Image']||0],['FreeType raw APIs',data.stats.modules['Text/FreeTypeRaw']||0],['FreeType typed APIs',data.stats.modules['Text/FreeType']||0],['Texture APIs',data.stats.modules['Graphics/Texture2D']||0],['SDF font APIs',data.stats.modules['Text/Font']||0],['GLM typed APIs',data.stats.modules['Math/GLM']||0],['GLM raw bridge APIs',data.stats.modules['Math/GLMRaw']||0],['Camera APIs',data.stats.modules['Math/Camera']||0],['GLM OpenGL APIs',data.stats.modules['Math/OpenGL']||0],['LazyUI APIs',data.stats.modules['UI/LazyUI']||0],['LazyUI renderer APIs',data.stats.modules['UI/Renderer']||0]];for(const [k,v] of labels){const n=document.createElement('span');n.className='pill';n.innerHTML='<strong>'+v+'</strong> '+k;s.appendChild(n)}
function escapeHtml(v){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function filtered(){const term=q.value.trim().toLowerCase();return data.entries.filter(e=>(!moduleSel.value||e.module===moduleSel.value)&&(!kindSel.value||e.kind===kindSel.value)&&(!term||(e.name+' '+(e.owner||'')+' '+e.signature+' '+(e.description||'')+' '+e.module+' '+e.kind).toLowerCase().includes(term)))}
function render(){const list=filtered();const pages=Math.max(1,Math.ceil(list.length/pageSize));if(page>=pages)page=pages-1;if(page<0)page=0;results.innerHTML='';const slice=list.slice(page*pageSize,(page+1)*pageSize);if(!slice.length)results.innerHTML='<div class="empty">No matching API entries.</div>';for(const e of slice){const el=document.createElement('article');el.className='entry';const cls=e.kind.replaceAll(' ','-');const qualified=e.module+'.'+(e.owner?e.owner+'.':'')+e.name;el.innerHTML='<div class="entry-head"><span class="entry-name">'+escapeHtml(qualified)+'</span><span class="badge '+cls+'">'+escapeHtml(e.kind)+'</span></div><pre>'+escapeHtml(e.signature)+'</pre><div class="description">'+escapeHtml(e.description||'No description available.')+'</div><div class="meta">'+escapeHtml(e.source)+':'+e.line+(e.dll?' · '+escapeHtml(e.dll):'')+'</div>';results.appendChild(el)}pageLabel.textContent=(list.length?(page*pageSize+1)+'–'+Math.min((page+1)*pageSize,list.length)+' of '+list.length:'0 results');document.getElementById('prev').disabled=page===0;document.getElementById('next').disabled=page>=pages-1;history.replaceState(null,'','#q='+encodeURIComponent(q.value)+'&module='+encodeURIComponent(moduleSel.value)+'&kind='+encodeURIComponent(kindSel.value))}
for(const el of [q,moduleSel,kindSel])el.addEventListener(el===q?'input':'change',()=>{page=0;render()});document.getElementById('clear').onclick=()=>{q.value='';moduleSel.value='';kindSel.value='';page=0;render();q.focus()};document.getElementById('prev').onclick=()=>{page--;render();scrollTo(0,0)};document.getElementById('next').onclick=()=>{page++;render();scrollTo(0,0)};addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();q.focus();q.select()}});const params=new URLSearchParams(location.hash.slice(1));q.value=params.get('q')||'';moduleSel.value=params.get('module')||'';kindSel.value=params.get('kind')||'';render();
</script>
</body></html>`;
fs.writeFileSync(path.join(outputRoot, 'index.html'), html);
console.log(`Generated ${entries.length} API entries in ${path.join(outputRoot, 'index.html')}`);
