// Brass Wallet e2e: the home screen's games footer and modal sheets. Home: "All games" and the five games are links of
// 44px or more (Brass Wallet is named, not linked), the h1 reads "Brass Wallet" as two words, Join is 44px tall, nothing
// overflows at 390 or 1280. Sheets (Seat options, opened from the keyboard on a phone-only table, and the Menu pill):
// the screen behind is inert, focus moves into the sheet and Tab stays there, Escape closes and a second Escape does
// nothing, the scrim closes, and with reduced motion the sheet does not move.
// Usage: node test/e2e/home-sheet.e2e.mjs (starts `wrangler dev` itself through phones.mjs, or BASE=...)
import { ledger, server, launch, phone } from './phones.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const L = ledger('brass-wallet home + sheet e2e');
const srv = await server(root);
const browser = await launch();

const sheetState = (page) => page.evaluate(() => {
  const d = document.querySelector('#app dialog.sheet'), s = document.querySelector('#app .screen');
  return { open: !!d, inert: !!s?.inert, focusIn: !!d && d.contains(document.activeElement), focusBehind: !!s?.contains(document.activeElement), modal: d?.getAttribute('aria-modal') };
});

try {
  for (const dev of /** @type {const} */ (['p390', 'd1280'])) {
    const p = await phone(browser, srv.base, 'Ana', dev);
    const w = dev === 'p390' ? 390 : 1280;
    await p.goto('/');
    await p.page.getByText('Join a table').waitFor();
    const all = p.page.locator('.games a', { hasText: 'All games' });
    L.check(`${w}: All games links to the hub`, (await all.getAttribute('href')) === 'https://gamenight.hatethespurs.com');
    const names = (await p.page.locator('.games li').allInnerTexts()).map((t) => t.trim());
    L.check(`${w}: footer lists all five games`, JSON.stringify(names) === JSON.stringify(['Mafia Night', 'Quest Night', 'The Gilded Chamber', 'Brass Wallet', 'The Odd Card']), names);
    L.check(`${w}: Brass Wallet is the current page, not a link`, (await p.page.locator('.games [aria-current="page"]').innerText()).trim() === 'Brass Wallet' && (await p.page.locator('.games a', { hasText: 'Brass Wallet' }).count()) === 0);
    const small = await p.page.locator('.games a').evaluateAll((as) => as.filter((a) => { const r = a.getBoundingClientRect(); return r.height < 44; }).map((a) => a.textContent));
    L.check(`${w}: every footer link is at least 44px tall`, small.length === 0, small);
    await p.page.locator('.games').scrollIntoViewIfNeeded();
    L.check(`${w}: footer is visible`, await p.page.locator('.games').isVisible());
    L.check(`${w}: h1 reads as two words`, (await p.page.locator('h1').textContent()) === 'Brass Wallet');
    const join = await p.page.getByRole('button', { name: 'Join', exact: true }).boundingBox();
    L.check(`${w}: Join is at least 44px tall`, join.height >= 44, join.height);
    L.check(`${w}: no horizontal overflow`, !(await p.overflow()));
    if (dev === 'd1280') { L.check('no console or page errors (1280)', p.errors.length === 0, p.errors.slice(0, 3).join(' | ')); await p.close(); continue; }

    // ---- a sheet from the keyboard: phone-only table, Seat options
    await p.page.getByRole('button', { name: 'Play on this phone only' }).click();
    const opener = p.page.locator('[aria-label^="Seat options for"]').first();
    await opener.waitFor();
    await opener.focus(); await p.page.keyboard.press('Enter');
    await p.page.locator('dialog.sheet').waitFor();
    let s = await sheetState(p.page);
    L.check('sheet open: the screen behind is inert', s.inert, s);
    L.check('sheet open: aria-modal is true', s.modal === 'true');
    L.check('sheet open: focus moved into the sheet', s.focusIn && !s.focusBehind, s);
    let escaped = false;
    for (let i = 0; i < 12; i++) { await p.page.keyboard.press('Tab'); const t = await sheetState(p.page); if (t.focusBehind) escaped = true; }
    L.check('Tab never reaches the inert screen behind', !escaped);
    L.check('reduced motion: the sheet does not move', await p.page.evaluate(() => document.querySelector('#app .sheet').getAnimations().length === 0));
    await p.page.keyboard.press('Escape');
    s = await sheetState(p.page);
    L.check('Escape closes the sheet and the screen is live again', !s.open && !s.inert, s);
    await p.page.keyboard.press('Escape');
    L.check('a second Escape leaves the screen as it was', (await p.page.locator('[aria-label^="Seat options for"]').count()) > 0 && !(await sheetState(p.page)).open);
    await opener.click();
    await p.page.locator('dialog.sheet').waitFor();
    await p.page.locator('.scrim').click({ position: { x: 20, y: 20 } });
    s = await sheetState(p.page);
    L.check('the scrim closes the sheet', !s.open && !s.inert, s);

    // ---- the Menu pill's sheet is modal too
    await p.page.locator('.more-pill').click();
    await p.page.locator('.menu-sh dialog.sheet').waitFor();
    s = await sheetState(p.page);
    L.check('Menu sheet: screen inert and focus inside', s.inert && s.focusIn, s);
    await p.page.keyboard.press('Escape');
    L.check('Menu sheet: Escape closes, focus back on the pill', !(await sheetState(p.page)).open && await p.page.evaluate(() => !!document.activeElement?.classList.contains('more-pill')));
    L.check('no console or page errors (390)', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
    await p.close();
  }
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await browser.close(); srv.stop(); L.done();
}
