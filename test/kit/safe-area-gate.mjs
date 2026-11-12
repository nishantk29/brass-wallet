// Safe-area gate (WebKit review item 1 / SPACING.md 3): with viewport-fit=cover, every page container must pad its left
// and right edges by the safe-area inset. A "page container" is a rule that lays out a page edge: position fixed/sticky
// spanning the width (left:0;right:0 or inset:0), a centred column (max-width + margin auto), or a selector the site lists.
// Its horizontal padding passes when the left side references a left inset and the right side a right inset:
// env(safe-area-inset-left|right) or one of the inset tokens (--pad-l/-r, --inset-l/-r, --safe-l/-r, --gutter-l/-r).
import fs from 'node:fs'; import path from 'node:path';
const L = /env\(\s*safe-area-inset-left|var\(--(pad|inset|safe|gutter)-l\)/, R = /env\(\s*safe-area-inset-right|var\(--(pad|inset|safe|gutter)-r\)/;
const split = (v) => { const out = []; let d = 0, cur = ''; for (const ch of v.trim()) { if (ch === '(') d++; if (ch === ')') d--; if (/\s/.test(ch) && !d) { if (cur) out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
export function rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(css))) { const sel = m[1].trim(); if (sel.startsWith('@') || /^(from|to|\d+%)/.test(sel)) continue; const d = {}; for (const x of m[2].split(';')) { const i = x.indexOf(':'); if (i > 0) d[x.slice(0, i).trim()] = x.slice(i + 1).trim().replace(/\s*!important$/, ''); } out.push({ sel, d }); }
  return out;
}
export function sides(d) {
  let l = null, r = null;
  if (d.padding) { const p = split(d.padding); r = p[1] ?? p[0]; l = p[3] ?? p[1] ?? p[0]; }
  if (d['padding-inline']) { const p = split(d['padding-inline']); l = p[0]; r = p[1] ?? p[0]; }
  if (d['padding-left']) l = d['padding-left']; if (d['padding-right']) r = d['padding-right'];
  if (d['padding-inline-start']) l = d['padding-inline-start']; if (d['padding-inline-end']) r = d['padding-inline-end'];
  return { l, r };
}
const zero = (v) => v == null || /^0(px)?$/.test(v);
export function isContainer({ d }) {
  const full = /^(fixed|sticky)$/.test(d.position || '') && ((zero(d.left) && zero(d.right) && d.left != null) || /^0(px)?$/.test(d.inset || ''));
  const col = d['max-width'] && /(^|\s)auto(\s|$)/.test(d.margin || d['margin-inline'] || '');
  return full || col;
}
export function audit(pub, { required = [], skip = ['print.css'] } = {}) {
  const files = fs.readdirSync(pub).filter((f) => f.endsWith('.css') && !skip.includes(f));
  const fails = [], found = new Set(), checked = [];
  for (const f of files) for (const r of rules(fs.readFileSync(path.join(pub, f), 'utf8'))) {
    const req = required.find((q) => r.sel.split(',').map((s) => s.trim()).includes(q));
    if (!req && !isContainer(r)) continue;
    const { l, r: rt } = sides(r.d);
    if (req && (l != null || rt != null)) found.add(req);
    if (zero(l) && zero(rt)) continue; // no horizontal padding: the children carry it
    checked.push(`${f} ${r.sel}`);
    if (!zero(l) && !L.test(l)) fails.push(`${f} ${r.sel}: padding-left "${l}" has no left safe-area inset`);
    if (!zero(rt) && !R.test(rt)) fails.push(`${f} ${r.sel}: padding-right "${rt}" has no right safe-area inset`);
  }
  for (const q of required) if (!found.has(q)) fails.push(`required container ${q} not found with horizontal padding`);
  return { fails, checked };
}
