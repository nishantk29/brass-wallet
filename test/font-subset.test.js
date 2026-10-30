// Subset web fonts (scripts/fonts/subset.py, hand-run, output committed). These checks keep the committed output,
// the CSS and the service worker in step with each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const man = JSON.parse(read('scripts/fonts/manifest.json'));
const cfg = JSON.parse(read('scripts/fonts/fonts.json'));
const walk = (d) => (existsSync(path.join(root, d)) ? readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const styleFiles = [...walk('public'), ...walk('src')].filter((f) => /\.(css|html|js)$/.test(f));
const styles = styleFiles.map((f) => [f, read(f)]);
const parse = (r) => r.split(',').flatMap((p) => { const [a, b] = p.replace(/U\+/i, '').split('-'); const lo = parseInt(a, 16), hi = parseInt(b || a, 16); return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); });
const files = man.fonts.flatMap((f) => f.files.map((x) => ({ ...x, font: f })));

test('every subset file in the manifest is committed, current (size + sha256) and precached by the service worker', () => {
  const sw = read('public/sw.js');
  for (const f of files) {
    const p = path.join(root, 'public/fonts', f.file);
    assert.ok(existsSync(p), `${f.file} missing: run scripts/fonts/subset.py`);
    const buf = readFileSync(p);
    assert.equal(buf.length, f.bytes, `${f.file} size differs from the manifest`);
    assert.equal(createHash('sha256').update(buf).digest('hex'), f.sha256, `${f.file} differs from the manifest`);
    assert.ok(sw.includes(`'/fonts/${f.file}'`), `${f.file} is not in the SW precache list`);
  }
});

test('font sources stay out of public/ (they are inputs to the subsetter, not deployed)', () => {
  for (const f of man.fonts) {
    assert.ok(f.src.startsWith('scripts/fonts/src/') && existsSync(path.join(root, f.src)), f.src);
    assert.ok(!existsSync(path.join(root, 'public/fonts', path.basename(f.src))), `${path.basename(f.src)} is still in public/fonts`);
  }
});

test('each @font-face for a split font carries exactly the unicode-range of its file, and the ranges do not overlap', () => {
  for (const font of man.fonts.filter((f) => f.files.length > 1)) {
    const seen = new Set();
    for (const f of font.files) {
      for (const cp of parse(f.unicode_range)) { assert.ok(!seen.has(cp), `${f.file}: U+${cp.toString(16)} in two files`); seen.add(cp); }
      const blocks = styles.flatMap(([, t]) => [...t.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0])).filter((b) => b.includes(`/fonts/${f.file}`));
      assert.ok(blocks.length > 0, `${f.file} is not used by any @font-face`);
      for (const b of blocks) assert.ok(b.includes(`unicode-range:${f.unicode_range}}`) || b.includes(`unicode-range:${f.unicode_range};`), `${f.file}: @font-face unicode-range differs from the manifest`);
    }
  }
});

test('every character in the site copy that a split font covers is in its preloaded core file (no surprise second download)', () => {
  const copy = new Set();
  for (const d of cfg.scan || ['public', 'src']) for (const f of walk(d)) {
    if (f.includes(`${path.sep}fonts${path.sep}`) || !/\.(js|mjs|html|css|json|webmanifest|svg|txt|md)$/.test(f)) continue;
    const t = read(f);
    for (const ch of t) { const c = ch.codePointAt(0); if (c > 0x7e) copy.add(c); }
    for (const m of t.matchAll(/\\u([0-9a-fA-F]{4})/g)) copy.add(parseInt(m[1], 16));
  }
  for (const font of man.fonts.filter((f) => f.files.length > 1)) {
    const core = new Set(parse(font.files[0].unicode_range));
    const ext = new Set(font.files.slice(1).flatMap((f) => parse(f.unicode_range)));
    const missing = [...copy].filter((c) => ext.has(c) && !core.has(c)).map((c) => String.fromCodePoint(c));
    assert.deepEqual(missing, [], `${font.files[0].file}: site copy uses ${missing.join(' ')}; re-run scripts/fonts/subset.py`);
  }
});

test('preloads point at core files only, and every preloaded font exists', () => {
  const ext = new Set(files.filter((f) => /-ext\.woff2$/.test(f.file)).map((f) => f.file));
  for (const [name, t] of styles.filter(([f]) => f.endsWith('.html'))) {
    for (const m of t.matchAll(/<link rel="preload" href="\/fonts\/([\w.-]+)"/g)) {
      assert.ok(!ext.has(m[1]), `${name} preloads the extended file ${m[1]}`);
      assert.ok(existsSync(path.join(root, 'public/fonts', m[1])), `${name} preloads missing ${m[1]}`);
    }
  }
});

test('renamed fonts (SIL OFL Reserved Font Name) are never loaded under their reserved name', () => {
  for (const f of cfg.fonts.filter((x) => x.rename)) {
    for (const [name, t] of styles) assert.doesNotMatch(t, new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${f.rename.from}"`), `${name} loads a subset font as "${f.rename.from}"`);
    for (const x of man.fonts.find((m) => m.src === f.src).files) assert.equal(x.name, f.rename.to, `${x.file} internal family name`);
  }
});
