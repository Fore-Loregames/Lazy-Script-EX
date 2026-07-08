'use strict';

// Inline LSHTML/LSCSS lowering for LazyScriptEX.
// The declarations live in ordinary .lsx modules and are lowered to normal LSX
// functions before the native compiler lexer runs. No HTML/CSS runtime is added.

function hashText(text) {
  let hash = 5381;
  for (const byte of Buffer.from(String(text), 'utf8')) hash = (Math.imul(hash, 33) + byte) % 2147483647;
  return hash >>> 0;
}

function isIdentStart(ch) { return /[A-Za-z_]/.test(ch || ''); }
function isIdent(ch) { return /[A-Za-z0-9_]/.test(ch || ''); }

function skipTrivia(source, state) {
  while (state.i < source.length) {
    if (/\s/.test(source[state.i])) { state.i++; continue; }
    if (source.startsWith('--[[', state.i)) {
      const end = source.indexOf(']]', state.i + 4);
      state.i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith('--', state.i)) {
      const end = source.indexOf('\n', state.i + 2);
      state.i = end < 0 ? source.length : end + 1;
      continue;
    }
    break;
  }
}

function readIdentifier(source, state, label = 'identifier') {
  skipTrivia(source, state);
  const start = state.i;
  if (!isIdentStart(source[state.i])) throw new Error(`expected ${label}`);
  state.i++;
  while (isIdent(source[state.i])) state.i++;
  return source.slice(start, state.i);
}

function readStyleSelector(source, state) {
  skipTrivia(source, state);
  const start = state.i;
  let bracketDepth = 0;
  let parenDepth = 0;
  let quote = null;
  while (state.i < source.length) {
    const ch = source[state.i];
    if (quote) {
      if (ch === '\\') { state.i += 2; continue; }
      if (ch === quote) quote = null;
      state.i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; state.i++; continue; }
    if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '=' && bracketDepth === 0 && parenDepth === 0) break;
    state.i++;
  }
  const selector = source.slice(start, state.i).trim();
  if (!selector) throw new Error('expected LSCSS selector');
  return selector;
}

function readBalanced(source, state, open, close) {
  skipTrivia(source, state);
  if (source[state.i] !== open) throw new Error(`expected '${open}'`);
  const start = ++state.i;
  let depth = 1;
  let quote = null;
  let raw = false;
  while (state.i < source.length) {
    const ch = source[state.i];
    if (quote) {
      if (raw) {
        if (ch === quote) { quote = null; raw = false; }
        state.i++;
        continue;
      }
      if (ch === '\\') { state.i += 2; continue; }
      if (ch === quote) quote = null;
      state.i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; state.i++; continue; }
    if (ch === '`') { quote = ch; raw = true; state.i++; continue; }
    if (source.startsWith('--[[', state.i)) {
      const end = source.indexOf(']]', state.i + 4);
      state.i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith('--', state.i)) {
      const end = source.indexOf('\n', state.i + 2);
      state.i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const value = source.slice(start, state.i);
        state.i++;
        return value;
      }
    }
    state.i++;
  }
  throw new Error(`unterminated '${open}${close}' block`);
}

function scanDeclarations(source, filePath) {
  const declarations = [];
  let i = 0;
  let quote = null;
  let raw = false;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (raw) {
        if (ch === quote) { quote = null; raw = false; }
        i++;
        continue;
      }
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (ch === '`') { quote = ch; raw = true; i++; continue; }
    if (source.startsWith('--[[', i)) {
      const end = source.indexOf(']]', i + 4);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }

    const before = i === 0 ? '' : source[i - 1];
    let exported = false;
    let keywordStart = i;
    let kind = null;
    if (!isIdent(before) && source.startsWith('export', i) && !isIdent(source[i + 6])) {
      const probe = { i: i + 6 };
      skipTrivia(source, probe);
      if (source.startsWith('lshtml', probe.i) && !isIdent(source[probe.i + 6])) { exported = true; kind = 'lshtml'; keywordStart = probe.i; }
      else if (source.startsWith('lscss', probe.i) && !isIdent(source[probe.i + 5])) { exported = true; kind = 'lscss'; keywordStart = probe.i; }
    } else if (!isIdent(before) && source.startsWith('lshtml', i) && !isIdent(source[i + 6])) kind = 'lshtml';
    else if (!isIdent(before) && source.startsWith('lscss', i) && !isIdent(source[i + 5])) kind = 'lscss';

    if (!kind) { i++; continue; }
    const start = i;
    const state = { i: keywordStart + kind.length };
    try {
      let name = '';
      let selector = '';
      let params = [];
      if (kind === 'lscss') {
        selector = readStyleSelector(source, state);
        name = `style_${hashText(selector).toString(16)}`;
      } else {
        name = readIdentifier(source, state, `${kind} name`);
        skipTrivia(source, state);
        if (source[state.i] === '(') {
          const paramBody = readBalanced(source, state, '(', ')').trim();
          params = paramBody ? paramBody.split(',').map((p) => p.trim()).filter(Boolean) : [];
          for (const param of params) {
            if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*)*)?$/.test(param)) {
              throw new Error(`invalid lshtml parameter '${param}'; use an inferred parameter name such as props`);
            }
          }
          params = params.map((param) => param.replace(/\s*\.\s*/g, '.'));
        }
      }
      skipTrivia(source, state);
      if (source[state.i] !== '=') throw new Error("expected '='");
      state.i++;
      const body = readBalanced(source, state, '{', '}');
      let content = body.trim();
      if (kind === 'lshtml' && content.startsWith('(') && content.endsWith(')')) content = content.slice(1, -1).trim();
      declarations.push({ kind, name, selector, params, body: content, exported, start, end: state.i, filePath });
      i = state.i;
    } catch (error) {
      const prefix = filePath ? `${filePath}: ` : '';
      throw new Error(`${prefix}${kind} declaration: ${error.message}`);
    }
  }
  return declarations;
}

function splitTopLevel(text, delimiters = new Set([',', ';', '\n'])) {
  const parts = [];
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
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (depth === 0 && delimiters.has(ch)) {
      const part = text.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function findTopLevelAssignment(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === '=' || ch === ':')) return i;
  }
  return -1;
}

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('`') && v.endsWith('`'))) {
    if (v[0] === '"') {
      try { return JSON.parse(v); } catch { return v.slice(1, -1); }
    }
    return v.slice(1, -1);
  }
  return null;
}

function parseStyleObject(body) {
  const out = {};
  const nestedBlocks = new Set(['hover', 'active', 'focus', 'disabled', 'checked', 'selected']);
  for (const part of splitTopLevel(body)) {
    const at = findTopLevelAssignment(part);
    if (at < 0) continue;
    const key = part.slice(0, at).trim().replace(/^['"]|['"]$/g, '');
    const raw = part.slice(at + 1).trim();
    const normalized = key.toLowerCase().replace(/_/g, '-');
    // State blocks remain nested LSCSS objects. Every other {...} value is an
    // ordinary LSX expression, matching the expression syntax used by LSHTML.
    if (raw.startsWith('{') && raw.endsWith('}') && nestedBlocks.has(normalized)) out[key] = parseStyleObject(raw.slice(1, -1));
    else out[key] = raw;
  }
  return out;
}

function dynamicExpression(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text.length < 3 || text[0] !== '{' || text[text.length - 1] !== '}') return null;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0 && i !== text.length - 1) return null;
    }
  }
  if (depth !== 0) return null;
  const expression = text.slice(1, -1).trim();
  return expression || null;
}

function hasDynamicStyles(object) {
  for (const value of Object.values(object || {})) {
    if (value && typeof value === 'object') {
      if (hasDynamicStyles(value)) return true;
    } else if (dynamicExpression(value) !== null) return true;
  }
  return false;
}

function splitStyleDynamics(object) {
  const staticObject = {};
  const dynamicObject = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (value && typeof value === 'object') {
      const nested = splitStyleDynamics(value);
      if (Object.keys(nested.staticObject).length) staticObject[key] = nested.staticObject;
      if (Object.keys(nested.dynamicObject).length) dynamicObject[key] = nested.dynamicObject;
    } else if (dynamicExpression(value) !== null) dynamicObject[key] = value;
    else staticObject[key] = value;
  }
  return { staticObject, dynamicObject };
}

function styleBindingCalls(target, object, stateName = 'normal') {
  const lines = [];
  const states = new Set(['hover', 'active', 'focus', 'disabled', 'checked', 'selected']);
  for (const [rawKey, rawValue] of Object.entries(object || {})) {
    const key = rawKey.toLowerCase().replace(/_/g, '-');
    if (rawValue && typeof rawValue === 'object') {
      if (states.has(key)) lines.push(...styleBindingCalls(target, rawValue, key));
      continue;
    }
    const expression = dynamicExpression(rawValue);
    if (expression === null || key === 'selector') continue;
    lines.push(`${target}.add_binding(${escapeLsxString(`style.${stateName}.${key}`)},${escapeLsxString(expression)})`);
  }
  return lines;
}

