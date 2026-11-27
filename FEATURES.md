# Brass Wallet: feature map

Read this before a change, then open only the files listed for the feature.

## Test commands

| Command | What it runs | When |
|---|---|---|
| `npm run test:quick` | the test gate (`scripts/test-gate.mjs`, all `test/*.test.js`, a few seconds) | every change |
| `npm run check` | `scripts/guard.mjs`: repeat-mistake checks (names, paths, secrets, theme switch, root scripts) | every change |
| `npm run test:e2e` | multi-phone browser run (`test/e2e/multi-phone.e2e.mjs`, needs `npm run dev`) | UI changes |
| `npm run fuzz` | seeded full-game sims; `SIM_GAMES` and `SIM_SEED` raise and shift them | releases (CI on `v*` tags) |

## Features → files

| Feature (user's view) | Files | Tests |
|---|---|---|
| Start / join a table (4-letter code, QR) | `src/worker.js` (`/api/create`, `/api/room/:code`, `/ws/:code`), `public/js/qr.js`, `public/js/app.js` | `once-per-message.test.js` |
| Seat permissions over the socket, seat takeover | `public/js/room.js` | `game-invariants.test.js` |
| Round bookkeeping: money, spending, income, loans, turn order | `public/js/table.js` (reducer), `public/js/rules.js` (every number and default) | `rules.test.js`, `sim-games.test.js` |
| Era scoring (canal, rail) | `public/js/table.js`, `public/js/rules.js` | `sim-games.test.js` |
| Host fixes and undo, per-player log | `public/js/table.js` | `game-invariants.test.js` |
| Offline pass-and-play, resume | `public/js/app.js` (localStorage) | `e2e/home-sheet.e2e.mjs` |
| Changes apply once (duplicate taps) | `public/js/room.js`, `public/js/app.js` | `once-per-message.test.js`, `e2e/once-per-tap.e2e.mjs` |
| Menu pill | `public/js/more-pill.js` | `e2e/more-pill.e2e.mjs` |
| Screen stays awake | `public/js/wake.js` | `wake.test.js` |
| Install / offline (PWA), safe areas | `public/sw.js`, `public/pwa-install.js`, `pwa/pwa.json` | `files.test.js`, `safe-area.test.js` |
| Fonts | `public/fonts/`, `scripts/fonts/` | `font-subset.test.js` |
| Deploy file | `scripts/build-embedded.mjs`, `scripts/asset-server.mjs`, `wrangler.jsonc` | `asset-server.test.js` |
