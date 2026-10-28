#!/usr/bin/env node
// Tailwind 클래스 → 실제 px/hex 해석, Figma 값 → 프로젝트 토큰 역조회.
// 프로젝트에 설치된 tailwindcss(v3/v4)로 직접 컴파일하므로 커스텀 설정·root font-size·CSS 변수 체인이 반영된다.
//
// 사용:
//   node tw-resolve.mjs [옵션] resolve "<클래스들>"
//   node tw-resolve.mjs [옵션] find <spacing|color|font-size|font-weight|line-height|radius|shadow> [값]
// 옵션:
//   --cwd <프로젝트 루트>   기본: 현재 디렉터리
//   --css <전역 CSS>        v3: CSS 변수·root font-size 출처 / v4: 컴파일 엔트리 (여러 번 지정 가능)
//   --config <파일>         v3 tailwind 설정 파일 (기본: 자동 탐지)
//   --root-px <N>           root font-size 강제 (기본: html/:root font-size 탐지, 없으면 16)
//   --json                  JSON 출력

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ───────── 인자 ─────────
const argv = process.argv.slice(2);
const opts = { cwd: process.cwd(), css: [], config: null, rootPx: null, json: false };
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--cwd') opts.cwd = path.resolve(argv[++i]);
  else if (a === '--css') opts.css.push(argv[++i]);
  else if (a === '--config') opts.config = argv[++i];
  else if (a === '--root-px') opts.rootPx = Number(argv[++i]);
  else if (a === '--json') opts.json = true;
  else if (a === '-h' || a === '--help') usage(0);
  else rest.push(a);
}
const [command, ...cmdArgs] = rest;
if (!command || !['resolve', 'find'].includes(command)) usage(1);

function usage(code) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n');
  console.log(src.slice(1, 13).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(code);
}

function fail(msg) {
  console.error(`tw-resolve: ${msg}`);
  console.error('→ 수동 해석 절차는 references/tailwind.md 참고');
  process.exit(2);
}

// ───────── 프로젝트 탐지 ─────────
const cwd = opts.cwd;
if (!fs.existsSync(path.join(cwd, 'package.json'))) fail(`package.json 없음: ${cwd} (--cwd로 프로젝트 루트 지정)`);
const req = createRequire(path.join(cwd, 'package.json'));

function findUp(rel) {
  let dir = cwd;
  for (;;) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const twPkgPath = findUp('node_modules/tailwindcss/package.json');
if (!twPkgPath) fail('tailwindcss가 설치되어 있지 않음 (node_modules/tailwindcss 없음)');
const twVersion = JSON.parse(fs.readFileSync(twPkgPath, 'utf8')).version;
const twMajor = Number(twVersion.split('.')[0]);
const twDir = path.dirname(twPkgPath);

let postcss;
try {
  postcss = req('postcss');
} catch {
  try {
    postcss = createRequire(twPkgPath)('postcss');
  } catch {
    fail('postcss를 찾을 수 없음 (프로젝트 또는 tailwindcss 의존성에 필요)');
  }
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', 'coverage', 'storybook-static', 'public', '.turbo', '.vercel']);
function walkCss(dir, depth, acc) {
  if (depth < 0 || !fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walkCss(path.join(dir, e.name), depth - 1, acc);
    } else if (e.name.endsWith('.css')) acc.push(path.join(dir, e.name));
  }
  return acc;
}

const V3_MARK = /@tailwind\s+(base|components|utilities)/;
const V4_MARK = /@import\s+(url\()?\s*["']tailwindcss(\/[^"']*)?["']/;
function detectEntries() {
  if (opts.css.length) return opts.css.map(p => path.resolve(cwd, p));
  const mark = twMajor >= 4 ? V4_MARK : V3_MARK;
  const files = new Set();
  for (const d of ['app', 'src', 'styles']) walkCss(path.join(cwd, d), 5, []).forEach(f => files.add(f));
  for (const e of fs.readdirSync(cwd)) if (e.endsWith('.css')) files.add(path.join(cwd, e));
  const hits = [...files].filter(f => mark.test(fs.readFileSync(f, 'utf8')));
  // app 라우터 globals 우선
  hits.sort((a, b) => score(b) - score(a) || a.length - b.length);
  return hits;
  function score(f) {
    return (/globals?\.css$/.test(f) ? 2 : 0) + (/[\\/]app[\\/]/.test(f) ? 1 : 0);
  }
}

// 엔트리 + 상대 @import 재귀
function collectCssFiles(entries) {
  const seen = new Set();
  const out = [];
  const visit = f => {
    if (seen.has(f) || !fs.existsSync(f)) return;
    seen.add(f);
    out.push(f);
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('/')) visit(path.resolve(path.dirname(f), spec));
    }
  };
  entries.forEach(visit);
  return out;
}

