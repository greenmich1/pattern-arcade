/* ===== Abstract Reasoning Arcade — generator + validator + explainer engine ===== */
(function (root) {
'use strict';

/* ---------- RNG ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function RNG(seed) { this.r = mulberry32(seed >>> 0); }
RNG.prototype.f = function () { return this.r(); };
RNG.prototype.int = function (a, b) { return a + Math.floor(this.r() * (b - a + 1)); };
RNG.prototype.pick = function (arr) { return arr[Math.floor(this.r() * arr.length)]; };
RNG.prototype.chance = function (p) { return this.r() < p; };
RNG.prototype.shuffle = function (arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
RNG.prototype.sample = function (arr, n) { return this.shuffle(arr).slice(0, n); };

/* ---------- vocabulary ---------- */
const SHAPES_SYM = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'cross'];
const SHAPES_ROT = ['arrow', 'half', 'tee'];
const POLY = ['triangle', 'square', 'pentagon', 'hexagon'];
const SIZE_N = ['small', 'medium', 'large'];
const FILL_N = ['white', 'striped', 'black'];
const POS_N = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];
const SEG_N = ['top edge', 'right edge', 'bottom edge', 'left edge', 'top-left corner', 'top-right corner', 'bottom-right corner', 'bottom-left corner'];
const COLORS = ['#00D1FF', '#FFC400', '#B44CFF', '#22D36B', '#FF3D6E', '#FF8A00', '#3D7BFF'];
const ATTR_LABEL = { count: 'Number', size: 'Size', fill: 'Shading', shape: 'Shape', rot: 'Rotation', pos: 'Dot position', lines: 'Lines' };

const mod = (a, m) => ((a % m) + m) % m;
const rotl8 = (m, s) => { s = mod(s, 8); return ((m << s) | (m >>> (8 - s))) & 255; };
const bits = m => { let c = 0; for (let i = 0; i < 8; i++) if (m >> i & 1) c++; return c; };
const randMask = (rng, lo, hi) => { const k = rng.int(lo, hi); let m = 0; rng.sample([0, 1, 2, 3, 4, 5, 6, 7], k).forEach(b => m |= 1 << b); return m; };
const LOGIC = {
  OR: { f: (a, b) => a | b, name: 'overlay (add)', text: 'Column 3 overlays columns 1 and 2: every line that appears in either one is kept.' },
  XOR: { f: (a, b) => a ^ b, name: 'cancel-out (XOR)', text: 'Lines that appear in both columns 1 and 2 cancel out. Lines that appear in only one are kept.' },
  AND: { f: (a, b) => a & b, name: 'common lines (AND)', text: 'Only lines that appear in both columns 1 and 2 are kept.' },
  SUB: { f: (a, b) => a & ~b & 255, name: 'subtract', text: 'Column 3 is column 1 with column 2’s lines taken away.' }
};

function valName(attr, v) {
  switch (attr) {
    case 'count': return v === 1 ? '1 shape' : v + ' shapes';
    case 'size': return SIZE_N[v];
    case 'fill': return FILL_N[v];
    case 'rot': return (v * 45) + '°';
    case 'pos': return v < 0 ? 'no dot' : POS_N[v];
    case 'shape': return v;
    case 'lines': return bits(v) === 1 ? '1 line' : bits(v) + ' lines';
  }
  return String(v);
}
function tagName(attr, v) {
  switch (attr) {
    case 'count': return '×' + v;
    case 'size': return ['S', 'M', 'L'][v];
    case 'fill': return ['○', '▒', '●'][v];
    case 'rot': return (v * 45) + '°';
    case 'pos': return v < 0 ? '–' : ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][v];
    case 'shape': return ({ circle: '●', square: '■', triangle: '▲', diamond: '◆', pentagon: '⬟', hexagon: '⬢', star: '★', cross: '✚', arrow: '➜', half: '◗', tee: 'T' })[v] || v;
    case 'lines': return '|' + bits(v);
  }
  return String(v);
}

/* ---------- group-panel model (matrix + series) ---------- */
// {shape,count,size,fill,rot,pos,lines}
const GATTRS = ['shape', 'count', 'size', 'fill', 'rot', 'pos', 'lines'];
function gkey(p) { const r = SHAPES_ROT.includes(p.shape) ? p.rot : 0; return [p.shape, p.count, p.size, p.fill, r, p.pos, p.lines].join('|'); }
function gclone(p) { return Object.assign({}, p); }

/* ----- hypothesis library over a 3x3 grid (cell [2][2] unknown) ----- */
const ORD = { count: [1, 6], size: [0, 2], fill: [0, 2] };
const CYC = { rot: 8, pos: 8 };
function inDom(attr, v) { if (ORD[attr]) return v >= ORD[attr][0] && v <= ORD[attr][1]; return true; }

function gridHyps(attr, G) {
  const v = (r, c) => G[r][c][attr];
  const out = [];
  const add = (name, pred) => out.push({ name, pred });
  const eq = (a, b) => a === b;
  // constant in row
  if ([0, 1, 2].every(r => r === 2 ? eq(v(2, 0), v(2, 1)) : eq(v(r, 0), v(r, 1)) && eq(v(r, 1), v(r, 2)))) add('const_row', v(2, 0));
  if ([0, 1, 2].every(c => c === 2 ? eq(v(0, 2), v(1, 2)) : eq(v(0, c), v(1, c)) && eq(v(1, c), v(2, c)))) add('const_col', v(0, 2));
  if (attr === 'lines') {
    for (const op in LOGIC) {
      const f = LOGIC[op].f;
      if (f(v(0, 0), v(0, 1)) === v(0, 2) && f(v(1, 0), v(1, 1)) === v(1, 2)) add('logic_row:' + op, f(v(2, 0), v(2, 1)));
      if (f(v(0, 0), v(1, 0)) === v(2, 0) && f(v(0, 1), v(1, 1)) === v(2, 1)) add('logic_col:' + op, f(v(0, 2), v(1, 2)));
    }
    for (let s = 1; s < 8; s++) {
      if (rotl8(v(0, 0), s) === v(0, 1) && rotl8(v(0, 1), s) === v(0, 2) && rotl8(v(1, 0), s) === v(1, 1) && rotl8(v(1, 1), s) === v(1, 2) && rotl8(v(2, 0), s) === v(2, 1)) add('rot_row:' + s, rotl8(v(2, 1), s));
      if (rotl8(v(0, 0), s) === v(1, 0) && rotl8(v(1, 0), s) === v(2, 0) && rotl8(v(0, 1), s) === v(1, 1) && rotl8(v(1, 1), s) === v(2, 1) && rotl8(v(0, 2), s) === v(1, 2)) add('rot_col:' + s, rotl8(v(1, 2), s));
    }
  } else if (attr === 'shape') {
    const idx = s => POLY.indexOf(s);
    const all = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 2 && c === 2)) all.push(v(r, c));
    if (all.every(s => idx(s) >= 0)) {
      const d = idx(v(0, 1)) - idx(v(0, 0));
      if (d !== 0 && [0, 1].every(r => idx(v(r, 1)) - idx(v(r, 0)) === d && idx(v(r, 2)) - idx(v(r, 1)) === d) && idx(v(2, 1)) - idx(v(2, 0)) === d) {
        const n = idx(v(2, 1)) + d; if (n >= 0 && n < POLY.length) add('sides_row', POLY[n]);
      }
      const e = idx(v(1, 0)) - idx(v(0, 0));
      if (e !== 0 && [0, 1].every(c => idx(v(1, c)) - idx(v(0, c)) === e && idx(v(2, c)) - idx(v(1, c)) === e) && idx(v(1, 2)) - idx(v(0, 2)) === e) {
        const n = idx(v(1, 2)) + e; if (n >= 0 && n < POLY.length) add('sides_col', POLY[n]);
      }
    }
  } else {
    const m = CYC[attr];
    const diff = (a, b) => m ? mod(b - a, m) : b - a;
    const s = diff(v(0, 0), v(0, 1));
    if (s !== 0 && v(0, 0) >= -0 && diff(v(0, 1), v(0, 2)) === s && diff(v(1, 0), v(1, 1)) === s && diff(v(1, 1), v(1, 2)) === s && diff(v(2, 0), v(2, 1)) === s) {
      const n = m ? mod(v(2, 1) + s, m) : v(2, 1) + s; if (inDom(attr, n) && !(attr === 'pos' && v(0, 0) < 0)) add('prog_row:' + s, n);
    }
    const t = diff(v(0, 0), v(1, 0));
    if (t !== 0 && diff(v(1, 0), v(2, 0)) === t && diff(v(0, 1), v(1, 1)) === t && diff(v(1, 1), v(2, 1)) === t && diff(v(0, 2), v(1, 2)) === t) {
      const n = m ? mod(v(1, 2) + t, m) : v(1, 2) + t; if (inDom(attr, n) && !(attr === 'pos' && v(0, 0) < 0)) add('prog_col:' + t, n);
    }
  }
  // distribution of three (rows / cols)
  const set3 = arr => new Set(arr).size === 3;
  const r0 = [v(0, 0), v(0, 1), v(0, 2)], r1 = [v(1, 0), v(1, 1), v(1, 2)];
  if (set3(r0) && set3(r1) && r1.every(x => r0.includes(x)) && v(2, 0) !== v(2, 1) && r0.includes(v(2, 0)) && r0.includes(v(2, 1))) add('dist3_row', r0.find(x => x !== v(2, 0) && x !== v(2, 1)));
  const c0 = [v(0, 0), v(1, 0), v(2, 0)], c1 = [v(0, 1), v(1, 1), v(2, 1)];
  if (set3(c0) && set3(c1) && c1.every(x => c0.includes(x)) && v(0, 2) !== v(1, 2) && c0.includes(v(0, 2)) && c0.includes(v(1, 2))) add('dist3_col', c0.find(x => x !== v(0, 2) && x !== v(1, 2)));
  return out;
}

