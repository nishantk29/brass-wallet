// Builds dist-embedded/worker.js: the Worker with every file in public/ inlined, for publishing through the
// Cloudflare API without the assets-upload step. The normal path is still Workers Static Assets (see wrangler.jsonc).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const TYPES = { js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8', png: 'image/png',
  svg: 'image/svg+xml', woff2: 'font/woff2', webmanifest: 'application/manifest+json', txt: 'text/plain; charset=utf-8' };
const files = {};
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files['/' + path.relative('public', p).split(path.sep).join('/')] = p; } };
walk('public');
// The ETag is the first 16 hex of the file's SHA-256, so it changes exactly when the content does.
const etag = (buf) => `"${createHash('sha256').update(buf).digest('hex').slice(0, 16)}"`;
const map = Object.fromEntries(Object.entries(files).map(([u, p]) => { const buf = fs.readFileSync(p); return [u, { t: TYPES[path.extname(p).slice(1)] || 'application/octet-stream', b: buf.toString('base64'), e: etag(buf) }]; }));
fs.mkdirSync('dist-embedded', { recursive: true });
// Headers, cache lifetimes and If-None-Match handling live in scripts/asset-server.mjs (unit-tested).
fs.writeFileSync('dist-embedded/entry.js', `import worker, { Room } from '../src/worker.js';
import { serve } from '../scripts/asset-server.mjs';
const FILES = ${JSON.stringify(map)};
const ASSETS = { async fetch(req) { return serve(FILES, req); } };
export default { fetch: (req, env, ctx) => worker.fetch(req, Object.assign(Object.create(env), { ROOM: env.ROOM, ASSETS }), ctx) };
export { Room };
`);
await build({ entryPoints: ['dist-embedded/entry.js'], bundle: true, format: 'esm', outfile: 'dist-embedded/worker.js', external: ['cloudflare:workers'], target: 'es2022', logLevel: 'warning' });
console.log('dist-embedded/worker.js', fs.statSync('dist-embedded/worker.js').size, 'bytes,', Object.keys(map).length, 'files');