const entries = detectEntries();
const cssFiles = collectCssFiles(entries);
const sourceRoots = cssFiles.map(f => {
  try {
    return { file: f, root: postcss.parse(fs.readFileSync(f, 'utf8'), { from: f }) };
  } catch (e) {
    return { file: f, root: null, error: e.message };
  }
});

// ───────── root font-size ─────────
const ROOT_SEL = /^(html|:root|:host)$/;
function isRootSelector(sel) {
  return sel.split(',').map(s => s.trim()).every(s => ROOT_SEL.test(s));
}
function inMedia(node) {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && /^(media|supports|container)$/.test(p.name)) return p;
  return null;
}
let rootPx = opts.rootPx;
let rootPxSource = rootPx ? '--root-px' : null;
if (!rootPx) {
  for (const { file, root } of sourceRoots) {
    if (!root || rootPx) continue;
    root.walkRules(rule => {
      if (rootPx || inMedia(rule)) return;
      if (!rule.selector.split(',').some(s => s.trim() === 'html' || s.trim() === ':root')) return;
      rule.each(d => {
        if (rootPx || d.type !== 'decl' || d.prop !== 'font-size') return;
        const v = d.value.replace(/!important/, '').trim();
        let m;
        if ((m = v.match(/^([\d.]+)px$/))) rootPx = Number(m[1]);
        else if ((m = v.match(/^([\d.]+)%$/))) rootPx = (16 * Number(m[1])) / 100;
        if (rootPx) rootPxSource = path.relative(cwd, file);
      });
    });
  }
}
if (!rootPx) {
  rootPx = 16;
  rootPxSource = '기본값';
}

// ───────── CSS 변수 스코프 ─────────
// base = :root/html/:host, 그 외 다크·테마 셀렉터(.dark, [data-theme=…], @media prefers-color-scheme)는 대체 스코프
const THEME_SEL = /dark|light|theme/i;
function collectVars(roots, into = { base: new Map(), alt: new Map() }) {
  for (const root of roots) {
    if (!root) continue;
    // v4 @property --x { initial-value: … } → 미설정 변수의 기본값
    root.walkAtRules('property', at => {
      let init;
      at.walkDecls('initial-value', d => (init = d.value));
      if (init !== undefined && !into.base.has(at.params.trim())) into.base.set(at.params.trim(), init);
    });
    root.walkDecls(/^--/, d => {
      const rule = d.parent;
      if (!rule || rule.type !== 'rule') {
        // v4 @theme { --x: … } 블록
        if (rule?.type === 'atrule' && rule.name === 'theme') into.base.set(d.prop, d.value);
        return;
      }
      const media = inMedia(rule);
      const sel = rule.selector.trim();
      if (media) {
        if (/prefers-color-scheme:\s*dark/.test(media.params) && isRootSelector(sel)) setAlt(`@media (prefers-color-scheme: dark)`, d);
        return;
      }
      if (isRootSelector(sel)) into.base.set(d.prop, d.value);
      else if (THEME_SEL.test(sel)) setAlt(sel, d);
    });
  }
  return into;
  function setAlt(scope, d) {
    if (!into.alt.has(scope)) into.alt.set(scope, new Map());
    into.alt.get(scope).set(d.prop, d.value);
  }
}