function stateBindingName(stateExpr) {
  const map = {
    '__UI.STATE_HOVER': 'hover',
    '__UI.STATE_ACTIVE': 'active',
    '__UI.STATE_FOCUS': 'focus',
    '__UI.STATE_DISABLED': 'disabled',
    '__UI.STATE_CHECKED': 'checked',
    '__UI.STATE_SELECTED': 'selected',
  };
  return map[stateExpr] || 'normal';
}

function escapeLsxString(value) { return JSON.stringify(String(value)); }

const NAMED_COLORS = {
  transparent: [0, 0, 0, 0], black: [0, 0, 0, 255], white: [255, 255, 255, 255],
  red: [255, 0, 0, 255], green: [0, 128, 0, 255], blue: [0, 0, 255, 255],
  yellow: [255, 255, 0, 255], gray: [128, 128, 128, 255], grey: [128, 128, 128, 255],
  orange: [255, 165, 0, 255], purple: [128, 0, 128, 255], pink: [255, 192, 203, 255],
};
function colorValue(raw) {
  const quoted = unquote(raw);
  const value = String(quoted === null ? raw : quoted).trim().toLowerCase();
  let rgba = NAMED_COLORS[value] || null;
  if (!rgba && /^#[0-9a-f]{3,8}$/i.test(value)) {
    const h = value.slice(1);
    if (h.length === 3 || h.length === 4) rgba = [...h].map((c) => parseInt(c + c, 16));
    else if (h.length === 6 || h.length === 8) rgba = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255];
    if (rgba?.length === 3) rgba.push(255);
  }
  if (!rgba) {
    const m = /^rgba?\(([^)]+)\)$/.exec(value);
    if (m) {
      const p = m[1].split(',').map((x) => x.trim());
      rgba = [0, 1, 2].map((i) => Math.max(0, Math.min(255, Number(p[i]) || 0)));
      const a = p[3] === undefined ? 255 : Number(p[3]) <= 1 ? Number(p[3]) * 255 : Number(p[3]);
      rgba.push(Math.max(0, Math.min(255, Math.round(a))));
    }
  }
  if (!rgba) return null;
  return (rgba[0] + rgba[1] * 256 + rgba[2] * 65536 + rgba[3] * 16777216) >>> 0;
}

function parseDimension(raw) {
  const quoted = unquote(raw);
  const value = String(quoted === null ? raw : quoted).trim().toLowerCase();
  if (value === 'auto') return ['__UI.UNIT_AUTO', '0.0'];
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|%|vw|vh|em|rem)?$/.exec(value);
  if (!match) return ['__UI.UNIT_PX', raw];
  const unit = match[2] || 'px';
  const map = { px: '__UI.UNIT_PX', '%': '__UI.UNIT_PERCENT', vw: '__UI.UNIT_VW', vh: '__UI.UNIT_VH', em: '__UI.UNIT_EM', rem: '__UI.UNIT_REM' };
  const number = Number(match[1]);
  return [map[unit], `${Number.isInteger(number) ? number.toFixed(1) : number}`];
}

function parseBox(raw) {
  const quoted = unquote(raw);
  const value = String(quoted === null ? raw : quoted).trim();
  const items = value.split(/\s+/).filter(Boolean).map((v) => parseDimension(v)[1]);
  if (items.length === 0) return ['0.0', '0.0', '0.0', '0.0'];
  if (items.length === 1) return [items[0], items[0], items[0], items[0]];
  if (items.length === 2) return [items[0], items[1], items[0], items[1]];
  if (items.length === 3) return [items[0], items[1], items[2], items[1]];
  return [items[0], items[1], items[2], items[3]];
}

