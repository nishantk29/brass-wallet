# Brass Wallet

A wallet app for the physical game of Brass: Birmingham. It tracks money, spent this round, income, VP and loans, works out turn order and income at the end of each round, and adds up era scoring. There is no board, no map and no markets. It uses no Roxley art and copies no rules text. Numbers come from the Roxley rulebook v2018.11.

## How a table works
- One flow for every table: the host phone starts a table (room code and QR). Each seat is **on this phone** or **on its own phone**. All local is pass-and-play, all connected is one wallet per phone, mixed works too.
- Pass-and-play with no room works fully offline and is saved in localStorage ("Play on this phone only", "Resume the saved table").
- The host can fix any seat or undo its last change. Every fix names who and when, and shows in that player's log and the table log. A dropped remote player's seat can move to the host phone after a confirm.
- Room state lives in a Durable Object (`Room`), so the host can refresh or reconnect safely.

## Layout
- `public/js/rules.js`: every number and open-question default (one file).
- `public/js/table.js`: pure reducer and views. `public/js/room.js`: socket permissions. `src/worker.js`: Worker and `Room` DO.
- `public/js/app.js`: the client. `public/styles.css`: mockup tokens (soot, ink, brass, copper, ledger paper, rivets, milled coins; Bitter 700 and Rubik).
- `scripts/build-embedded.mjs` builds `dist-embedded/worker.js`.

## Commands
- `npm install`, then `npm run dev` for local development (wrangler).
- `npm test` runs the gate (`node scripts/test-gate.mjs`): unit tests, sims of 2/3/4-player games, the shared invariants kit, copy-lint.
- `BASE=http://127.0.0.1:<port> npm run e2e` runs the Playwright browser test against a running dev server (Chromium).
- After changing anything in `public/`, restamp the service worker with the shared `make-pwa.mjs public pwa/pwa.json`.

## Open questions (defaults live in `rules.js`)
1. `INCOME_TRACK`: the space to level mapping is not in the rulebook text. Default; confirm against the board.
2. `SCORING_HELPER = true`: keep the end-of-era totals helper.
3. `ALLOW_SEAT_TAKEOVER = true`: move a dropped remote seat to the host phone.
