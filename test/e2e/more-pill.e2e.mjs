// Brass Wallet e2e: the Menu pill at the top of a table screen's dock and the Menu sheet that grows out of it.
// Host and one player on their own phones. The pill is visible, at least 44px and above the dock button; it opens the
// sheet (rows per role), Table log goes to the log and Back returns, Show QR / Hide QR toggles inside the sheet,
// Escape and the scrim close it with focus back on the pill, a counted action is unchanged by open/close, and with
// reduced motion nothing moves. Motion on: the sheet grows out of the pill once and never replays on a re-render.
// Usage: node test/e2e/more-pill.e2e.mjs (starts `wrangler dev` itself through phones.mjs, or BASE=...)
//        node test/e2e/more-pill.e2e.mjs --shots <dir>   (or SHOTS=<dir>) also writes screenshots at 390 and 1280 wide
import { ledger, server, launch, phone } from './phones.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const arg = process.argv.indexOf('--shots');
const SHOTS = process.env.SHOTS || (arg > 0 ? process.argv[arg + 1] : '');
const L = ledger('brass-wallet more-pill e2e');
const srv = await server(root);
const browser = await launch();
const click = (p, name) => p.page.getByRole('button', { name }).first().click();
const visible = (p, text, t = 8000) => p.page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: t }).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isOpen = (page) => page.evaluate(() => { const d = document.querySelector('#app .menu-sh dialog.sheet'); return !!d && d.getClientRects().length > 0; });
const expanded = (page) => page.locator('.more-pill').getAttribute('aria-expanded');
const pillFocused = (page) => page.evaluate(() => !!document.activeElement?.classList.contains('more-pill'));
const rows = (page) => page.locator('.menu-sh .rows button').allInnerTexts().then((a) => a.map((t) => t.trim()));
const moving = (page) => page.evaluate(() => { const s = document.querySelector('#app .menu-sh .sheet'); return s ? s.getAnimations().filter((a) => a.effect.getKeyframes().some((k) => k.transform && k.transform !== 'none')).length : -1; });
const open = async (page) => { await page.locator('.more-pill').click(); await page.locator('.menu-sh dialog.sheet').waitFor({ state: 'visible', timeout: 4000 }); };
const shot = (p, file) => SHOTS ? p.shot(SHOTS, file) : null;

// The pill is visible, 44px or more, in the viewport, and ends above the dock's primary button (and the flash above it).
async function pillLayout(p, who, w, h) {
  const page = p.page;
  const box = await page.locator('.more-pill').boundingBox();
  L.check(`${who} ${w}: the pill is visible and says Menu`, (await page.locator('.more-pill').isVisible()) && (await page.locator('.more-pill').innerText()).trim() === 'Menu');
  L.check(`${who} ${w}: the pill is at least 44x44`, box.width >= 44 && box.height >= 44, `${box.width}x${box.height}`);
  L.check(`${who} ${w}: the pill is inside the viewport`, box.x >= 0 && box.x + box.width <= w && box.y >= 0 && box.y + box.height <= h);
  const btn = await page.locator('.dock .btn').first().boundingBox();
  if (btn) L.check(`${who} ${w}: the pill sits above the dock button without covering it`, box.y + box.height <= btn.y, `pill ends ${box.y + box.height}, button starts ${btn.y}`);
  const fl = await page.evaluate(() => {
    const f = document.createElement('p'); f.className = 'flash'; f.textContent = 'You’re offline. Reconnecting…';
    document.querySelector('#app').append(f); const r = f.getBoundingClientRect(); f.remove(); return { top: r.top, bottom: r.bottom };
  });
  L.check(`${who} ${w}: a flash message sits above the pill, not on it`, fl.bottom <= box.y, `flash ends ${fl.bottom}, pill starts ${box.y}`);
  L.check(`${who} ${w}: aria-haspopup=dialog, aria-expanded=false`, (await page.locator('.more-pill').getAttribute('aria-haspopup')) === 'dialog' && (await expanded(page)) === 'false');
}

