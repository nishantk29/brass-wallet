import { gameInvariantTests } from './kit/game-invariants.mjs';
import { reduce, viewFor, ranking } from '../public/js/table.js';
import { broadcastPlan } from '../public/js/room.js';
import { setupTable, progress, H } from './sim-util.mjs';

// Secrets in Brass Wallet are the rejoin tokens: nobody may ever see another seat's token or the host key.
const view = (t, viewerId) => {
  const seat = t.seats.find((s) => s.id === viewerId);
  const sockets = [{ ws: 'x', who: viewerId === 'host' ? 'host' : 'seat', seatId: viewerId }];
  if (viewerId !== 'host' && !seat) return null;
  return broadcastPlan(t, sockets)[0]?.msgs[0].view ?? null;
};
const adapter = {
  name: 'brass-wallet',
  cases: [{ n: 2, remote: 1 }, { n: 3, remote: 2 }, { n: 4, remote: 3 }, { n: 4, remote: 0 }, { n: 3, remote: 3 }],
  setup(c, rng) { const t = setupTable(c.n, rng, c.remote); return t; },
  apply(state, actor, msg, rng, now) { const r = reduce(state, actor, msg, rng, now); return { ok: !!r.ok, state }; },
  isOver: (t) => t.phase === 'over',
  progress,
  fallback(t) { return t.phase === 'turns' ? [H, { type: 'endRound' }] : t.phase === 'scoring' ? [H, { type: 'continue', fill: true }] : null; },
  probes(t) {
    const s = t.seats[0];
    return [{ type: 'spend', seat: s.id, amount: 1 }, { type: 'loan', seat: s.id }, { type: 'merchant', seat: s.id }, { type: 'income', seat: s.id, spaces: 2 }, { type: 'vp', seat: s.id, n: 3 },
      { type: 'endTurn', seat: s.id }, { type: 'endRound' }, { type: 'collect' }, { type: 'continue' }, { type: 'score', seat: s.id, links: 1, tiles: 1 }, { type: 'fix', seat: s.id, money: 1 },
      { type: 'toLocal', seat: s.id }, { type: 'start' }, { type: 'addSeat', name: 'Late' }].map((m) => [H, m]);
  },
  undo(t) { return [H, { type: 'undo', seat: t.seats[0].id }]; },
  fingerprint: (t) => JSON.stringify({ final: t.final, seats: t.seats.map((s) => [s.id, s.money, s.vp, s.space, s.where, s.token]), log: t.log.length, phase: t.phase }),
  viewers: (t) => ['host', ...t.seats.filter((s) => s.where === 'remote').map((s) => s.id)],
  view,
  secretsRevealed: () => false,
  secretHolders: (t) => t.seats.filter((s) => s.token).map((s) => s.id),
  withSecrets(t, mapping) { const c = structuredClone(t); for (const [to, from] of Object.entries(mapping)) c.seats.find((s) => s.id === to).token = t.seats.find((s) => s.id === from).token; c.hostKey = 'other'; return c; },
  knowledgeClass: () => 'token',
};
gameInvariantTests(adapter, { games: 60, maxSteps: 1500, leakViewers: 2 });
