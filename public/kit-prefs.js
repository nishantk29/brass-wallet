// Display preferences for every Game Night site (kit, 30 Oct 2026). Copied byte-for-byte into each site's public/.
// Load it as a plain blocking <script src="/kit-prefs.js"></script> in <head>, before the stylesheets, so the theme and
// the solid-bar choice are on <html> before first paint.
//  - Appearance: 'system' | 'light' | 'dark' in localStorage 'kit.theme' (default system). The site declares which themes
//    it has in <meta name="kit-themes" content="dark"> (space separated). A theme the site doesn't have resolves to its
//    first one, and the Appearance control only shows when the site has more than one theme.
//    Sets html[data-theme], <meta name="color-scheme"> and <meta name="theme-color"> (from its data-dark / data-light).
//  - Reduce transparency: localStorage 'kit.noblur' '1' | '0'; unset = automatic (on for low-memory phones,
//    navigator.deviceMemory <= 2). Sets html[data-noblur="1"], which family.css turns into solid bars. Safari has no
//    prefers-reduced-transparency, so this switch is the way to get solid bars there; family.css still honours the query.
// <kit-display-prefs></kit-display-prefs> renders the controls (native radios and a checkbox switch, family tokens).
(() => {
  const d = document, html = d.documentElement, LS = (() => { try { return window.localStorage; } catch { return null; } })();
  const MEM = {};   // used when storage is blocked, so a choice still holds for this page
  const get = (k) => { if (k in MEM) return MEM[k]; try { return LS ? LS.getItem(k) : null; } catch { return null; } };
  const put = (k, v) => { if (v == null) delete MEM[k]; else MEM[k] = v; try { if (!LS) return; if (v == null) LS.removeItem(k); else LS.setItem(k, v); delete MEM[k]; } catch { /* private mode: MEM keeps it */ } };
  const meta = (n) => d.querySelector(`meta[name="${n}"]`);
  const themes = () => ((meta('kit-themes') || {}).content || 'dark').split(/\s+/).filter(Boolean);
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  const pref = () => { const p = get('kit.theme'); return p === 'light' || p === 'dark' ? p : 'system'; };
  const resolve = (p = pref()) => { const t = themes(); const want = p === 'system' ? (mq && mq.matches ? 'light' : 'dark') : p; return t.includes(want) ? want : t[0]; };
  const lowEnd = () => typeof navigator !== 'undefined' && navigator.deviceMemory != null && navigator.deviceMemory <= 2;
  const noblurPref = () => { const v = get('kit.noblur'); return v === '1' || v === '0' ? v : 'auto'; };
  const noblur = () => { const v = noblurPref(); return v === '1' || (v === 'auto' && lowEnd()); };
  function apply() {
    const t = resolve(); html.dataset.theme = t;
    const cs = meta('color-scheme'); if (cs) cs.content = t;
    const tc = meta('theme-color'); if (tc) { if (!tc.dataset.dark) tc.dataset.dark = tc.content; const c = tc.dataset[t]; if (c) tc.content = c; }
    if (noblur()) html.dataset.noblur = '1'; else delete html.dataset.noblur;
  }
  apply();
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', apply, { once: true });   // metas after this script
  if (mq) (mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply));
  addEventListener('storage', (e) => { if (e.key === 'kit.theme' || e.key === 'kit.noblur') apply(); });
  const api = {
    get theme() { return pref(); }, get resolved() { return resolve(); }, get themes() { return themes(); },
    get noblur() { return noblur(); }, get noblurPref() { return noblurPref(); },
    setTheme(p) { put('kit.theme', p === 'light' || p === 'dark' ? p : null); apply(); },
    setNoblur(on) { put('kit.noblur', on ? '1' : '0'); apply(); },
  };
  window.kitPrefs = api;
  if (!window.customElements || customElements.get('kit-display-prefs')) return;
  const CSS = `kit-display-prefs{display:block}
details:has(>kit-display-prefs)>summary{display:flex;align-items:center;min-height:44px;cursor:pointer}
.kp{display:grid;gap:var(--f-s3)}
.kp-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:var(--f-s1);padding:var(--f-s1);margin:0;border:0;border-radius:var(--f-r-pill);background:color-mix(in srgb,var(--f-ink) 10%,transparent)}
.kp-seg legend{grid-column:1/-1;padding:0 0 var(--f-s2);font:var(--f-t-secondary);color:color-mix(in srgb,var(--f-ink) 72%,transparent)}
.kp-seg label{position:relative;display:grid;place-items:center;min-height:44px;border-radius:var(--f-r-pill);font:var(--f-t-secondary);cursor:pointer}
.kp-seg input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.kp-seg label:has(input:checked){background:color-mix(in srgb,var(--f-ink) 20%,transparent);font-weight:600}
.kp-seg label:has(input:focus-visible){outline:2px solid var(--f-accent);outline-offset:2px}
.kp-sw{display:flex;align-items:center;justify-content:space-between;gap:var(--f-s3);min-height:52px;cursor:pointer}
.kp-sw small{display:block;font-size:inherit;color:color-mix(in srgb,var(--f-ink) 72%,transparent)}
.kp-sw input{appearance:none;-webkit-appearance:none;flex:none;position:relative;width:51px;height:31px;margin:0;border-radius:var(--f-r-pill);background:color-mix(in srgb,var(--f-ink) 18%,transparent);cursor:pointer}
.kp-sw input::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:var(--f-r-round);background:var(--f-ink);transition:transform var(--f-dur-fast) var(--f-ease)}
.kp-sw input:checked{background:var(--f-accent)}.kp-sw input:checked::after{background:var(--f-on-accent)}.kp-sw input:checked::after{transform:translateX(20px)}
.kp-sw input:focus-visible{outline:2px solid var(--f-accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.kp-sw input::after{transition:none}}`;
  customElements.define('kit-display-prefs', class extends HTMLElement {
    connectedCallback() {
      if (!d.getElementById('kit-prefs-css')) { const s = d.createElement('style'); s.id = 'kit-prefs-css'; s.textContent = CSS; d.head.appendChild(s); }
      const t = themes(), p = pref(), id = 'kp' + Math.random().toString(36).slice(2, 7);
      const opts = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].filter(([v]) => v === 'system' || t.includes(v));
      const seg = t.length > 1 ? `<fieldset class="kp-seg"><legend>Appearance</legend>${opts.map(([v, l]) => `<label><input type="radio" name="${id}" value="${v}"${v === p ? ' checked' : ''}>${l}</label>`).join('')}</fieldset>` : '';
      this.innerHTML = `<div class="kp">${seg}<label class="kp-sw"><span>Reduce transparency<small>Solid bars instead of see-through glass</small></span><input type="checkbox" role="switch" data-kp="noblur"${noblur() ? ' checked' : ''}></label></div>`;
      this.addEventListener('change', (e) => { const el = e.target; if (el.dataset.kp === 'noblur') api.setNoblur(el.checked); else if (el.name === id) api.setTheme(el.value); });
    }
  });
})();