function parseGradient(raw) {
  const quoted = unquote(raw);
  const value = String(quoted === null ? raw : quoted).trim();
  let mode = null;
  let body = null;
  if (/^linear-gradient\s*\(/i.test(value)) { mode = '__UI.GRADIENT_LINEAR'; body = value.replace(/^linear-gradient\s*\(/i, '').replace(/\)\s*$/, ''); }
  else if (/^radial-gradient\s*\(/i.test(value)) { mode = '__UI.GRADIENT_RADIAL'; body = value.replace(/^radial-gradient\s*\(/i, '').replace(/\)\s*$/, ''); }
  if (!mode) return null;
  const parts = splitTopLevel(body, new Set([',']));
  let angle = '0.0';
  if (mode === '__UI.GRADIENT_LINEAR' && parts.length > 2) {
    const first = parts[0].trim().toLowerCase();
    if (/^-?(?:\d+\.?\d*|\.\d+)(deg)?$/.test(first)) { angle = first.replace(/deg$/,''); parts.shift(); }
    else if (first.startsWith('to ')) {
      const directions = { 'to right':'0.0','to bottom right':'45.0','to bottom':'90.0','to bottom left':'135.0','to left':'180.0','to top left':'225.0','to top':'270.0','to top right':'315.0' };
      angle = directions[first] || '90.0'; parts.shift();
    }
  }
  const firstColor = colorValue((parts[0] || 'transparent').trim().split(/\s+/)[0]);
  const lastColor = colorValue((parts[parts.length - 1] || 'transparent').trim().split(/\s+/)[0]);
  if (firstColor === null || lastColor === null) return null;
  return { mode, start: String(firstColor), end: String(lastColor), angle };
}

function boolExpr(raw) {
  const q = unquote(raw);
  const v = String(q === null ? raw : q).trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(v) ? 'true' : ['false', '0', 'no', 'off'].includes(v) ? 'false' : raw;
}

function enumExpr(raw, map, fallback) {
  const q = unquote(raw);
  const text = String(q === null ? raw : q).trim();
  const key = text.toLowerCase().replace(/-/g, '_');
  if (map[key]) return map[key];
  // Unquoted member access and function expressions are LSX values supplied by
  // {var}; preserve them instead of replacing them with the static fallback.
  if (q === null && /[.\[\]()?:+*\/]/.test(text)) return raw;
  return fallback || raw;
}

const DISPLAY = { none: '__UI.DISPLAY_NONE', flex: '__UI.DISPLAY_FLEX', block: '__UI.DISPLAY_BLOCK', grid: '__UI.DISPLAY_GRID', inline: '__UI.DISPLAY_INLINE' };
const POSITION = { relative: '__UI.POSITION_RELATIVE', absolute: '__UI.POSITION_ABSOLUTE', fixed: '__UI.POSITION_FIXED', sticky: '__UI.POSITION_STICKY' };
const FLEX_DIRECTION = { row: '__UI.FLEX_ROW', row_reverse: '__UI.FLEX_ROW_REVERSE', column: '__UI.FLEX_COLUMN', column_reverse: '__UI.FLEX_COLUMN_REVERSE' };
const JUSTIFY = { start: '__UI.ALIGN_START', flex_start: '__UI.ALIGN_START', center: '__UI.ALIGN_CENTER', end: '__UI.ALIGN_END', flex_end: '__UI.ALIGN_END', space_between: '__UI.ALIGN_SPACE_BETWEEN', space_around: '__UI.ALIGN_SPACE_AROUND', space_evenly: '__UI.ALIGN_SPACE_EVENLY' };
const ALIGN = { auto: '__UI.ALIGN_AUTO', stretch: '__UI.ALIGN_STRETCH', start: '__UI.ALIGN_START', flex_start: '__UI.ALIGN_START', center: '__UI.ALIGN_CENTER', end: '__UI.ALIGN_END', flex_end: '__UI.ALIGN_END', baseline: '__UI.ALIGN_BASELINE' };
const OVERFLOW = { visible: '__UI.OVERFLOW_VISIBLE', hidden: '__UI.OVERFLOW_HIDDEN', scroll: '__UI.OVERFLOW_SCROLL', auto: '__UI.OVERFLOW_AUTO', clip: '__UI.OVERFLOW_CLIP' };
const TEXT_ALIGN = { left: '__UI.TEXT_LEFT', start: '__UI.TEXT_LEFT', center: '__UI.TEXT_CENTER', right: '__UI.TEXT_RIGHT', end: '__UI.TEXT_RIGHT', justify: '__UI.TEXT_JUSTIFY' };
const BOX_SIZING = { content_box: '__UI.BOX_CONTENT', border_box: '__UI.BOX_BORDER' };
const CURSOR = { default: '__UI.CURSOR_DEFAULT', pointer: '__UI.CURSOR_POINTER', text: '__UI.CURSOR_TEXT', move: '__UI.CURSOR_MOVE', crosshair: '__UI.CURSOR_CROSSHAIR', grab: '__UI.CURSOR_GRAB', grabbing: '__UI.CURSOR_GRABBING', resize_ew: '__UI.CURSOR_RESIZE_EW', ew_resize: '__UI.CURSOR_RESIZE_EW', resize_ns: '__UI.CURSOR_RESIZE_NS', ns_resize: '__UI.CURSOR_RESIZE_NS', not_allowed: '__UI.CURSOR_NOT_ALLOWED' };

function styleCalls(target, object, stateExpr = '__UI.STATE_NORMAL') {
  const lines = [];
  const call = (name, ...args) => lines.push(`__UI.${name}(${target},${stateExpr}${args.length ? ',' : ''}${args.join(',')})`);
  for (const [rawKey, rawValue] of Object.entries(object)) {
    const key = rawKey.toLowerCase().replace(/_/g, '-');
    if (['selector', 'hover', 'active', 'focus', 'disabled', 'checked', 'selected'].includes(key)) continue;
    if (rawValue && typeof rawValue === 'object') continue;
    const dynamic = dynamicExpression(rawValue);
    const value = dynamic === null ? rawValue : dynamic;
    const color = dynamic === null ? colorValue(rawValue) : null;
    switch (key) {
      case 'display': call('css_display', enumExpr(value, DISPLAY, '__UI.DISPLAY_FLEX')); break;
      case 'position': call('css_position', enumExpr(value, POSITION, '__UI.POSITION_RELATIVE')); break;
      case 'box-sizing': call('css_box_sizing', enumExpr(value, BOX_SIZING, '__UI.BOX_CONTENT')); break;
      case 'width': { const [u, v] = parseDimension(value); call('css_width', u, v); break; }
      case 'height': { const [u, v] = parseDimension(value); call('css_height', u, v); break; }
      case 'min-width': { const [u, v] = parseDimension(value); call('css_min_width', u, v); break; }
      case 'min-height': { const [u, v] = parseDimension(value); call('css_min_height', u, v); break; }
      case 'max-width': { const [u, v] = parseDimension(value); call('css_max_width', u, v); break; }
      case 'max-height': { const [u, v] = parseDimension(value); call('css_max_height', u, v); break; }
      case 'left': { const [u, v] = parseDimension(value); call('css_left', u, v); break; }
      case 'right': { const [u, v] = parseDimension(value); call('css_right', u, v); break; }
      case 'top': { const [u, v] = parseDimension(value); call('css_top', u, v); break; }
      case 'bottom': { const [u, v] = parseDimension(value); call('css_bottom', u, v); break; }
      case 'margin': call('css_margin', ...parseBox(value)); break;
      case 'margin-top': call('css_margin_top', parseDimension(value)[1]); break;
      case 'margin-right': call('css_margin_right', parseDimension(value)[1]); break;
      case 'margin-bottom': call('css_margin_bottom', parseDimension(value)[1]); break;
      case 'margin-left': call('css_margin_left', parseDimension(value)[1]); break;
      case 'padding': call('css_padding', ...parseBox(value)); break;
      case 'padding-top': call('css_padding_top', parseDimension(value)[1]); break;
      case 'padding-right': call('css_padding_right', parseDimension(value)[1]); break;
      case 'padding-bottom': call('css_padding_bottom', parseDimension(value)[1]); break;
      case 'padding-left': call('css_padding_left', parseDimension(value)[1]); break;
      case 'gap': call('css_gap', parseDimension(value)[1]); break;
      case 'row-gap': call('css_row_gap', parseDimension(value)[1]); break;
      case 'column-gap': call('css_column_gap', parseDimension(value)[1]); break;
      case 'flex-direction': call('css_flex_direction', enumExpr(value, FLEX_DIRECTION, '__UI.FLEX_COLUMN')); break;
      case 'flex-wrap': call('css_flex_wrap', enumExpr(value, { nowrap: '__UI.FLEX_NOWRAP', wrap: '__UI.FLEX_WRAP', wrap_reverse: '__UI.FLEX_WRAP_REVERSE' }, '__UI.FLEX_NOWRAP')); break;
      case 'flex-grow': call('css_flex_grow', value); break;
      case 'flex-shrink': call('css_flex_shrink', value); break;
      case 'flex-basis': { const [u, v] = parseDimension(value); call('css_flex_basis', u, v); break; }
      case 'justify-content': call('css_justify', enumExpr(value, JUSTIFY, '__UI.ALIGN_START')); break;
      case 'align-items': call('css_align_items', enumExpr(value, ALIGN, '__UI.ALIGN_STRETCH')); break;
      case 'align-self': call('css_align_self', enumExpr(value, ALIGN, '__UI.ALIGN_AUTO')); break;
      case 'align-content': call('css_align_content', enumExpr(value, JUSTIFY, '__UI.ALIGN_START')); break;
      case 'order': call('css_order', value); break;
      case 'grid-columns': call('css_grid_columns', value); break;
      case 'grid-template-columns': {
        if (dynamic !== null) { call('css_grid_columns', value); break; }
        const q = unquote(value); const text = String(q === null ? value : q);
        const repeat = /repeat\(\s*(\d+)/i.exec(text); const count = repeat ? repeat[1] : String(text.split(/\s+/).filter(Boolean).length || 1);
        call('css_grid_columns', count); break;
      }
      case 'grid-rows': call('css_grid_rows', value); break;
      case 'grid-template-rows': {
        if (dynamic !== null) { call('css_grid_rows', value); break; }
        const q = unquote(value); const text = String(q === null ? value : q);
        const repeat = /repeat\(\s*(\d+)/i.exec(text); const count = repeat ? repeat[1] : String(text.split(/\s+/).filter(Boolean).length || 1);
        call('css_grid_rows', count); break;
      }
      case 'background': {
        const gradient = parseGradient(value);
        if (gradient) call('css_gradient', gradient.mode, gradient.start, gradient.end, gradient.angle);
        else call('css_background', color !== null ? `${color}` : value);
        break;
      }
      case 'background-color': call('css_background', color !== null ? `${color}` : value); break;
      case 'fill': call('css_background', color !== null ? `${color}` : value); break;
      case 'fill-opacity': call('css_opacity', value); break;
      case 'background-end': case 'background-color-end': call('css_background_end', color !== null ? `${color}` : value); break;
      case 'background-gradient-mode': call('css_gradient_mode', enumExpr(value, { none:'__UI.GRADIENT_NONE', linear:'__UI.GRADIENT_LINEAR', radial:'__UI.GRADIENT_RADIAL' }, '__UI.GRADIENT_NONE')); break;
      case 'background-angle': case 'gradient-angle': call('css_gradient_angle', String(value).replace(/deg$/i,'')); break;
      case 'color': call('css_color', color !== null ? `${color}` : value); break;
      case 'opacity': call('css_opacity', value); break;
      case 'border': {
        if (dynamic !== null) { call('css_border_width', value, value, value, value); break; }
        const q = unquote(value); const parts = String(q === null ? value : q).split(/\s+/);
        let width = '1.0', packed = null;
        for (const p of parts) { if (/^-?(?:\d|\.)/.test(p)) width = parseDimension(p)[1]; const c = colorValue(p); if (c !== null) packed = c; }
        call('css_border', width, `${packed === null ? 0 : packed}`); break;
      }
      case 'border-width': call('css_border_width', ...parseBox(value)); break;
      case 'border-top-width': call('css_border_top_width', parseDimension(value)[1]); break;
      case 'border-right-width': call('css_border_right_width', parseDimension(value)[1]); break;
      case 'border-bottom-width': call('css_border_bottom_width', parseDimension(value)[1]); break;
      case 'border-left-width': call('css_border_left_width', parseDimension(value)[1]); break;
      case 'border-color': call('css_border_color', color !== null ? `${color}` : value); break;
      case 'stroke': call('css_border', '1.0', color !== null ? `${color}` : value); break;
      case 'stroke-width': call('css_border_width', ...parseBox(value)); break;
      case 'stroke-opacity': call('css_opacity', value); break;
      case 'border-top-color': call('css_border_top_color', color !== null ? `${color}` : value); break;
      case 'border-right-color': call('css_border_right_color', color !== null ? `${color}` : value); break;
      case 'border-bottom-color': call('css_border_bottom_color', color !== null ? `${color}` : value); break;
      case 'border-left-color': call('css_border_left_color', color !== null ? `${color}` : value); break;
      case 'border-radius': call('css_radius', ...parseBox(value)); break;
      case 'border-top-left-radius': call('css_radius_top_left', parseDimension(value)[1]); break;
      case 'border-top-right-radius': call('css_radius_top_right', parseDimension(value)[1]); break;
      case 'border-bottom-right-radius': call('css_radius_bottom_right', parseDimension(value)[1]); break;
      case 'border-bottom-left-radius': call('css_radius_bottom_left', parseDimension(value)[1]); break;
      case 'box-shadow': {
        if (dynamic !== null) { call('css_shadow_blur', value); break; }
        const q = unquote(value); const parts = String(q === null ? value : q).split(/\s+/).filter(Boolean);
        const numbers = parts.filter((p) => /^-?(?:\d|\.)/.test(p)).map((p) => parseDimension(p)[1]);
        let packed = 0; for (const p of parts) { const c = colorValue(p); if (c !== null) packed = c; }
        call('css_shadow', numbers[0] || '0.0', numbers[1] || '0.0', numbers[2] || '0.0', numbers[3] || '0.0', `${packed}`); break;
      }
      case 'shadow-x': call('css_shadow_x', value); break;
      case 'shadow-y': call('css_shadow_y', value); break;
      case 'shadow-blur': call('css_shadow_blur', value); break;
      case 'shadow-spread': call('css_shadow_spread', value); break;
      case 'shadow-color': call('css_shadow_color', color !== null ? `${color}` : value); break;
      case 'outline': {
        if (dynamic !== null) { call('css_outline', value, '0'); break; }
        const q = unquote(value); const parts = String(q === null ? value : q).split(/\s+/);
        let width = '1.0', packed = 0; for (const p of parts) { if (/^-?(?:\d|\.)/.test(p)) width = parseDimension(p)[1]; const c = colorValue(p); if (c !== null) packed = c; }
        call('css_outline', width, `${packed}`); break;
      }
      case 'outline-offset': call('css_outline_offset', parseDimension(value)[1]); break;
      case 'font-size': call('css_font_size', parseDimension(value)[1]); break;
      case 'font-weight': call('css_font_weight', value); break;
      case 'line-height': call('css_line_height', parseDimension(value)[1]); break;
      case 'letter-spacing': call('css_letter_spacing', parseDimension(value)[1]); break;
      case 'word-spacing': call('css_word_spacing', parseDimension(value)[1]); break;
      case 'text-align': call('css_text_align', enumExpr(value, TEXT_ALIGN, '__UI.TEXT_LEFT')); break;
      case 'vertical-align': call('css_vertical_align', enumExpr(value, { top: '__UI.VERTICAL_TOP', middle: '__UI.VERTICAL_MIDDLE', center: '__UI.VERTICAL_MIDDLE', bottom: '__UI.VERTICAL_BOTTOM', baseline: '__UI.VERTICAL_BASELINE' }, '__UI.VERTICAL_TOP')); break;
      case 'white-space': call('css_white_space', enumExpr(value, { normal: '__UI.WHITE_SPACE_NORMAL', nowrap: '__UI.WHITE_SPACE_NOWRAP', pre: '__UI.WHITE_SPACE_PRE', pre_wrap: '__UI.WHITE_SPACE_PRE_WRAP' }, '__UI.WHITE_SPACE_NORMAL')); break;
      case 'text-overflow': call('css_text_overflow', enumExpr(value, { clip: '__UI.TEXT_OVERFLOW_CLIP', ellipsis: '__UI.TEXT_OVERFLOW_ELLIPSIS' }, '__UI.TEXT_OVERFLOW_CLIP')); break;
      case 'overflow': { const e = enumExpr(value, OVERFLOW, '__UI.OVERFLOW_VISIBLE'); call('css_overflow', e, e); break; }
      case 'overflow-x': call('css_overflow_x', enumExpr(value, OVERFLOW, '__UI.OVERFLOW_VISIBLE')); break;
      case 'overflow-y': call('css_overflow_y', enumExpr(value, OVERFLOW, '__UI.OVERFLOW_VISIBLE')); break;
      case 'z-index': call('css_z_index', value); break;
      case 'cursor': call('css_cursor', enumExpr(value, CURSOR, '__UI.CURSOR_DEFAULT')); break;
      case 'pointer-events': {
        if (dynamic !== null) { call('css_pointer_events', value); break; }
        const pointerValue = String(unquote(value) ?? value).trim().toLowerCase();
        const enabled = ['none','false','0','no','off'].includes(pointerValue) ? 'false'
          : ['auto','all','true','1','yes','on'].includes(pointerValue) ? 'true'
          : boolExpr(value);
        call('css_pointer_events', enabled);
        break;
      }
      case 'visibility': {
        if (dynamic !== null) { call('css_visibility', value); break; }
        const visibilityValue = String(unquote(value) ?? value).trim().toLowerCase();
        const visible = ['hidden','collapse','false','0','no','off'].includes(visibilityValue) ? 'false'
          : ['visible','true','1','yes','on'].includes(visibilityValue) ? 'true'
          : boolExpr(value);
        call('css_visibility', visible);
        break;
      }
      case 'aspect-ratio': call('css_aspect_ratio', value); break;
      case 'translate-x': call('css_translate_x', parseDimension(value)[1]); break;
      case 'translate-y': call('css_translate_y', parseDimension(value)[1]); break;
      case 'scale-x': call('css_scale_x', value); break;
      case 'scale-y': call('css_scale_y', value); break;
      case 'rotate': call('css_rotate', String(value).replace(/deg$/i,'')); break;
      case 'transform-origin': { const values = String(unquote(value) ?? value).split(/\s+/); call('css_transform_origin', parseDimension(values[0] || '50%')[1], parseDimension(values[1] || values[0] || '50%')[1]); break; }
      case 'object-fit': call('css_object_fit', enumExpr(value, { fill: '__UI.OBJECT_FILL', contain: '__UI.OBJECT_CONTAIN', cover: '__UI.OBJECT_COVER', none: '__UI.OBJECT_NONE', scale_down: '__UI.OBJECT_SCALE_DOWN' }, '__UI.OBJECT_FILL')); break;
      case 'image-tint': call('css_image_tint', color !== null ? `${color}` : value); break;
      case 'transform': {
        const q = String(unquote(value) ?? value);
        const tx = /translateX\(([^)]+)\)/i.exec(q); if (tx) call('css_translate_x', parseDimension(tx[1])[1]);
        const ty = /translateY\(([^)]+)\)/i.exec(q); if (ty) call('css_translate_y', parseDimension(ty[1])[1]);
        const tr = /translate\(([^,\s)]+)[,\s]+([^)]+)\)/i.exec(q); if (tr) { call('css_translate_x', parseDimension(tr[1])[1]); call('css_translate_y', parseDimension(tr[2])[1]); }
        const sx = /scaleX\(([^)]+)\)/i.exec(q); if (sx) call('css_scale_x', sx[1]);
        const sy = /scaleY\(([^)]+)\)/i.exec(q); if (sy) call('css_scale_y', sy[1]);
        const sc = /scale\(([^,\s)]+)(?:[,\s]+([^)]+))?\)/i.exec(q); if (sc) { call('css_scale_x', sc[1]); call('css_scale_y', sc[2] || sc[1]); }
        const ro = /rotate\(([^)]+)\)/i.exec(q); if (ro) call('css_rotate', ro[1].replace(/deg$/i,''));
        break;
      }
      case 'transition-duration': call('css_transition_duration', dynamic !== null ? value : String(value).replace(/ms$/i,'').replace(/s$/i,'*1000.0')); break;
      default: break;
    }
  }
  return lines;
}

