// @ts-check
// Shared kit: reconnect at once when a phone comes back (Game Night tech review, Oct 28 2026).
// Copy this file to public/js/wake.js in each online game (Mafia, Quest, Gilded); test/wake.test.js covers it there.
//
// Why: a phone that sleeps, switches apps or loses signal drops its WebSocket. The client then retries on a backoff
// timer (400 ms doubling, capped at 8 s), so after the phone is back the player can wait up to 8 s for the room.
// The browser tells us the moment it is back: the page turns visible, the network comes back online, or the page is
// restored from the back/forward cache. On any of those, a dead socket is replaced straight away.

/** @typedef {{ readyState: number }} SocketLike */
/** @typedef {{ visibilityState: string, addEventListener: Function, removeEventListener: Function }} DocLike */
/** @typedef {{ addEventListener: Function, removeEventListener: Function }} WinLike */

/**
 * True when the socket should be replaced now: there is none yet, or it is closing (2) or closed (3).
 * A socket that is still connecting (0) or open (1) is left alone.
 * @param {SocketLike | null | undefined} ws
 */
export const needsReconnect = (ws) => !ws || ws.readyState >= 2;

/**
 * Calls fn('visible' | 'online' | 'pageshow') whenever the page comes back. Returns a function that removes the listeners.
 * @param {(why: string) => void} fn
 * @param {{ doc?: DocLike, win?: WinLike }} [env]
 */
export function onWake(fn, env = {}) {
  const doc = env.doc ?? /** @type {DocLike | undefined} */ (globalThis.document);
  const win = env.win ?? /** @type {WinLike | undefined} */ (globalThis.window);
  if (!doc || !win) return () => {};
  const vis = () => { if (doc.visibilityState === 'visible') fn('visible'); };
  const online = () => fn('online');
  /** @param {{ persisted?: boolean }} e */
  const show = (e) => { if (e && e.persisted) fn('pageshow'); };
  doc.addEventListener('visibilitychange', vis);
  win.addEventListener('online', online);
  win.addEventListener('pageshow', show);
  return () => { doc.removeEventListener('visibilitychange', vis); win.removeEventListener('online', online); win.removeEventListener('pageshow', show); };
}

/**
 * Wires a transport to onWake: when the page comes back and the transport is still wanted but its socket is dead,
 * reconnect() runs at once (the caller clears its backoff timer and resets its retry count there).
 * @param {{ getSocket: () => SocketLike | null | undefined, isStopped: () => boolean, reconnect: (why: string) => void }} t
 * @param {{ doc?: DocLike, win?: WinLike }} [env]
 */
export function wakeReconnect(t, env) {
  return onWake((why) => { if (!t.isStopped() && needsReconnect(t.getSocket())) t.reconnect(why); }, env);
}
