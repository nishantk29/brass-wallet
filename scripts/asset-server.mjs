// The static-file server inside dist-embedded/worker.js (see build-embedded.mjs, which makes FILES: { t: type,
// b: base64, e: ETag }). Kept in its own file so test/asset-server.test.js can call it without building.

// Sent on every file and on the 404 page. frame-ancestors 'none': nothing frames this site. A full CSP waits until the
// inline scripts in index.html are hashed.
export const SECURITY = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "frame-ancestors 'none'",
};

// HTML and the service worker are always revalidated. Fonts and icons rarely change, so a year; their names are not
// content-versioned, so no `immutable`. Everything else an hour. The ETag lets an expired file come back as a 304.
export function cacheFor(p) {
  if (p === '/index.html' || p === '/sw.js' || p.endsWith('.html')) return 'no-cache';
  if (p.startsWith('/fonts/') || p.startsWith('/icons/')) return 'public, max-age=31536000';
  return 'public, max-age=3600';
}

const bytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const matches = (inm, etag) => !!inm && (inm.trim() === '*' || inm.split(',').some((t) => t.trim().replace(/^W\//, '') === etag));

export function serve(FILES, req) {
  const url = new URL(req.url);
  const p = url.pathname === '/' ? '/index.html' : url.pathname;
  const f = FILES[p];
  if (!f) { const nf = FILES['/404.html']; return new Response(nf ? bytes(nf.b) : 'Not found', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY } }); }
  const headers = { 'content-type': f.t, 'cache-control': cacheFor(p), etag: f.e, ...SECURITY };
  if (matches(req.headers.get('if-none-match'), f.e)) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : bytes(f.b), { headers });
}
