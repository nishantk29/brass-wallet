// AI-look ratchet (Scout AI-LOOK.md, 30 Oct 2026). Serves public/ from disk through a Playwright route (no server,
// no network), opens each screen in test/ailook-screens.json at 390x844 with JS on, waits 3 s (G21 reads
// document.getAnimations() then), runs test/kit/ailook-measure.js and sums violations per check.
//   node test/kit/ailook-check.mjs            compare with test/ailook-baseline.json; exit 1 if any count went UP
//   node test/kit/ailook-check.mjs --init     write the first baseline
//   node test/kit/ailook-check.mjs --write    lower the baseline (refuses if anything went up)
// Box-only like the e2e suites: PW (playwright-core dir) and CHROME env, defaults below.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..', '..');
const PW = process.env.PW || '/workspace/forge/pw/node_modules/playwright-core', CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const pub = path.join(root, 'public'), BL = path.join(root, 'test', 'ailook-baseline.json');
const screens = JSON.parse(fs.readFileSync(path.join(root, 'test', 'ailook-screens.json'), 'utf8'));
const M = fs.readFileSync(path.join(here, 'ailook-measure.js'), 'utf8');
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
// G21 also catches entrances that finish before the 3 s read: every CSS animation that STARTS is logged with its timing.
await ctx.addInitScript(() => { window.__ailookAnims = new Map(); addEventListener('animationstart', (e) => { const a = (e.target.getAnimations ? e.target.getAnimations() : []).find((x) => x.animationName === e.animationName); const t = a && a.effect ? a.effect.getComputedTiming() : {}; window.__ailookAnims.set(e.animationName, [+t.duration || 0, t.iterations]); }, true); });
const totals = {}, per = {};
for (const s of screens) {
  const p = await ctx.newPage();
  await p.goto('http://kit.local' + s, { waitUntil: 'load' }); await p.waitForTimeout(3000);
  const m = await p.evaluate(`(${M})({})`);
  const started = await p.evaluate(() => [...(window.__ailookAnims || new Map())]);
  const live = new Set((m.det.G21 || []).map((x) => x.split(' ')[0]));
  for (const [name, [d, it]] of started) if (!live.has(name) && (d > 400 || it !== 1) && !(d >= 100 && d <= 150 && it === 1)) { m.G.G21 = (m.G.G21 || 0) + 1; (m.det.G21 ||= []).push(`${name} ${Math.round(d)}ms x${it} (entrance)`); }
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
if (up.length) { console.error('AI-look ratchet: counts went UP (Scout AI-LOOK.md)\n  ' + up.join('\n  ')); process.exit(1); }
if (arg === '--write') { fs.writeFileSync(BL, JSON.stringify({ screens, counts: Object.fromEntries(ids.map((k) => [k, totals[k] || 0])) }, null, 1) + '\n'); console.log('baseline lowered'); }
else if (down.length) console.log('lower the baseline (--write):', down.join(', '));
console.log('AI-look ratchet ok');
