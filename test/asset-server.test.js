import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, cacheFor, SECURITY } from '../scripts/asset-server.mjs';

const file = (s, t, e) => ({ t, b: Buffer.from(s).toString('base64'), e });
const FILES = {
  '/index.html': file('<h1>Brass</h1>', 'text/html; charset=utf-8', '"aaaa"'),
  '/sw.js': file('//sw', 'application/javascript; charset=utf-8', '"bbbb"'),
  '/styles.css': file('a{}', 'text/css; charset=utf-8', '"cccc"'),
  '/fonts/rubik-var.woff2': file('font', 'font/woff2', '"dddd"'),
  '/icons/icon-512.png': file('png', 'image/png', '"eeee"'),
  '/404.html': file('<p>Not here</p>', 'text/html; charset=utf-8', '"ffff"'),
};
const get = (p, h = {}) => serve(FILES, new Request('https://brass.test' + p, { headers: h }));

test('assets: security headers on every file and on the 404 page', async () => {
  for (const p of ['/', '/sw.js', '/styles.css', '/fonts/rubik-var.woff2', '/nope']) {
    const r = get(p);
    assert.equal(r.headers.get('strict-transport-security'), 'max-age=31536000', p);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p);
    assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', p);
    assert.equal(r.headers.get('content-security-policy'), "frame-ancestors 'none'", p);
  }
  assert.equal(Object.keys(SECURITY).length, 4);
  const nf = get('/nope'); assert.equal(nf.status, 404); assert.equal(await nf.text(), '<p>Not here</p>');
});

test('assets: HTML and sw.js revalidate, fonts and icons for a year (not immutable), the rest an hour', () => {
  assert.equal(get('/').headers.get('cache-control'), 'no-cache');
  assert.equal(get('/sw.js').headers.get('cache-control'), 'no-cache');
  assert.equal(get('/fonts/rubik-var.woff2').headers.get('cache-control'), 'public, max-age=31536000');
  assert.equal(get('/icons/icon-512.png').headers.get('cache-control'), 'public, max-age=31536000');
  assert.equal(get('/styles.css').headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(cacheFor('/404.html'), 'no-cache');
});

test('assets: ETag is sent and If-None-Match answers 304 with no body', async () => {
  const r = get('/styles.css');
  assert.equal(r.status, 200); assert.equal(r.headers.get('etag'), '"cccc"'); assert.equal(await r.text(), 'a{}');
  for (const inm of ['"cccc"', 'W/"cccc"', '"zzzz", "cccc"', '*']) {
    const n = get('/styles.css', { 'if-none-match': inm });
    assert.equal(n.status, 304, inm); assert.equal(await n.text(), ''); assert.equal(n.headers.get('etag'), '"cccc"');
    assert.equal(n.headers.get('cache-control'), 'public, max-age=3600');
  }
  assert.equal(get('/styles.css', { 'if-none-match': '"zzzz"' }).status, 200);
});

test('assets: the build stores a content-hash ETag for every file', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('scripts/build-embedded.mjs', 'utf8');
  assert.match(src, /createHash\('sha256'\)/); assert.match(src, /e: etag\(buf\)/); assert.match(src, /serve\(FILES, req\)/);
});
