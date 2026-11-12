// AI-look gate measure (Scout AI-LOOK.md G1-G26, 30 Oct 2026). Pure read of computed styles in the page; returns
// violation COUNTS per check for one screen, plus a few details. Built on Scout's design/ailook/tells.js (read first).
// Not gated, by decision: G8 (cross-site, computed by the runner), G12/G17/G19/G23/G27/G28 (review), G15 (pending
// Nishant), G18 (needs semantics, review). G24 gates TRAILING ARROWS ONLY: the 'A · B · C' meta line is Nishant's
// standard. G7 counts distinct radii per screen only; the token VALUES go through the corner-rounding decision.
((opts = {}) => {
  const cs = (e) => getComputedStyle(e), vh = innerHeight, vw = innerWidth;
  const SKIP = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|BR|META|LINK|PATH|G|DEFS|SYMBOL|USE|CLIPPATH|MASK|LINEARGRADIENT|RADIALGRADIENT|STOP)$/i;
  const visible = (e) => { const c = cs(e); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return null; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; if (e.closest('[aria-hidden="true"],[inert]')) return null; return r; };
  const V = []; for (const e of document.querySelectorAll('body *')) { if (SKIP.test(e.tagName)) continue; const r = visible(e); if (r) V.push([e, r, cs(e)]); }
  const inFold = (r) => r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const rgb = (s) => { const m = (s || '').match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; };
  const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const filled = (c) => (rgb(c.backgroundColor) || [0, 0, 0, 0])[3] > 0.05 && !/^rgba?\(0, 0, 0, 0\)$/.test(c.backgroundColor);
  const bordered = (c) => ['Top', 'Right', 'Bottom', 'Left'].every((s) => parseFloat(c['border' + s + 'Width']) >= 1 && c['border' + s + 'Style'] !== 'none');
  const isBox = (e, r, c) => (parseFloat(c.borderTopLeftRadius) || 0) > 0 && (filled(c) || bordered(c)) && r.width > 60 && r.height > 30;
  const EXEMPT = 'button,input,select,textarea,a,label,summary,[role=button],[role=tab],[class*=chip],[class*=pill],[class*=card-art],[class*=token],[class*=coin],[class*=avatar],[class*=playing],[class*=seat-token],dialog,[data-sheet]';
  const TW = ['0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px', '0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px', '0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px', '0px 20px 25px -5px, rgba(0, 0, 0, 0.1) 0px 8px 10px -6px', '0px 25px 50px -12px'];
  const EMO = /(?![\u2660-\u2667])\p{Extended_Pictographic}/u; // card suits are game objects, not emoji icons
  const BANNED = /\b(seamless(ly)?|elevate|unleash|effortless(ly)?|supercharge|revolutioni[sz]e|delve|unlock|empower|ultimate|magic(al)?|journey|epic|immersive|level up|get ready|let'?s go)\b/i;
  const ALLOW = /^(QR|FAQ|VP|OK|I|Mafia|Quest|Gilded|Council|Odd|Card|Brass|Wallet|Game|Night|Doctor|Detective|Villager|Merlin|Percival|Morgana|Mordred|Oberon|Assassin|Liberal|Fascist|Hitler|Chancellor|President|Boss|Mayor|Werewolf|Seer)$/;
  const weights = new Set(), fams = new Set(), combos = new Set(), radii = new Set(), lefts = new Set();
  const G = {}; const inc = (k, n = 1) => { G[k] = (G[k] || 0) + n; };
  const det = {}; const note = (k, s) => { (det[k] ||= []).length < 6 && det[k].push(String(s).slice(0, 50)); };
  let big = null; const boxes = new Set(); let satFills = 0;
  for (const [e, r, c] of V) {
    const rad = parseFloat(c.borderTopLeftRadius) || 0;
    if (rad > 0) radii.add(rad >= Math.min(r.height, r.width) / 2 - 0.5 ? 'pill' : Math.round(rad) + 'px');
    if (isBox(e, r, c)) boxes.add(e);
    if (c.boxShadow && c.boxShadow !== 'none') { if (TW.some((s) => c.boxShadow.includes(s))) { inc('G11'); note('G11', 'tailwind shadow'); } const m = c.boxShadow.match(/rgba?\(([^)]+)\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/); if (m) { const [, s] = hsl(m[1].split(',').map(Number)); if (s > .4 && +m[4] >= 8 && Math.abs(+m[3]) <= 4 && (m[1].split(',')[3] ?? 1) > .2) { inc('G11'); note('G11', 'glow ' + e.className); } } }
    const bg = c.backgroundImage || '';
    if (/gradient/.test(bg) && r.width * r.height > 2000) { const hs = [...bg.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[1].split(',').map(Number)).filter((x) => (x[3] ?? 1) > 0.2).map(hsl).filter(([, s]) => s > .3); if (hs.some(([h]) => h >= 240 && h <= 300) && hs.some(([h]) => (h >= 190 && h < 240) || (h > 280 && h <= 330))) inc('G14'); }
    const p = rgb(c.backgroundColor);
    if (p && (p[3] ?? 1) >= .5 && r.width * r.height > 10000 && inFold(r) && !e.closest('[data-colour-data]')) { const [, s, l] = hsl(p); if (s > .45 && l > .2 && l < .85) { satFills++; note('G13', e.tagName + '.' + e.className); } }
    const t = own(e); if (!t) continue;
    const n = t.length, fs = parseFloat(c.fontSize), ff = c.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    weights.add(c.fontWeight); if (!(opts.ignoreUaFont && /^Times New Roman$/i.test(ff))) fams.add(ff); combos.add(`${Math.round(fs)}/${c.fontWeight}/${ff}`);
    if (n > 2 && !/^[A-Z0-9]{4,8}$/.test(t) && (!big || fs > big.fs)) big = { fs, lh: c.lineHeight === 'normal' ? null : parseFloat(c.lineHeight), ls: parseFloat(c.letterSpacing) || 0, t };
    const tops = new Set(); for (const nd of e.childNodes) if (nd.nodeType === 3 && nd.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(nd); for (const q of rg.getClientRects()) if (q.width > 1) tops.add(Math.round(q.top / 4)); } const lines = tops.size;
    const centred = c.textAlign === 'center' || (c.textAlign === 'start' && e.parentElement && cs(e.parentElement).textAlign === 'center');
    if (centred && fs < 28 && (lines > 2 || n > 90)) { inc('G5'); note('G5', t); }
    if ((c.textTransform === 'uppercase' || parseFloat(c.letterSpacing) > 0.05 * fs) && n > 12 && !/Limelight|Mafia Deco/i.test(c.fontFamily)) { inc('G6'); note('G6', t); }
    if (/[→›»]\s*$/.test(t)) { inc('G24'); note('G24', t); }
    if (EMO.test(t) && (n <= 3 || e.closest('button,label,a'))) { inc('G25'); note('G25', t); }
    const b = t.match(BANNED); if (b) { inc('G26'); note('G26', b[0]); }
    if (e.closest('button,a,[role=button],label,summary,[role=tab]')) { const ws = t.split(/\s+/); const el = []; for (let i = 1; i < ws.length; i++) if (/^[A-Za-z]/.test(ws[i]) && !/[.:!?]$/.test(ws[i - 1]) && !/^(a|an|the|of|and|or|to|in|on|for|by|at)$/i.test(ws[i])) el.push(ws[i].replace(/[^A-Za-z]/g, '')); const caps = el.filter((x) => /^[A-Z][a-z]/.test(x) && !ALLOW.test(x)); if (el.length && caps.length > el.length / 2) { inc('G22'); note('G22', t); } }
    if (inFold(r) && r.width > 40 && !/^inline/.test(c.display) && !e.closest('button,a,[role=button],nav,[role=tablist],li,[role=listitem],label')) lefts.add(Math.round(r.left));
  }
  if (weights.size > 3) { inc('G1', weights.size - 3); note('G1', [...weights].join('/')); }
  const banF = [...fams].filter((f) => /^(arial|helvetica|alegreya sans|monospace|courier|menlo|consolas|sf mono|ui-monospace)/i.test(f)).length;
  if (fams.size > 2 || banF) { inc('G2', Math.max(0, fams.size - 2) + banF); note('G2', [...fams].join('/')); }
  if (combos.size > 10) inc('G3', combos.size - 10);
  if (big && big.fs >= 28) { const lh = big.lh ? big.lh / big.fs : 1.2, ls = big.ls / big.fs; if (lh < 0.95 || lh > 1.15 || ls < -0.031 || ls > 0.011) { inc('G4'); note('G4', `${big.t} ${Math.round(big.fs)}px lh ${lh.toFixed(2)} ls ${ls.toFixed(3)}em`); } }
  if (radii.size > 4) { inc('G7', radii.size - 4); note('G7', [...radii].join(' ')); }
  for (const e of boxes) { if (e.matches(EXEMPT) || e.closest(EXEMPT)) continue; let a = e.parentElement; while (a && a !== document.body) { if (boxes.has(a)) { inc('G9'); note('G9', e.className); break; } a = a.parentElement; } }
  const seen = new Set();
  for (const [e] of V) { const p = e.parentElement; if (!p || seen.has(p)) continue; seen.add(p); const kids = [...p.children].map((k) => [k, k.getBoundingClientRect(), cs(k)]).filter(([k, kr]) => kr.width > 80 && kr.height > 60 && !k.matches(EXEMPT)); if (kids.length < 3) continue; const same = kids.filter(([k, kr, kc]) => (parseFloat(kc.borderTopLeftRadius) > 0) && (kc.boxShadow !== 'none' || parseFloat(kc.borderTopWidth) >= 1 || filled(kc)) && Math.abs(kr.width - kids[0][1].width) < 2 && Math.abs(kr.height - kids[0][1].height) < 4); if (same.length >= 3) { inc('G10'); note('G10', p.className || p.tagName); } }
  if (satFills > 1) inc('G13', satFills - 1);
  if (lefts.size > 2) { inc('G16', lefts.size - 2); note('G16', [...lefts].sort((a, b) => a - b).join(',')); }
  const games = document.querySelectorAll('#games > li');
  if (games.length) { const inV = [...games].filter((g) => { const r = g.getBoundingClientRect(); return r.top < vh && r.bottom > 0; }).length; if (inV < 3) { inc('G20'); note('G20', inV + ' games in first viewport'); } }
  for (const a of (document.getAnimations ? document.getAnimations() : [])) { const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {}; const d = +t.duration || 0; const it = t.iterations; if ((d > 400 || it !== 1) && !(d >= 100 && d <= 150 && it === 1)) { inc('G21'); note('G21', (a.animationName || a.id || 'anim') + ' ' + Math.round(d) + 'ms x' + it); } }
  const comp = {}; for (const [k, q] of [['primary', '.btn.big,.btn-primary,.primary,.cta'], ['input', 'input[type=text],input:not([type])'], ['sheet', 'dialog[open],[data-sheet][open],.sheet']]) { const e = [...document.querySelectorAll(q)].find((x) => visible(x)); if (e) comp[k] = cs(e).borderTopLeftRadius; }
  return { G, det, comp, radii: [...radii], weights: [...weights], families: [...fams], combos: combos.size, lefts: [...lefts].sort((a, b) => a - b) };
})