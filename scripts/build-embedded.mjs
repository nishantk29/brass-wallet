// Builds dist-embedded/worker.js: the Worker with every file in public/ inlined, for publishing through the
// Cloudflare API without the assets-upload step. The normal path is still Workers Static Assets (see wrangler.jsonc).
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const TYPES = { js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8', png: 'image/png',
  svg: 'image/svg+xml', woff2: 'font/woff2', webmanifest: 'application/manifest+json', txt: 'text/plain; charset=utf-8' };
const files = {};
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files['/' + path.relative('public', p).split(path.sep).join('/')] = p; } };
walk('public');
const map = Object.fromEntries(Object.entries(files).map(([u, p]) => [u, { t: TYPES[path.extname(p).slice(1)] || 'application/octet-stream', b: fs.readFileSync(p).toString('base64') }]));
fs.mkdirSync('dist-embedded', { recursive: true });
fs.writeFileSync('dist-embedded/entry.js', `import worker, { Room } from '../src/worker.js';
const FILES = ${JSON.stringify(map)};
const bytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const ASSETS = { async fetch(req) {
  const url = new URL(req.url);
  const p = url.pathname === '/' ? '/index.html' : url.pathname;
  const f = FILES[p];
  if (!f) { const nf = FILES['/404.html']; return new Response(nf ? bytes(nf.b) : 'Not found', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }); }
  const cache = p === '/index.html' || p === '/sw.js' ? 'no-cache' : 'public, max-age=3600';
  return new Response(bytes(f.b), { headers: { 'content-type': f.t, 'cache-control': cache } });
} };
export default { fetch: (req, env, ctx) => worker.fetch(req, Object.assign(Object.create(env), { ROOM: env.ROOM, ASSETS }), ctx) };
export { Room };
`);
await build({ entryPoints: ['dist-embedded/entry.js'], bundle: true, format: 'esm', outfile: 'dist-embedded/worker.js', external: ['cloudflare:workers'], target: 'es2022', logLevel: 'warning' });
console.log('dist-embedded/worker.js', fs.statSync('dist-embedded/worker.js').size, 'bytes,', Object.keys(map).length, 'files');
