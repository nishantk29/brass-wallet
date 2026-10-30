// Token gate baseline (test/token-baseline.json). Usage:
//   node scripts/token-baseline.mjs           print counts and what changed against the baseline
//   node scripts/token-baseline.mjs --write   lower the baseline to today's values (refuses if anything is new)
//   node scripts/token-baseline.mjs --init    write the first baseline (only when none exists)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tokenAudit, ratchet, toBaseline, siteFiles } from '../test/kit/token-gate.mjs';
const PUB = fileURLToPath(new URL('../public/', import.meta.url));
const FILE = fileURLToPath(new URL('../test/token-baseline.json', import.meta.url));
const audit = tokenAudit(siteFiles(PUB)); const arg = process.argv[2];
const save = () => writeFileSync(FILE, JSON.stringify(toBaseline(audit), null, 1) + '\n');
if (arg === '--init') { if (existsSync(FILE)) { console.error('baseline exists; use --write'); process.exit(1); } save(); console.log('baseline written', audit.counts); process.exit(0); }
const base = JSON.parse(readFileSync(FILE, 'utf8')); const { fails, stale } = ratchet(audit, base);
console.log('now     ', JSON.stringify(audit.counts)); console.log('baseline', JSON.stringify(base.counts));
if (fails.length) console.log('NEW (fails the gate):\n ' + fails.join('\n '));
if (stale.length) console.log(`fixed since the baseline: ${stale.length}`);
if (arg === '--write') { if (fails.length) { console.error('refused: new raw values; use tokens instead'); process.exit(1); } save(); console.log('baseline lowered'); }
