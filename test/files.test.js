import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('files: fonts, licences, manifest and worker config exist', () => {
  for (const f of ['public/fonts/bitter-700-core.woff2', 'public/fonts/bitter-700-ext.woff2', 'public/fonts/LICENSE-bitter.txt', 'public/fonts/rubik-var.woff2', 'public/manifest.webmanifest', 'public/sw.js', 'public/404.html']) assert.ok(fs.existsSync(f), f);
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
test('files: home links every game, head has og: tags and a noscript line, h1 reads as two words', () => {
  const app = fs.readFileSync('public/js/app.js', 'utf8'), html = fs.readFileSync('public/index.html', 'utf8');
  assert.match(app, /href="https:\/\/gamenight\.hatethespurs\.com">All games</);
  for (const [n, u] of [['Mafia Night', 'mafia'], ['Quest Night', 'avalon'], ['The Gilded Chamber', 'gilded'], ['The Odd Card', 'oddcard']]) assert.ok(app.includes(`['${n}', 'https://${u}.hatethespurs.com']`), n);
  assert.ok(app.includes(`['Brass Wallet', '']`), 'this game is named, not linked');
  assert.match(app, />Brass <br>Wallet</);
  for (const p of ['og:title', 'og:description', 'og:image']) assert.match(html, new RegExp(`<meta property="${p}" content="[^"]+">`), p);
  assert.match(html, /og:image" content="https:\/\/[^"]+\/icons\/icon-512\.png"/); assert.ok(fs.existsSync('public/icons/icon-512.png'));
  assert.match(html, /<noscript><p[^>]*>[^<]*JavaScript[^<]*<\/p><\/noscript>/);
});
test('files: sheets are modal (screen inert, aria-modal, focus moves in) and tap sizes hold', () => {
  const app = fs.readFileSync('public/js/app.js', 'utf8'), css = fs.readFileSync('public/styles.css', 'utf8');
  assert.ok(app.includes(`class="screen grain"\${v && A.sheet ? ' inert' : ''}`));
  assert.match(app, /<dialog open class="sheet"[^>]*aria-modal="true"[^>]*tabindex="-1"/);
  assert.match(css, /\.field \.add\{min-height:44px/); assert.match(css, /\.more-pill\{[^}]*min-height:48px[^}]*font-weight:700/);
  assert.match(css, /\.games li\{[^}]*min-height:44px/);
  assert.ok(!/Not shipped/.test(css), 'stale mockup comment is gone');
});
