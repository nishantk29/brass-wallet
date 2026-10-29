// Brass Wallet rooms: the table plus who is allowed to do what over a socket. Pure, no network.
import { newTable, reduce, viewFor, seatById } from './table.js';

export const newRoom = (code, hostKey) => newTable(code, hostKey);

/** Who a socket is. att: { who: 'host' } | { who: 'seat', seatId, token } | { who: null }. */
export function actorOf(att) { return att.who === 'host' ? { host: true } : att.who === 'seat' ? { host: false, seatId: att.seatId } : null; }

/** Handshake. Returns { att, reply } or { error, fatal? } or { lobby }. Mutates the room only for a join. */
export function hello(room, msg, rng, now) {
  if (msg.hostKey) {
    if (msg.hostKey !== room.hostKey) return { error: 'That host link is not valid for this table.', fatal: true };
    return { att: { who: 'host' } };
  }
  if (msg.seatId) {
    const s = seatById(room, msg.seatId);
    if (!s || !s.token || s.token !== msg.token) return { error: 'Couldn’t rejoin the table. Join again with your name.', fatal: true };
    return { att: { who: 'seat', seatId: s.id, token: s.token } };
  }
  if (msg.join) {
    const res = reduce(room, { host: false }, { type: 'join', name: msg.join, seat: msg.seat }, rng, now);
    if (res.error) return { error: res.error };
    return { att: { who: 'seat', seatId: res.data.seatId, token: res.data.token }, reply: { type: 'joined', ...res.data } };
  }
  return { lobby: { type: 'lobby', phase: room.phase, open: room.seats.filter((s) => s.open).map((s) => ({ id: s.id, name: s.name })), count: room.seats.length, started: room.phase !== 'setup' } };
}

/** A socket is stale when its seat is gone, was released, or changed hands. */
export const isStale = (room, att) => att.who === 'seat' && seatById(room, att.seatId)?.token !== att.token;

export const connectedSeats = (sockets) => new Set(sockets.filter((s) => s.who === 'seat').map((s) => s.seatId));

/** What to send each open socket after a change: its own view and nothing else. sockets: [{ ws, who, seatId }]. */
export function broadcastPlan(room, sockets) {
  const connected = connectedSeats(sockets);
  return sockets.filter((s) => s.who === 'host' || (s.who === 'seat' && !isStale(room, s)))
    .map((s) => ({ ws: s.ws, msgs: [{ type: 'view', view: viewFor(room, s.who === 'host' ? { host: true } : { seatId: s.seatId }, connected) }] }));
}
export const socketsToDrop = (room, sockets) => sockets.filter((s) => s.who === 'seat' && isStale(room, s)).map((s) => s.ws);
