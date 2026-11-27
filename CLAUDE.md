# CLAUDE.md

Brass Wallet: a shared money and score tracker for Brass, on Cloudflare Workers. Read `FEATURES.md` first: it maps each feature to its files and lists the test commands. Open only what the task needs.

## Default: verify first
- Start every run with a review pass: `npm run test:quick` and `npm run check`, then read the files `FEATURES.md` names for the task. Report what you found before you edit.
- Reproduce a bug with a failing test before fixing it.
- Keep generation scoped to the task: no drive-by refactors, no new dependencies, no new comments that explain a workaround (fix the cause instead).
- Done means `npm run test:quick` and `npm run check` pass, plus `npm run test:e2e` and 390 px / 1280 px screenshots when the UI changed. Paste the command output, not a summary.
- Every number and default lives in `public/js/rules.js`; the reducer is `public/js/table.js`. After a reducer change, also run `npm run fuzz`.

## Enforced in code, not here
`npm run check` (`scripts/guard.mjs`) fails on the owner's real name (use "Hate the Spurs"), internal helper names, machine-local paths, a visible light/dark switch (theme follows the system), a `.sh` file at the repo root, and likely secrets. Fix the cause; add to `guard.config.json` "allow" only for a real false positive.

## Never
- Push to main, merge, deploy, or change repo settings. Open a PR.
- Commit secrets, `.dev.vars` or local work folders.

When compacting, keep: the task and what done means, decisions and why, files touched, and the last test output.