/* ----- hypothesis library over a series v0..v4 → v5 ----- */
function seriesHyps(attr, vals) {
  const out = []; const add = (name, pred) => out.push({ name, pred });
  const n = vals.length; // 5
  if (vals.every(x => x === vals[0])) add('const', vals[0]);
  for (let p = 2; p <= 3; p++) { let ok = true; for (let t = p; t < n; t++) if (vals[t] !== vals[t - p]) ok = false; if (ok && !vals.every(x => x === vals[0])) add('cycle' + p, vals[n - p]); }
  if (attr === 'lines') {
    for (let s = 1; s < 8; s++) { let ok = true; for (let t = 1; t < n; t++) if (rotl8(vals[t - 1], s) !== vals[t]) ok = false; if (ok) add('rot:' + s, rotl8(vals[n - 1], s)); }
    // add one line each step (accumulate clockwise / anticlockwise)
    for (const dir of [1, -1]) { let ok = true; for (let t = 1; t < n; t++) { const added = vals[t] & ~vals[t - 1]; if (bits(added) !== 1 || (vals[t] & vals[t - 1]) !== vals[t - 1]) { ok = false; break; } if (t >= 2) { const prev = vals[t - 1] & ~vals[t - 2]; if (rotl8(prev, dir) !== added) ok = false; } } if (ok) { const last = vals[n - 1] & ~vals[n - 2]; add('accum:' + dir, vals[n - 1] | rotl8(last, dir)); } }
    return out;
  }
  if (attr === 'shape') {
    const idx = s => POLY.indexOf(s);
    if (vals.every(s => idx(s) >= 0)) { const d = idx(vals[1]) - idx(vals[0]); if (d !== 0) { let ok = true; for (let t = 1; t < n; t++) if (idx(vals[t]) - idx(vals[t - 1]) !== d) ok = false; const nx = idx(vals[n - 1]) + d; if (ok && nx >= 0 && nx < POLY.length) add('sides', POLY[nx]); } }
    return out;
  }
  const m = CYC[attr];
  const diff = (a, b) => m ? mod(b - a, m) : b - a;
  if (attr === 'pos' && vals.some(x => x < 0)) return out;
  const d = diff(vals[0], vals[1]);
  if (d !== 0) { let ok = true; for (let t = 1; t < n; t++) if (diff(vals[t - 1], vals[t]) !== d) ok = false; if (ok) { const nx = m ? mod(vals[n - 1] + d, m) : vals[n - 1] + d; if (inDom(attr, nx)) add('prog:' + d, nx); } }
  if (m) { // accelerating step (+1 each time)
    for (const k of [1, -1]) { const d0 = diff(vals[0], vals[1]); let ok = true; for (let t = 2; t < n; t++) if (diff(vals[t - 1], vals[t]) !== mod(d0 + k * (t - 1), m)) ok = false; if (ok && mod(k, m) !== 0) add('accel:' + k, mod(vals[n - 1] + d0 + k * (n - 1), m)); }
  }
  return out;
}

function uniquePred(hyps) {
  if (!hyps.length) return { ok: false };
  const ps = new Set(hyps.map(h => String(h.pred)));
  return { ok: ps.size === 1, pred: hyps[0].pred, n: ps.size };
}

/* ---------- option builder with anti-typicality balance ---------- */
function buildOptions(correct, dimAlts, nOpt, rng, keyFn) {
  const dims = Object.keys(dimAlts).filter(d => dimAlts[d].length);
  if (!dims.length) return null;
  // candidate pool: single and double changes
  const pool = [];
  const seen = new Set([keyFn(correct)]);
  const push = (p, changed) => { const k = keyFn(p); if (seen.has(k)) return; seen.add(k); pool.push({ p, changed }); };
  dims.forEach(d => dimAlts[d].forEach(v => { const p = gclone(correct); p[d] = v; push(p, [d]); }));
  for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) {
    dimAlts[dims[i]].slice(0, 2).forEach(a => dimAlts[dims[j]].slice(0, 2).forEach(b => { const p = gclone(correct); p[dims[i]] = a; p[dims[j]] = b; push(p, [dims[i], dims[j]]); }));
  }
  if (dims.length >= 3) {
    for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) for (let k = j + 1; k < dims.length; k++)
      dimAlts[dims[i]].slice(0, 2).forEach(a => dimAlts[dims[j]].slice(0, 2).forEach(b => dimAlts[dims[k]].slice(0, 1).forEach(c => { const p = gclone(correct); p[dims[i]] = a; p[dims[j]] = b; p[dims[k]] = c; push(p, [dims[i], dims[j], dims[k]]); })));
  }
  if (pool.length < nOpt - 1) return null;
  const score = (o, opts) => GATTRS.reduce((s, d) => s + opts.filter(q => String(q[d]) === String(o[d])).length, 0);
  let best = null, bestGap = 1e9;
  const target = rng.int(0, nOpt - 1); // where the answer should sit in a "typicality" ranking: uniform, so ranking leaks nothing
  for (let tries = 0; tries < 400; tries++) {
    const pick = rng.sample(pool, nOpt - 1);
    if (!pick.some(x => x.changed.length === 1)) continue; // keep at least one near-miss
    const opts = [correct].concat(pick.map(x => x.p));
    const sc = opts.map(o => score(o, opts));
    const higher = sc.slice(1).filter(v => v > sc[0]).length, ties = sc.slice(1).filter(v => v === sc[0]).length;
    const gap = target < higher ? higher - target : target > higher + ties ? target - higher - ties : 0;
    if (gap < bestGap) { bestGap = gap; best = pick; }
    if (gap === 0) break;
  }
  if (!best) return null;
  {
    const pick = best;
    const opts = [correct].concat(pick.map(x => x.p));
    const order = rng.shuffle(opts.map((_, i) => i));
    return { options: order.map(i => opts[i]), answer: order.indexOf(0), changed: order.map(i => i === 0 ? [] : pick[i - 1].changed) };
  }
  return null;
}

