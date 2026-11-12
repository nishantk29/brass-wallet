// Token gate (glass kit, Nishant 2026-10-30 8:43 AM ET). Copy into each site's test/kit/.
// Finds every raw (non-token) value in six categories across a site's CSS and inline styles:
//   fontSize, lineHeight, spacing, radius, iconSize, colour.
// It is a ratchet: test/token-baseline.json lists today's raw values by fingerprint (file|selector|property|value).
// The test fails if a fingerprint is new or its count goes up. Fixes lower the baseline via scripts/token-baseline.mjs.
// Custom-property definitions (--x: 13px) are token definitions and are not counted.
import { okValue as radiusOk } from './radius-gate.mjs';

export const CATEGORIES = ['fontSize', 'lineHeight', 'spacing', 'radius', 'iconSize', 'colour'];
const RAW_LEN = /(?<![\w-])-?(?:\d*\.)?\d+(?:px|rem|em|ch|pt)\b/;      // 13px, .8rem, 1.5em
const NONZERO_LEN = /(?<![\w-])-?(?:\d*\.\d+|[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)(?:px|rem|em|ch|pt)\b/;
const NAMED = 'white|black|red|green|blue|yellow|orange|purple|gray|grey|pink|gold|silver|navy|maroon|teal|olive|lime|aqua|fuchsia|brown|beige|ivory|crimson|tomato|salmon|coral|khaki|indigo|violet|plum|tan|wheat|linen|snow|azure|cyan|magenta';
const COLOUR_LIT = new RegExp(`#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\(|(?<![\\w-])(?:${NAMED})(?![\\w-])`, 'i');
const COLOUR_PROPS = /^(color|background|background-color|background-image|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|stop-color|filter|-webkit-text-stroke(-color)?|-webkit-tap-highlight-color|scrollbar-color)$/;
const SPACE_PROPS = /^(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap)$/;
const ICON_SEL = /(?:^|[\s>+~,(.#:])(?:svg|[\w-]*(?:icon|-ic|ic-|glyph)[\w-]*|\.ic|\.f-ic)\b/i;
const KEYWORDS = /^(inherit|initial|unset|revert|revert-layer|auto|none|normal|0|100%|1em|currentcolor|transparent)$/i;

const strip = (s) => s.replace(/!important/gi, '').trim();
const fontShorthandParts = (v) => {
  // "600 17px/1.3 Rubik" -> { size:'17px', lh:'1.3' }. A var() font (font:var(--f-t-body)) has no raw parts.
  const m = v.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' VAR ').match(/(?:^|\s)((?:-?[\d.]+(?:px|rem|em|%|pt|vw)?)|VAR|clamp\([^)]*\)|calc\([^)]*\))\s*(?:\/\s*([^\s,]+))?\s+[^\d\s/]/);
  return m ? { size: m[1], lh: m[2] } : {};
};
// Returns the category (or null) a declaration violates.
export function classify(prop, value, selector = '') {
  prop = prop.toLowerCase(); const v = strip(value);
  if (prop.startsWith('--') || !v) return [];
  const out = [];
  if (prop === 'font-size' && !KEYWORDS.test(v) && RAW_LEN.test(v.replace(/var\([^)]*\)/g, ''))) out.push(ICON_SEL.test(selector) ? 'iconSize' : 'fontSize');
  if (prop === 'line-height' && !/^(inherit|initial|unset|revert)$/i.test(v) && !/^var\(/.test(v)) out.push('lineHeight');
  if (prop === 'font') { const { size, lh } = fontShorthandParts(v); if (size && size !== 'VAR' && RAW_LEN.test(size)) out.push('fontSize'); if (lh && !/^var\(/.test(lh)) out.push('lineHeight'); }
  if (SPACE_PROPS.test(prop) && NONZERO_LEN.test(v.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'VAR'))) out.push('spacing');
  if (/border(-(top|bottom)-(left|right))?-radius$/.test(prop) && !radiusOk(v)) out.push('radius');
  if (/^(width|height|inline-size|block-size|min-width|min-height)$/.test(prop) && ICON_SEL.test(selector) && NONZERO_LEN.test(v.replace(/var\([^)]*\)/g, ''))) out.push('iconSize');
  if (COLOUR_PROPS.test(prop) && COLOUR_LIT.test(v.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'VAR').replace(/url\([^)]*\)/g, ''))) out.push('colour');
  return out;
}

