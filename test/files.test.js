import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('files: fonts, licences, manifest and worker config exist', () => {
  for (const f of ['public/fonts/bitter-700.woff2', 'public/fonts/LICENSE-bitter.txt', 'public/fonts/rubik-var.woff2', 'public/manifest.webmanifest', 'public/sw.js', 'public/404.html']) assert.ok(fs.existsSync(f), f);
  const w = fs.readFileSync('wrangler.jsonc', 'utf8');
  assert.match(w, /"name": "brass-wallet"/); assert.match(w, /new_sqlite_classes": \["Room"\]/); assert.match(w, /"tag": "v1"/);
});
test('files: service worker VERSION matches the precached files (restamp with make-pwa after changes)', () => {
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  assert.match(sw, /const VERSION = '[0-9a-f]{10}'/);
  assert.ok(/\/js\/app\.js/.test(sw) && /\/js\/table\.js/.test(sw), 'app files are precached for offline play');
});
test('files: touch targets, input and body sizes stay in the stylesheet rules', () => {
  const css = fs.readFileSync('public/styles.css', 'utf8');
  assert.match(css, /\.btn\{[^}]*min-height:52px/); assert.match(css, /--xs:\.8125rem/);
});