/* ================= MATRIX ================= */
const MATRIX_POOL = [
  { attr: 'count', type: 'prog', minL: 1 },
  { attr: 'size', type: 'prog', minL: 1 },
  { attr: 'fill', type: 'const_row', minL: 1 },
  { attr: 'shape', type: 'dist3', minL: 2 },
  { attr: 'fill', type: 'dist3', minL: 3 },
  { attr: 'pos', type: 'prog', minL: 3 },
  { attr: 'shape', type: 'sides', minL: 4 },
  { attr: 'count', type: 'dist3', minL: 4 },
  { attr: 'rot', type: 'prog', minL: 5 },
  { attr: 'pos', type: 'dist3', minL: 5 },
  { attr: 'size', type: 'dist3', minL: 5 },
  { attr: 'lines', type: 'rotmask', minL: 6 },
  { attr: 'lines', type: 'logic', minL: 7 }
];
const FOCUS_RULES = {
  progression: r => r.type === 'prog' || r.type === 'sides',
  dist3: r => r.type === 'dist3' || r.type === 'const_row',
  movement: r => r.attr === 'pos' || r.attr === 'rot',
  logic: r => r.type === 'logic',
  lines: r => r.attr === 'lines'
};

function pickRules(L, n, rng, pool, focus) {
  let avail = pool.filter(r => r.minL <= L);
  for (let tries = 0; tries < 100; tries++) {
    const chosen = []; const attrs = new Set();
    let cand = rng.shuffle(avail);
    if (focus && FOCUS_RULES[focus]) { const f = cand.filter(FOCUS_RULES[focus]); if (f.length) { const r = rng.pick(f); chosen.push(r); attrs.add(r.attr); } }
    // prefer newest-tier rule at higher levels
    if (!chosen.length && L >= 3 && rng.chance(0.6)) { const top = cand.filter(r => r.minL >= L - 3); if (top.length) { const r = rng.pick(top); chosen.push(r); attrs.add(r.attr); } }
    for (const r of cand) { if (chosen.length >= n) break; if (attrs.has(r.attr)) continue; chosen.push(r); attrs.add(r.attr); }
    const has = (a, t) => chosen.some(r => r.attr === a && (!t || r.type === t));
    if (has('rot') && has('shape', 'sides')) continue;
    if (chosen.length === n) return chosen;
  }
  return null;
}

function genMatrix(L, rng, focus) {
  const nRules = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4][L - 1];
  const nOpt = [4, 4, 6, 6, 8, 8, 8, 8, 8, 8][L - 1];
  for (let attempt = 0; attempt < 400; attempt++) {
    const rules = pickRules(L, nRules, rng, MATRIX_POOL, focus);
    if (!rules) continue;
    const hasRot = rules.some(r => r.attr === 'rot');
    const shapeSet = hasRot ? SHAPES_ROT : SHAPES_SYM;
    // base constant values
    const base = {
      shape: rng.pick(shapeSet),
      count: rng.pick(L <= 4 ? [1, 2, 3] : [1, 2]),
      size: rng.pick([1, 2]),
      fill: rng.pick([0, 1, 2]),
      rot: hasRot ? rng.int(0, 7) : 0,
      pos: (L >= 6 && rng.chance(0.4)) ? rng.int(0, 7) : -1,
      lines: (L >= 7 && rng.chance(0.35)) ? randMask(rng, 2, 3) : 0
    };
    const G = [0, 1, 2].map(() => [0, 1, 2].map(() => gclone(base)));
    const set = (attr, fn) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) G[r][c][attr] = fn(r, c); };
    const meta = [];
    let fail = false;
    for (const rule of rules) {
      const a = rule.attr; const m = { attr: a, type: rule.type };
      if (rule.type === 'prog') {
        if (a === 'count') {
          const s = rng.pick([1, -1]); const diag = L >= 3 && rng.chance(0.6);
          const span = diag ? 4 : 2; const lo = s > 0 ? 1 : 1 + span; const hi = s > 0 ? 6 - span : 6;
          const st = rng.int(lo, hi); set(a, (r, c) => st + s * (c + (diag ? r : 0))); Object.assign(m, { s, diag });
        } else if (a === 'size') { const s = rng.pick([1, -1]); const st = s > 0 ? 0 : 2; set(a, (r, c) => st + s * c); Object.assign(m, { s }); }
        else if (a === 'rot' || a === 'pos') {
          const steps = a === 'rot' ? (L >= 7 ? [1, -1, 2, -2, 3, -3] : [2, -2]) : (L >= 7 ? [1, -1, 2, -2, 3, -3] : [1, -1, 2, -2]);
          const s = rng.pick(steps); const t = L >= 7 ? rng.pick([0, s, rng.int(1, 7)]) : rng.pick([0, s]); const st = rng.int(0, 7);
          set(a, (r, c) => mod(st + s * c + t * r, 8)); Object.assign(m, { s, t });
        }
      } else if (rule.type === 'sides') {
        const s = rng.pick([1, -1]); const st = s > 0 ? rng.int(0, 1) : rng.int(2, 3); set('shape', (r, c) => POLY[st + s * c]); Object.assign(m, { s });
      } else if (rule.type === 'const_row') {
        const vals = rng.shuffle([0, 1, 2]); set(a, (r) => vals[r]);
      } else if (rule.type === 'dist3') {
        let dom;
        if (a === 'shape') dom = shapeSet; else if (a === 'count') dom = [1, 2, 3, 4, 5]; else if (a === 'pos') dom = [0, 1, 2, 3, 4, 5, 6, 7]; else dom = [0, 1, 2];
        const vals = rng.sample(dom, 3); const k = rng.pick([1, 2]);
        set(a, (r, c) => vals[mod(c + k * r, 3)]); Object.assign(m, { vals, k });
      } else if (rule.type === 'rotmask') {
        const s = rng.pick([1, -1, 2, -2, 3]); const b0 = randMask(rng, 2, 3); const u = rng.int(1, 7);
        set(a, (r, c) => rotl8(rotl8(b0, u * r), s * c)); Object.assign(m, { s });
      } else if (rule.type === 'logic') {
        const op = rng.pick(Object.keys(LOGIC)); const f = LOGIC[op].f;
        for (let r = 0; r < 3; r++) {
          const A = randMask(rng, 2, 4), B = randMask(rng, 2, 4); const C = f(A, B);
          if (bits(C) === 0 || A === B) { fail = true; }
          G[r][0].lines = A; G[r][1].lines = B; G[r][2].lines = C;
        }
        Object.assign(m, { op });
      }
      meta.push(m);
    }
    if (fail) continue;
    // need marker present if pos rule
    // validate uniqueness for every attribute
    let ok = true; const preds = {};
    for (const a of GATTRS) {
      if (a === 'rot' && !hasRot) continue;
      const u = uniquePred(gridHyps(a, G)); if (!u.ok) { ok = false; break; } preds[a] = u.pred;
    }
    if (!ok) continue;
    const correct = G[2][2];
    if (GATTRS.some(a => (a !== 'rot' || hasRot) && String(preds[a]) !== String(correct[a]))) continue;
    // distractor alternatives
    const ruleAttrs = meta.map(m => m.attr);
    const alts = {};
    const known = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 2 && c === 2)) known.push(G[r][c]);
    const addAlt = (a, v) => { if (v === undefined || v === null) return; if (String(v) === String(correct[a])) return; if (a !== 'shape' && a !== 'lines' && !inDom(a, v) && !CYC[a]) return; alts[a] = alts[a] || []; if (!alts[a].some(x => String(x) === String(v))) alts[a].push(v); };
    for (const m of meta) {
      const a = m.attr; const cv = correct[a];
      if (a === 'lines' && m.type === 'logic') { for (const op in LOGIC) addAlt(a, LOGIC[op].f(G[2][0].lines, G[2][1].lines)); addAlt(a, G[2][1].lines); addAlt(a, G[2][0].lines); }
      else if (a === 'lines') { addAlt(a, G[2][1].lines); addAlt(a, rotl8(cv, 1)); addAlt(a, rotl8(cv, -1)); }
      else if (CYC[a]) { addAlt(a, G[2][1][a]); addAlt(a, mod(cv + 4, 8)); addAlt(a, mod(cv + 1, 8)); addAlt(a, mod(cv - 1, 8)); }
      else if (a === 'shape') { known.forEach(p => addAlt(a, p.shape)); addAlt(a, rng.pick(shapeSet)); }
      else { addAlt(a, G[2][1][a]); addAlt(a, cv + 1); addAlt(a, cv - 1); addAlt(a, G[2][0][a]); }
    }
    // perceptual / constant dims for low-rule items
    const constDims = ['fill', 'size', 'shape'].filter(d => !ruleAttrs.includes(d));
    const needDims = nOpt <= 4 ? 2 : 3;
    let extra = rng.shuffle(constDims);
    while (Object.keys(alts).length < needDims && extra.length) {
      const d = extra.shift();
      if (d === 'shape') addAlt(d, rng.pick(shapeSet.filter(s => s !== correct.shape)));
      else addAlt(d, rng.pick([0, 1, 2].filter(v => v !== correct[d])));
    }
    // filter alt values: invisible rot changes etc
    Object.keys(alts).forEach(a => { alts[a] = rng.shuffle(alts[a]).filter(v => { const p = gclone(correct); p[a] = v; return gkey(p) !== gkey(correct) && !(a === 'lines' && bits(v) === 0 && L < 7); }).slice(0, 3); });
    const built = buildOptions(correct, alts, nOpt, rng, gkey);
    if (!built) continue;
    // sanity: no option other than answer satisfies every attribute prediction
    const fits = built.options.map(o => GATTRS.every(a => (a === 'rot' && !hasRot) || String(o[a]) === String(preds[a])));
    if (fits.filter(Boolean).length !== 1 || !fits[built.answer]) continue;
    const item = { type: 'matrix', level: L, grid: G, rules: meta, hasRot, options: built.options, answer: built.answer, changed: built.changed };
    item.explain = explainMatrix(item);
    return item;
  }
  return null;
}

