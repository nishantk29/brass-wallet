// game-invariants.mjs: shared game-rules test kit for the Game Night family (node:test, no dependencies, Node 20+).
// Source of truth: the shared invariants kit. Copy it UNCHANGED into a repo's test/kit/ and write a small
// adapter for that game in test/game-invariants.test.js. See README.md in the same folder.
//
// Four properties, each a node:test test, checked over seeded random games:
//   1. over is terminal: once a game is over, no in-game action changes the game (only the adapter's
//      `resetActions`, such as Restart or Play again, may leave the end screen).
//   2. no step can block: in every reachable state before the end, at least one progress action is accepted,
//      the host's fallback (skip) is accepted when the adapter names one, and every game ends within maxSteps.
//   3. no leaks (non-interference): a player's view must not change when the secrets that player may not know are
//      shuffled among the other players. The adapter says what a viewer may know through `knowledgeClass`.
//   4. no Undo after game over: Undo on the end screen is refused and changes nothing.
//
// Adapter contract (all functions receive the kit's seeded rng where randomness is needed):
//   name                          string, used in test names
//   cases                         array of case objects (table sizes, options); games rotate through them
//   setup(c, rng)                 -> state: a dealt game, ready to play
//   apply(state, actor, msg, rng, now) -> { ok, state }   must not mutate its input when ok is false.
//                                 Mutating reducers: clone inside the adapter (the kit also passes clones).
//   isOver(state)                 -> boolean
//   progress(state, rng)          -> [[actor, msg], ...] candidate moves that move the game on (may include refusals)
//   fallback(state)               -> [actor, msg] | null: the host's neutral skip for this step, if the game has one
//   probes(state, rng)            -> [[actor, msg], ...] in-game actions to try on the end screen (excluding undo)
//   undo(state)                   -> [actor, msg]: the Undo action (host)
//   fingerprint(state)            -> string/JSON of everything a finished game must keep (winner, roles, results...)
//   viewers(state)                -> [viewerId, ...]
//   view(state, viewerId)         -> the object sent to that viewer
//   secretsRevealed(state)        -> boolean: true when the rules reveal everything (game over), skips the leak check
//   secretHolders(state)          -> [playerId, ...] whose secret can be shuffled (empty when the app holds no secrets)
//   withSecrets(state, mapping)   -> clone of state where holder id's secret is replaced by mapping[id]'s secret
//   knowledgeClass(state, viewerId, otherId) -> string: two others with the same class may swap secrets without
//                                 the viewer being allowed to notice. Return null for "viewer knows exactly" (never swapped).
//   normalizeView(view)           -> optional; strip fields that legitimately vary (timestamps). Default identity.
// Options: games (300), maxSteps (3000), seed, fallbackEvery (1 = try the host skip at every state), leakViewers (2 random
//   viewers checked per state; Infinity = all), todo { property: 'pointer to the fix' } for known bugs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

