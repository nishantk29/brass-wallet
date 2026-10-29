// Tests for the shared reconnect-on-wake kit (public/js/wake.js). Copied into each online game's test/ folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsReconnect, onWake, wakeReconnect } from '../public/js/wake.js';

const env = (state = 'visible') => {
  const doc = new EventTarget(); doc.visibilityState = state; const win = new EventTarget();
  const fire = (t, k, extra = {}) => t.dispatchEvent(Object.assign(new Event(k), extra));
  return { doc, win, hide: () => { doc.visibilityState = 'hidden'; fire(doc, 'visibilitychange'); }, show: () => { doc.visibilityState = 'visible'; fire(doc, 'visibilitychange'); },
    online: () => fire(win, 'online'), pageshow: (persisted) => fire(win, 'pageshow', { persisted }) };
};

test('needsReconnect: only a missing, closing or closed socket', () => {
  assert.equal(needsReconnect(null), true);
  assert.equal(needsReconnect(undefined), true);
  assert.deepEqual([0, 1, 2, 3].map((s) => needsReconnect({ readyState: s })), [false, false, true, true]);
});
test('onWake fires on visible, online and a back/forward-cache restore, not on hide or a normal load', () => {
  const e = env('hidden'); const seen = []; const stop = onWake((w) => seen.push(w), e);
  e.hide(); e.show(); e.online(); e.pageshow(false); e.pageshow(true);
  assert.deepEqual(seen, ['visible', 'online', 'pageshow']);
  stop(); e.show(); e.online(); e.pageshow(true);
  assert.deepEqual(seen, ['visible', 'online', 'pageshow'], 'stop() removes every listener');
});
test('wakeReconnect replaces a dead socket at once, and leaves a live, connecting or stopped one alone', () => {
  const e = env(); let ws = { readyState: 3 }; let stopped = false; const calls = [];
  wakeReconnect({ getSocket: () => ws, isStopped: () => stopped, reconnect: (w) => { calls.push(w); ws = { readyState: 0 }; } }, e);
  e.online(); assert.deepEqual(calls, ['online'], 'closed socket -> reconnect');
  e.show(); assert.deepEqual(calls, ['online'], 'still connecting -> no second socket');
  ws.readyState = 1; e.online(); assert.equal(calls.length, 1, 'open socket untouched');
  ws.readyState = 2; e.show(); assert.deepEqual(calls, ['online', 'visible'], 'closing socket -> reconnect');
  ws.readyState = 3; stopped = true; e.online(); assert.equal(calls.length, 2, 'a transport that was closed on purpose stays closed');
});
test('without a browser (node, the Durable Object) onWake is a no-op', () => {
  const stop = onWake(() => { throw new Error('must not fire'); }, { doc: undefined, win: undefined });
  assert.equal(typeof stop, 'function'); stop();
});
