# Brass Wallet: rules for working here
- All numbers and defaults live in `public/js/rules.js`. Never hard-code them elsewhere.
- Game logic is the pure reducer `public/js/table.js`; the same code runs offline (localStorage) and in the `Room` Durable Object. Keep it free of DOM and network.
- Do not change the `Room` class name or the migration (`v1`, `new_sqlite_classes: ["Room"]`). Rule changes must be pinned per table (`RULES_VERSION`).
- Copy: sentence case, plain, no em dashes; `npm test` runs copy-lint. Display font Bitter 700, UI Rubik. No Limelight.
- Targets 44px, body 16px, nothing under 13px; motion transform/opacity only, 400ms or less.
- Before finishing: `npm test`, then the e2e, then restamp the service worker (`make-pwa.mjs public pwa/pwa.json`).
- No deploys, no secrets.
