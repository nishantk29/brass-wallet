import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../public/js/rules.js';
import { newTable, reduce, levelOf } from '../public/js/table.js';

test('income track: spaces map to levels as the README table says', () => {
  const at = (s) => R.levelOfSpace(s);
  assert.deepEqual([0, 5, 10, 11, 12, 13, 30, 31, 33, 34, 60, 61, 64, 65, 96, 97, 99].map(at), [-10, -5, 0, 1, 1, 2, 10, 11, 11, 12, 20, 21, 21, 22, 29, 30, 30]);
  assert.equal(R.levelOfSpace(-4), -10);
  assert.equal(R.levelOfSpace(500), 30);
});
test('income track is continuous: every space 0..99 has one level, levels never skip or go down', () => {
  let prev = -10;
  for (let s = 0; s <= 99; s++) { const l = R.levelOfSpace(s); assert.ok(l === prev || l === prev + 1, `space ${s}`); prev = l; }
  assert.equal(prev, 30);
  for (let l = -10; l <= 30; l++) { const top = R.topSpaceOfLevel(l); assert.equal(R.levelOfSpace(top), l); if (top < 99) assert.equal(R.levelOfSpace(top + 1), l + 1); }
});
test('README sample: Cal at income £2 takes a loan and goes to −£1, space 9', () => {
  const space = R.topSpaceOfLevel(2); assert.equal(R.incomeOfSpace(space), 2);
  const to = R.spaceAfterLoan(space);
  assert.equal(to, 9); assert.equal(R.incomeOfSpace(to), -1);
});
test('README sample: Ben at space 20 (£5) gains 3 spaces and lands on 23 (£7)', () => {
  assert.equal(R.incomeOfSpace(20), 5);
  assert.equal(R.incomeOfSpace(23), 7);
});
test('loan is refused below level −10 and allowed at −7', () => {
  assert.equal(R.spaceAfterLoan(R.topSpaceOfLevel(-7)), 0);
  assert.equal(R.spaceAfterLoan(R.topSpaceOfLevel(-6)), 1);
  assert.equal(R.spaceAfterLoan(R.topSpaceOfLevel(-8)), null);
  assert.equal(R.spaceAfterLoan(0), null);
});
test('rounds, actions and turn order', () => {
  assert.deepEqual([2, 3, 4].map(R.roundsFor), [10, 9, 8]);
  assert.equal(R.actionsFor('canal', 1), 1); assert.equal(R.actionsFor('canal', 2), 2); assert.equal(R.actionsFor('rail', 1), 2);
  assert.deepEqual(R.nextOrder(['a', 'b', 'c', 'd'], { a: 8, b: 21, c: 8, d: 5 }), ['d', 'a', 'c', 'b']); // ties keep order
  assert.deepEqual(R.nextOrder(['c', 'a', 'b'], { a: 0, b: 0, c: 0 }), ['c', 'a', 'b']);
});
test('constants: start, coins, colours', () => {
  assert.equal(R.START_MONEY, 17); assert.equal(R.START_INCOME_SPACE, 10); assert.equal(R.LOAN_AMOUNT, 30);
  assert.equal(R.CANAL_COST, 3); assert.equal(R.RAIL_COST, 5); assert.equal(R.DOUBLE_RAIL_COST, 15); assert.equal(R.MERCHANT_BONUS_MONEY, 5);
  assert.equal(R.SCORING_HELPER, true); assert.equal(R.ALLOW_SEAT_TAKEOVER, true);
  assert.equal(new Set(R.COLOURS.map((c) => c.id)).size, R.MAX_PLAYERS);
});

// ---- reducer ----
const H = { host: true };
const rng = () => 0.3;
function start(names = ['Ana', 'Ben', 'Cal']) {
  const t = newTable('ABCD', 'key');
  names.forEach((n, i) => reduce(t, H, { type: 'addSeat', name: n, isHost: i === 0 }, rng, 1));
  const r = reduce(t, H, { type: 'start' }, rng, 2); assert.ok(r.ok, r.error);
  return t;
}
const S = (t, name) => t.seats.find((s) => s.name === name);
const go = (t, actor, msg) => reduce(t, actor, msg, rng, 10);

