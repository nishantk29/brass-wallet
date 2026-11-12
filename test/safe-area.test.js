// viewport-fit=cover: every page container pads left/right by the safe-area inset (WebKit review item 1, SPACING.md 3).
import test from 'node:test'; import assert from 'node:assert/strict';
import { audit, rules, sides, isContainer } from './kit/safe-area-gate.mjs';
const REQUIRED = ['.top', 'main', '.dock', '.sheet', '.bar', '.banner'];
test('every page container pads its left and right edges by the safe-area inset', () => {
  const { fails, checked } = audit(new URL('../public', import.meta.url).pathname, { required: REQUIRED });
  assert.deepEqual(fails, []); assert.ok(checked.length >= REQUIRED.length, checked.join('\n'));
});
test('the gate catches a container without the inset (liveness)', () => {
  const [r] = rules('.x{position:fixed;left:0;right:0;padding:0 16px}');
  assert.ok(isContainer(r)); const s = sides(r.d); assert.equal(s.l, '16px');
  const [ok] = rules('.y{max-width:560px;margin:0 auto;padding:0 var(--pad-r) 0 var(--pad-l)}');
  assert.ok(isContainer(ok)); assert.match(sides(ok.d).l, /--pad-l/);
});