function ruleColorMap(rules) { const map = {}; rules.forEach((r, i) => map[r.attr] = COLORS[i % COLORS.length]); return map; }

function describeGridRule(m, G) {
  const a = m.attr; const v = (r, c) => G[r][c][a];
  const row = r => [0, 1, 2].map(c => (r === 2 && c === 2) ? '?' : valName(a, v(r, c)));
  const rowsTxt = [0, 1, 2].map(r => 'Row ' + (r + 1) + ': ' + row(r).join(' → ')).join('; ');
  const ans = valName(a, v(2, 2));
  const L = ATTR_LABEL[a];
  let title = '', detail = '';
  switch (m.type) {
    case 'prog':
      if (a === 'count') { title = 'Number of shapes ' + (m.s > 0 ? 'goes up' : 'goes down') + ' by 1 along each row'; detail = rowsTxt + (m.diag ? '. Each row also starts one higher than the last.' : '.'); }
      else if (a === 'size') { title = 'Size ' + (m.s > 0 ? 'grows' : 'shrinks') + ' one step along each row'; detail = rowsTxt + '.'; }
      else if (a === 'rot') { title = 'Each cell turns ' + (Math.abs(m.s) * 45) + '° ' + (m.s > 0 ? 'clockwise' : 'anticlockwise') + ' from the one before it'; detail = 'Compare neighbours along a row: the turn is always the same. ' + rowsTxt + '.'; }
      else { title = 'The dot moves ' + Math.abs(m.s) + ' place' + (Math.abs(m.s) > 1 ? 's' : '') + ' ' + (m.s > 0 ? 'clockwise' : 'anticlockwise') + ' around the edge each step'; detail = rowsTxt + '.'; }
      break;
    case 'sides': title = 'The shape ' + (m.s > 0 ? 'gains' : 'loses') + ' one side each step along a row'; detail = rowsTxt + '.'; break;
    case 'const_row': title = L + ' is the same within a row, and changes between rows'; detail = rowsTxt + '. Row 3 is ' + valName(a, v(2, 0)) + ', so the missing cell is too.'; break;
    case 'dist3': {
      const vals = [v(0, 0), v(0, 1), v(0, 2)].map(x => valName(a, x));
      title = 'Distribution of three: every row has one each of ' + vals.join(', ');
      detail = 'The order changes from row to row. Row 3 already has ' + valName(a, v(2, 0)) + ' and ' + valName(a, v(2, 1)) + ', so the missing cell needs ' + ans + '.'; break; }
    case 'rotmask': title = 'The line pattern rotates ' + (Math.abs(m.s) * 45) + '° ' + (m.s > 0 ? 'clockwise' : 'anticlockwise') + ' each step along a row'; detail = 'Track one line and watch where it goes, then check the others move the same way.'; break;
    case 'logic': title = 'Lines: ' + LOGIC[m.op].name; detail = LOGIC[m.op].text + ' Test it on rows 1 and 2, then apply it to row 3.'; break;
  }
  return { attr: a, title, detail, answerText: L + ': ' + ans };
}

function explainMatrix(item) {
  const G = item.grid; const colors = ruleColorMap(item.rules);
  const rules = item.rules.map(m => Object.assign(describeGridRule(m, G), { color: colors[m.attr] }));
  const ruleAttrs = item.rules.map(m => m.attr);
  const consts = GATTRS.filter(a => !ruleAttrs.includes(a) && (a !== 'rot' || item.hasRot) && !(a === 'pos' && G[0][0].pos < 0) && !(a === 'lines' && G[0][0].lines === 0));
  const L = ATTR_LABEL;
  const steps = [];
  steps.push({ kind: 'strategy', text: 'Predict before you look. Scan along the rows one feature at a time (number, shape, size, shading, rotation, position, lines). Build the missing cell in your head, then find it among the options.' });
  rules.forEach((r, i) => steps.push({ kind: 'rule', attr: r.attr, color: r.color, title: 'Rule ' + (i + 1) + ' — ' + r.title, text: r.detail }));
  if (consts.length) steps.push({ kind: 'const', text: 'Never changes: ' + consts.map(a => L[a].toLowerCase() + ' (' + valName(a, G[0][0][a]) + ')').join(', ') + '. Nothing to track there.' });
  steps.push({ kind: 'build', text: 'Put it together. The missing cell must have: ' + rules.map(r => r.answerText).join('; ') + '.' });
  const notes = optionNotes(item, rules);
  steps.push({ kind: 'match', text: 'Option ' + String.fromCharCode(65 + item.answer) + ' is the only one that fits every rule.', notes });
  return { rules, steps, notes };
}

function optionNotes(item, rules) {
  const correct = item.options[item.answer];
  return item.options.map((o, i) => {
    if (i === item.answer) return { ok: true, text: 'Fits every rule.' };
    const diffs = GATTRS.filter(a => (a !== 'rot' || item.hasRot) && String(o[a]) !== String(correct[a]));
    return { ok: false, text: diffs.map(a => { const r = rules.find(x => x.attr === a); if (a === 'lines' && bits(o[a]) === bits(correct[a])) return 'Lines are in the wrong places'; return ATTR_LABEL[a] + ' is ' + valName(a, o[a]) + ', should be ' + valName(a, correct[a]) + (r ? '' : ' (this never changes)'); }).join('. ') + '.', attrs: diffs };
  });
}

/* ================= SERIES ================= */
const SERIES_POOL = [
  { attr: 'count', type: 'prog', minL: 1 },
  { attr: 'pos', type: 'prog', minL: 1 },
  { attr: 'rot', type: 'prog', minL: 2 },
  { attr: 'fill', type: 'cycle2', minL: 1 },
  { attr: 'shape', type: 'cycle3', minL: 3 },
  { attr: 'size', type: 'cycle3', minL: 3 },
  { attr: 'lines', type: 'rotmask', minL: 5 },
  { attr: 'fill', type: 'cycle3', minL: 5 },
  { attr: 'lines', type: 'accum', minL: 6 },
  { attr: 'pos', type: 'cycle2', minL: 7 },
  { attr: 'pos', type: 'accel', minL: 8 }
];