test('new table: £17, space 10, income £0, VP 0, random order of all seats', () => {
  const t = start();
  for (const s of t.seats) { assert.equal(s.money, 17); assert.equal(s.space, 10); assert.equal(s.vp, 0); assert.equal(levelOf(s), 0); }
  assert.deepEqual([...t.order].sort(), t.seats.map((s) => s.id).sort());
  assert.equal(t.rounds, 9);
});
test('spend, loan, merchant, income, vp change the wallet and log who did what', () => {
  const t = start(); const cal = S(t, 'Cal');
  assert.ok(go(t, H, { type: 'spend', seat: cal.id, amount: 5, kind: 'canal' }).ok);
  assert.equal(cal.money, 12); assert.equal(cal.spent, 5);
  assert.match(t.log[0].text, /^Cal spent £5 on a canal link\.$/);
  go(t, H, { type: 'loan', seat: cal.id });
  assert.equal(cal.money, 42); assert.equal(cal.loans, 1); assert.equal(cal.space, 7); assert.equal(levelOf(cal), -3);
  go(t, H, { type: 'merchant', seat: cal.id }); assert.equal(cal.money, 47);
  go(t, H, { type: 'income', seat: cal.id, spaces: 3 }); assert.equal(cal.space, 10);
  go(t, H, { type: 'vp', seat: cal.id, n: 4 }); assert.equal(cal.vp, 4);
  assert.ok(go(t, H, { type: 'spend', seat: cal.id, amount: 500 }).error);
  assert.ok(go(t, H, { type: 'spend', seat: cal.id, amount: 0 }).error);
  assert.equal(cal.spent, 5);
});
test('a loan is refused at level −8 and changes nothing', () => {
  const t = start(); const a = S(t, 'Ana'); a.space = 2;
  const r = go(t, H, { type: 'loan', seat: a.id });
  assert.match(r.error, /can’t take a loan/); assert.equal(a.money, 17); assert.equal(a.loans, 0);
});
test('permissions: a connected player changes only their own wallet; the host cannot spend for a remote seat', () => {
  const t = newTable('ABCD', 'k');
  go(t, H, { type: 'addSeat', name: 'Ana', isHost: true });
  const j = reduce(t, { host: false }, { type: 'join', name: 'Cal' }, rng, 1); assert.ok(j.ok);
  go(t, H, { type: 'addSeat', name: 'Ben' });
  assert.ok(go(t, H, { type: 'start' }).ok);
  const cal = S(t, 'Cal'), ana = S(t, 'Ana');
  assert.ok(go(t, { host: false, seatId: cal.id }, { type: 'spend', seat: cal.id, amount: 3, kind: 'canal' }).ok);
  assert.ok(go(t, { host: false, seatId: cal.id }, { type: 'spend', seat: ana.id, amount: 3 }).error);
  assert.ok(go(t, H, { type: 'spend', seat: cal.id, amount: 3 }).error);
  assert.ok(go(t, { host: false, seatId: cal.id }, { type: 'collect' }).error);
});
test('round end: order least spent first with ties kept; income collected; the shortfall is stated; no income after the last round', () => {
  const t = start(['Ana', 'Ben', 'Cal', 'Dee']);
  const [a, b, c, d] = ['Ana', 'Ben', 'Cal', 'Dee'].map((n) => S(t, n));
  t.order = [a.id, b.id, c.id, d.id];
  go(t, H, { type: 'spend', seat: a.id, amount: 8 }); go(t, H, { type: 'spend', seat: c.id, amount: 8 }); go(t, H, { type: 'spend', seat: d.id, amount: 5 }); b.money = 40; go(t, H, { type: 'spend', seat: b.id, amount: 21 });
  c.space = 9; c.money = 0; // owes £1, has £0
  t.seats.forEach((s) => go(t, H, { type: 'endTurn', seat: s.id }));
  assert.equal(t.phase, 'endround');
  assert.ok(go(t, H, { type: 'collect' }).ok);
  assert.deepEqual(t.order, [d.id, a.id, c.id, b.id]);
  assert.equal(t.round, 2); assert.equal(t.phase, 'turns'); assert.equal(a.spent, 0);
  assert.equal(c.money, 0); assert.match(t.log.find((l) => l.seat === c.id && /Short/.test(l.text)).text, /Short £1/);
  assert.equal(S(t, 'Ana').money, 9 + 0); // income level 0
});
test('last round of the game pays no income and goes to scoring', () => {
  const t = start(['Ana', 'Ben']); t.era = 'rail'; t.round = t.rounds; const a = S(t, 'Ana'); a.space = 20; const before = a.money;
  go(t, H, { type: 'endRound' }); go(t, H, { type: 'collect' });
  assert.equal(a.money, before); assert.equal(t.phase, 'scoring');
});
test('era scoring needs every row; helper adds link and tile VP; rail then final ties break on income then money', () => {
  const t = start(['Ana', 'Ben']); const [a, b] = [S(t, 'Ana'), S(t, 'Ben')];
  t.round = t.rounds; go(t, H, { type: 'endRound' }); go(t, H, { type: 'collect' }); assert.equal(t.phase, 'scoring');
  go(t, H, { type: 'score', seat: a.id, links: 9, tiles: 12 });
  const blocked = go(t, H, { type: 'continue' }); assert.match(blocked.error, /Type Ben’s totals/);
  go(t, H, { type: 'scoreZero', seat: b.id }); go(t, H, { type: 'score', seat: b.id, links: 5 });
  assert.ok(go(t, H, { type: 'continue' }).ok);
  assert.equal(a.vp, 21); assert.equal(b.vp, 5); assert.equal(t.era, 'rail'); assert.equal(t.round, 1);
  t.round = t.rounds; go(t, H, { type: 'endRound' }); go(t, H, { type: 'collect' });
  go(t, H, { type: 'score', seat: a.id, links: 0, tiles: 0 }); go(t, H, { type: 'score', seat: b.id, links: 16, tiles: 0 });
  go(t, H, { type: 'continue' });
  assert.equal(t.phase, 'over'); assert.equal(a.vp, 21); assert.equal(b.vp, 21);
});
test('tie-break: same VP, higher income wins, then more money', () => {
  const t = start(['Ana', 'Ben', 'Cal']); const [a, b, c] = ['Ana', 'Ben', 'Cal'].map((n) => S(t, n));
  [a, b, c].forEach((s) => { s.vp = 30; }); a.space = 20; b.space = 30; c.space = 30; b.money = 5; c.money = 9;
  assert.deepEqual(ranking_(t), [c.id, b.id, a.id]);
});
import { ranking } from '../public/js/table.js';
const ranking_ = ranking;

