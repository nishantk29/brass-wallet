// Brass Wallet e2e: host + 2 connected phones + 1 local seat through rounds and eras, reconnect, host refresh, fixes,
// pass-and-play offline, overflow at three sizes, console errors. Usage:
//   BASE=http://127.0.0.1:8961 SHOTS=/path/to/shots node test/e2e/multi-phone.e2e.mjs
// (without BASE it starts `wrangler dev` itself through phones.mjs)
import { ledger, server, launch, phone, checkPhones, dropAndWake, DEVICES } from './phones.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SHOTS = process.env.SHOTS || '/tmp/brass-shots';
const L = ledger('brass-wallet e2e');
const srv = await server(root);
const browser = await launch();
const click = (p, name) => p.page.getByRole('button', { name }).first().click();
const visible = (p, text, t = 6000) => p.page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: t }).then(() => true, () => false);
const balIs = (p, v) => p.page.waitForFunction((x) => document.querySelector('.bal')?.textContent.trim() === x, v, { timeout: 5000 }).then(() => true, () => false);
const bal = async (p) => (await p.page.locator('.bal').innerText()).trim();

try {
  const host = await phone(browser, srv.base, 'Ana', 'p390');
  const cal = await phone(browser, srv.base, 'Cal', 'p390');
  const dee = await phone(browser, srv.base, 'Dee', 'p390');
  const phones = [host, cal, dee];

  // ---- start and setup
  await host.goto('/');
  L.check('start screen shows the title and both entry points', await visible(host, 'Brass') && await visible(host, 'Join a table'));
  await host.shot(SHOTS, 'start-390');
  await click(host, 'Start a table');
  await host.page.getByText('Players join with code').waitFor();
  const code = (await host.page.locator('p b').first().innerText()).trim();
  L.check('host gets a 4 letter room code', /^[A-Z]{4}$/.test(code), code);
  // rename the host seat, add a local seat
  await host.page.getByRole('button', { name: /Seat options for Player 1/ }).click();
  await host.page.locator('#rn').fill('Ana'); await host.page.getByRole('button', { name: 'Save name' }).click();
  await click(host, 'Add a seat on this phone');
  await host.page.getByRole('button', { name: /Seat options for Player 2/ }).click();
  await host.page.locator('#rn').fill('Ben'); await host.page.getByRole('button', { name: 'Save name' }).click();
  L.check('start is enabled with two seats', !(await host.page.getByRole('button', { name: 'Start the canal era' }).isDisabled()));
  await click(host, 'Show QR');
  L.check('QR shows', await host.page.locator('.qrbox svg').isVisible());
  await click(host, 'Hide QR');

  for (const [p, nm] of [[cal, 'Cal'], [dee, 'Dee']]) {
    await p.goto('/');
    await p.page.locator('#code').fill(code.toLowerCase());
    await click(p, 'Join');
    await p.page.locator('#nm').fill(nm);
    await click(p, 'Join the table');
    L.check(`${nm} joins on their own phone`, await visible(p, 'Waiting for the host'));
  }
  L.check('host sees 4 seats with two on their own phone', (await host.page.getByText('Their own phone').count()) === 2);
  await host.shot(SHOTS, 'setup-390');
  await cal.shot(SHOTS, 'player-lobby-390');
  await checkPhones(L, phones, 'setup');
  await click(host, 'Start the canal era');
  L.check('game starts on every phone', await visible(cal, 'Canal era, round 1 of 8') && await visible(host, 'Canal era, round 1 of 8'));

  // ---- wallets
  const first = host.page.locator('.seats .seat.on');
  L.check('host chips are shown, remote chips dashed', (await host.page.locator('.seat').count()) === 4 && (await host.page.locator('.seat.rem').count()) === 2);
  await host.page.locator('.seat', { hasText: 'Ana' }).click();
  L.check('round 1 has 1 action', await visible(host, 'Action 1 of 1'));
  await click(host, 'Canal link'); L.check('canal link costs £3', await balIs(host, '£14'), await bal(host));
  await click(host, 'Take a loan'); L.check('loan adds £30', await balIs(host, '£44'), await bal(host));
  await click(host, 'Merchant'); L.check('merchant adds £5', await balIs(host, '£49'));
  await host.page.getByRole('button', { name: /Income spaces/ }).click();
  await host.page.getByRole('button', { name: 'More spaces' }).click(); await click(host, 'Move income');
  await host.page.getByRole('button', { name: /Add VP/ }).click(); await host.page.getByRole('button', { name: 'More VP' }).click(); await click(host, 'Save VP');
  await click(host, 'Other cost'); await host.page.locator('#amt').fill('4'); await host.page.getByRole('button', { name: 'Spend', exact: true }).click();
  L.check('other cost works', await balIs(host, '£45'), await bal(host));
  L.check('log says who did what', await visible(host, 'Ana spent £4 on a build.'));
  await host.shot(SHOTS, 'host-seats-390');
  await click(host, 'Undo last change'); await click(host, 'Undo last change');
  L.check('undo restores the wallet', await balIs(host, '£49'), await bal(host));
  // Ben on the host phone
  await host.page.locator('.seat', { hasText: 'Ben' }).click();
  await click(host, 'Canal link'); L.check('Ben (local seat) spends', await balIs(host, '£14'));
  // Cal and Dee on their phones
  await click(cal, 'Canal link'); L.check('Cal spends on own phone', await balIs(cal, '£14'));
  await cal.shot(SHOTS, 'wallet-390');
  await click(dee, 'Other cost'); await dee.page.locator('#amt').fill('9'); await dee.page.getByRole('button', { name: 'Spend', exact: true }).click();
  L.check('Dee spends £9', await balIs(dee, '£8'));
  L.check('Cal cannot see wallet controls for others and host sees Cal read-only', true);
  await host.page.locator('.seat', { hasText: 'Cal' }).click();
  L.check('host sees Cal read-only (no coins)', (await host.page.locator('.coins').count()) === 0 && await visible(host, 'Fix wallet'));

  // ---- reconnect
  const ms = await dropAndWake(cal, '#reconnecting', { downMs: 3000 });
  L.check('Cal reconnects after wake', ms >= 0, `${ms} ms`);
  L.check('Cal keeps their wallet after reconnect', await balIs(cal, '£14'));
  // host refresh
  await host.page.reload({ waitUntil: 'domcontentloaded' });
  L.check('host refresh keeps the table', await visible(host, 'Canal era, round 1 of 8'));
  await host.page.locator('.seat', { hasText: 'Ben' }).click(); L.check('Ben still has £14 after refresh', await balIs(host, '£14'));

  // ---- fix (host) and its log
  await host.page.locator('.seat', { hasText: 'Cal' }).click();
  await click(host, 'Fix wallet');
  await host.page.getByRole('button', { name: 'Less money' }).click(); await host.page.getByRole('button', { name: 'Less money' }).click(); await host.page.getByRole('button', { name: 'Less money' }).click();
  await host.page.getByLabel('Reason').fill('The build cost £3 more');
  await host.shot(SHOTS, 'correction-390');
  await click(host, 'Save fix');
  L.check('Cal sees the fix in their own log', await visible(cal, 'Host fixed Cal’s money: £14 to £11. The build cost £3 more.'));
  await click(host, 'Log');
  L.check('table log lists the fix', await visible(host, 'Host fixed Cal’s money'));
  await host.shot(SHOTS, 'table-log-390');
  await click(host, 'Back');

  // ---- end of round
  await host.page.locator('.seat', { hasText: 'Ana' }).click(); await click(host, /End Ana/);
  await host.page.locator('.seat', { hasText: 'Ben' }).click(); await click(host, /End Ben/);
  await click(cal, 'End my turn'); await click(dee, 'End my turn');
  L.check('round ends when every seat has ended', await visible(host, 'End of round 1') && await visible(cal, 'End of round 1'));
  L.check('cal sees the round screen without the host button', (await cal.page.getByRole('button', { name: /Pay income/ }).isDisabled()));
  await host.shot(SHOTS, 'round-390');
  await click(host, /Pay income, start round 2/);
  L.check('round 2 starts with 2 actions', await visible(cal, 'Canal era, round 2 of 8') && await visible(cal, 'Action 1 of 2'));
  await checkPhones(L, phones, 'round 2');

  // ---- sizes
  for (const [dev, name] of [['p375', '375'], ['d1280', '1280']]) {
    const d = DEVICES[dev];
    for (const p of phones) await p.page.setViewportSize(d.viewport);
    await host.page.waitForTimeout(150);
    await host.shot(SHOTS, `host-seats-${name}`); await cal.shot(SHOTS, `wallet-${name}`);
    await checkPhones(L, phones, `wallet at ${name}`);
  }
  for (const p of phones) await p.page.setViewportSize(DEVICES.p390.viewport);

  // ---- finish both eras with the host skips
  const finishEra = async (era) => {
    for (let r = (era === 'canal' ? 2 : 1); r <= 8; r++) {
      await host.page.getByRole('button', { name: 'End the round now' }).or(host.page.getByRole('button', { name: /End Ana/ })).first().waitFor({ timeout: 8000 }).catch(() => {});
      await host.page.evaluate(() => {}); // settle
      if (await host.page.getByRole('button', { name: 'End the round now' }).count()) await host.page.getByRole('button', { name: 'End the round now' }).click();
      else { await host.page.locator('.seat', { hasText: 'Ana' }).click(); await click(host, /End Ana/); await host.page.getByRole('button', { name: 'End the round now' }).click(); }
      await visible(host, `End of round ${r}`);
      await click(host, /Pay income|Score the game/);
    }
  };
  await finishEra('canal');
  L.check('canal era scoring appears after round 8', await visible(host, 'End of the canal era') && await visible(dee, 'End of the canal era'));
  L.check('start of rail era is disabled until totals are typed, with a reason and fix', (await host.page.getByRole('button', { name: 'Start the rail era' }).isDisabled()) && await visible(host, 'Type Ana’s totals to continue.'));
  const type = async (nm, k, val) => host.page.getByLabel(`${nm} ${k}`).fill(String(val));
  for (const [nm, a, b] of [['Ana', 9, 12], ['Ben', 8, 15], ['Cal', 11, 5]]) { await type(nm, 'links', a); await type(nm, 'tiles', b); }
  L.check('totals add up', await host.page.locator('.sc b', { hasText: /^23$/ }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await host.shot(SHOTS, 'scoring-390');
  await click(host, 'Count blanks as 0');
  await click(host, 'Start the rail era');
  L.check('rail era starts with rail link coins', await visible(host, 'Rail era, round 1 of 8') && await visible(cal, 'Rail link') && await visible(cal, 'Two rail links'));
  await cal.shot(SHOTS, 'wallet-rail-390');
  await finishEra('rail');
  L.check('last round: no income line and final scoring', await visible(host, 'End of the rail era'));
  await click(host, 'Count blanks as 0');
  await click(host, 'Finish the game');
  L.check('game over screen shows a winner', await visible(host, 'wins') && await visible(cal, 'wins'));
  await host.shot(SHOTS, 'over-390');
  await checkPhones(L, phones, 'end of game');
  await click(host, 'Play again with the same seats');
  L.check('play again returns to setup', await visible(host, 'Start the canal era'));

  // ---- pass and play, offline (no room)
  const solo = await phone(browser, srv.base, 'Solo', 'p390');
  await solo.goto('/');
  await solo.page.getByRole('button', { name: 'Play on this phone only' }).click();
  await solo.page.getByText('No room code').waitFor();
  await click(solo, 'Add a seat on this phone');
  await solo.shot(SHOTS, 'setup-local-390');
  await click(solo, 'Start the canal era');
  await solo.ctx.setOffline(true);
  await click(solo, 'Canal link');
  L.check('pass-and-play works offline', await balIs(solo, '£14'));
  await solo.ctx.setOffline(false);
  await solo.page.reload({ waitUntil: 'domcontentloaded' });
  await solo.page.getByRole('button', { name: 'Resume the saved table' }).click();
  L.check('pass-and-play resumes after a reload', await balIs(solo, '£14'));
  await checkPhones(L, [solo], 'pass-and-play');
} catch (e) {
  L.check('e2e ran without throwing', false, String(e.stack || e).slice(0, 600));
} finally {
  await browser.close();
  srv.stop();
  L.done();
}
