// Brass Wallet e2e: a spend is charged once even when it reaches the table twice.
// Cal double-taps a cost chip; Dee's phone sends every message twice (a flaky link); a pass-and-play double tap too.
// Usage: node test/e2e/once-per-tap.e2e.mjs (starts `wrangler dev` itself through phones.mjs, or BASE=...)
import { ledger, server, launch, phone } from './phones.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const L = ledger('brass-wallet once-per-tap e2e');
const srv = await server(root);
const browser = await launch();
const click = (p, name) => p.page.getByRole('button', { name }).first().click();
const visible = (p, text, t = 8000) => p.page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: t }).then(() => true, () => false);
const balIs = (p, v) => p.page.waitForFunction((x) => document.querySelector('.bal')?.textContent.trim() === x, v, { timeout: 6000 }).then(() => true, () => false);
const bal = async (p) => (await p.page.locator('.bal').innerText()).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const host = await phone(browser, srv.base, 'Ana', 'p390');
  const cal = await phone(browser, srv.base, 'Cal', 'p390');
  const dee = await phone(browser, srv.base, 'Dee', 'p390');
  // Dee's phone sends every socket message twice.
  await dee.ctx.addInitScript(() => { const s = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { s.call(this, d); s.call(this, d); }; });

  await host.goto('/');
  await click(host, 'Start a table');
  await host.page.getByText('Players join with code').waitFor();
  const code = (await host.page.locator('p b').first().innerText()).trim();
  for (const [p, nm] of [[cal, 'Cal'], [dee, 'Dee']]) {
    await p.goto('/');
    await p.page.locator('#code').fill(code.toLowerCase());
    await click(p, 'Join');
    await p.page.locator('#nm').fill(nm);
    await click(p, 'Join the table');
    L.check(`${nm} joins`, await visible(p, 'Waiting for the host'));
  }
  await sleep(1000);
  L.check('a join that reaches the table twice makes one seat', (await host.page.getByText('Their own phone').count()) === 2, String(await host.page.getByText('Their own phone').count()));
  await click(host, 'Start the canal era');
  L.check('game starts (3 players: 9 rounds)', await visible(cal, 'Canal era, round 1 of 9') && await visible(dee, 'Canal era, round 1 of 9'));

  await cal.page.getByRole('button', { name: 'Canal link' }).first().dblclick();
  await sleep(800);
  L.check('a double tap on Canal link charges £3 once', await balIs(cal, '£14'), await bal(cal));
  await click(cal, 'Canal link');
  L.check('a second tap after a pause charges again', await balIs(cal, '£11'), await bal(cal));
  await host.page.locator('.seat', { hasText: 'Cal' }).click();
  L.check('host sees the same balance for Cal', await balIs(host, '£11'), await bal(host));

  await click(dee, 'Canal link'); await sleep(800);
  L.check('a spend that reaches the table twice is charged once', await balIs(dee, '£14'), await bal(dee));
  await click(dee, 'Take a loan'); await sleep(800);
  L.check('a loan that reaches the table twice adds £30 once', await balIs(dee, '£44'), await bal(dee));
  await click(dee, 'Undo last change'); await sleep(800);
  L.check('an undo that reaches the table twice undoes one change', await balIs(dee, '£14'), await bal(dee));

  // pass-and-play
  const solo = await phone(browser, srv.base, 'Solo', 'p390');
  await solo.goto('/');
  await solo.page.getByRole('button', { name: 'Play on this phone only' }).click();
  await solo.page.getByText('No room code').waitFor();
  await click(solo, 'Add a seat on this phone');
  await click(solo, 'Start the canal era');
  await solo.page.getByRole('button', { name: 'Canal link' }).first().dblclick(); await sleep(300);
  L.check('pass and play: a double tap charges once', await balIs(solo, '£14'), await bal(solo));

  const errs = [host, cal, dee, solo].flatMap((p) => p.errors);
  L.check('no console or page errors', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close();
  srv.stop();
  L.done();
}