// CSS text -> [{selector, prop, value, line}]
export function cssDecls(text, offsetLine = 0) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const out = []; const stack = []; let buf = ''; let line = 1 + offsetLine; let bufLine = line;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\n') line++;
    if (ch === '{') { stack.push(buf.replace(/\s+/g, ' ').trim()); buf = ''; bufLine = line; continue; }
    if (ch === ';' || ch === '}') {
      const d = buf.trim(); const m = d.match(/^([-\w]+)\s*:\s*([\s\S]+)$/);
      if (m && stack.length) out.push({ selector: stack.filter((s) => !s.startsWith('@')).pop() || stack[stack.length - 1], prop: m[1], value: m[2].replace(/\s+/g, ' ').trim(), line: bufLine });
      buf = ''; bufLine = line; if (ch === '}') stack.pop(); continue;
    }
    if (!buf.trim()) bufLine = line; buf += ch;
  }
  return out;
}
const inlineDecls = (style, line, selector = '[inline style]') => style.split(';').map((d) => d.match(/^\s*([-\w]+)\s*:\s*([\s\S]+?)\s*$/)).filter(Boolean).map((m) => ({ selector, prop: m[1], value: m[2], line }));
const lineAt = (t, i) => t.slice(0, i).split('\n').length;
// Any file -> declarations. CSS: all of it. HTML: <style> blocks + style="". JS: style="" in strings, .style.x = '', setProperty, cssText.
export function declsOf(name, text) {
  if (name.endsWith('.css')) return cssDecls(text);
  const out = []; let m;
  if (name.endsWith('.html')) { const re = /<style[^>]*>([\s\S]*?)<\/style>/gi; while ((m = re.exec(text))) out.push(...cssDecls(m[1], lineAt(text, m.index) - 1)); }
  const attr = /\bstyle\s*=\s*(\\?["'])([^"'`<>]*?)\1/g; while ((m = attr.exec(text))) out.push(...inlineDecls(m[2].replace(/\$\{[^}]*\}/g, 'var(--js)'), lineAt(text, m.index)));
  if (name.endsWith('.js') || name.endsWith('.mjs')) {
    const as = /\.style\.([a-zA-Z]+)\s*=\s*(["'`])([^"'`]*)\2/g; while ((m = as.exec(text))) out.push({ selector: '[js style]', prop: m[1].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), value: m[3], line: lineAt(text, m.index) });
    const sp = /\.setProperty\(\s*(["'])([-\w]+)\1\s*,\s*(["'`])([^"'`]*)\3/g; while ((m = sp.exec(text))) out.push({ selector: '[js style]', prop: m[2], value: m[4], line: lineAt(text, m.index) });
    const ct = /cssText\s*[+]?=\s*(["'`])([^"'`]*)\1/g; while ((m = ct.exec(text))) out.push(...inlineDecls(m[2], lineAt(text, m.index), '[js cssText]'));
  }
  return out;
}

// files: [[name, text]], exempt: [RegExp] on selector. Returns { counts, entries: {cat: {fp: n}}, list: {cat: [..]} }
export function tokenAudit(files, exempt = []) {
  const entries = Object.fromEntries(CATEGORIES.map((c) => [c, {}])); const list = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  const lhs = new Set(); // every distinct line-height declared (raw or token): Scout's target is <= 10 per site
  for (const [f, text] of files) for (const d of declsOf(f, text)) {
    if (exempt.some((re) => re.test(d.selector))) continue;
    if (!d.prop.startsWith('--')) { const p = d.prop.toLowerCase(); const v = strip(d.value);
      if (p === 'line-height' && !/^(inherit|initial|unset|revert)$/i.test(v)) lhs.add(v);
      if (p === 'font') { const { lh } = fontShorthandParts(v); if (lh) lhs.add(lh); } }
    for (const cat of classify(d.prop, d.value, d.selector)) {
      const fp = `${f}|${d.selector.slice(0, 120)}|${d.prop}|${strip(d.value).slice(0, 120)}`;
      entries[cat][fp] = (entries[cat][fp] || 0) + 1; list[cat].push(`${f}:${d.line} ${d.selector.slice(0, 80)} { ${d.prop}: ${strip(d.value).slice(0, 80)} }`);
    }
  }
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, Object.values(entries[c]).reduce((a, b) => a + b, 0)]));
  return { counts, entries, list, distinct: { lineHeight: [...lhs].sort() } };
}
export const TARGETS = { distinctLineHeight: 10 };
// Compare an audit with a baseline. Returns human-readable failures (empty = pass) and stale (fixed) fingerprints.
export function ratchet(audit, baseline) {
  const fails = []; const stale = [];
  for (const c of CATEGORIES) {
    const base = baseline.entries?.[c] || {}; const now = audit.entries[c];
    if (audit.counts[c] > (baseline.counts?.[c] ?? 0)) fails.push(`${c}: ${audit.counts[c]} raw values, baseline ${baseline.counts?.[c] ?? 0}`);
    for (const [fp, n] of Object.entries(now)) if (n > (base[fp] || 0)) fails.push(`${c}: new raw value ${fp}${base[fp] ? ` (x${n}, baseline x${base[fp]})` : ''}`);
    for (const [fp, n] of Object.entries(base)) if ((now[fp] || 0) < n) stale.push(`${c}: ${fp}`);
  }
  const dl = audit.distinct.lineHeight.length, bl = baseline.distinct?.lineHeight ?? dl;
  if (dl > Math.max(bl, TARGETS.distinctLineHeight)) fails.push(`distinct line-heights: ${dl}, baseline ${bl} (target <= ${TARGETS.distinctLineHeight}): ${audit.distinct.lineHeight.join(' | ')}`);
  return { fails, stale };
}
export function toBaseline(audit) { return { note: 'Token gate ratchet. Lower only: node scripts/token-baseline.mjs --write. Never add by hand.', counts: audit.counts, distinct: { lineHeight: audit.distinct.lineHeight.length }, entries: audit.entries }; }

// The files a site's gate scans: public/**/*.{css,js,html}, minus the print sheet, the shared install banner, the service
// worker and asset folders.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
export const SKIP_FILES = new Set(['print.css', 'pwa-install.js', 'sw.js']);
export const SKIP_DIRS = new Set(['vendor', 'fonts', 'icons', 'art', 'img', 'node_modules']);
export function siteFiles(pub, dir = pub) {
  return readdirSync(dir).sort().flatMap((f) => { const p = join(dir, f); if (statSync(p).isDirectory()) return SKIP_DIRS.has(f) ? [] : siteFiles(pub, p);
    return /\.(css|js|html)$/.test(f) && !SKIP_FILES.has(f) ? [[p.slice(pub.length), readFileSync(p, 'utf8')]] : []; });
}