const STYLE_STATE_EXPRESSIONS = {
  hover: '__UI.STATE_HOVER',
  active: '__UI.STATE_ACTIVE',
  focus: '__UI.STATE_FOCUS',
  disabled: '__UI.STATE_DISABLED',
  checked: '__UI.STATE_CHECKED',
  selected: '__UI.STATE_SELECTED',
};

function splitStyleObjectByState(object, selectorState) {
  const base = {};
  const groups = [];
  for (const [rawKey, rawValue] of Object.entries(object || {})) {
    const key = rawKey.toLowerCase().replace(/_/g, '-');
    if (selectorState === '__UI.STATE_NORMAL' && STYLE_STATE_EXPRESSIONS[key] && rawValue && typeof rawValue === 'object') {
      groups.push({ state: STYLE_STATE_EXPRESSIONS[key], object: rawValue });
    } else {
      base[rawKey] = rawValue;
    }
  }
  groups.unshift({ state: selectorState, object: base });
  return groups;
}

function decodeHtmlEntities(value) {
  return String(value).replace(/&(?:#(\d+)|#x([0-9A-Fa-f]+)|([A-Za-z][A-Za-z0-9]+));/g, (match, decimal, hexadecimal, named) => {
    if (decimal !== undefined) {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF
        ? String.fromCodePoint(codePoint)
        : match;
    }
    if (hexadecimal !== undefined) {
      const codePoint = Number.parseInt(hexadecimal, 16);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF
        ? String.fromCodePoint(codePoint)
        : match;
    }
    const entities = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      quot: '"',
      nbsp: ' ',
    };
    return Object.prototype.hasOwnProperty.call(entities, named) ? entities[named] : match;
  });
}

