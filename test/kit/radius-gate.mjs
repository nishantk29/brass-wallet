// Radius gate (Nishant approved the corner-radius tokens 2026-10-29 6:03 PM ET; run/mockups/corner-radius/side-by-side/NOTES.md).
// Copy into each game's test/kit/. Every border-radius value must be built from the family tokens; a raw px value fails
// unless its selector is on the site's exemption list.
export const TOKENS = ['--f-r-inset', '--f-r-field', '--f-r-card', '--f-r-sheet', '--f-r-pill', '--f-r-round', '--f-r-face'];
const PART = /^(0|inherit|var\(--f-r-(inset|field|card|sheet|pill|round|face)\)|calc\(var\(--f-r-(inset|field|card|sheet|pill)\) - \d+px\))$/;
export function okValue(v) {
  const s = v.replace(/!important/g, '').trim();
  if (PART.test(s)) return true;
  if (/calc\(/.test(s)) return false;
  return s.split(/\s+/).every((p) => PART.test(p));
}
// Walk CSS (or CSS inside JS template strings) and return [{selector, value, line}] for every border-radius declaration.
export function radiusDecls(text) {
  const out = []; const re = /(?<![\w-])border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;}"'`]+)/g; let m;
  while ((m = re.exec(text))) {
    const pre = text.slice(0, m.index); const o = pre.lastIndexOf('{'); const c = pre.lastIndexOf('}');
    let sel = '?'; if (o > c) { sel = pre.slice(pre.lastIndexOf('}', o) + 1, o).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim(); }
    else { const q = pre.lastIndexOf('style="'); if (q > c) sel = '[inline style]'; }
    out.push({ selector: sel, value: m[1].trim(), line: pre.split('\n').length });
  }
  return out;
}
// files: [[name, text]]; exempt: [RegExp] tested against the selector. Returns { bad, distinct, exempted }.
export function radiusAudit(files, exempt = []) {
  const bad = []; const distinct = new Set(); const exempted = new Set();
  for (const [f, text] of files) for (const d of radiusDecls(text)) {
    const v = d.value.replace(/!important/g, '').trim();
    if (exempt.some((re) => re.test(d.selector))) { exempted.add(v); continue; }
    for (const part of (/calc\(/.test(v) ? [v] : v.split(/\s+/))) distinct.add(part); // count tokens, not shorthand combos
    if (!okValue(v)) bad.push(`${f}:${d.line} ${d.selector} { border-radius: ${v} }`);
  }
  return { bad, distinct: [...distinct].sort(), exempted: [...exempted].sort() };
}