function genSeries(L, rng, focus) {
  const nRules = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4][L - 1];
  const nOpt = [4, 4, 5, 5, 5, 5, 5, 5, 5, 5][L - 1];
  const N = 6;
  for (let attempt = 0; attempt < 400; attempt++) {
    const rules = pickRules(L, nRules, rng, SERIES_POOL, focus);
    if (!rules) continue;
    const hasRot = rules.some(r => r.attr === 'rot');
    const shapeSet = hasRot ? SHAPES_ROT : SHAPES_SYM;
    const base = { shape: rng.pick(shapeSet), count: rng.pick([1, 2]), size: rng.pick([1, 2]), fill: rng.pick([0, 2]), rot: hasRot ? rng.int(0, 7) : 0, pos: -1, lines: 0 };
    if (L >= 6 && rng.chance(0.3) && !rules.some(r => r.attr === 'lines')) base.lines = randMask(rng, 1, 2);
    const S = []; for (let t = 0; t < N; t++) S.push(gclone(base));
    const set = (a, fn) => S.forEach((p, t) => p[a] = fn(t));
    const meta = [];
    for (const rule of rules) {
      const a = rule.attr; const m = { attr: a, type: rule.type };
      if (rule.type === 'prog') {
        if (a === 'count') { const s = rng.pick([1, -1]); const st = s > 0 ? 1 : 6; set(a, t => st + s * t); m.s = s; }
        else { const steps = a === 'rot' ? (L >= 5 ? [1, -1, 2, -2, 3] : [2, -2]) : (L >= 5 ? [1, -1, 2, -2, 3, -3] : [1, -1, 2]); const s = rng.pick(steps); const st = rng.int(0, 7); set(a, t => mod(st + s * t, 8)); m.s = s; }
      } else if (rule.type === 'cycle2') {
        const dom = a === 'fill' ? [0, 1, 2] : [0, 1, 2, 3, 4, 5, 6, 7]; const v = rng.sample(dom, 2); set(a, t => v[t % 2]); m.vals = v;
      } else if (rule.type === 'cycle3') {
        const dom = a === 'shape' ? shapeSet : [0, 1, 2]; const v = rng.sample(dom, 3); set(a, t => v[t % 3]); m.vals = v;
      } else if (rule.type === 'sides') { const s = rng.pick([1, -1]); const st = s > 0 ? 0 : 3; set('shape', t => POLY[mod(st + s * Math.min(t, 3) , 4)]); m.s = s; /* invalid beyond 4: fixed below */ }
      else if (rule.type === 'rotmask') { const s = rng.pick([1, -1, 2, 3]); const b0 = randMask(rng, 1, 3); set(a, t => rotl8(b0, s * t)); m.s = s; }
      else if (rule.type === 'accum') { const dir = rng.pick([1, -1]); const st = rng.int(0, 7); set(a, t => { let mm = 0; for (let k = 0; k <= t; k++) mm |= 1 << mod(st + dir * k, 8); return mm; }); m.dir = dir; }
      else if (rule.type === 'accel') { const k = rng.pick([1, -1]); const st = rng.int(0, 7); const d0 = rng.pick([1, 2]) * k; let p = st; const arr = [st]; for (let t = 1; t < N; t++) { p = mod(p + d0 + k * (t - 1), 8); arr.push(p); } set(a, t => arr[t]); m.k = k; }
      meta.push(m);
    }
    // sides series only valid with 4 frames — skip if chosen (6 frames impossible)
    if (meta.some(m => m.type === 'sides')) continue;
    let ok = true; const preds = {};
    for (const a of GATTRS) {
      if (a === 'rot' && !hasRot) continue;
      const u = uniquePred(seriesHyps(a, S.slice(0, 5).map(p => p[a])));
      if (!u.ok) { ok = false; break; } preds[a] = u.pred;
    }
    if (!ok) continue;
    const correct = S[5];
    if (GATTRS.some(a => (a !== 'rot' || hasRot) && String(preds[a]) !== String(correct[a]))) continue;
    const alts = {}; const addAlt = (a, v) => { if (v === undefined) return; if (String(v) === String(correct[a])) return; if (ORD[a] && !inDom(a, v)) return; alts[a] = alts[a] || []; if (!alts[a].some(x => String(x) === String(v))) alts[a].push(v); };
    for (const m of meta) {
      const a = m.attr, cv = correct[a], last = S[4][a];
      if (a === 'lines') { addAlt(a, last); addAlt(a, rotl8(cv, 1)); addAlt(a, rotl8(cv, -1)); if (m.type === 'accum') addAlt(a, cv & ~(1 << mod(Math.log2(cv & ~last), 8))); }
      else if (CYC[a]) { const d = mod(cv - last, 8); addAlt(a, last); addAlt(a, mod(cv + d, 8)); addAlt(a, mod(last - d, 8)); addAlt(a, mod(cv + 4, 8)); }
      else if (a === 'shape') { S.forEach(p => addAlt(a, p.shape)); }
      else { addAlt(a, last); addAlt(a, cv + (cv - last)); addAlt(a, S[3][a]); [0, 1, 2].forEach(v => addAlt(a, v)); }
    }
    const ruleAttrs = meta.map(m => m.attr);
    const constDims = rng.shuffle(['fill', 'size', 'shape'].filter(d => !ruleAttrs.includes(d)));
    const needDims = nOpt <= 4 ? 2 : 3;
    while (Object.keys(alts).length < needDims && constDims.length) { const d = constDims.shift(); if (d === 'shape') addAlt(d, rng.pick(shapeSet.filter(s => s !== correct.shape))); else addAlt(d, rng.pick([0, 1, 2].filter(v => v !== correct[d]))); }
    Object.keys(alts).forEach(a => { alts[a] = alts[a].filter(v => { const p = gclone(correct); p[a] = v; return gkey(p) !== gkey(correct); }).slice(0, 3); });
    const built = buildOptions(correct, alts, nOpt, rng, gkey);
    if (!built) continue;
    const fits = built.options.map(o => GATTRS.every(a => (a === 'rot' && !hasRot) || String(o[a]) === String(preds[a])));
    if (fits.filter(Boolean).length !== 1 || !fits[built.answer]) continue;
    const item = { type: 'series', level: L, frames: S, rules: meta, hasRot, options: built.options, answer: built.answer, changed: built.changed };
    item.explain = explainSeries(item);
    return item;
  }
  return null;
}

function describeSeriesRule(m, S) {
  const a = m.attr; const seq = S.slice(0, 5).map(p => valName(a, p[a])).join(' → ') + ' → ?';
  const ans = valName(a, S[5][a]); const L = ATTR_LABEL[a];
  let title = '';
  switch (m.type) {
    case 'prog':
      if (a === 'count') title = 'Number of shapes ' + (m.s > 0 ? 'goes up' : 'goes down') + ' by 1 each frame';
      else if (a === 'rot') title = 'Turns ' + (Math.abs(m.s) * 45) + '° ' + (m.s > 0 ? 'clockwise' : 'anticlockwise') + ' each frame';
      else title = 'The dot moves ' + Math.abs(m.s) + ' place' + (Math.abs(m.s) > 1 ? 's' : '') + ' ' + (m.s > 0 ? 'clockwise' : 'anticlockwise') + ' each frame';
      break;
    case 'cycle2': title = L + ' alternates between two values'; break;
    case 'cycle3': title = L + ' repeats a cycle of three'; break;
    case 'rotmask': title = 'The lines rotate ' + (Math.abs(m.s) * 45) + '° ' + (m.s > 0 ? 'clockwise' : 'anticlockwise') + ' each frame'; break;
    case 'accum': title = 'One line is added each frame, moving ' + (m.dir > 0 ? 'clockwise' : 'anticlockwise'); break;
    case 'accel': title = 'The dot moves one place further each time (the step grows by 1)'; break;
  }
  return { attr: a, title, detail: seq + '. Next: ' + ans + '.', answerText: L + ': ' + ans };
}
function explainSeries(item) {
  const S = item.frames; const colors = ruleColorMap(item.rules);
  const rules = item.rules.map(m => Object.assign(describeSeriesRule(m, S), { color: colors[m.attr] }));
  const ruleAttrs = item.rules.map(m => m.attr);
  const consts = GATTRS.filter(a => !ruleAttrs.includes(a) && (a !== 'rot' || item.hasRot) && !(a === 'pos' && S[0].pos < 0) && !(a === 'lines' && S[0].lines === 0));
  const steps = [];
  steps.push({ kind: 'strategy', text: 'Compare neighbouring frames one feature at a time. Write each change as a step (+1, turn 90°, move 2). Then check the step holds for every frame before you trust it.' });
  rules.forEach((r, i) => steps.push({ kind: 'rule', attr: r.attr, color: r.color, title: 'Rule ' + (i + 1) + ' — ' + r.title, text: r.detail }));
  if (consts.length) steps.push({ kind: 'const', text: 'Stays the same in every frame: ' + consts.map(a => ATTR_LABEL[a].toLowerCase() + ' (' + valName(a, S[0][a]) + ')').join(', ') + '.' });
  steps.push({ kind: 'build', text: 'The next frame must have: ' + rules.map(r => r.answerText).join('; ') + '.' });
  const notes = optionNotes(item, rules);
  steps.push({ kind: 'match', text: 'Option ' + String.fromCharCode(65 + item.answer) + ' is the only one that continues every rule.', notes });
  return { rules, steps, notes };
}

