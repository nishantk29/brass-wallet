// Token gate (glass kit, Nishant 2026-10-30 8:43 AM ET). kit/token-gate.mjs is a copy of
// /workspace/code-team/shared/gate/token-gate.mjs. It lists every raw (non-token) font-size, line-height, spacing, radius,
// icon size and colour in public/ CSS and inline styles. Ratchet: token-baseline.json holds today's raw values; anything new,
// or a higher count, fails. After a fix, lower the baseline with `node scripts/token-baseline.mjs --write`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tokenAudit, ratchet, classify, siteFiles, CATEGORIES } from './kit/token-gate.mjs';

const PUB = fileURLToPath(new URL('../public/', import.meta.url));
const BASE = JSON.parse(readFileSync(new URL('./token-baseline.json', import.meta.url), 'utf8'));

test('token gate: no new raw font-size, line-height, spacing, radius, icon size or colour (ratchet)', () => {
  const audit = tokenAudit(siteFiles(PUB));
  const { fails, stale } = ratchet(audit, BASE);
  if (stale.length) console.log(`token gate: ${stale.length} baseline entries are fixed; lower the baseline: node scripts/token-baseline.mjs --write`);
  assert.deepEqual(fails, [], `Use a family token (var(--f-...)) instead:\n${fails.join('\n')}`);
});
test('token gate: the baseline only names known categories', () => {
  assert.deepEqual(Object.keys(BASE.counts).sort(), [...CATEGORIES].sort());
  assert.equal(typeof BASE.distinct?.lineHeight, 'number');
});
test('token gate is live (each category catches a raw value and passes a token)', () => {
  assert.deepEqual(classify('font-size', '13px'), ['fontSize']); assert.deepEqual(classify('font-size', 'var(--f-fs-sm)'), []);
  assert.deepEqual(classify('line-height', '1.3'), ['lineHeight']); assert.deepEqual(classify('line-height', 'var(--f-lh-body)'), []);
  assert.deepEqual(classify('padding', 'var(--f-s2) 14px'), ['spacing']); assert.deepEqual(classify('margin', '0 auto var(--f-s4)'), []);
  assert.deepEqual(classify('border-radius', '9px'), ['radius']); assert.deepEqual(classify('border-radius', 'var(--f-r-card)'), []);
  assert.deepEqual(classify('width', '22px', '.tool svg'), ['iconSize']); assert.deepEqual(classify('width', 'var(--f-ic-bar)', '.tool svg'), []);
  assert.deepEqual(classify('color', '#fff'), ['colour']); assert.deepEqual(classify('background', 'var(--f-surface)'), []);
  assert.deepEqual(classify('--x', '13px'), []); // token definitions are not counted
  const a = tokenAudit([['x.css', '.a{color:#fff;padding:3px}']]);
  assert.equal(ratchet(a, { counts: { fontSize: 0, lineHeight: 0, spacing: 0, radius: 0, iconSize: 0, colour: 0 }, entries: {} }).fails.length, 4);
});
test('token gate: distinct line-heights never grow (Scout target <= 10 per site)', () => {
  const a = tokenAudit(siteFiles(PUB));
  assert.ok(a.distinct.lineHeight.length <= Math.max(BASE.distinct.lineHeight, 10), a.distinct.lineHeight.join(' | '));
});