// ───────── 값 해석 ─────────
function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim());
}

// 이름(…) 호출을 괄호 균형 맞춰 치환
function replaceFn(str, name, fn) {
  const re = new RegExp(`\\b${name}\\(`, 'i');
  let guard = 0;
  for (;;) {
    const m = re.exec(str);
    if (!m || guard++ > 500) return str;
    const start = m.index;
    let i = start + m[0].length;
    let depth = 1;
    for (; i < str.length && depth; i++) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') depth--;
    }
    const inner = str.slice(start + m[0].length, i - 1);
    const rep = fn(inner);
    if (rep === null) return str; // 해석 불가 → 그대로
    str = str.slice(0, start) + rep + str.slice(i);
  }
}

function lookupVar(name, scope, local) {
  if (local?.has(name)) return local.get(name);
  if (scope && vars.alt.get(scope)?.has(name)) return vars.alt.get(scope).get(name);
  return vars.base.get(name);
}

function substituteVars(value, scope, local, depth = 0) {
  if (depth > 20) return value;
  return replaceFn(value, 'var', inner => {
    const [name, ...fb] = splitTop(inner);
    const v = lookupVar(name, scope, local);
    const chosen = v !== undefined ? v : fb.length ? fb.join(', ') : null;
    if (chosen === null) return `‹${name} 미정의›`;
    return substituteVars(chosen, scope, local, depth + 1);
  });
}

