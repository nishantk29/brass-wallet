# Brass Wallet

Brass Wallet is a phone wallet for the board game Brass: Birmingham. It replaces the paper money and the income and score bookkeeping, while the board stays on the table. It tracks each player's money, spending this round, income, victory points and loans. At the end of each round it works out turn order and pays income, and at the end of each era it adds up the scoring. It is built for groups who play the physical game and want faster, error-free bookkeeping. On the engineering side, each table is one server-authoritative Durable Object. The game logic is a pure reducer that runs unchanged on the server and offline on the phone. Each socket receives its own projection of the table with the host key and seat tokens removed. The app installs as an offline PWA, and simulated full games test it against shared invariants.

It uses no Roxley art and copies no rules text. Numbers come from the Roxley rulebook v2018.11.

**Live:** https://brass.hatethespurs.com

<p>
  <img src="docs/screenshots/wallet-phone.png" width="260" alt="A player's wallet on a phone: balance, income and loan controls">
  <img src="docs/screenshots/scoring-phone.png" width="260" alt="End-of-era scoring on a phone">
</p>
<img src="docs/screenshots/host-desktop.png" width="720" alt="The host view on a desktop browser with every seat at the table">

## Features
- **One flow for every table.** The host starts a table with a four-letter room code and a QR code. Each seat is either on the host phone or on its own phone, so a table can be all pass-and-play, one wallet per phone, or a mix.
- **Fully offline pass-and-play.** With no room, the table runs on one phone and is saved in localStorage, so you can resume it later.
- **Round bookkeeping.** The app tracks money, spending this round, income level, VP, loans and the per-turn action count for 2 to 4 players. It computes the next turn order from spending and the income payout.
- **Era scoring helper.** Players type their link VP and tile VP from the board, and the app adds up the totals for the canal and rail eras.
- **Host fixes and undo.** The host can fix any seat or undo its last change. Every fix records who made it and when, and shows in that player's log and in the table log.
- **Seat takeover.** After a confirm, the host phone can take over the seat of a remote player who dropped.
- **Fast reconnect.** When a phone wakes, comes back online or restores the page from the back/forward cache, it reconnects at once rather than waiting out the retry backoff.
- **Changes apply once.** A tap that arrives twice, for example after a reconnect, changes the wallet only once.

## Stack
- **Language:** JavaScript (ES modules), with no build step for the client.
- **Server:** a Cloudflare Worker with Durable Objects (SQLite-backed, using the WebSocket Hibernation API), plus Workers Static Assets for the client.
- **Client:** vanilla JS, HTML and CSS with no framework. It includes a small built-in QR encoder and a line-icon set.
- **PWA:** a web app manifest and a service worker. Static files are cache-first, navigation is network-first with an app-shell fallback, and `/api` and `/ws` requests are never cached.
- **Fonts:** Bitter 700 and Rubik, self-hosted and subset with fontTools.
- **Tooling:** Wrangler 4, esbuild (only for the optional single-file build) and Node's built-in test runner. The e2e uses Playwright with Chromium.

## How it works
```
src/worker.js        Worker: POST /api/create, GET /api/room/:code, /ws/:code, then static assets; the Room Durable Object
public/js/table.js   pure reducer (reduce) and per-viewer projection (viewFor); no DOM, no network
public/js/room.js    socket identity (host key or seat token), handshake, who gets which view
public/js/rules.js   every number and default, pinned per table with RULES_VERSION
public/js/app.js     the client; runs table.js locally for pass-and-play, or talks to the Room
public/sw.js         generated service worker
```
- A table is one `Room` Durable Object, addressed by its room code. The Room validates each message, runs it through `reduce` and saves the result. Then it sends each open socket its own `viewFor` projection.
- Rooms expire 24 hours after their last change, through a Durable Object alarm.
- Messages carry an ID, so the reducer can ignore a change it has already applied.

## Run locally
Requires Node 22 or later, because Wrangler 4 needs it.
```sh
npm ci
npm run dev        # wrangler dev, serves http://localhost:8787
```

## Tests
```sh
npm test           # 54 tests across 9 files, all passing
```
`npm test` runs `scripts/test-gate.mjs` over `test/*.test.js` using `node --test`. It covers the rules and reducer, simulated 2-, 3- and 4-player games, a shared game-invariants kit, duplicate-message handling, reconnect, safe areas, font subsets, required files and a copy lint.

The browser e2e drives a host phone, two connected phones and one local seat through rounds and eras. It also covers reconnects, a host refresh, fixes, offline pass-and-play and layout overflow at three screen sizes. It needs `playwright-core` and a Chrome or Chromium binary:
```sh
npm i --no-save playwright-core
PW=$PWD/node_modules/playwright-core CHROME=/path/to/chrome npm run e2e
```
Without `BASE`, the e2e starts `wrangler dev` itself. Set `BASE=http://127.0.0.1:<port>` to run it against a server that is already running.

## Deploying
Run `npx wrangler deploy` with a Cloudflare account. It uploads the Worker, the Static Assets in `public/` and the `Room` Durable Object. Do not rename the `Room` class or edit the `v1` migration (`new_sqlite_classes: ["Room"]`). Existing tables live in that class's storage, so any change needs a new migration. After changing anything in `public/`, restamp the service worker version so phones pick up the new files. `npm run build` writes a single-file `dist-embedded/worker.js` with every asset inlined, for publishing through the Cloudflare API without uploading assets separately.

## Settings and known gaps
Their defaults live in `public/js/rules.js`.
1. `INCOME_TRACK`: the mapping from income spaces to levels is not in the rulebook text. The current mapping is a default and still needs checking against the board.
2. `SCORING_HELPER = true`: keep the end-of-era totals helper.
3. `ALLOW_SEAT_TAKEOVER = true`: let the host phone take over a dropped remote seat.

## Credits
- Brass: Birmingham is published by Roxley. This is an unofficial companion app. It uses no Roxley art and copies no rules text.
- Fonts: [Bitter](https://github.com/solmatas/BitterPro) and [Rubik](https://github.com/googlefonts/rubik), both under the SIL Open Font License 1.1 (`public/fonts/LICENSE-bitter.txt`, `public/fonts/LICENSE-rubik.txt`). See `scripts/fonts/README.md` for subsetting details.
