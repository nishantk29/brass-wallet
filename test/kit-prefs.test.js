// kit-prefs.js: theme + reduce-transparency plumbing, run in a stub DOM (no browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../public/kit-prefs.js', import.meta.url), 'utf8');
function run({ themes = 'dark', store = {}, light = false, mem, theme = '#0B0B0D', themeLight } = {}) {
  const metas = { 'kit-themes': { content: themes }, 'color-scheme': { content: 'dark' }, 'theme-color': { content: theme, dataset: themeLight ? { light: themeLight } : {} } };
  const ls = { ...store };
  const html = { dataset: {} };
  const listeners = [];
  const win = {
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    matchMedia: () => ({ get matches() { return light; }, addEventListener: (_, f) => listeners.push(f) }),
    addEventListener: () => {},
  };
  const document = { documentElement: html, readyState: 'complete', querySelector: (s) => metas[s.match(/name="([^"]+)"/)[1]] || null };
  const ctx = { window: win, document, navigator: mem == null ? {} : { deviceMemory: mem }, addEventListener: () => {}, HTMLElement: class {} };
  ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { html, metas, ls, api: ctx.window.kitPrefs, flip: (m) => { light = m; listeners.forEach((f) => f()); } };
}

test('kit-prefs: a dark-only site stays dark whatever the phone or the stored choice says', () => {
  for (const o of [{}, { light: true }, { store: { 'kit.theme': 'light' } }]) {
    const r = run(o); assert.equal(r.html.dataset.theme, 'dark'); assert.equal(r.metas['color-scheme'].content, 'dark');
  }
});
test('kit-prefs: System follows prefers-color-scheme when the site has a light theme, and live changes apply', () => {
  const r = run({ themes: 'dark light', light: true, themeLight: '#F6F1E7' });
  assert.equal(r.html.dataset.theme, 'light'); assert.equal(r.metas['color-scheme'].content, 'light'); assert.equal(r.metas['theme-color'].content, '#F6F1E7');
  r.flip(false); assert.equal(r.html.dataset.theme, 'dark'); assert.equal(r.metas['theme-color'].content, '#0B0B0D');
});
test('kit-prefs: an explicit Light or Dark choice wins over the phone and is remembered', () => {
  const r = run({ themes: 'dark light', light: true });
  r.api.setTheme('dark'); assert.equal(r.html.dataset.theme, 'dark'); assert.equal(r.ls['kit.theme'], 'dark');
  r.api.setTheme('system'); assert.equal(r.html.dataset.theme, 'light'); assert.equal('kit.theme' in r.ls, false);
  assert.equal(run({ themes: 'dark light', light: true, store: { 'kit.theme': 'dark' } }).html.dataset.theme, 'dark');
});
test('kit-prefs: Reduce transparency sets data-noblur, is remembered, and is on by default only for low-memory phones', () => {
  assert.equal(run().html.dataset.noblur, undefined);
  assert.equal(run({ mem: 2 }).html.dataset.noblur, '1');
  assert.equal(run({ mem: 8 }).html.dataset.noblur, undefined);
  assert.equal(run({ mem: 2, store: { 'kit.noblur': '0' } }).html.dataset.noblur, undefined);
  const r = run(); r.api.setNoblur(true); assert.equal(r.html.dataset.noblur, '1'); assert.equal(r.ls['kit.noblur'], '1');
  r.api.setNoblur(false); assert.equal(r.html.dataset.noblur, undefined); assert.equal(r.ls['kit.noblur'], '0');
});
test('kit-prefs: storage that throws (private mode) still gives a working dark page', () => {
  const SRC2 = SRC; const html = { dataset: {} };
  const ctx = { window: { get localStorage() { throw new Error('denied'); }, addEventListener() {} }, document: { documentElement: html, readyState: 'complete', querySelector: () => null }, navigator: {}, addEventListener() {}, HTMLElement: class {} };
  ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(SRC2, ctx);
  assert.equal(html.dataset.theme, 'dark'); ctx.window.kitPrefs.setNoblur(true); assert.equal(html.dataset.noblur, '1');
});
test('kit-prefs: index.html loads it as a blocking head script before the stylesheets', () => {
  const h = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const i = h.indexOf('<script src="/kit-prefs.js"></script>');
  const before = [...h.slice(0, Math.max(i, 0)).matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((m) => m[0]).filter((l) => !/href="\/family\.css"/.test(l));
  assert.ok(i > 0 && i < h.indexOf('</head>'), 'kit-prefs.js must be a plain blocking script in <head>');
  assert.deepEqual(before, [], 'only family.css may load before kit-prefs.js, so the site styles never paint without the theme');
  assert.match(h, /<meta name="kit-themes" content="[a-z ]+">/);
});