function parseAttributes(source) {
  const attrs = [];
  let i = 0;
  while (i < source.length) {
    while (/\s/.test(source[i])) i++;
    if (i >= source.length) break;
    const start = i;
    while (i < source.length && !/[\s=]/.test(source[i])) i++;
    const name = source.slice(start, i);
    while (/\s/.test(source[i])) i++;
    if (source[i] !== '=') { attrs.push({ name, kind: 'boolean', value: 'true' }); continue; }
    i++;
    while (/\s/.test(source[i])) i++;
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i++]; let value = '';
      while (i < source.length && source[i] !== quote) { if (source[i] === '\\' && i + 1 < source.length) value += source[i++]; value += source[i++]; }
      i++;
      attrs.push({ name, kind: 'string', value: decodeHtmlEntities(value) });
    } else if (source[i] === '{') {
      const state = { i }; const value = readBalanced(source, state, '{', '}'); i = state.i;
      attrs.push({ name, kind: 'expression', value: value.trim() });
    } else {
      const valueStart = i; while (i < source.length && !/\s/.test(source[i])) i++;
      attrs.push({ name, kind: 'bare', value: decodeHtmlEntities(source.slice(valueStart, i)) });
    }
  }
  return attrs;
}

function parseMarkup(text) {
  const root = { tag: '__fragment', originalTag: '__fragment', attrs: [], children: [], parent: null };
  const stack = [root];
  const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'track', 'area', 'base', 'embed', 'param', 'wbr']);
  let i = 0;
  const appendText = (raw) => {
    if (!raw) return;
    const currentParent = stack[stack.length - 1];
    const preserveWhitespace = currentParent && ['textarea', 'pre', 'codeeditor', 'richtext'].includes(currentParent.tag);
    if (preserveWhitespace && !raw.includes('{')) {
      let value = decodeHtmlEntities(raw.replace(/\r\n?/g, '\n'));
      // Match HTML textarea/pre authoring behavior: ignore a formatting newline
      // immediately after the opening tag and indentation before the closing tag,
      // but preserve every meaningful internal newline and space.
      value = value.replace(/^\n/, '').replace(/\n[ \t]*$/, '');
      if (value.length) currentParent.children.push({ tag: '__text', value, dynamic: false, parent: currentParent, children: [], attrs: [] });
      return;
    }
    let cursor = 0;
    while (cursor < raw.length) {
      const open = raw.indexOf('{', cursor);
      if (open < 0) {
        const value = decodeHtmlEntities(raw.slice(cursor).replace(/\s+/g, ' ').trim());
        if (value) stack[stack.length - 1].children.push({ tag: '__text', value, dynamic: false, parent: stack[stack.length - 1], children: [], attrs: [] });
        break;
      }
      const prefix = decodeHtmlEntities(raw.slice(cursor, open).replace(/\s+/g, ' ').trim());
      if (prefix) stack[stack.length - 1].children.push({ tag: '__text', value: prefix, dynamic: false, parent: stack[stack.length - 1], children: [], attrs: [] });
      const state = { i: open };
      try {
        const expr = readBalanced(raw, state, '{', '}').trim();
        if (expr) stack[stack.length - 1].children.push({ tag: '__text', value: expr, dynamic: true, parent: stack[stack.length - 1], children: [], attrs: [] });
        cursor = state.i;
      } catch {
        const rest = decodeHtmlEntities(raw.slice(open).trim()); if (rest) stack[stack.length - 1].children.push({ tag: '__text', value: rest, dynamic: false, parent: stack[stack.length - 1], children: [], attrs: [] });
        break;
      }
    }
  };
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) { appendText(text.slice(i)); break; }
    appendText(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) { const end = text.indexOf('-->', lt + 4); i = end < 0 ? text.length : end + 3; continue; }
    let j = lt + 1; let quote = null; let brace = 0;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (quote) { if (ch === '\\') j++; else if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '{') brace++;
      else if (ch === '}') brace--;
      else if (ch === '>' && brace === 0) break;
    }
    if (j >= text.length) throw new Error('unterminated LSHTML tag');
    const token = text.slice(lt + 1, j).trim(); i = j + 1;
    if (!token || token.startsWith('!') || token.startsWith('?')) continue;
    if (token.startsWith('/')) {
      const close = token.slice(1).trim().toLowerCase();
      // Be forgiving when LSHTML authors explicitly close HTML void elements
      // such as <img></img>. The opening tag is already complete and was not
      // pushed onto the stack, so the matching close must not pop its parents.
      if (voidTags.has(close)) continue;
      while (stack.length > 1) { const node = stack.pop(); if (node.tag.toLowerCase() === close) break; }
      continue;
    }
    const selfClosing = token.endsWith('/');
    const body = selfClosing ? token.slice(0, -1).trim() : token;
    const m = /^([^\s]+)([\s\S]*)$/.exec(body);
    const originalTag = m[1]; const tag = originalTag.toLowerCase();
    const parent = stack[stack.length - 1];
    const node = { tag, originalTag, attrs: parseAttributes(m[2] || ''), children: [], parent };
    parent.children.push(node);
    if (!selfClosing && !voidTags.has(tag)) stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`unclosed LSHTML tag <${stack[stack.length - 1].originalTag}>`);
  return root;
}

function attr(node, name) { return node.attrs.find((a) => a.name.toLowerCase() === name.toLowerCase()) || null; }
function staticAttr(node, name) { const a = attr(node, name); return a && a.kind !== 'expression' ? a.value : null; }
function nodeClasses(node) { return String(staticAttr(node, 'class') || '').split(/\s+/).filter(Boolean); }

function selectorPartMatches(node, part) {
  part = part.replace(/:(hover|active|focus|disabled|checked|selected)$/i, '');
  const id = /#([\w-]+)/.exec(part); if (id && staticAttr(node, 'id') !== id[1]) return false;
  const classes = [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const current = new Set(nodeClasses(node)); if (classes.some((c) => !current.has(c))) return false;
  const tag = part.replace(/#[\w-]+/g, '').replace(/\.[\w-]+/g, '').trim();
  return !tag || tag === '*' || node.tag === tag.toLowerCase();
}

function selectorMatches(node, selector) {
  const normalized = selector.trim().replace(/\s*>\s*/g, ' > ');
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  let i = parts.length - 1;
  if (!selectorPartMatches(node, parts[i])) return false;
  let current = node.parent;
  i--;
  while (i >= 0) {
    if (parts[i] === '>') { i--; continue; }
    const direct = i + 1 < parts.length && parts[i + 1] === '>';
    if (direct) {
      if (!current || !selectorPartMatches(current, parts[i])) return false;
      current = current.parent;
    } else {
      while (current && !selectorPartMatches(current, parts[i])) current = current.parent;
      if (!current) return false;
      current = current.parent;
    }
    i--;
  }
  return true;
}
function specificity(selector) { return (selector.match(/#[\w-]+/g) || []).length * 100 + (selector.match(/[.:][\w-]+/g) || []).length * 10 + selector.split(/\s+|>/).filter((p) => /^[A-Za-z]/.test(p)).length; }


const CANVAS_SHAPE_TAGS = new Set([
  'rect', 'circle', 'ellipse', 'line', 'triangle', 'polygon', 'polyline', 'path', 'canvas-text', 'canvas-image'
]);

function numericAttributeExpression(attribute, fallback = '0.0') {
  if (!attribute) return fallback;
  if (attribute.kind === 'expression') return attribute.value || fallback;
  const text = String(attribute.value ?? '').trim().replace(/px$/i, '');
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    const number = Number(text);
    return Number.isInteger(number) ? number.toFixed(1) : String(number);
  }
  return text || fallback;
}

function parseCanvasPoints(value) {
  const numbers = String(value || '').match(/-?(?:\d+\.?\d*|\.\d+)/g) || [];
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
  return points;
}

function parseSimpleCanvasPath(value) {
  const tokens = String(value || '').match(/[MLHVZmlhvz]|-?(?:\d+\.?\d*|\.\d+)/g) || [];
  const points = [];
  let command = null;
  let index = 0;
  let x = 0;
  let y = 0;
  let closed = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MLHVZmlhvz]$/.test(token)) {
      command = token;
      index++;
      if (token === 'Z' || token === 'z') { closed = true; continue; }
    }
    if (!command) break;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === 'M' || upper === 'L') {
      if (index + 1 >= tokens.length) break;
      let nextX = Number(tokens[index++]);
      let nextY = Number(tokens[index++]);
      if (relative) { nextX += x; nextY += y; }
      x = nextX; y = nextY;
      points.push([String(x), String(y)]);
      if (upper === 'M') command = relative ? 'l' : 'L';
    } else if (upper === 'H') {
      let nextX = Number(tokens[index++]);
      if (relative) nextX += x;
      x = nextX;
      points.push([String(x), String(y)]);
    } else if (upper === 'V') {
      let nextY = Number(tokens[index++]);
      if (relative) nextY += y;
      y = nextY;
      points.push([String(x), String(y)]);
    } else break;
  }
  return { points, closed };
}

