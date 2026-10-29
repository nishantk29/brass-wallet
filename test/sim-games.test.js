import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, levelOf, ranking } from '../public/js/table.js';
import * as R from '../public/js/rules.js';
import { lcg } from './kit/game-invariants.mjs';
import { setupTable, progress, noise, H } from './sim-util.mjs';

function play(n, seed, remote) {
  const rng = lcg(seed);
  const t = setupTable(n, rng, remote);
  let step = 0, rounds = 0, eras = 0;
  while (t.phase !== 'over') {
    assert.ok(++step < 5000, 'game must finish');
    if (t.phase === 'turns') for (let k = 0; k < 6; k++) { const [a, m] = noise(t, rng); reduce(t, a, m, rng, step); }
    const before = t.phase;
    const moves = progress(t, rng);
    let moved = false;
    for (const [a, m] of moves.sort(() => rng() - 0.5)) { if (reduce(t, a, m, rng, step).ok) { moved = true; break; } }
    assert.ok(moved, `dead end in ${before}`);
    if (before === 'endround') rounds++;
    if (before === 'scoring' && t.phase !== 'scoring') eras++;
    for (const s of t.seats) { // invariants every step
      assert.ok(Number.isInteger(s.money) && s.money >= 0, 'money never negative');
      assert.ok(s.space >= 0 && s.space <= 99); assert.ok(levelOf(s) >= -10 && levelOf(s) <= 30); assert.ok(s.spent >= 0);
    }
  }
  return { t, rounds, eras };
}
for (const n of [2, 3, 4]) {
  test(`sim: ${n}-player games run canal and rail eras to the end (${R.roundsFor(n)} rounds each)`, () => {
    for (let g = 0; g < 40; g++) {
      const { t, rounds, eras } = play(n, 1000 + g * 31 + n, g % n);
      assert.equal(rounds, 2 * R.roundsFor(n)); assert.equal(eras, 2);
      assert.equal(t.final.length, n); assert.deepEqual(t.final, ranking(t));
      assert.ok(t.log.length > 10);
    }
  });
}
test('sim: income paid in rail last round is zero (money unchanged by the final collect)', () => {
  const rng = lcg(7); const t = setupTable(2, rng); reduce(t, H, { type: 'start' }, rng, 1);
  t.era = 'rail'; t.round = t.rounds; t.seats[0].space = 40; const m = t.seats[0].money;
  reduce(t, H, { type: 'endRound' }, rng, 2); reduce(t, H, { type: 'collect' }, rng, 3);
  assert.equal(t.seats[0].money, m);
});