test('fix and undo: host fix is logged with reason, shows in the seat log, and can be undone with a reason', () => {
  const t = newTable('ABCD', 'k'); go(t, H, { type: 'addSeat', name: 'Ana', isHost: true }); reduce(t, { host: false }, { type: 'join', name: 'Cal' }, rng, 1); go(t, H, { type: 'start' });
  const cal = S(t, 'Cal');
  go(t, { host: false, seatId: cal.id }, { type: 'spend', seat: cal.id, amount: 3, kind: 'canal' });
  assert.ok(go(t, { host: false, seatId: cal.id }, { type: 'fix', seat: cal.id, money: 99 }).error);
  const r = go(t, H, { type: 'fix', seat: cal.id, money: 10, reason: 'The build cost £4' });
  assert.ok(r.ok); assert.equal(cal.money, 10);
  assert.equal(t.log[0].text, 'Host fixed Cal’s money: £14 to £10. The build cost £4.'); assert.equal(t.log[0].seat, cal.id);
  assert.ok(go(t, H, { type: 'undo', seat: cal.id, reason: 'My mistake' }).ok); assert.equal(cal.money, 14);
  assert.match(t.log[0].text, /^Host undid Cal’s last change \(a fix\)\. My mistake\.$/);
  assert.ok(go(t, { host: false, seatId: cal.id }, { type: 'undo', seat: cal.id }).ok); assert.equal(cal.money, 17); assert.equal(cal.spent, 0);
  assert.ok(go(t, { host: false, seatId: cal.id }, { type: 'undo', seat: cal.id }).error);
});
test('seat takeover moves a remote seat to the host phone and invalidates its token', () => {
  const t = newTable('ABCD', 'k'); go(t, H, { type: 'addSeat', name: 'Ana', isHost: true }); reduce(t, { host: false }, { type: 'join', name: 'Cal' }, rng, 1); go(t, H, { type: 'start' });
  const cal = S(t, 'Cal'); assert.ok(cal.token);
  assert.ok(go(t, H, { type: 'toLocal', seat: cal.id }).ok);
  assert.equal(cal.where, 'local'); assert.equal(cal.token, undefined); assert.match(t.log[0].text, /took over Cal/);
  assert.ok(go(t, H, { type: 'spend', seat: cal.id, amount: 3 }).ok);
});
test('setup limits: 2 to 4 players, unique names and colours, an open seat blocks start with a reason', () => {
  const t = newTable('ABCD', 'k');
  go(t, H, { type: 'addSeat', name: 'Ana', isHost: true });
  assert.match(go(t, H, { type: 'start' }).error, /at least 2/);
  ['Ben', 'Cal', 'Dee'].forEach((n) => go(t, H, { type: 'addSeat', name: n }));
  assert.ok(go(t, H, { type: 'addSeat', name: 'Eve' }).error);
  assert.ok(go(t, H, { type: 'addSeat', name: 'ben' }).error);
  assert.equal(new Set(t.seats.map((s) => s.colour)).size, 4);
  go(t, H, { type: 'colour', seat: t.seats[0].id, colour: t.seats[1].colour });
  assert.equal(new Set(t.seats.map((s) => s.colour)).size, 4);
  go(t, H, { type: 'release', seat: t.seats[3].id });
  assert.match(go(t, H, { type: 'start' }).error, /open/);
});