/* ================= SCATTER panels (odd one out, sets) ================= */
// panel: {items:[{shape,fill(0|2),big(bool),cell}]}
const SC_SHAPES = ['circle', 'triangle', 'square', 'pentagon', 'hexagon'];
const SIDES = { circle: 0, triangle: 3, square: 4, pentagon: 5, hexagon: 6 };
function scGen(rng, opt) {
  const n = rng.int(opt.min || 2, opt.max || 6);
  const cells = rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8], n);
  const shapes = opt.shapes || SC_SHAPES;
  return { items: cells.map(cell => ({ shape: rng.pick(shapes), fill: rng.chance(opt.pBlack == null ? 0.45 : opt.pBlack) ? 2 : 0, big: opt.big ? rng.chance(0.3) : false, cell })) };
}
const nBlack = p => p.items.filter(i => i.fill === 2).length;
const nShape = (p, s) => p.items.filter(i => i.shape === s).length;
const totalSides = p => p.items.reduce((a, i) => a + SIDES[i.shape], 0);

function buildPredicates(maxTier) {
  const P = [];
  const add = (id, tier, text, test, tag, hl) => { if (tier <= maxTier) P.push({ id, tier, text, test, tag, hl }); };
  for (let k = 2; k <= 6; k++) add('count=' + k, 1, 'has exactly ' + k + ' shapes', p => p.items.length === k, p => '×' + p.items.length, p => p.items.map((_, i) => i));
  SC_SHAPES.forEach(s => add('has:' + s, 1, 'contains at least one ' + s, p => nShape(p, s) > 0, p => s + ' ×' + nShape(p, s), p => p.items.map((it, i) => it.shape === s ? i : -1).filter(i => i >= 0)));
  add('allsame', 1, 'uses only one type of shape', p => new Set(p.items.map(i => i.shape)).size === 1, p => new Set(p.items.map(i => i.shape)).size + ' type' + (new Set(p.items.map(i => i.shape)).size > 1 ? 's' : ''), p => p.items.map((_, i) => i));
  add('allblack', 1, 'has only black shapes', p => nBlack(p) === p.items.length, p => '● ' + nBlack(p) + '/' + p.items.length, p => p.items.map((it, i) => it.fill === 2 ? i : -1).filter(i => i >= 0));
  add('allwhite', 1, 'has only white shapes', p => nBlack(p) === 0, p => '● ' + nBlack(p) + '/' + p.items.length, p => p.items.map((it, i) => it.fill === 2 ? i : -1).filter(i => i >= 0));
  for (let k = 1; k <= 4; k++) add('black=' + k, 2, 'has exactly ' + k + ' black shape' + (k > 1 ? 's' : ''), p => nBlack(p) === k, p => '● ' + nBlack(p), p => p.items.map((it, i) => it.fill === 2 ? i : -1).filter(i => i >= 0));
  add('even', 2, 'has an even number of shapes', p => p.items.length % 2 === 0, p => '×' + p.items.length, p => p.items.map((_, i) => i));
  add('odd', 2, 'has an odd number of shapes', p => p.items.length % 2 === 1, p => '×' + p.items.length, p => p.items.map((_, i) => i));
  add('beven', 2, 'has an even number of black shapes', p => nBlack(p) % 2 === 0, p => '● ' + nBlack(p), p => p.items.map((it, i) => it.fill === 2 ? i : -1).filter(i => i >= 0));
  add('bodd', 2, 'has an odd number of black shapes', p => nBlack(p) % 2 === 1, p => '● ' + nBlack(p), p => p.items.map((it, i) => it.fill === 2 ? i : -1).filter(i => i >= 0));
  add('bmore', 2, 'has more black shapes than white', p => nBlack(p) * 2 > p.items.length, p => '●' + nBlack(p) + ' ○' + (p.items.length - nBlack(p)), p => p.items.map((it, i) => it.fill === 2 ? i : -1).filter(i => i >= 0));
  add('wmore', 2, 'has more white shapes than black', p => nBlack(p) * 2 < p.items.length, p => '●' + nBlack(p) + ' ○' + (p.items.length - nBlack(p)), p => p.items.map((it, i) => it.fill === 0 ? i : -1).filter(i => i >= 0));
  add('alldiff', 3, 'has no two shapes of the same type', p => new Set(p.items.map(i => i.shape)).size === p.items.length, p => new Set(p.items.map(i => i.shape)).size + '/' + p.items.length + ' types', p => p.items.map((_, i) => i));
  add('twin', 3, 'contains two identical shapes (same type and shading)', p => { const k = p.items.map(i => i.shape + i.fill); return new Set(k).size < k.length; }, p => 'pair?', p => { const k = p.items.map(i => i.shape + i.fill); return p.items.map((_, i) => k.indexOf(k[i]) !== i || k.lastIndexOf(k[i]) !== i ? i : -1).filter(i => i >= 0); });
  add('centre', 3, 'has a shape in the centre', p => p.items.some(i => i.cell === 4), p => p.items.some(i => i.cell === 4) ? 'centre ✓' : 'centre ✗', p => p.items.map((it, i) => it.cell === 4 ? i : -1).filter(i => i >= 0));
  add('nocentre', 3, 'leaves the centre empty', p => !p.items.some(i => i.cell === 4), p => p.items.some(i => i.cell === 4) ? 'centre ✓' : 'centre ✗', p => p.items.map((it, i) => it.cell === 4 ? i : -1).filter(i => i >= 0));
  add('seven', 3, 'has an even total number of straight sides', p => totalSides(p) % 2 === 0, p => 'Σ ' + totalSides(p), p => p.items.map((_, i) => i));
  add('sodd', 3, 'has an odd total number of straight sides', p => totalSides(p) % 2 === 1, p => 'Σ ' + totalSides(p), p => p.items.map((_, i) => i));
  add('tri-black', 3, 'has at least one triangle, and every triangle is black', p => nShape(p, 'triangle') > 0 && p.items.every(i => i.shape !== 'triangle' || i.fill === 2), p => '▲● ' + p.items.filter(i => i.shape === 'triangle' && i.fill === 2).length + '/' + nShape(p, 'triangle'), p => p.items.map((it, i) => it.shape === 'triangle' ? i : -1).filter(i => i >= 0));
  add('circ-white', 3, 'has at least one circle, and every circle is white', p => nShape(p, 'circle') > 0 && p.items.every(i => i.shape !== 'circle' || i.fill === 0), p => '○ ' + p.items.filter(i => i.shape === 'circle' && i.fill === 0).length + '/' + nShape(p, 'circle'), p => p.items.map((it, i) => it.shape === 'circle' ? i : -1).filter(i => i >= 0));
  add('big-black', 3, 'has a large shape, and every large shape is black', p => p.items.some(i => i.big) && p.items.every(i => !i.big || i.fill === 2), p => 'L● ' + p.items.filter(i => i.big && i.fill === 2).length + '/' + p.items.filter(i => i.big).length, p => p.items.map((it, i) => it.big ? i : -1).filter(i => i >= 0));
  add('big-white', 3, 'has a large shape, and every large shape is white', p => p.items.some(i => i.big) && p.items.every(i => !i.big || i.fill === 0), p => 'L○ ' + p.items.filter(i => i.big && i.fill === 0).length + '/' + p.items.filter(i => i.big).length, p => p.items.map((it, i) => it.big ? i : -1).filter(i => i >= 0));
  add('c=s', 3, 'has the same number of circles as squares (at least one of each)', p => nShape(p, 'circle') > 0 && nShape(p, 'circle') === nShape(p, 'square'), p => '●' + nShape(p, 'circle') + ' ■' + nShape(p, 'square'), p => p.items.map((it, i) => it.shape === 'circle' || it.shape === 'square' ? i : -1).filter(i => i >= 0));
  return P;
}
const PRED_ALL = buildPredicates(3);
const predById = id => PRED_ALL.find(p => p.id === id);
const tierOf = L => L <= 3 ? 1 : L <= 6 ? 2 : 3;