function canvasGeometryAttributeLines(nodeVar, node, attribute) {
  if (!CANVAS_SHAPE_TAGS.has(node.tag)) return null;
  const name = attribute.name.toLowerCase().replace(/_/g, '-');
  const expr = attribute.kind === 'expression' ? attribute.value : null;
  const value = numericAttributeExpression(attribute);
  const bind = (property) => expr ? `${nodeVar}.add_binding(${escapeLsxString(`canvas.${property}`)},${escapeLsxString(expr)})` : null;
  const directFields = {
    x: 'canvas_x', cx: 'canvas_x', x1: 'canvas_x',
    y: 'canvas_y', cy: 'canvas_y', y1: 'canvas_y',
    x2: 'canvas_x2', y2: 'canvas_y2', x3: 'canvas_x3', y3: 'canvas_y3',
    width: 'canvas_width', height: 'canvas_height',
    radius: 'canvas_radius', r: 'canvas_radius',
    rx: 'canvas_radius_x', 'radius-x': 'canvas_radius_x',
    ry: 'canvas_radius_y', 'radius-y': 'canvas_radius_y',
  };
  if (directFields[name]) {
    const field = directFields[name];
    const lines = [`${nodeVar}.${field} = ${value}`];
    const binding = bind(field);
    if (binding) lines.push(binding);
    return lines;
  }
  if (name === 'closed') {
    const bool = expr || (attribute.kind === 'boolean' ? 'true' : boolExpr(attribute.value));
    const lines = [`${nodeVar}.canvas_closed = ${bool}`];
    const binding = bind('closed'); if (binding) lines.push(binding);
    return lines;
  }
  if (name === 'points') {
    if (expr) throw new Error('canvas points currently use a static points="x,y ..." list; bind individual x/y coordinates on line, triangle, rect, circle, or ellipse elements');
    const lines = [];
    for (const [x, y] of parseCanvasPoints(attribute.value)) lines.push(`${nodeVar}.add_canvas_point(${x},${y})`);
    return lines;
  }
  if (name === 'd') {
    if (expr) throw new Error('dynamic canvas path strings are not reparsed at runtime; use declarative line/triangle/shape coordinates or a static d="..." path');
    const parsed = parseSimpleCanvasPath(attribute.value);
    const lines = [];
    for (const [x, y] of parsed.points) lines.push(`${nodeVar}.add_canvas_point(${x},${y})`);
    if (parsed.closed) lines.push(`${nodeVar}.canvas_closed = true`);
    return lines;
  }
  return null;
}

const TAG_FUNCTIONS = new Set([
  'ui','root','fragment','panel','div','section','header','footer','main','nav','aside','row','column','stack','grid','split','splitter','spacer','scroll','viewport','overlay','modal','window','dockspace','dockpanel','toolbar','statusbar','menubar','menu','menuitem','contextmenu','tabs','tab','tabpanel','accordion','foldout','details','summary','group','fieldset','legend','separator','hr',
  'label','span','p','paragraph','h1','h2','h3','h4','h5','h6','text','icon','img','image','video','audio','progress','meter','badge','tooltip','toast',
  'button','toggle','checkbox','radio','input','textarea','number','range','slider','select','option','combobox','color','file','search','date','time','keybind',
  'table','thead','tbody','tfoot','tr','th','td','list','ul','ol','li','tree','treeitem','canvas','rect','circle','ellipse','line','triangle','polygon','polyline','path','canvas-text','canvas-image',
  'hierarchy','inspector','property','propertygroup','contentbrowser','thumbnail','breadcrumb','assetfield','objectfield','texturefield','materialfield','enumfield','vector2','vector3','vector4','rectfield','transformfield','curve','gradient','graph','nodeeditor','timeline','console','profiler',
  'article','address','blockquote','pre','code','strong','em','small','mark','kbd','a','form','dialog','popup','popover','portal','titlebar','buttongroup','segmented','divider','skeleton','avatar','chip','scrollbar','scrollthumb','resizehandle','password','email','url','tel','spinner','switch','dropdown','dropdownitem','multiselect','autocomplete','calendar','datepicker','timepicker','colorpicker','filepicker','assetpicker','pagination','datagrid','listview','treeview','virtuallist','codeeditor','markdown','richtext','chart','plot','piechart','barchart','linechart','sceneview','gameview','preview','outliner','projectbrowser','assetbrowser','propertyeditor','componentheader','gizmo','transformgizmo','materialeditor','shadereditor','shadergraph','behaviorgraph','animationeditor','animator','spriteeditor','tilemapeditor','terraineditor','particleeditor','audiomixer','buildwindow','settings','commandpalette','searchresults','consoleentry','profilergraph','memoryview','networkview','hud','safearea','healthbar','manabar','minimap','crosshair','inventory','inventoryslot','hotbar','questlog','dialogue','subtitle','notification','radialmenu','joystick','toucharea','title-bar','button-group','scroll-thumb','resize-handle','switch-control','dropdown-item','multi-select','date-picker','time-picker','color-picker','file-picker','asset-picker','data-grid','list-view','tree-view','virtual-list','code-editor','rich-text','pie-chart','bar-chart','line-chart','scene-view','game-view','project-browser','asset-browser','property-editor','component-header','transform-gizmo','material-editor','shader-editor','shader-graph','behavior-graph','animation-editor','sprite-editor','tilemap-editor','terrain-editor','particle-editor','audio-mixer','build-window','settings-panel','command-palette','search-results','console-entry','profiler-graph','memory-view','network-view','safe-area','health-bar','mana-bar','inventory-slot','quest-log','radial-menu','touch-area'
]);

function functionForTag(tag) {
  const aliases = { rect: 'canvas_rect', circle: 'canvas_circle', ellipse: 'canvas_ellipse', line: 'canvas_line', triangle: 'canvas_triangle', polygon: 'canvas_polygon', polyline: 'canvas_polyline', path: 'canvas_path', 'canvas-text': 'canvas_text', 'canvas-image': 'canvas_image', div: 'panel', p: 'paragraph', text: 'text_node', img: 'image', hr: 'separator', ul: 'list', ol: 'list', li: 'listitem', propertygroup: 'property_group', contentbrowser: 'content_browser', assetfield: 'asset_field', objectfield: 'object_field', texturefield: 'texture_field', materialfield: 'material_field', enumfield: 'enum_field', rectfield: 'rect_field', transformfield: 'transform_field', nodeeditor: 'node_editor', treeitem: 'tree_item', menuitem: 'menu_item', contextmenu: 'context_menu', tabpanel: 'tab_panel', dockspace: 'dock_space', dockpanel: 'dock_panel', statusbar: 'status_bar', menubar: 'menu_bar', 'em': 'emphasis', 'kbd': 'keyboard', 'a': 'link', 'titlebar': 'title_bar', 'title-bar': 'title_bar', 'buttongroup': 'button_group', 'button-group': 'button_group', 'scrollthumb': 'scroll_thumb', 'scroll-thumb': 'scroll_thumb', 'resizehandle': 'resize_handle', 'resize-handle': 'resize_handle', 'tel': 'telephone', 'switch': 'switch_control', 'switch-control': 'switch_control', 'dropdownitem': 'dropdown_item', 'dropdown-item': 'dropdown_item', 'multiselect': 'multi_select', 'multi-select': 'multi_select', 'datepicker': 'date_picker', 'date-picker': 'date_picker', 'timepicker': 'time_picker', 'time-picker': 'time_picker', 'colorpicker': 'color_picker', 'color-picker': 'color_picker', 'filepicker': 'file_picker', 'file-picker': 'file_picker', 'assetpicker': 'asset_picker', 'asset-picker': 'asset_picker', 'datagrid': 'data_grid', 'data-grid': 'data_grid', 'listview': 'list_view', 'list-view': 'list_view', 'treeview': 'tree_view', 'tree-view': 'tree_view', 'virtuallist': 'virtual_list', 'virtual-list': 'virtual_list', 'codeeditor': 'code_editor', 'code-editor': 'code_editor', 'richtext': 'rich_text', 'rich-text': 'rich_text', 'piechart': 'pie_chart', 'pie-chart': 'pie_chart', 'barchart': 'bar_chart', 'bar-chart': 'bar_chart', 'linechart': 'line_chart', 'line-chart': 'line_chart', 'sceneview': 'scene_view', 'scene-view': 'scene_view', 'gameview': 'game_view', 'game-view': 'game_view', 'projectbrowser': 'project_browser', 'project-browser': 'project_browser', 'assetbrowser': 'asset_browser', 'asset-browser': 'asset_browser', 'propertyeditor': 'property_editor', 'property-editor': 'property_editor', 'componentheader': 'component_header', 'component-header': 'component_header', 'transformgizmo': 'transform_gizmo', 'transform-gizmo': 'transform_gizmo', 'materialeditor': 'material_editor', 'material-editor': 'material_editor', 'shadereditor': 'shader_editor', 'shader-editor': 'shader_editor', 'shadergraph': 'shader_graph', 'shader-graph': 'shader_graph', 'behaviorgraph': 'behavior_graph', 'behavior-graph': 'behavior_graph', 'animationeditor': 'animation_editor', 'animation-editor': 'animation_editor', 'spriteeditor': 'sprite_editor', 'sprite-editor': 'sprite_editor', 'tilemapeditor': 'tilemap_editor', 'tilemap-editor': 'tilemap_editor', 'terraineditor': 'terrain_editor', 'terrain-editor': 'terrain_editor', 'particleeditor': 'particle_editor', 'particle-editor': 'particle_editor', 'audiomixer': 'audio_mixer', 'audio-mixer': 'audio_mixer', 'buildwindow': 'build_window', 'build-window': 'build_window', 'settings': 'settings_panel', 'settings-panel': 'settings_panel', 'commandpalette': 'command_palette', 'command-palette': 'command_palette', 'searchresults': 'search_results', 'search-results': 'search_results', 'consoleentry': 'console_entry', 'console-entry': 'console_entry', 'profilergraph': 'profiler_graph', 'profiler-graph': 'profiler_graph', 'memoryview': 'memory_view', 'memory-view': 'memory_view', 'networkview': 'network_view', 'network-view': 'network_view', 'safearea': 'safe_area', 'safe-area': 'safe_area', 'healthbar': 'health_bar', 'health-bar': 'health_bar', 'manabar': 'mana_bar', 'mana-bar': 'mana_bar', 'inventoryslot': 'inventory_slot', 'inventory-slot': 'inventory_slot', 'questlog': 'quest_log', 'quest-log': 'quest_log', 'radialmenu': 'radial_menu', 'radial-menu': 'radial_menu', 'toucharea': 'touch_area', 'touch-area': 'touch_area' };
  return aliases[tag] || tag.replaceAll('-', '_');
}

