// Shared by the sims and the invariants adapter: build a table and pick a random legal move for it.
import { newTable, reduce, scoringComplete } from '../public/js/table.js';

export const H = { host: true };
export function setupTable(n, rng, remote = 0) {
  const t = newTable('SIMS', 'key');
  reduce(t, H, { type: 'addSeat', name: 'P1', isHost: true }, rng, 1);
  for (let i = 2; i <= n; i++) {
    if (i - 1 <= remote) reduce(t, { host: false }, { type: 'join', name: `P${i}` }, rng, 1);
    else reduce(t, H, { type: 'addSeat', name: `P${i}` }, rng, 1);
  }
  return t;
}
const actorFor = (t, s) => (s.where === 'remote' ? { host: false, seatId: s.id } : H);
const pickOf = (rng, a) => a[Math.floor(rng() * a.length)];

/** Candidate moves that move the game on from this state: [[actor, msg], ...]. */
export function progress(t, rng) {
  if (t.phase === 'setup') return [[H, { type: 'start' }]];
  if (t.phase === 'turns') {
    const open = t.seats.filter((s) => !s.done);
    const s = pickOf(rng, open);
    return [[actorFor(t, s), { type: 'endTurn', seat: s.id }]];
  }
  if (t.phase === 'endround') return [[H, { type: 'collect' }]];
  if (t.phase === 'scoring') return [...t.seats.map((s) => [H, { type: 'score', seat: s.id, links: Math.floor(rng() * 20), tiles: Math.floor(rng() * 25) }]), [H, { type: 'continue' }]];
  return [];
}
/** A random legal-or-not wallet move, to exercise the numbers during a sim. */
export function noise(t, rng) {
  const s = pickOf(rng, t.seats);
  const a = actorFor(t, s);
  const kind = Math.floor(rng() * 7);
  const msgs = [{ type: 'spend', seat: s.id, amount: 1 + Math.floor(rng() * 6), kind: 'other' }, { type: 'loan', seat: s.id }, { type: 'merchant', seat: s.id },
    { type: 'income', seat: s.id, spaces: Math.floor(rng() * 7) - 3 || 1 }, { type: 'vp', seat: s.id, n: Math.floor(rng() * 7) - 2 || 1 },
    { type: 'undo', seat: s.id }, { type: 'action', seat: s.id, n: Math.floor(rng() * 3) }];
  return [a, msgs[kind]];
}
export const finished = (t) => t.phase === 'over';
export { reduce, scoringComplete };