function sample(rng, opt, cond, tries) { for (let i = 0; i < (tries || 300); i++) { const p = scGen(rng, opt); if (cond(p)) return p; } return null; }

/* ---------- ODD ONE OUT ---------- */
function genOdd(L, rng) {
  const N = L <= 5 ? 5 : 9;
  const tier = tierOf(L);
  const cands = PRED_ALL.filter(p => p.tier === tier || (p.tier === tier - 1 && rng.chance(0.3)));
  for (let attempt = 0; attempt < 600; attempt++) {
    const pred = rng.pick(cands);
    const opt = { min: 2, max: L <= 3 ? 5 : 6, big: pred.id.startsWith('big') || (L >= 8 && rng.chance(0.4)), pBlack: 0.45, shapes: L <= 2 ? rng.sample(SC_SHAPES, 3) : SC_SHAPES };
    const panels = []; let bad = false;
    for (let i = 0; i < N - 1; i++) { const p = sample(rng, opt, pred.test); if (!p) { bad = true; break; } panels.push(p); }
    if (bad) continue;
    const oddP = sample(rng, opt, p => !pred.test(p)); if (!oddP) continue;
    const key = rng.int(0, N - 1); panels.splice(key, 0, oddP);
    // validate: every predicate that splits off exactly one item must point at key
    let ok = true; const alsoTrue = [];
    for (const q of PRED_ALL) {
      const t = panels.map(q.test); const nt = t.filter(Boolean).length;
      if (nt === N - 1) { const i = t.indexOf(false); if (i !== key) { ok = false; break; } if (q.id !== pred.id) alsoTrue.push(q); }
      if (nt === 1) { const i = t.indexOf(true); if (i !== key) { ok = false; break; } }
    }
    if (!ok) continue;
    if (alsoTrue.some(q => q.tier < pred.tier)) continue; // a simpler rule would explain it — keep the intended rule the simplest
    const item = { type: 'odd', level: L, panels, answer: key, pred: pred.id };
    item.explain = explainOdd(item);
    return item;
  }
  return null;
}
function explainOdd(item) {
  const pred = predById(item.pred); const col = COLORS[0];
  const steps = [];
  steps.push({ kind: 'strategy', text: 'Find one feature the figures share. Count things (shapes, black shapes, sides), look for a shape that always appears, and check relations (do all triangles share a shading?). Test each idea against every figure.' });
  steps.push({ kind: 'rule', attr: 'pred', color: col, title: 'Shared rule — every other figure ' + pred.text, text: 'Read the coloured tags: each figure shows the count that matters for this rule.' });
  steps.push({ kind: 'build', text: 'Figure ' + (item.answer + 1) + ' breaks it (' + pred.tag(item.panels[item.answer]) + '), so it is the odd one out.' });
  steps.push({ kind: 'match', text: 'Check: no other simple rule singles out a different figure. That is what makes this answer the only defensible one.' });
  return { rules: [{ attr: 'pred', color: col, title: pred.text }], steps, pred: pred.id };
}

/* ---------- SET A / SET B ---------- */
const SET_PAIRS = [
  ['count=2', 'count=4', 1], ['count=3', 'count=5', 1], ['allblack', 'allwhite', 1], ['has:circle', 'has:square', 1],
  ['black=1', 'black=2', 2], ['black=2', 'black=3', 2], ['bmore', 'wmore', 2], ['even', 'odd', 2], ['beven', 'bodd', 2], ['black=1', 'black=3', 2],
  ['alldiff', 'allsame', 3], ['tri-black', 'circ-white', 3], ['big-black', 'big-white', 3], ['centre', 'nocentre', 3], ['seven', 'sodd', 3], ['twin', 'alldiff', 3]
];
function genSets(L, rng) {
  const tier = tierOf(L);
  const pairs = SET_PAIRS.filter(p => p[2] === tier || (p[2] === tier - 1 && rng.chance(0.25)));
  for (let attempt = 0; attempt < 800; attempt++) {
    const pr = rng.pick(pairs); const flip = rng.chance(0.5);
    const pA = predById(flip ? pr[1] : pr[0]), pB = predById(flip ? pr[0] : pr[1]);
    const opt = { min: 2, max: 6, big: pA.id.startsWith('big'), pBlack: 0.45 };
    const inA = p => pA.test(p) && !pB.test(p), inB = p => pB.test(p) && !pA.test(p), inN = p => !pA.test(p) && !pB.test(p);
    const A = [], B = []; let bad = false;
    for (let i = 0; i < 6 && !bad; i++) { const a = sample(rng, opt, inA); const b = sample(rng, opt, inB); if (!a || !b) bad = true; else { A.push(a); B.push(b); } }
    if (bad) continue;
    const answers = ['A', 'B']; const hasN = !!sample(rng, opt, inN, 120); if (hasN) answers.push('N');
    const ans = rng.pick(answers);
    const test = sample(rng, opt, ans === 'A' ? inA : ans === 'B' ? inB : inN); if (!test) continue;
    // validate: all consistent rule pairs classify the test figure the same way
    const candA = PRED_ALL.filter(q => A.every(q.test) && !B.some(q.test));
    const candB = PRED_ALL.filter(q => B.every(q.test) && !A.some(q.test));
    if (!candA.length || !candB.length) continue;
    let ok = true;
    for (const qa of candA) { for (const qb of candB) { const a = qa.test(test), b = qb.test(test); const c = a && !b ? 'A' : b && !a ? 'B' : (!a && !b ? 'N' : 'X'); if (c !== ans) { ok = false; break; } } if (!ok) break; }
    if (!ok) continue;
    if (candA.some(q => q.tier < pA.tier) || candB.some(q => q.tier < pB.tier)) continue;
    const item = { type: 'sets', level: L, A, B, test, answer: ans, pA: pA.id, pB: pB.id, hasN };
    item.explain = explainSets(item);
    return item;
  }
  return null;
}
function explainSets(item) {
  const pA = predById(item.pA), pB = predById(item.pB);
  const name = { A: 'Set A', B: 'Set B', N: 'Neither' }[item.answer];
  const steps = [];
  steps.push({ kind: 'strategy', text: 'Look at Set A only, and find what every figure has in common. Then do the same for Set B. The two rules usually mirror each other (2 vs 3 black shapes, even vs odd).' });
  steps.push({ kind: 'rule', attr: 'A', color: COLORS[0], title: 'Set A — every figure ' + pA.text, text: 'Tags show the deciding count. No figure in Set B fits this rule.' });
  steps.push({ kind: 'rule', attr: 'B', color: COLORS[2], title: 'Set B — every figure ' + pB.text, text: 'No figure in Set A fits this rule.' });
  const tA = pA.test(item.test), tB = pB.test(item.test);
  steps.push({ kind: 'build', text: 'Test figure: ' + (tA ? 'fits Set A’s rule' : 'does not fit Set A’s rule') + ' (' + pA.tag(item.test) + ') and ' + (tB ? 'fits Set B’s rule' : 'does not fit Set B’s rule') + (pB.tag(item.test) !== pA.tag(item.test) ? ' (' + pB.tag(item.test) + ')' : '') + '.' });
  steps.push({ kind: 'match', text: 'Answer: ' + name + '. Every other rule that also separates the two sets gives the same verdict, so the answer is unambiguous.' });
  return { rules: [{ attr: 'A', color: COLORS[0], title: pA.text }, { attr: 'B', color: COLORS[2], title: pB.text }], steps };
}

