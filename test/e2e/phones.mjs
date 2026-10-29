// @ts-check
// Shared multi-phone browser harness for the Game Night games (tech review, Oct 28 2026). Replaces the one-off
// puppeteer/playwright scripts in code-team/redesign/run/tools/ with one tested set of helpers.
// Copy to test/e2e/phones.mjs in each game; the game's test/e2e/multi-phone.e2e.mjs drives it with a small adapter.
//
//   BASE=https://...  node test/e2e/multi-phone.e2e.mjs   # against a deployed site (read-only smoke; closes its rooms)
//   node test/e2e/multi-phone.e2e.mjs                     # starts `wrangler dev` from this repo on a free port, stops it after
//
// Chromium only (system Chrome). The box has no WebKit runtime libraries. Browser tests stay out of the deploy gate
// (node --test); run them before opening a PR that touches the client or the Worker.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const PW = process.env.PW || '/workspace/forge/pw/node_modules/playwright-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

/** Phone and desktop profiles used across the family (390 is the review size). */
export const DEVICES = {
  p390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  p375: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  d1280: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

/** Pass/fail ledger. `done()` prints every line and exits 1 on any failure. @param {string} title */
export function ledger(title) {
  /** @type {{ ok: boolean, label: string, info: string }[]} */
  const rows = [];
  const t0 = Date.now();
  return {
    rows,
    /** @param {string} label @param {boolean} ok @param {unknown} [info] */
    check(label, ok, info = '') { rows.push({ ok: !!ok, label, info: info === '' ? '' : typeof info === 'string' ? info : JSON.stringify(info) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${info === '' ? '' : ` (${rows.at(-1)?.info})`}`); return !!ok; },
    done() {
      const fail = rows.filter((r) => !r.ok).length;
      console.log(`\n${title}: ${rows.length - fail} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      process.exitCode = fail || !rows.length ? 1 : 0;
      return { pass: rows.length - fail, fail };
    },
  };
}

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => res(typeof a === 'object' && a ? a.port : 0)); }); s.on('error', rej); });

/**
 * Starts `wrangler dev` (real workerd, local Durable Objects) for the repo at `dir`, unless BASE is set.
 * @param {string} dir repo root
 * @returns {Promise<{ base: string, stop: () => void, local: boolean }>}
 */
export async function server(dir) {
  if (process.env.BASE) return { base: process.env.BASE.replace(/\/$/, ''), stop: () => {}, local: false };
  const bin = join(dir, 'node_modules/.bin/wrangler');
  if (!existsSync(bin)) throw new Error(`no ${bin}: run npm install (or set BASE=...)`);
  const port = await freePort();
  const p = spawn(bin, ['dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', join(dir, '.wrangler/e2e-state')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  let log = '';
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('wrangler dev did not start in 60 s\n' + log)), 60000);
    const on = (/** @type {Buffer} */ b) => { log += b; if (/Ready on/.test(log)) { clearTimeout(to); res(undefined); } };
    p.stdout.on('data', on); p.stderr.on('data', on); p.on('exit', (c) => { clearTimeout(to); rej(new Error(`wrangler dev exited ${c}\n${log}`)); });
  });
  return { base: `http://127.0.0.1:${port}`, stop: () => { p.kill('SIGTERM'); }, local: true };
}

/** @param {{ headless?: boolean }} [o] */
export async function launch(o = {}) {
  const { chromium } = await import(`${PW}/index.mjs`);
  return chromium.launch({ executablePath: CHROME, headless: o.headless ?? true, args: ['--no-sandbox'] });
}

/**
 * One phone = one browser context (own storage, own socket). Collects console errors and page errors, and lets a test
 * drop the room socket, keep the room unreachable, and bring it back (Playwright routeWebSocket).
 * @param {any} browser
 * @param {string} base
 * @param {string} name
 * @param {keyof typeof DEVICES} [device]
 */
export async function phone(browser, base, name, device = 'p390') {
  const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (/** @type {Error} */ e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (/** @type {any} */ m) => { if (m.type() === 'error' && !/vibrate|favicon/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  let mode = 'pass'; const live = new Set();
  await page.routeWebSocket(/\/ws\//, (/** @type {any} */ ws) => { if (mode === 'down') { ws.close({ code: 4000, reason: 'e2e: room unreachable' }); return; } ws.connectToServer(); live.add(ws); });
  const P = {
    name, ctx, page, errors, base,
    /** @param {string} path */
    goto: (path) => page.goto(base + path, { waitUntil: 'domcontentloaded' }),
    /** Network gone: the open socket drops and new ones fail until up(). */
    async down() { mode = 'down'; for (const w of live) await w.close({ code: 4001, reason: 'e2e: drop' }); live.clear(); },
    up() { mode = 'pass'; },
    /** Fires what the browser fires when a phone comes back. @param {'online' | 'visible'} kind */
    wake: (kind = 'online') => page.evaluate((/** @type {string} */ k) => {
      if (k === 'online') window.dispatchEvent(new Event('online'));
      else { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }
    }, kind),
    overflow: () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    text: () => page.evaluate(() => (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ').trim()),
    /** @param {string} dir @param {string} file */
    async shot(dir, file) { mkdirSync(dir, { recursive: true }); await page.screenshot({ path: join(dir, `${file}.png`), animations: 'disabled' }); },
    close: () => ctx.close(),
  };
  return P;
}

/**
 * Drops a phone's socket, keeps the room unreachable for `downMs`, then brings it back and fires a wake event.
 * Returns ms from the wake event until the reconnecting banner is gone (or -1 on timeout).
 * @param {Awaited<ReturnType<typeof phone>>} p @param {string} bannerSel
 * @param {{ downMs?: number, kind?: 'online' | 'visible', timeoutMs?: number }} [o]
 */
export async function dropAndWake(p, bannerSel, o = {}) {
  await p.down();
  await p.page.locator(bannerSel).first().waitFor({ state: 'visible', timeout: 5000 });
  await p.page.waitForTimeout(o.downMs ?? 12000);
  p.up(); const t0 = Date.now(); await p.wake(o.kind ?? 'online');
  try { await p.page.locator(bannerSel).first().waitFor({ state: 'detached', timeout: o.timeoutMs ?? 12000 }); return Date.now() - t0; } catch { return -1; }
}

/** Common per-phone checks: no console or page errors, no sideways scroll. @param {ReturnType<typeof ledger>} L @param {Awaited<ReturnType<typeof phone>>[]} phones @param {string} when */
export async function checkPhones(L, phones, when) {
  for (const p of phones) {
    L.check(`${when}: ${p.name} has no sideways scroll`, !(await p.overflow()));
  }
  const errs = phones.flatMap((p) => p.errors);
  L.check(`${when}: no console or page errors on ${phones.length} phones`, errs.length === 0, errs.slice(0, 3).join(' | '));
}
