// Spacing + section-pattern ratchet (Scout SPACING.md, 30 Oct 2026). Serves public/ from disk through a Playwright route (no server,
// no network), opens each screen in test/ailook-screens.json at 390x844 with JS on, waits 3 s (animations settle),
// runs test/kit/spacing-measure.js and sums violations per check (S1-S7).
//   node test/kit/spacing-check.mjs            compare with test/spacing-baseline.json; exit 1 if any count went UP
//   node test/kit/spacing-check.mjs --init     write the first baseline
//   node test/kit/spacing-check.mjs --write    lower the baseline (refuses if anything went up)
// Box-only like the e2e suites: PW (playwright-core dir) and CHROME env, defaults below.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..', '..');
const PW = process.env.PW || '/workspace/forge/pw/node_modules/playwright-core', CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const pub = path.join(root, 'public'), BL = path.join(root, 'test', 'spacing-baseline.json');
const screens = JSON.parse(fs.readFileSync(path.join(root, 'test', 'ailook-screens.json'), 'utf8'));
const M = fs.readFileSync(path.join(here, 'spacing-measure.js'), 'utf8');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.pdf': 'application/pdf' };
const { chromium } = await import(`${PW}/index.mjs`);
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.host !== 'kit.local') return route.fulfill({ status: 204, body: '' });
  let f = path.join(pub, decodeURIComponent(u.pathname)); if (!f.startsWith(pub)) return route.fulfill({ status: 403, body: '' });
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { if (u.pathname.startsWith('/api') || u.pathname.startsWith('/ws')) return route.fulfill({ status: 503, body: '' }); f = path.join(pub, 'index.html'); }
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});
const totals = {}, per = {};
for (const s of screens) {
  const p = await ctx.newPage();
  await p.goto('http://kit.local' + s, { waitUntil: 'load' }); await p.waitForTimeout(3000);
  const m = await p.evaluate(`(${M})({})`);
  per[s] = m;
  for (const [k, v] of Object.entries(m.G)) totals[k] = (totals[k] || 0) + v;
  await p.close();
}
await b.close();
const ids = [...new Set([...Object.keys(totals), ...(fs.existsSync(BL) ? Object.keys(JSON.parse(fs.readFileSync(BL, 'utf8')).counts) : [])])].sort((a, b) => +a.slice(1) - +b.slice(1));
const arg = process.argv[2];
if (arg === '--init' || !fs.existsSync(BL)) { if (arg !== '--init') { console.error('no baseline: run with --init'); process.exit(1); } fs.writeFileSync(BL, JSON.stringify({ screens, counts: Object.fromEntries(ids.map((k) => [k, totals[k] || 0])) }, null, 1) + '\n'); console.log('wrote', BL, totals); process.exit(0); }
const base = JSON.parse(fs.readFileSync(BL, 'utf8')).counts; const up = [], down = [];
for (const k of ids) { const n = totals[k] || 0, o = base[k] || 0; if (n > o) up.push(`${k} ${o} -> ${n}: ${Object.entries(per).filter(([, m]) => m.G[k]).map(([s, m]) => s + ' ' + (m.det[k] || []).slice(0, 3).join(' | ')).join('; ')}`); else if (n < o) down.push(`${k} ${o} -> ${n}`); }
console.log('now     ', JSON.stringify(Object.fromEntries(ids.map((k) => [k, totals[k] || 0])))); console.log('baseline', JSON.stringify(base));
if (up.length) { console.error('Spacing ratchet: counts went UP (Scout SPACING.md)\n  ' + up.join('\n  ')); process.exit(1); }
if (arg === '--write') { fs.writeFileSync(BL, JSON.stringify({ screens, counts: Object.fromEntries(ids.map((k) => [k, totals[k] || 0])) }, null, 1) + '\n'); console.log('baseline lowered'); }
else if (down.length) console.log('lower the baseline (--write):', down.join(', '));
console.log('Spacing ratchet ok');