const LSHTML_EVENT_HELPERS = new Map([
  ['onclick', 'click'], ['on-click', 'click'],
  ['onchange', 'change'], ['on-change', 'change'],
  ['oninput', 'input'], ['on-input', 'input'],
  ['onfocus', 'focus'], ['on-focus', 'focus'],
  ['onblur', 'blur'], ['on-blur', 'blur'],
  ['onkeydown', 'key_down'], ['on-key-down', 'key_down'],
  ['onkeyup', 'key_up'], ['on-key-up', 'key_up'],
  ['onpointerdown', 'pointer_down'], ['on-pointer-down', 'pointer_down'],
  ['onpointerup', 'pointer_up'], ['on-pointer-up', 'pointer_up'],
  ['onpointermove', 'pointer_move'], ['on-pointer-move', 'pointer_move'],
  ['onscroll', 'scroll'], ['on-scroll', 'scroll'],
]);

const LSHTML_ATTRIBUTES = Object.freeze([
  'id','class','class-name','text','value','placeholder','title','src','alt','name','context',
  'hidden','disabled','checked','selected','readonly','multiple','draggable','focusable',
  'tabindex','tab-index','min','max','step','number-value','maxlength','max-length','texture','style',
  'props','function','component',
  'x','y','x1','y1','x2','y2','x3','y3','cx','cy','width','height','radius','r','rx','ry',
  'radius-x','radius-y','closed','points','d',
  ...LSHTML_EVENT_HELPERS.keys(),
]);

const LSCSS_STATE_SELECTORS = Object.freeze(['hover','active','focus','disabled','checked','selected']);
const LSCSS_SELECTOR_FORMS = Object.freeze(['tag','.class','#id','ancestor descendant','parent > child','selector, selector']);

function lowerAttributes(nodeVar, node, expressionBindings) {
  const lines = [];
  const eventHelpers = LSHTML_EVENT_HELPERS;
  const contextAttribute = attr(node, 'context');
  const contextExpression = contextAttribute?.kind === 'expression' ? contextAttribute.value : null;
  const hasBoundEventContext = Boolean(contextExpression)
    && node.attrs.some((item) => eventHelpers.has(item.name.toLowerCase()));
  for (const a of node.attrs) {
    const name = a.name.toLowerCase();
    const staticValue = a.kind === 'string' || a.kind === 'bare' ? a.value : null;
    const expr = a.kind === 'expression' ? a.value : null;
    const canvasGeometry = canvasGeometryAttributeLines(nodeVar, node, a);
    if (canvasGeometry) { lines.push(...canvasGeometry); continue; }
    if (name === 'id') {
      if (expr) { lines.push(`${nodeVar}.set_id(${expr})`); lines.push(`${nodeVar}.add_binding("id",${escapeLsxString(expr)})`); }
      else lines.push(`${nodeVar}.set_id(${escapeLsxString(staticValue || '')})`);
    } else if (name === 'class' || name === 'class-name') {
      if (expr) { lines.push(`${nodeVar}.set_class(${expr})`); lines.push(`${nodeVar}.add_binding("class",${escapeLsxString(expr)})`); }
      else lines.push(`${nodeVar}.set_class(${escapeLsxString(staticValue || '')})`);
    } else if (name === 'text') {
      if (expr) {
        lines.push(`${nodeVar}.text = ${expr}`);
        lines.push(`${nodeVar}.mark_layout_dirty()`);
        lines.push(`${nodeVar}.add_binding("text",${escapeLsxString(expr)})`);
      } else {
        lines.push(`${nodeVar}.text = ${escapeLsxString(staticValue || '')}`);
        lines.push(`${nodeVar}.mark_layout_dirty()`);
      }
    } else if (name === 'value' || name === 'placeholder' || name === 'title' || name === 'src' || name === 'alt' || name === 'name') {
      const method = name === 'value' ? 'set_value' : name === 'placeholder' ? 'set_placeholder' : name === 'src' ? 'set_source' : name === 'alt' ? 'set_alt' : name === 'title' ? 'set_title' : 'set_name';
      if (expr) { lines.push(`${nodeVar}.${method}(${expr})`); lines.push(`${nodeVar}.add_binding(${escapeLsxString(name)},${escapeLsxString(expr)})`); }
      else lines.push(`${nodeVar}.${method}(${escapeLsxString(staticValue || '')})`);
    } else if (eventHelpers.has(name)) {
      const eventName = eventHelpers.get(name);
      const handler = expr || staticValue;
      if (contextExpression) lines.push(`__UI._bind_${eventName}(${nodeVar},${handler},memory.ptr(${contextExpression},0))`);
      else lines.push(`__UI.on_${eventName}(${nodeVar},${handler})`);
    } else if (name === 'context') {
      if (!hasBoundEventContext) {
        if (expr) lines.push(`__UI._set_event_context_handle(${nodeVar},memory.ptr(${expr},0))`);
        else lines.push(`__UI._set_event_context_handle(${nodeVar},0)`);
      }
    }
    else if (['hidden','disabled','checked','selected','readonly','multiple','draggable','focusable'].includes(name)) {
      const field = name === 'readonly' ? 'read_only' : name;
      const value = expr || (a.kind === 'boolean' ? 'true' : boolExpr(staticValue));
      lines.push(`${nodeVar}.${field} = ${value}`);
    } else if (name === 'tabindex' || name === 'tab-index') lines.push(`${nodeVar}.tab_index = ${expr || staticValue || '0'}`);
    else if (name === 'min') lines.push(`${nodeVar}.min_value = ${expr || staticValue || '0.0'}`);
    else if (name === 'max') lines.push(`${nodeVar}.max_value = ${expr || staticValue || '1.0'}`);
    else if (name === 'step') lines.push(`${nodeVar}.step_value = ${expr || staticValue || '1.0'}`);
    else if (name === 'number-value') lines.push(`${nodeVar}.number_value = ${expr || staticValue || '0.0'}`);
    else if (name === 'maxlength' || name === 'max-length') lines.push(`${nodeVar}.max_length = ${expr || staticValue || '0'}`);
    else if (name === 'texture') lines.push(`${nodeVar}.texture = ${expr || staticValue || '0'}`);
    else if (name === 'style' && expr) lines.push(`__UI.apply_style(${nodeVar},${expr})`);
    else if (name !== 'props' && name !== 'function' && name !== 'component') {
      if (expr) lines.push(`${nodeVar}.add_binding(${escapeLsxString(name)},${escapeLsxString(expr)})`);
      else lines.push(`${nodeVar}.set_attribute(${escapeLsxString(name)},${escapeLsxString(staticValue ?? 'true')})`);
    }
  }
  return lines;
}

