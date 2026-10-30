import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTable, reduce, seatById, MID_KEEP } from '../public/js/table.js';
import { hello } from '../public/js/room.js';

const rng = () => 0.5;
function table() {
  const t = newTable('BB', 'hk');
  reduce(t, { host: true }, { type: 'addSeat', name: 'Host', isHost: true }, rng, 1);
  const ann = reduce(t, {}, { type: 'join', name: 'Ann' }, rng, 1).data.seatId;
  reduce(t, { host: true }, { type: 'start' }, rng, 2);
  return { t, ann };
}
const money = (t, id) => seatById(t, id).money;

test('the same spend sent twice is charged once', () => {
  const { t, ann } = table(); const m0 = money(t, ann);
  const msg = { type: 'spend', seat: ann, amount: 5, mid: 'tap-0001' };
  assert.ok(reduce(t, { seatId: ann }, msg, rng, 3).ok);
  const again = reduce(t, { seatId: ann }, { ...msg }, rng, 4);
  assert.ok(again.ok); assert.equal(again.data.dup, true);
  assert.equal(money(t, ann), m0 - 5);
});

test('two spends with different ids are both charged', () => {
  const { t, ann } = table(); const m0 = money(t, ann);
  reduce(t, { seatId: ann }, { type: 'spend', seat: ann, amount: 5, mid: 'tap-0001' }, rng, 3);
  reduce(t, { seatId: ann }, { type: 'spend', seat: ann, amount: 5, mid: 'tap-0002' }, rng, 3);
  assert.equal(money(t, ann), m0 - 10);
});

test('every wallet change is applied once per id', () => {
  const { t, ann } = table();
  const msgs = [{ type: 'loan', seat: ann }, { type: 'income', seat: ann, spaces: 2 }, { type: 'vp', seat: ann, n: 3 }, { type: 'merchant', seat: ann },
    { type: 'fix', seat: ann, money: 40, reason: 'typo' }, { type: 'undo', seat: ann }, { type: 'endTurn', seat: ann }];
  msgs.forEach((m, i) => {
    const msg = { ...m, mid: `m-${i}-abcd` }; const who = m.type === 'fix' ? { host: true } : { seatId: ann };
    assert.ok(reduce(t, who, msg, rng, 3).ok, m.type);
    const before = JSON.stringify(seatById(t, ann));
    assert.equal(reduce(t, who, msg, rng, 3).data.dup, true, m.type);
    assert.equal(JSON.stringify(seatById(t, ann)), before, `${m.type} copy changed the seat`);
  });
});

test('a refused message does not use up its id', () => {
  const { t, ann } = table(); const m0 = money(t, ann);
  const msg = { type: 'spend', seat: ann, amount: m0 + 1000, mid: 'big-0001' };
  assert.ok(reduce(t, { seatId: ann }, msg, rng, 3).error);
  assert.ok(!t.mids?.includes('big-0001'));
});

test('messages without an id (old phones) work as before', () => {
  const { t, ann } = table(); const m0 = money(t, ann);
  reduce(t, { seatId: ann }, { type: 'spend', seat: ann, amount: 5 }, rng, 3);
  reduce(t, { seatId: ann }, { type: 'spend', seat: ann, amount: 5 }, rng, 3);
  assert.equal(money(t, ann), m0 - 10);
});

test('a bad id is ignored, and the table keeps only the last MID_KEEP ids', () => {
  const { t, ann } = table(); const m0 = money(t, ann);
  reduce(t, { seatId: ann }, { type: 'spend', seat: ann, amount: 1, mid: { x: 1 } }, rng, 3);
  reduce(t, { seatId: ann }, { type: 'spend', seat: ann, amount: 1, mid: { x: 1 } }, rng, 3);
  assert.equal(money(t, ann), m0 - 2);
  assert.equal(t.mids, undefined);
  for (let i = 0; i < MID_KEEP + 10; i++) reduce(t, { seatId: ann }, { type: 'vp', seat: ann, n: 1, mid: `vp-${i}-xxxx` }, rng, 3);
  assert.equal(t.mids.length, MID_KEEP);
  assert.equal(t.mids.at(-1), `vp-${MID_KEEP + 9}-xxxx`);
});

test('a table saved before ids existed takes ids straight away', () => {
  const { t, ann } = table(); delete t.mids; const old = structuredClone(t);
  const msg = { type: 'spend', seat: ann, amount: 5, mid: 'tap-0009' };
  reduce(old, { seatId: ann }, msg, rng, 3); reduce(old, { seatId: ann }, msg, rng, 3);
  assert.equal(money(old, ann), money(t, ann) - 5);
});

test('a join sent twice seats the phone once', () => {
  const t = newTable('BB', 'hk');
  reduce(t, { host: true }, { type: 'addSeat', name: 'Host', isHost: true }, rng, 1);
  const msg = { type: 'hello', join: 'Dee', mid: 'join-0001' };
  const first = hello(t, msg, rng, 1);
  assert.equal(first.reply.type, 'joined');
  assert.deepEqual(hello(t, { ...msg }, rng, 1), { dup: true });
  assert.equal(t.seats.length, 2);
  assert.ok(hello(t, { ...msg, join: 'Eve', mid: 'join-0002' }, rng, 1).reply, 'a new join still works');
  assert.equal(t.seats.length, 3);
});