const fmt = n => String(Math.round(n * 100) / 100);
// px는 소수 1자리 — 0.571rem×14=7.994 같은 rem 근사 노이즈 제거
const fmtPx = n => String(Math.round(n * 10) / 10);
function remToPx(value) {
  return value.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${fmtPx(Number(n) * rootPx)}px`);
}

// calc(): px·무단위·% 사칙연산만
function evalCalc(value) {
  return replaceFn(value, 'calc', inner => {
    const r = evalExpr(inner);
    // 무단위(line-height 배수 등)는 px 환산 오차를 줄이려 4자리 유지
    return r ? `${r.u === 'px' ? fmtPx(r.n) : r.u ? fmt(r.n) : String(Math.round(r.n * 1e4) / 1e4)}${r.u}` : null;
  });
}
function evalExpr(src) {
  const toks = src.match(/-?\d*\.?\d+(px|%)?|[-+*/()]/g);
  if (!toks || toks.join('').replace(/\s/g, '') !== src.replace(/\s/g, '')) return null;
  let i = 0;
  const num = () => {
    const t = toks[i++];
    if (t === '(') {
      const v = add();
      i++;
      return v;
    }
    if (t === '-') {
      const v = num();
      return v && { n: -v.n, u: v.u };
    }
    const m = t?.match(/^(-?\d*\.?\d+)(px|%)?$/);
    return m ? { n: Number(m[1]), u: m[2] || '' } : null;
  };
  const mul = () => {
    let a = num();
    while (a && (toks[i] === '*' || toks[i] === '/')) {
      const op = toks[i++];
      const b = num();
      if (!b || (a.u && b.u)) return null;
      a = { n: op === '*' ? a.n * b.n : a.n / b.n, u: a.u || b.u };
    }
    return a;
  };
  const add = () => {
    let a = mul();
    while (a && (toks[i] === '+' || toks[i] === '-')) {
      const op = toks[i++];
      const b = mul();
      if (!b || a.u !== b.u) return null;
      a = { n: op === '+' ? a.n + b.n : a.n - b.n, u: a.u };
    }
    return a;
  };
  const r = add();
  return r && i === toks.length ? r : null;
}

// ───────── 색 ─────────
const clamp01 = x => Math.min(1, Math.max(0, x));
const hex2 = x => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0');
function toHex({ r, g, b, a = 1 }) {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
  return a >= 0.999 ? base : `${base} α${fmt(a)}`;
}
function parseNum(t, scale = 1) {
  if (t === undefined || t === 'none') return 0;
  return t.endsWith('%') ? (Number(t.slice(0, -1)) / 100) * scale : Number(t);
}
function channels(inner) {
  // "a, b, c, d" | "a b c / d"
  const [main, alpha] = inner.includes('/') ? inner.split('/').map(s => s.trim()) : [inner, undefined];
  const parts = main.split(/[\s,]+/).filter(Boolean);
  return { parts, alpha: alpha ?? parts[3] };
}
function parseColor(str) {
  const s = str.trim();
  let m;
  if ((m = s.match(/^#([0-9a-f]{3,8})$/i))) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = i => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  if ((m = s.match(/^rgba?\((.*)\)$/i))) {
    const { parts, alpha } = channels(m[1]);
    if (parts.length < 3) return null;
    const c = t => (t.endsWith('%') ? parseNum(t) : Number(t) / 255);
    return { r: c(parts[0]), g: c(parts[1]), b: c(parts[2]), a: alpha === undefined ? 1 : parseNum(alpha) };
  }
  if ((m = s.match(/^hsla?\((.*)\)$/i))) {
    const { parts, alpha } = channels(m[1]);
    if (parts.length < 3) return null;
    const h = (parseFloat(parts[0]) % 360) / 360;
    const sat = parseNum(parts[1].endsWith('%') ? parts[1] : `${parts[1]}%`);
    const l = parseNum(parts[2].endsWith('%') ? parts[2] : `${parts[2]}%`);
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const hue = t => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: hue(h + 1 / 3), g: hue(h), b: hue(h - 1 / 3), a: alpha === undefined ? 1 : parseNum(alpha) };
  }
  if ((m = s.match(/^oklch\((.*)\)$/i))) {
    const { parts, alpha } = channels(m[1]);
    const L = parseNum(parts[0]);
    const C = parseNum(parts[1], 0.4);
    const H = (parseFloat(parts[2]) || 0) * (Math.PI / 180);
    return { ...oklabToSrgb(L, C * Math.cos(H), C * Math.sin(H)), a: alpha === undefined ? 1 : parseNum(alpha) };
  }
  if ((m = s.match(/^oklab\((.*)\)$/i))) {
    const { parts, alpha } = channels(m[1]);
    return { ...oklabToSrgb(parseNum(parts[0]), parseNum(parts[1], 0.4), parseNum(parts[2], 0.4)), a: alpha === undefined ? 1 : parseNum(alpha) };
  }
  if (/^(white|black)$/i.test(s)) return s.toLowerCase() === 'white' ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 };
  if (/^transparent$/i.test(s)) return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}
function oklabToSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const g = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return {
    r: g(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: g(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: g(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}
function convertColors(value) {
  // color-mix(in <space>, C p%, transparent) → C의 alpha × p (Tailwind 투명도 수식어)
  value = replaceFn(value, 'color-mix', inner => {
    const [, c1, c2] = splitTop(inner);
    if (!c1 || !/^transparent$/i.test(c2 ?? '')) return null;
    const m = c1.match(/^(.*?)\s+(\d*\.?\d+)%$/);
    const col = parseColor(m ? m[1] : c1);
    if (!col) return null;
    return toHex({ ...col, a: (col.a ?? 1) * (m ? Number(m[2]) / 100 : 1) });
  });
  for (const fn of ['rgba', 'rgb', 'hsla', 'hsl', 'oklch', 'oklab']) {
    value = replaceFn(value, fn, inner => {
      const c = parseColor(`${fn}(${inner})`);
      return c ? toHex(c) : null;
    });
  }
  return value.replace(/#([0-9a-f]{3,8})\b/gi, h => {
    const c = parseColor(h);
    return c ? toHex(c) : h;
  });
}

function resolveValue(raw, scope, local) {
  let v = raw.replace(/<alpha-value>/g, '1');
  v = substituteVars(v, scope, local);
  v = remToPx(v);
  v = evalCalc(v);
  v = convertColors(v);
  v = v.replace(/\s+/g, ' ').trim();
  // Tailwind 그림자 합성의 빈 레이어(ring 등) 제거
  const layers = splitTop(v);
  if (layers.length > 1 && layers.some(l => l === '0 0 #000000 α0')) v = layers.filter(l => l !== '0 0 #000000 α0').join(', ');
  return v;
}

// 스코프마다 해석하고, base와 다른 것만 덧붙임. forced = dark: 변형처럼 특정 스코프에서만 적용되는 규칙
function resolveAcrossScopes(raw, local, forced) {
  if (forced) return { base: resolveValue(raw, forced, local), alts: [], forced };
  const base = resolveValue(raw, null, local);
  const alts = [];
  for (const scope of vars.alt.keys()) {
    const v = resolveValue(raw, scope, local);
    if (v !== base) alts.push({ scope, value: v });
  }
  return { base, alts };
}

// ───────── 컴파일 ─────────
function cssEscape(cls) {
  return cls.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`).replace(/^(-?\d)/, '\\3$1 ');
}

