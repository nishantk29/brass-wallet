// Spacing + section-pattern gate measure (Scout SPACING.md, 30 Oct 2026). Pure read of the page: layout rects, computed
// styles and the CSSOM. Returns counts per check (S1..S7) and a few examples for each.
//  S1 tap target under 44x44 (SPACING.md 5). Exempt: links inside running text (WCAG 2.5.8 inline exception), hidden
//     inputs whose label is the target, and controls inside a 44px-tall row or label that is itself the target.
//  S2 text or control closer than 16px to the left or right edge (SPACING.md 3), not counting fixed full-bleed bars.
//  S3 off-grid spacing: a margin, padding or gap that isn't a multiple of 4px (hairline 1px and 2px focus rings exempt
//     only on borders, which aren't counted).
//  S4 inverted gap: a group's inner gap is at least as big as the gap around it (SPACING.md 2, proximity).
//  S5 fixed px line-height in a stylesheet rule (SPACING.md 7: unitless or 1em + rem).
//  S6 negative margin on a text element (WCAG 1.4.12; the Mafia FAQ h3 -8px).
//  S7 section pattern: a heading (h1-h4) with its own vertical margin; spacing must come from the parent's gap.
(opts = {}) => {
  const C = {}, det = {}; const inc = (k, n = 1) => { C[k] = (C[k] || 0) + n; }; const note = (k, s) => { (det[k] ||= []).length < 6 && det[k].push(s); };
  const W = innerWidth; const px = (v) => parseFloat(v) || 0;
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) return null; return r; };
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const fixedBar = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  // S1
  for (const e of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=switch]')) {
    const r = vis(e); if (!r) continue;
    if (e.matches('a') && e.closest('p,li,dd,td,small') && (e.closest('p,li,dd,td,small').textContent.trim().length > e.textContent.trim().length + 8)) continue;
    if (e.matches('input[type=radio],input[type=checkbox]') && e.closest('label') && vis(e.closest('label')) && vis(e.closest('label')).height >= 44) continue;
    const box = e.closest('label') && vis(e.closest('label')) || r;
    if (Math.round(box.width) < 44 || Math.round(box.height) < 44) { inc('S1'); note('S1', `${name(e)} ${Math.round(box.width)}x${Math.round(box.height)}`); }
  }
  // S2, S3, S6, S7
  const seenS2 = new Set();
  for (const e of document.querySelectorAll('body *')) {
    const r = vis(e); if (!r) continue; const cs = getComputedStyle(e);
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.matches('button,input,select,a[href]');
    if (own && r.top < innerHeight && r.bottom > 0 && !fixedBar(e) && (r.left < 15.5 || W - r.right < 15.5) && r.width < W - 2) { const k = name(e); if (!seenS2.has(k)) { seenS2.add(k); inc('S2'); note('S2', `${k} L${Math.round(r.left)} R${Math.round(W - r.right)}`); } }
    for (const p of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'rowGap', 'columnGap']) {
      const v = cs[p]; if (!v || v === 'normal' || v === 'auto') continue; const n = Math.abs(px(v)); if (n === 0) continue;
      if (Math.abs(n / 4 - Math.round(n / 4)) > 0.02) { inc('S3'); note('S3', `${name(e)} ${p}=${+n.toFixed(1)}`); break; }
    }
    if (own && (px(cs.marginTop) < 0 || px(cs.marginBottom) < 0)) { inc('S6'); note('S6', `${name(e)} ${cs.marginTop}/${cs.marginBottom}`); }
    if (e.matches('h1,h2,h3,h4') && (px(cs.marginTop) > 0 || px(cs.marginBottom) > 0)) { inc('S7'); note('S7', `${name(e)} ${cs.marginTop}/${cs.marginBottom}`); }
    // S4: a flex/grid column whose child group (itself a column with 2+ children) has a gap >= the parent's gap
    if ((cs.display.includes('flex') && cs.flexDirection.startsWith('column') || cs.display.includes('grid')) && px(cs.rowGap) > 0) {
      for (const c of e.children) { const cc = getComputedStyle(c); if (c.children.length > 1 && (cc.display.includes('flex') && cc.flexDirection.startsWith('column') || cc.display.includes('grid')) && px(cc.rowGap) >= px(cs.rowGap) && vis(c)) { inc('S4'); note('S4', `${name(e)} gap ${cs.rowGap} > ${name(c)} gap ${cc.rowGap}`); break; } }
    }
  }
  // S5 (CSSOM, once per rule)
  const walk = (rules) => { for (const r of rules) { if (r.cssRules && !r.style) walk(r.cssRules); else if (r.style) { const v = r.style.getPropertyValue('line-height') || ''; const f = r.style.getPropertyValue('font') || ''; if (/^\s*-?[\d.]+px\s*$/.test(v) || /\/\s*[\d.]+px/.test(f)) { inc('S5'); note('S5', `${(r.selectorText || '').slice(0, 50)} ${v || f}`); } if (r.cssRules) walk(r.cssRules); } } };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* cross-origin */ } }
  return { G: C, det };
}