function lowerTemplate(declaration, styleRules, alias) {
  const root = parseMarkup(declaration.body);
  const functionName = declaration.name;
  const params = declaration.params.join(',');
  const lines = [`${declaration.exported ? 'export ' : ''}fn ${functionName}(${params}) -> ${alias}.Element`];
  let counter = 0;
  let rootVar = null;
  const emitNode = (node, parentVar) => {
    if (node.tag === '__text') {
      const name = `__ui_${counter++}`;
      lines.push(`    local ${name} = ${alias}.text(${node.dynamic ? node.value : escapeLsxString(node.value)})`);
      lines.push(`    ${name}.creation_kind = ${alias}.CREATION_LSHTML`);
      lines.push(`    ${name}.template_id = ${hashText(declaration.name)}`);
      lines.push(`    ${name}.inherit_style = true`);
      if (node.dynamic) lines.push(`    ${name}.add_binding("text",${escapeLsxString(node.value)})`);
      if (parentVar) lines.push(`    ${name} = ${parentVar}.add(${name})`);
      return name;
    }
    const name = `__ui_${counter++}`;
    let create;
    const componentAttr = attr(node, 'function') || attr(node, 'component');
    const propsAttr = attr(node, 'props');
    const compactTag = node.tag.replaceAll('-', '');
    const custom = (!TAG_FUNCTIONS.has(node.tag) && !TAG_FUNCTIONS.has(compactTag)) || /^[A-Z]/.test(node.originalTag);
    if (node.tag === '__fragment') create = `${alias}.fragment()`;
    else if (node.tag === 'component' && componentAttr) {
      const fn = componentAttr.kind === 'expression' ? componentAttr.value : componentAttr.value;
      create = `${fn}(${propsAttr ? (propsAttr.kind === 'expression' ? propsAttr.value : propsAttr.value) : ''})`;
    } else if (custom) {
      create = `${node.originalTag}(${propsAttr ? (propsAttr.kind === 'expression' ? propsAttr.value : propsAttr.value) : ''})`;
    } else create = `${alias}.${functionForTag(node.tag)}()`;
    lines.push(`    local ${name} = ${create}`);
    lines.push(`    ${name}.template_id = ${hashText(declaration.name)}`);
    lines.push(`    ${name}.creation_kind = ${alias}.CREATION_LSHTML`);
    lines.push(`    ${name}.source_tag = ${escapeLsxString(node.originalTag)}`);
    lines.push(...lowerAttributes(name, node).map((v) => `    ${v.replaceAll('__UI', alias)}`));

    const matched = [];
    for (const rule of styleRules) {
      for (const selector of rule.selectors) if (selectorMatches(node, selector)) matched.push({ rule, selector, spec: specificity(selector) });
    }
    matched.sort((a, b) => {
      const aState = a.rule.state === '__UI.STATE_NORMAL' ? 0 : 1;
      const bState = b.rule.state === '__UI.STATE_NORMAL' ? 0 : 1;
      return aState - bState || a.spec - b.spec || a.rule.order - b.rule.order;
    });
    for (const item of matched) {
      if (item.rule.hasStatic) lines.push(`    ${item.rule.functionName}(${name})`);
      if (item.rule.hasDynamic) {
        lines.push(...styleCalls(name, item.rule.dynamicObject, item.rule.state).map((v) => `    ${v.replaceAll('__UI', alias)}`));
        lines.push(...styleBindingCalls(name, item.rule.dynamicObject, stateBindingName(item.rule.state)).map((v) => `    ${v}`));
      }
    }
    const inline = attr(node, 'style');
    if (inline?.kind === 'string') {
      const inlineObject = {};
      for (const piece of splitTopLevel(inline.value, new Set([';']))) {
        const at = findTopLevelAssignment(piece);
        if (at >= 0) inlineObject[piece.slice(0, at).trim()] = piece.slice(at + 1).trim();
      }
      lines.push(...styleCalls(name, inlineObject).map((v) => `    ${v.replaceAll('__UI', alias)}`));
    }
    if (!rootVar && node.tag !== '__fragment') rootVar = name;
    const collapsedText = node.children.length === 1 && node.children[0].tag === '__text';
    if (collapsedText) {
      const textChild = node.children[0];
      const textValue = textChild.dynamic ? textChild.value : escapeLsxString(textChild.value);
      // Textarea content is its editable value, matching HTML. Other collapsed
      // text stays the element label/content. Assign before parent attachment so
      // the retained copy starts with the complete state.
      if (node.tag === 'textarea') {
        lines.push(`    ${name}.set_value(${textValue})`);
        if (textChild.dynamic) lines.push(`    ${name}.add_binding("value",${escapeLsxString(textChild.value)})`);
      } else {
        lines.push(`    ${name}.text = ${textValue}`);
        lines.push(`    ${name}.mark_layout_dirty()`);
        if (textChild.dynamic) lines.push(`    ${name}.add_binding("text",${escapeLsxString(textChild.value)})`);
      }
    }
    const retainedChildCount = collapsedText ? 0 : node.children.length;
    if (retainedChildCount > 0) lines.push(`    ${name}.children.reserve(${retainedChildCount})`);
    if (parentVar) lines.push(`    ${name} = ${parentVar}.add(${name})`);
    if (!collapsedText) {
      for (const child of node.children) emitNode(child, name);
    }
    return name;
  };
  let generatedRoot;
  if (root.children.length === 1) generatedRoot = emitNode(root.children[0], null);
  else {
    generatedRoot = emitNode(root, null);
    rootVar = generatedRoot;
  }
  lines.push(`    ${generatedRoot}.template_root = true`);
  lines.push(`    return ${generatedRoot}`);
  lines.push('end');
  return lines.join('\n');
}

function selectorState(selector) {
  const match = /:(hover|active|focus|disabled|checked|selected)\b/i.exec(selector);
  const states = { hover: '__UI.STATE_HOVER', active: '__UI.STATE_ACTIVE', focus: '__UI.STATE_FOCUS', disabled: '__UI.STATE_DISABLED', checked: '__UI.STATE_CHECKED', selected: '__UI.STATE_SELECTED' };
  return match ? states[match[1].toLowerCase()] : '__UI.STATE_NORMAL';
}

function lowerStyle(declaration, index, alias) {
  const object = parseStyleObject(declaration.body);
  // Normal declarations are emitted separately from their hover/focus/etc.
  // deltas. Templates apply every normal rule first, then state deltas. That
  // guarantees a focus style is copied from the final cascaded base style
  // instead of from an early tag rule that is still missing later classes.
  const selectors = String(declaration.selector).split(',').map((item) => item.trim()).filter(Boolean);
  const rules = [];
  const blocks = [];
  selectors.forEach((selector, selectorIndex) => {
    const selectorStateValue = selectorState(selector);
    const groups = splitStyleObjectByState(object, selectorStateValue);
    groups.forEach((group, groupIndex) => {
      const split = splitStyleDynamics(group.object);
      const functionName = `__lsx_lscss_${index}_${selectorIndex}_${groupIndex}_${hashText(selector + ':' + group.state).toString(16)}`;
      const staticLines = styleCalls('target', split.staticObject, group.state);
      const lines = [`fn ${functionName}(target:${alias}.Element)`];
      for (const line of staticLines) lines.push(`    ${line.replaceAll('__UI', alias)}`);
      lines.push('end');
      blocks.push(lines.join('\n'));
      rules.push({
        functionName,
        selectors: [selector],
        order: index * 1000 + selectorIndex * 10 + groupIndex,
        state: group.state,
        hasStatic: staticLines.length > 0,
        hasDynamic: hasDynamicStyles(split.dynamicObject),
        dynamicObject: split.dynamicObject,
      });
    });
  });
  return { code: blocks.join('\n\n'), rules };
}

function compileInlineUiSource(source, filePath = '') {
  const declarations = scanDeclarations(source, filePath);
  if (declarations.length === 0) return { source, declarations: [] };
  const alias = `__LazyUI_${hashText(filePath || source).toString(16)}`;
  const loweredStyles = new Map();
  const styles = [];
  let styleIndex = 0;
  for (const declaration of declarations) {
    if (declaration.kind !== 'lscss') continue;
    const lowered = lowerStyle(declaration, styleIndex++, alias);
    loweredStyles.set(declaration, lowered);
    styles.push(...lowered.rules);
  }
  const replacements = new Map();
  for (const declaration of declarations) {
    if (declaration.kind === 'lscss') replacements.set(declaration, loweredStyles.get(declaration).code);
    else replacements.set(declaration, lowerTemplate(declaration, styles, alias));
  }
  let output = '';
  let cursor = 0;
  for (const declaration of declarations) {
    output += source.slice(cursor, declaration.start);
    const replacement = replacements.get(declaration);
    output += replacement;
    const removed = source.slice(declaration.start, declaration.end);
    const newlinesRemoved = (removed.match(/\n/g) || []).length;
    const newlinesAdded = (replacement.match(/\n/g) || []).length;
    if (newlinesRemoved > newlinesAdded) output += '\n'.repeat(newlinesRemoved - newlinesAdded);
    cursor = declaration.end;
  }
  output += source.slice(cursor);
  output = `use "@LazyScript/bindings/UI/LazyUI.lsx" as ${alias}\n${output}`;
  return { source: output, declarations };
}

const LSCSS_PROPERTIES = Object.freeze([...new Set(
  [...styleCalls.toString().matchAll(/case\s+'([^']+)'/g)].map((match) => match[1])
)]);

module.exports = {
  hashText,
  scanDeclarations,
  parseStyleObject,
  dynamicExpression,
  parseMarkup,
  compileInlineUiSource,
  styleCalls,
  TAG_FUNCTIONS,
  LSHTML_EVENT_HELPERS,
  LSHTML_ATTRIBUTES,
  LSCSS_PROPERTIES,
  LSCSS_STATE_SELECTORS,
  LSCSS_SELECTOR_FORMS,
};