async function compileV3(classes) {
  let loadConfig;
  try {
    loadConfig = req('tailwindcss/loadConfig');
  } catch {
    loadConfig = p => req(p);
  }
  const cfgPath = opts.config
    ? path.resolve(cwd, opts.config)
    : ['ts', 'js', 'cjs', 'mjs', 'mts', 'cts'].map(e => path.join(cwd, `tailwind.config.${e}`)).find(fs.existsSync);
  const cfg = cfgPath ? loadConfig(cfgPath) : {};
  const tailwind = req('tailwindcss');
  const result = await postcss([
    tailwind({ ...cfg, content: [{ raw: classes.join(' ') }], corePlugins: { ...(cfg.corePlugins || {}), preflight: false } }),
  ]).process('@tailwind utilities;', { from: undefined });
  return { css: result.css, cfg, cfgPath };
}

async function loadTwNode() {
  const tries = [
    () => req.resolve('@tailwindcss/node'),
    ...['@tailwindcss/postcss', '@tailwindcss/vite', '@tailwindcss/cli'].map(p => () => createRequire(req.resolve(p)).resolve('@tailwindcss/node')),
  ];
  for (const t of tries) {
    try {
      const p = t();
      try {
        return createRequire(p)(p);
      } catch {
        return await import(pathToFileURL(p).href);
      }
    } catch {}
  }
  return null;
}

async function compileV4(classes) {
  const entry = entries[0];
  if (!entry) fail('Tailwind v4 엔트리 CSS(@import "tailwindcss")를 찾지 못함 → --css로 지정');
  const tw = await loadTwNode();
  if (!tw?.compile) fail('@tailwindcss/node를 찾지 못함 (@tailwindcss/postcss·vite·cli 의존성 경유도 실패)');
  const compiler = await tw.compile(fs.readFileSync(entry, 'utf8'), { base: path.dirname(entry), onDependency: () => {} });
  return { css: compiler.build(classes) };
}