try {
  const host = await phone(browser, srv.base, 'Ana', 'p390');
  const cal = await phone(browser, srv.base, 'Cal', 'p390');

  // ---- setup: host and a player on their own phone
  await host.goto('/');
  L.check('start screen has no pill', await visible(host, 'Join a table') && (await host.page.locator('.more-pill').count()) === 0);
  await click(host, 'Start a table');
  await host.page.getByText('Players join with code').waitFor();
  const code = (await host.page.locator('p b').first().innerText()).trim();
  L.check('setup: host sees the pill', await host.page.locator('.dock .more-pill').isVisible());
  await open(host.page);
  L.check('setup: host rows are Table log, Leave table (the QR toggle stays inline on setup)', JSON.stringify(await rows(host.page)) === '["Table log","Leave table"]', await rows(host.page));
  await host.page.keyboard.press('Escape');
  L.check('setup: Escape closes', !(await isOpen(host.page)));
  await click(host, 'Add a seat on this phone');
  await cal.goto('/');
  await cal.page.locator('#code').fill(code.toLowerCase());
  await click(cal, 'Join');
  L.check('join screen has no pill', (await cal.page.locator('.more-pill').count()) === 0);
  await cal.page.locator('#nm').fill('Cal');
  await click(cal, 'Join the table');
  L.check('player waiting in setup gets a dock with the pill', await visible(cal, 'Waiting for the host') && await cal.page.locator('.dock .more-pill').isVisible());
  await click(host, 'Start the canal era');
  L.check('game starts on both phones', await visible(cal, 'Canal era, round 1 of') && await visible(host, 'Canal era, round 1 of'));

  // ---- host wallet: pill, header, counted action
  await host.page.locator('.seat', { hasText: 'Player 1' }).click();
  await pillLayout(host, 'host', 390, 844);
  L.check('host header no longer has the Log link', (await host.page.locator('.bar [data-act="page"]').count()) === 0);
  await host.page.locator('.acts[data-act="action"]').click();
  await host.page.waitForFunction(() => /Actions done/.test(document.querySelector('.acts')?.textContent || ''), null, { timeout: 5000 });
  const state = () => host.page.evaluate(() => ({ bal: document.querySelector('.bal')?.textContent.trim(), acts: document.querySelector('.acts')?.textContent.trim(), log: document.querySelectorAll('.ledger .lg-row').length }));
  const before = await state();
  await shot(host, 'more-pill-host-closed-390');

  // ---- host opens the sheet (reduced motion: this harness forces it)
  await open(host.page);
  L.check('host: the Menu sheet opens (dialog, opaque, no glass)', await host.page.evaluate(() => {
    const d = document.querySelector('.menu-sh dialog.sheet'); const cs = getComputedStyle(d);
    const a = (c) => { const m = c.match(/[\d.]+/g); return c.startsWith('rgba') || / \/ /.test(c) ? Number(m.at(-1)) : 1; };
    return d.getAttribute('aria-label') === 'Menu' && cs.backdropFilter === 'none' && a(cs.backgroundColor) === 1 && getComputedStyle(document.querySelector('.more-pill')).backdropFilter === 'none';
  }));
  L.check('host: aria-expanded is true', (await expanded(host.page)) === 'true');
  L.check('host: focus moves into the sheet', await host.page.evaluate(() => !!document.activeElement?.closest('.menu-sh .sheet')));
  L.check('host: rows are Table log, Show QR, Leave table', JSON.stringify(await rows(host.page)) === '["Table log","Show QR","Leave table"]', await rows(host.page));
  L.check('host: every button in the sheet is at least 44px tall', (await host.page.locator('.menu-sh button').evaluateAll((b) => b.every((x) => x.getBoundingClientRect().height >= 44))));
  L.check('reduced motion: no transform animation, the sheet is in place', (await moving(host.page)) === 0 && (await host.page.evaluate(() => getComputedStyle(document.querySelector('.menu-sh .sheet')).transform)) === 'none');
  await shot(host, 'more-pill-host-open-390');

  // Show QR / Hide QR inside the sheet
  await host.page.locator('.menu-sh [data-act="qr"]').click();
  L.check('Show QR: the QR box and room code render in the sheet', await host.page.locator('.menu-sh .qrbox svg').isVisible() && (await host.page.locator('.menu-sh .sheet').innerText()).includes(code));
  L.check('Show QR: the sheet stays open, the row says Hide QR and keeps focus', (await isOpen(host.page)) && (await host.page.evaluate(() => document.activeElement?.dataset.act)) === 'qr' && (await rows(host.page))[1] === 'Hide QR');
  await shot(host, 'more-pill-host-qr-390');
  await host.page.locator('.menu-sh [data-act="qr"]').click();
  L.check('Hide QR: the QR box goes', (await host.page.locator('.menu-sh .qrbox').count()) === 0 && (await rows(host.page))[1] === 'Show QR');

  // Escape
  await host.page.keyboard.press('Escape');
  L.check('Escape: the sheet closes', !(await isOpen(host.page)));
  L.check('Escape: aria-expanded is false and focus is back on the pill', (await expanded(host.page)) === 'false' && (await pillFocused(host.page)));
  L.check('reduced motion: no shrinking copy on close', (await host.page.locator('.more-ghost').count()) === 0);
  L.check('wallet state (counted action, money, log) unchanged after open/close', JSON.stringify(await state()) === JSON.stringify(before), [before, await state()]);

  // Keyboard: Enter on the focused pill, then the scrim closes
  await host.page.keyboard.press('Enter');
  L.check('keyboard: Enter on the focused pill opens the sheet', await isOpen(host.page));
  await host.page.locator('.menu-sh .scrim').click({ position: { x: 20, y: 20 } });
  L.check('scrim tap: closes, focus back on the pill', !(await isOpen(host.page)) && (await pillFocused(host.page)));

  // Table log, then Back
  await open(host.page);
  await host.page.locator('.menu-sh [data-act="page"]').click();
  L.check('Table log: the log page shows and the sheet is gone', await visible(host, 'Every change, newest first') && !(await isOpen(host.page)));
  L.check('log page has no pill', (await host.page.locator('.more-pill').count()) === 0);
  await click(host, 'Back');
  L.check('Back: the wallet returns with the pill, sheet closed', await visible(host, 'Canal era, round 1 of') && (await host.page.locator('.more-pill').isVisible()) && (await expanded(host.page)) === 'false');
  L.check('wallet state unchanged after the log trip', JSON.stringify(await state()) === JSON.stringify(before));

  // ---- player phone
  await pillLayout(cal, 'player', 390, 844);
  await open(cal.page);
  L.check('player: rows are Table log, Leave table', JSON.stringify(await rows(cal.page)) === '["Table log","Leave table"]', await rows(cal.page));
  L.check('player: focus moves into the sheet', await cal.page.evaluate(() => !!document.activeElement?.closest('.menu-sh .sheet')));
  await shot(cal, 'more-pill-player-open-390');
  await cal.page.locator('.menu-sh [data-act="page"]').click();
  L.check('player: Table log shows the full log', await visible(cal, 'Every change, newest first'));
  await click(cal, 'Back');
  await open(cal.page);
  await cal.page.keyboard.press('Escape');
  L.check('player: Escape closes, focus on the pill', !(await isOpen(cal.page)) && (await pillFocused(cal.page)));

  // ---- motion on: a second host phone with the same credentials
  const hostState = await host.ctx.storageState();
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'no-preference', storageState: hostState });
  const mp = await mctx.newPage(); const merr = []; mp.on('pageerror', (e) => merr.push(String(e)));
  await mp.goto(`${srv.base}/?room=${code}`, { waitUntil: 'domcontentloaded' });
  await mp.locator('.more-pill').waitFor({ timeout: 8000 });
  await mp.locator('.more-pill').click();
  const anim = await mp.evaluate(() => {
    const s = document.querySelector('.menu-sh .sheet');
    return s.getAnimations().map((a) => ({ d: a.effect.getTiming().duration, props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))] }));
  });
  L.check('motion on: the sheet grows out of the pill (transform + opacity only, 400ms or less)', anim.length === 1 && anim[0].d <= 400 && anim[0].props.every((x) => x === 'transform' || x === 'opacity') && anim[0].props.includes('transform'), anim);
  await sleep(350);
  await cal.page.getByRole('button', { name: 'Canal link' }).click(); // a room update lands while the host's sheet is open
  await sleep(800);
  L.check('motion on: a room update re-renders with no replayed morph', (await moving(mp)) === 0 && (await isOpen(mp)));
  await mp.locator('.menu-sh [data-act="qr"]').click();
  L.check('motion on: Show QR re-renders with no replayed morph', (await moving(mp)) === 0 && (await mp.locator('.menu-sh .qrbox').count()) === 1);
  await mp.locator('.menu-sh [data-act="qr"]').click();
  await mp.keyboard.press('Escape');
  L.check('motion on: closing shrinks a copy back into the pill', (await mp.locator('.more-ghost').count()) === 1);
  await sleep(400);
  L.check('motion on: the copy is gone after the morph, focus on the pill', (await mp.locator('.more-ghost').count()) === 0 && (await mp.evaluate(() => !!document.activeElement?.classList.contains('more-pill'))));
  L.check('motion on: no page errors', merr.length === 0, merr.slice(0, 2).join(' | '));
  await mctx.close();

  // ---- 1280 wide
  await host.page.setViewportSize({ width: 1280, height: 800 });
  await cal.page.setViewportSize({ width: 1280, height: 800 });
  await sleep(200);
  await pillLayout(host, 'host', 1280, 800);
  await shot(host, 'more-pill-host-closed-1280');
  await open(host.page); await shot(host, 'more-pill-host-open-1280'); await host.page.keyboard.press('Escape');
  await open(cal.page); await shot(cal, 'more-pill-player-open-1280'); await cal.page.keyboard.press('Escape');
  await host.page.setViewportSize({ width: 390, height: 844 });

  // ---- Leave table (player): the start screen, and the code brings the same seat back
  await open(cal.page);
  await cal.page.locator('.menu-sh [data-act="leave"]').click();
  L.check('player Leave table: back on the start screen, no pill', await visible(cal, 'Join a table') && (await cal.page.locator('.more-pill').count()) === 0);
  await cal.goto(`/?room=${code}`);
  L.check('player: the code brings Cal back to the same seat', await visible(cal, 'Cal, '));

  const errs = [...host.errors, ...cal.errors];
  L.check('no console or page errors on either phone', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await browser.close(); srv.stop(); L.done();
}