/* ================= DIAGRAMMATIC ================= */
const TOK_SHAPES = ['circle', 'square', 'triangle', 'star', 'diamond', 'cross'];
const OPS = {
  REV: { name: 'reverse the order', f: s => s.slice().reverse(), tier: 1 },
  SW12: { name: 'swap the first two', f: s => { const a = s.slice(); [a[0], a[1]] = [a[1], a[0]]; return a; }, tier: 1 },
  INV: { name: 'flip every shading (black ↔ white)', f: s => s.map(t => ({ shape: t.shape, fill: 2 - t.fill })), tier: 1 },
  CYL: { name: 'move the first figure to the end', f: s => s.slice(1).concat([s[0]]), tier: 2 },
  CYR: { name: 'move the last figure to the front', f: s => [s[s.length - 1]].concat(s.slice(0, -1)), tier: 2 },
  SWL: { name: 'swap the last two', f: s => { const a = s.slice(); const n = a.length; [a[n - 2], a[n - 1]] = [a[n - 1], a[n - 2]]; return a; }, tier: 2 },
  INV1: { name: 'flip the shading of the first figure', f: s => s.map((t, i) => i === 0 ? { shape: t.shape, fill: 2 - t.fill } : t), tier: 2 },
  INVL: { name: 'flip the shading of the last figure', f: s => s.map((t, i) => i === s.length - 1 ? { shape: t.shape, fill: 2 - t.fill } : t), tier: 3 },
  SWE: { name: 'swap the first and last', f: s => { const a = s.slice(); const n = a.length; [a[0], a[n - 1]] = [a[n - 1], a[0]]; return a; }, tier: 3, minLen: 4 },
  DUPF: { name: 'replace the last figure with a copy of the first', f: s => s.slice(0, -1).concat([s[0]]), tier: 3 }
};
const SYMS = ['star', 'ring', 'tri', 'sq', 'hex', 'plus'];
const seqKey = s => s.map(t => t.shape[0] + t.shape[1] + t.fill).join(',');
function applyOps(seq, ops, map) { return ops.reduce((s, sym) => OPS[map[sym]].f(s), seq); }

function genDiagram(L, rng) {
  const len = L <= 5 ? 3 : 4;
  const tier = tierOf(L);
  const lib = Object.keys(OPS).filter(k => OPS[k].tier <= tier && (!OPS[k].minLen || len >= OPS[k].minLen));
  const nQ = [1, 1, 2, 2, 2, 3, 3, 3, 3, 4][L - 1];
  const extraSym = L >= 6 ? 1 : 0;
  const chain = L >= 5; // examples may chain operators
  const randSeq = () => rng.sample(TOK_SHAPES, len).map(sh => ({ shape: sh, fill: rng.pick([0, 2]) }));
  const mixedSeq = () => { for (let i = 0; i < 50; i++) { const s = randSeq(); const b = s.filter(t => t.fill === 2).length; if (b > 0 && b < len) return s; } return randSeq(); };
  for (let attempt = 0; attempt < 300; attempt++) {
    const nSym = nQ + extraSym;
    const syms = rng.sample(SYMS, nSym);
    const opsChosen = rng.sample(lib.filter(k => OPS[k].tier >= Math.max(1, tier - 1) || rng.chance(0.5)), nSym);
    if (opsChosen.length < nSym) continue;
    const map = {}; syms.forEach((s, i) => map[s] = opsChosen[i]);
    const qOps = rng.shuffle(syms.slice(0, nQ));
    // examples
    const examples = [];
    const pool = rng.shuffle(syms);
    if (chain && nSym >= 2) {
      // one single-op example, then chained examples that overlap
      examples.push({ ops: [pool[0]] });
      for (let i = 1; i < nSym; i++) examples.push({ ops: rng.shuffle([pool[i], pool[i - 1]]) });
    } else pool.forEach(s => examples.push({ ops: [s] }));
    examples.forEach(e => { e.input = mixedSeq(); e.output = applyOps(e.input, e.ops, map); });
    // ensure examples are not no-ops visually
    if (examples.some(e => seqKey(e.input) === seqKey(e.output))) continue;
    const qIn = mixedSeq();
    const qOut = applyOps(qIn, qOps, map);
    if (seqKey(qIn) === seqKey(qOut)) continue;
    // validate via brute force over all assignments
    const assign = {}; const outs = new Set(); const symOps = {}; syms.forEach(s => symOps[s] = new Set());
    const rec = i => {
      if (outs.size > 1) return;
      if (i === syms.length) {
        if (examples.every(e => seqKey(applyOps(e.input, e.ops, assign)) === seqKey(e.output))) { outs.add(seqKey(applyOps(qIn, qOps, assign))); syms.forEach(s => symOps[s].add(assign[s])); }
        return;
      }
      for (const k of lib) { assign[syms[i]] = k; rec(i + 1); }
    };
    rec(0);
    if (outs.size !== 1) continue;
    if (syms.some(s => symOps[s].size !== 1)) continue; // every symbol must be decodable in exactly one way
    // options
    const optsSeq = [qOut]; const seen = new Set([seqKey(qOut)]);
    const tryAdd = s => { const k = seqKey(s); if (!seen.has(k)) { seen.add(k); optsSeq.push(s); } };
    if (qOps.length > 1) tryAdd(applyOps(qIn, qOps.slice().reverse(), map)); // wrong order
    qOps.forEach((_, i) => tryAdd(applyOps(qIn, qOps.filter((__, j) => j !== i), map))); // skipped step
    qOps.forEach(sym => lib.filter(k => k !== map[sym]).forEach(k => { if (optsSeq.length < 9) { const m2 = Object.assign({}, map); m2[sym] = k; tryAdd(applyOps(qIn, qOps, m2)); } }));
    tryAdd(qIn);
    Object.keys(OPS).forEach(k => { if (optsSeq.length < 7 && (!OPS[k].minLen || len >= OPS[k].minLen)) { qOps.forEach(sym => { const m2 = Object.assign({}, map); m2[sym] = k; tryAdd(applyOps(qIn, qOps, m2)); }); } });
    if (optsSeq.length < 5) continue;
    const keep = [optsSeq[0]].concat(rng.shuffle(optsSeq.slice(1)).slice(0, 4));
    const order = rng.shuffle([0, 1, 2, 3, 4]);
    const options = order.map(i => keep[i]);
    const item = { type: 'diagram', level: L, len, examples, question: { input: qIn, ops: qOps }, map, options, answer: order.indexOf(0) };
    item.explain = explainDiagram(item);
    return item;
  }
  return null;
}
function explainDiagram(item) {
  const syms = Object.keys(item.map);
  const colorOf = {}; syms.forEach((s, i) => colorOf[s] = COLORS[i % COLORS.length]);
  const steps = [];
  steps.push({ kind: 'strategy', text: 'Decode each symbol first. Start with an example that uses one symbol on its own, then use what you learned to crack the examples that combine two.' });
  syms.forEach(s => {
    const ex = item.examples.findIndex(e => e.ops.length === 1 && e.ops[0] === s);
    const exi = ex >= 0 ? ex : item.examples.findIndex(e => e.ops.includes(s));
    steps.push({ kind: 'rule', attr: s, color: colorOf[s], sym: s, title: 'Symbol means: ' + OPS[item.map[s]].name, text: 'See example ' + (exi + 1) + (item.examples[exi].ops.length > 1 ? ' (after undoing the other symbol you already know).' : '.') + (item.question.ops.includes(s) ? '' : ' This symbol is not used in the question.') });
  });
  let cur = item.question.input; const trace = [cur];
  item.question.ops.forEach(s => { cur = OPS[item.map[s]].f(cur); trace.push(cur); });
  steps.push({ kind: 'build', text: 'Apply the question’s symbols in order, left to right. Each intermediate result is shown below.', trace, ops: item.question.ops });
  steps.push({ kind: 'match', text: 'Option ' + String.fromCharCode(65 + item.answer) + ' matches the final result. Wrong options come from skipping a step, swapping the order, or misreading a symbol.' });
  return { rules: syms.map(s => ({ attr: s, color: colorOf[s], title: OPS[item.map[s]].name })), steps, colorOf };
}

/* ================= public ================= */
const GEN = { matrix: genMatrix, series: genSeries, odd: genOdd, sets: genSets, diagram: genDiagram };
function generate(type, level, seed, focus) {
  const rng = new RNG(seed);
  let L = Math.max(1, Math.min(10, level | 0));
  for (let down = 0; down < 3; down++) { const it = GEN[type](Math.max(1, L - down), rng, focus); if (it) { it.seed = seed; it.level = level; return it; } }
  return null;
}

root.ARC = { generate, RNG, GATTRS, SHAPES_ROT, SIZE_N, FILL_N, POS_N, COLORS, ATTR_LABEL, valName, tagName, predById, OPS, applyOps, seqKey, gridHyps, seriesHyps, uniquePred, bits, PRED_ALL, LOGIC };
})(typeof module !== 'undefined' ? module.exports : window);