// 컴파일 결과에서 클래스별 규칙 수집
function rulesFor(root, cls) {
  const esc = `.${cssEscape(cls)}`;
  const out = [];
  root.walkRules(rule => {
    const hit = rule.selectors.some(s => {
      const i = s.indexOf(esc);
      return i !== -1 && !/[a-zA-Z0-9_\\-]/.test(s[i + esc.length] ?? '');
    });
    if (!hit) return;
    const decls = [];
    rule.each(n => n.type === 'decl' && decls.push(n));
    if (!decls.length) return;
    const ctx = [];
    for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && p.name !== 'layer') ctx.unshift(`@${p.name} ${p.params}`);
    const pseudo = rule.selector.split(esc)[1]?.trim();
    if (pseudo) ctx.push(pseudo);
    if (!rule.selector.startsWith(esc)) ctx.push(rule.selector);
    const full = `${ctx.join(' ')} ${rule.selector}`;
    const forced = [...(vars?.alt.keys() ?? [])].find(sc => new RegExp(`${sc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(full));
    out.push({ decls, ctx: [...new Set(ctx)].join(' '), forced });
  });
  return out;
}

// ───────── 출력 ─────────
const header = () =>
  `tailwind ${twVersion} · root font-size ${fmt(rootPx)}px (${rootPxSource}) · CSS ${cssFiles.map(f => path.relative(cwd, f)).join(', ') || '없음'}` +
  (vars.alt.size ? ` · 대체 스코프: ${[...vars.alt.keys()].join(', ')}` : '');

function showScoped({ base, alts, forced }) {
  return (forced ? `${forced} 전용: ` : '') + base + alts.map(a => ` | ${a.scope}: ${a.value}`).join('');
}

let vars;

async function runResolve(classStr) {
  const classes = classStr.split(/\s+/).filter(Boolean);
  if (!classes.length) fail('resolve에 클래스가 없음');
  const compiled = twMajor >= 4 ? await compileV4(classes) : await compileV3(classes);
  const outRoot = postcss.parse(compiled.css);
  // v3: 소스 CSS만 / v4: 컴파일 결과에 테마·소스 변수가 모두 포함되지만 소스도 합쳐 스코프 보존
  vars = collectVars(twMajor >= 4 ? [outRoot, ...sourceRoots.map(s => s.root)] : sourceRoots.map(s => s.root));

  const results = classes.map(cls => {
    const rules = rulesFor(outRoot, cls);
    if (!rules.length) return { class: cls, unresolved: true };
    return {
      class: cls,
      rules: rules.map(({ decls, ctx, forced }) => {
        const local = new Map(decls.filter(d => d.prop.startsWith('--')).map(d => [d.prop, d.value]));
        const shown = decls.filter(d => !d.prop.startsWith('--'));
        const list = (shown.length ? shown : decls).map(d => ({
          prop: d.prop,
          raw: d.value,
          ...resolveAcrossScopes(d.value, local, forced),
        }));
        // 무단위·% line-height → 같은 규칙의 font-size 기준 px 병기
        const fs_ = list.find(d => d.prop === 'font-size')?.base.match(/^([\d.]+)px$/);
        for (const d of list) {
          if (d.prop !== 'line-height' || !fs_) continue;
          const m = d.base.match(/^([\d.]+)(%?)$/);
          if (m) d.base += ` (= ${fmt(Number(m[1]) * (m[2] ? 0.01 : 1) * Number(fs_[1]))}px)`;
        }
        return { ctx, decls: list };
      }),
    };
  });

  if (opts.json) return console.log(JSON.stringify({ tailwind: twVersion, rootPx, rootPxSource, cssFiles, results }, null, 2));
  console.log(header());
  for (const r of results) {
    if (r.unresolved) {
      console.log(`\n${r.class}\n  (생성된 CSS 없음 — 오타·미등록 토큰·Tailwind 밖 클래스·cn 조건 확인)`);
      continue;
    }
    for (const rule of r.rules) {
      console.log(`\n${r.class}${rule.ctx ? `  [${rule.ctx}]` : ''}`);
      for (const d of rule.decls) {
        const val = showScoped(d);
        console.log(`  ${d.prop}: ${d.raw === d.base && !d.forced ? val : `${d.raw} → ${val}`}`);
      }
    }
  }
}

// ───────── find (역조회) ─────────
const KINDS = {
  spacing: { v3: 'spacing', v4: 'spacing', utils: ['p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'gap', 'gap-x', 'gap-y', 'm', 'mt', 'mb', 'space-y', 'w', 'h', 'size'] },
  color: { v3: 'colors', v4: 'color', utils: ['text', 'bg', 'border'] },
  'font-size': { v3: 'fontSize', v4: 'text', utils: ['text'] },
  'font-weight': { v3: 'fontWeight', v4: 'font-weight', utils: ['font'] },
  'line-height': { v3: 'lineHeight', v4: 'leading', utils: ['leading'] },
  radius: { v3: 'borderRadius', v4: 'radius', utils: ['rounded'] },
  shadow: { v3: 'boxShadow', v4: 'shadow', utils: ['shadow'] },
};

function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = k === 'DEFAULT' ? prefix.replace(/-$/, '') : `${prefix}${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, `${key}-`, out);
    else out.push([key, v]);
  }
  return out;
}

async function tokensV3(kind) {
  const { cfg } = await compileV3([]);
  const theme = req('tailwindcss/resolveConfig')(cfg).theme;
  const entries_ = kind === 'color' ? flatten(theme.colors) : Object.entries(theme[KINDS[kind].v3] ?? {});
  return entries_.map(([key, v]) => {
    if (typeof v === 'function') v = v({ opacityValue: '1', opacityVariable: '' });
    if (kind === 'font-size') {
      const [size, extra] = Array.isArray(v) ? v : [v];
      const meta = typeof extra === 'string' ? { lineHeight: extra } : extra ?? {};
      return { key, raw: String(size), meta };
    }
    return { key, raw: Array.isArray(v) ? v.join(', ') : String(v) };
  });
}

async function tokensV4(kind) {
  const ns = KINDS[kind].v4;
  const all = new Map();
  let themeCss = null;
  try {
    themeCss = req.resolve('tailwindcss/theme.css');
  } catch {
    themeCss = path.join(twDir, 'theme.css');
  }
  const roots = [fs.existsSync(themeCss) ? postcss.parse(fs.readFileSync(themeCss, 'utf8')) : null, ...sourceRoots.map(s => s.root)];
  for (const root of roots) {
    root?.walkAtRules('theme', at => {
      at.walkDecls(d => {
        // --color-*: initial → 기본 네임스페이스 제거
        const reset = d.prop.match(/^--([\w-]+)-\*$/);
        if (reset && d.value === 'initial') {
          for (const k of [...all.keys()]) if (k.startsWith(`--${reset[1]}-`)) all.delete(k);
        } else if (d.prop === '--*' && d.value === 'initial') all.clear();
        else all.set(d.prop, d.value);
      });
    });
  }
  const out = [];
  if (kind === 'spacing' && all.has('--spacing')) out.push({ key: '‹n›', raw: `calc(${all.get('--spacing')} * n)`, multiplier: all.get('--spacing') });
  for (const [prop, raw] of all) {
    const m = prop.match(new RegExp(`^--${ns}-([\\w.-]+)$`));
    if (!m || m[1].includes('--')) continue;
    const meta = {};
    if (kind === 'font-size') {
      if (all.has(`${prop}--line-height`)) meta.lineHeight = all.get(`${prop}--line-height`);
      if (all.has(`${prop}--font-weight`)) meta.fontWeight = all.get(`${prop}--font-weight`);
      if (all.has(`${prop}--letter-spacing`)) meta.letterSpacing = all.get(`${prop}--letter-spacing`);
    }
    out.push({ key: m[1], raw, meta });
  }
  return out;
}

function pxOf(s) {
  const m = s.match(/^(-?[\d.]+)px$/);
  return m ? Number(m[1]) : s === '0' ? 0 : null;
}

async function runFind(kind, target) {
  if (!KINDS[kind]) fail(`find 종류는 ${Object.keys(KINDS).join(' | ')} 중 하나`);
  vars = collectVars(sourceRoots.map(s => s.root));
  const tokens = twMajor >= 4 ? await tokensV4(kind) : await tokensV3(kind);
  const utils = KINDS[kind].utils;
  const rows = tokens.map(t => ({ ...t, ...resolveAcrossScopes(t.raw) }));
  let matches = [];
  let near = [];
  let fallback = null;

  if (target !== undefined && ['spacing', 'font-size', 'radius', 'line-height'].includes(kind)) {
    const want = Number(String(target).replace(/px$/, ''));
    for (const r of rows) {
      if (r.multiplier) {
        const unit = pxOf(resolveValue(r.multiplier));
        const n = unit ? want / unit : NaN;
        if (Number.isFinite(n) && Math.abs(n * 4 - Math.round(n * 4)) < 0.01) matches.push({ ...r, key: fmt(n), base: `${fmt(want)}px` });
        continue;
      }
      const px = pxOf(r.base);
      if (px === null) continue;
      r.diff = Math.abs(px - want);
      (r.diff <= 0.5 ? matches : near).push(r);
    }
    matches.sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0));
    near = near.sort((a, b) => a.diff - b.diff).slice(0, 3);
    fallback = `${utils[0]}-[${fmt(want)}px]`;
  } else if (target !== undefined && kind === 'color') {
    const want = parseColor(String(target).startsWith('#') || /\(/.test(target) ? target : `#${target}`);
    if (!want) fail(`색 값을 해석할 수 없음: ${target}`);
    const dist = r => {
      const c = parseColor(r.base.split(' α')[0]);
      if (!c) return Infinity;
      const a = Number(r.base.split(' α')[1] ?? 1);
      const d = Math.max(...['r', 'g', 'b'].map(k => Math.abs(c[k] - want[k]) * 255));
      return d + Math.abs(a - (want.a ?? 1)) * 255;
    };
    for (const r of rows) {
      r.diff = dist(r);
      if (r.diff <= 2) matches.push(r);
      else if (Number.isFinite(r.diff)) near.push(r);
    }
    // 테마 대응 시맨틱 토큰(var 참조·스코프별 값) 우선 → 같은 hex의 팔레트 색보다 먼저 제안
    const semantic = r => (/var\(/.test(r.raw) || r.alts?.length ? 0 : 1);
    matches.sort((a, b) => semantic(a) - semantic(b) || a.diff - b.diff);
    near = near.sort((a, b) => a.diff - b.diff).slice(0, 3);
    fallback = `${utils[0]}-[${toHex(want).replace(' α', '/').toLowerCase()}]`;
  } else if (target !== undefined && kind === 'font-weight') {
    matches = rows.filter(r => r.base === String(target));
  } else if (target !== undefined) {
    const norm = s => resolveValue(s).replace(/\s+/g, ' ');
    matches = rows.filter(r => r.base === norm(target));
  } else matches = rows;

  if (opts.json) return console.log(JSON.stringify({ kind, target, rootPx, matches, near, fallback }, null, 2));
  console.log(header());
  console.log(`\nfind ${kind}${target !== undefined ? ` ${target}` : ' (전체)'}`);
  const line = r => {
    const meta = r.meta && Object.keys(r.meta).length ? ` · ${Object.entries(r.meta).map(([k, v]) => `${k} ${resolveValue(String(v))}`).join(' · ')}` : '';
    const scoped = showScoped({ base: r.base, alts: r.alts ?? [] });
    const unit = kind === 'color' ? '' : 'px';
    const diff = r.diff > 0.05 && Number.isFinite(r.diff) ? `  (≈ 차이 ${fmt(r.diff)}${unit})` : '';
    return `  ${utils.map(u => `${u}-${r.key}`).slice(0, 3).join(' / ')}   ${r.raw} → ${scoped}${meta}${diff}`;
  };
  console.log(matches.length ? '일치:' : '일치: 없음');
  matches.forEach(r => console.log(line(r)));
  if (near.length) {
    console.log('근접:');
    near.forEach(r => console.log(line(r)));
  }
  if (!matches.length && fallback) console.log(`토큰 없음 → arbitrary value: ${fallback}`);
}

if (!entries.length) console.error('tw-resolve: 전역 CSS 엔트리를 찾지 못함 — CSS 변수·root font-size 해석이 빠질 수 있음 (--css로 지정)');
try {
  if (command === 'resolve') await runResolve(cmdArgs.join(' '));
  else await runFind(cmdArgs[0], cmdArgs[1]);
} catch (e) {
  fail(e.stack || e.message);
}