export const NOW = 1_800_000_000_000;
export function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
export const pick = (rng, a) => a[Math.floor(rng() * a.length)];
export function shuffled(rng, a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const clone = (x) => structuredClone(x);
const stable = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

function tryMove(A, state, move, rng, now) {
  const [actor, msg] = move;
  const res = A.apply(clone(state), actor, msg, rng, now);
  return res && res.ok ? res.state : null;
}

// Plays one seeded game with progress moves only; calls onState(state, step) before each move and onOver at the end.
function playOne(A, index, opts, hooks) {
  const rng = lcg((opts.seed + index * 7919) >>> 0);
  const c = A.cases[index % A.cases.length];
  let state = A.setup(c, rng);
  const tag = `${A.name} game ${index} (seed ${opts.seed}, case ${index % A.cases.length}: ${JSON.stringify(c).slice(0, 80)})`;
  for (let step = 0; step <= opts.maxSteps; step++) {
    if (A.isOver(state)) { hooks.onOver?.(state, tag, rng); return; }
    if (step === opts.maxSteps) { hooks.problem(`${tag}: no finish in ${opts.maxSteps} steps`); return; }
    hooks.onState?.(state, tag, step, rng);
    const moves = shuffled(rng, A.progress(state, rng) || []);
    let next = null;
    for (const m of moves) { next = tryMove(A, state, m, rng, NOW + step); if (next) break; }
    if (!next) {
      const fb = A.fallback?.(state);
      next = fb ? tryMove(A, state, fb, rng, NOW + step) : null;
      if (!next) { hooks.problem(`${tag} step ${step}: dead end, no progress move accepted (phase ${state.phase ?? '?'})`); return; }
    }
    state = next;
  }
}

/**
 * Registers the four invariant tests for one game.
 * @param {object} A adapter (see the header)
 * @param {{games?:number, maxSteps?:number, seed?:number, fallbackEvery?:number, leakViewers?:number,
 *   todo?: Partial<Record<'overIsTerminal'|'noBlock'|'noLeaks'|'noUndoAfterOver', string>>}} [opts]
 *   todo: mark a property as a known bug (node:test todo) with a pointer, e.g. { noUndoAfterOver: 'Quest -5 fixes this (QUEUE.md)' }
 */
export function gameInvariantTests(A, opts = {}) {
  const o = { games: 300, maxSteps: 3000, seed: 20261027, fallbackEvery: 1, leakViewers: 2, todo: {}, ...opts };
  const reg = (key, title, fn) => (o.todo[key] ? test(`${A.name}: ${title}`, { todo: o.todo[key] }, fn) : test(`${A.name}: ${title}`, fn));
  const report = (problems, what) => assert.deepEqual(problems.slice(0, 8), [], `${problems.length} ${what} problem(s)`);

  reg('noBlock', 'no step can block (seeded games end, a progress move or the host skip is always accepted)', () => {
    const problems = []; let states = 0; let fallbacks = 0; let overs = 0;
    for (let i = 0; i < o.games; i++) playOne(A, i, o, {
      problem: (m) => problems.push(m),
      onOver: () => { overs++; },
      onState: (s, tag, step, rng) => {
        states++;
        const fb = A.fallback?.(s);
        if (fb && step % o.fallbackEvery === 0) { fallbacks++; if (!tryMove(A, s, fb, rng, NOW + step)) problems.push(`${tag} step ${step}: the host fallback ${JSON.stringify(fb[1])} was refused (phase ${s.phase ?? '?'})`); }
      },
    });
    report(problems, 'dead-end');
    assert.equal(overs, o.games, 'every game must reach game over');
    assert.ok(states > o.games * 5, `games too short to mean much (${states} states)`);
    if (A.fallback) assert.ok(fallbacks > 0, 'the host fallback was never exercised');
  });

  reg('overIsTerminal', 'game over stays final (no in-game action changes a finished game)', () => {
    const problems = []; let probes = 0;
    for (let i = 0; i < o.games; i++) playOne(A, i, o, {
      problem: (m) => problems.push(m),
      onOver: (s, tag, rng) => {
        const fp = A.fingerprint(s);
        for (const [actor, msg] of A.probes(s, rng)) {
          probes++;
          const res = A.apply(clone(s), actor, msg, rng, NOW);
          if (res?.ok && (!A.isOver(res.state) || A.fingerprint(res.state) !== fp)) problems.push(`${tag}: ${JSON.stringify(msg)} changed a finished game`);
        }
      },
    });
    report(problems, 'over-is-terminal');
    assert.ok(probes > o.games, 'too few end-screen probes');
  });

  reg('noLeaks', 'no leaks (a view never changes when hidden secrets are shuffled)', () => {
    const problems = []; let checks = 0;
    const norm = A.normalizeView || ((v) => v);
    for (let i = 0; i < o.games; i++) playOne(A, i, o, {
      problem: (m) => problems.push(m),
      onState: (s, tag, step, rng) => {
        if (A.secretsRevealed(s)) return;
        const holders = A.secretHolders(s);
        if (holders.length < 2) return;
        const all = A.viewers(s);
        for (const viewer of (o.leakViewers >= all.length ? all : shuffled(rng, all).slice(0, o.leakViewers))) {
          const groups = new Map();
          for (const id of holders) {
            if (id === viewer) continue;
            const k = A.knowledgeClass(s, viewer, id);
            if (k == null) continue;
            if (!groups.has(k)) groups.set(k, []); groups.get(k).push(id);
          }
          const mapping = {};
          for (const ids of groups.values()) { const to = shuffled(rng, ids); ids.forEach((id, j) => { mapping[id] = to[j]; }); }
          if (Object.entries(mapping).every(([a, b]) => a === b)) continue;
          checks++;
          const a = stable(norm(A.view(s, viewer)));
          const b = stable(norm(A.view(A.withSecrets(s, mapping), viewer)));
          if (a !== b) problems.push(`${tag} step ${step}: viewer ${viewer} can tell hidden secrets apart (phase ${s.phase ?? '?'})`);
        }
      },
    });
    report(problems, 'leak');
    assert.ok(checks > o.games, `too few leak checks (${checks})`);
  });

  reg('noUndoAfterOver', 'no Undo after game over', () => {
    const problems = []; let tried = 0;
    for (let i = 0; i < o.games; i++) playOne(A, i, o, {
      problem: (m) => problems.push(m),
      onOver: (s, tag, rng) => {
        tried++;
        const before = stable(s);
        const [actor, msg] = A.undo(s);
        const copy = clone(s);
        const res = A.apply(copy, actor, msg, rng, NOW);
        if (res?.ok) problems.push(`${tag}: Undo was accepted on the end screen (phase now ${res.state?.phase ?? '?'})`);
        else if (stable(copy) !== before) problems.push(`${tag}: a refused Undo changed the finished game`);
      },
    });
    report(problems, 'undo-after-over');
    assert.ok(tried > 0);
  });
}
