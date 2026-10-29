// Cloudflare Worker: API + WebSocket entry for Brass Wallet tables. Static files come from Workers Static Assets.
import { DurableObject } from 'cloudflare:workers';
import { newRoom, actorOf, hello, broadcastPlan, socketsToDrop } from '../public/js/room.js';
import { reduce } from '../public/js/table.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O look-alikes
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MSG = 4 * 1024;

const randCode = () => [...crypto.getRandomValues(new Uint8Array(4))].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
const randKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
const cryptoRng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/create' && request.method === 'POST') {
      for (let i = 0; i < 5; i++) {
        const code = randCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, hostKey: randKey() }) });
        if (res.status === 200) return json(await res.json());
      }
      return json({ error: 'Couldn’t create a table. Try again.' }, 503);
    }
    const exists = url.pathname.match(/^\/api\/room\/([A-Za-z]{4})$/);
    if (exists) {
      const stub = env.ROOM.get(env.ROOM.idFromName(exists[1].toUpperCase()));
      const res = await stub.fetch('https://room/exists');
      return json({ exists: res.status === 200 }, res.status === 200 ? 200 : 404);
    }
    const ws = url.pathname.match(/^\/ws\/([A-Za-z]{4})$/);
    if (ws) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(ws[1].toUpperCase())).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.ready = ctx.blockConcurrencyWhile(async () => { this.room = (await ctx.storage.get('room')) || null; });
  }

  // A failed write must never swallow a change: retry once, then keep going from memory (every phone is showing it).
  async save() {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { await this.ctx.storage.put('room', this.room); await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS); return true; }
      catch (e) { console.error(`save failed (attempt ${attempt}) for table ${this.room.code}:`, e?.message || e); }
    }
    return false;
  }

  async alarm() { await this.ctx.storage.deleteAll(); this.room = null; }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname === '/init') {
      if (this.room) return new Response('exists', { status: 409 });
      const { code, hostKey } = await request.json();
      this.room = newRoom(code, hostKey);
      await this.save();
      return new Response(JSON.stringify({ code, hostKey }), { status: 200 });
    }
    if (url.pathname === '/exists') return new Response(null, { status: this.room ? 200 : 404 });
    if (!this.room) return new Response('Table not found', { status: 404 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ who: null });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  sockets() { return this.ctx.getWebSockets().map((ws) => ({ ws, ...ws.deserializeAttachment() })); }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* socket gone */ } }

  broadcast() {
    for (const ws of socketsToDrop(this.room, this.sockets())) {
      ws.serializeAttachment({ who: null });
      this.send(ws, { type: 'fatal', error: 'The host changed your seat. Join again.', clear: true });
      try { ws.close(1008, 'seat gone'); } catch { /* already closed */ }
    }
    for (const { ws, msgs } of broadcastPlan(this.room, this.sockets())) for (const m of msgs) this.send(ws, m);
  }

  async webSocketMessage(ws, raw) {
    await this.ready;
    if (!this.room) { this.send(ws, { type: 'fatal', error: 'This table has expired.' }); ws.close(1000, 'gone'); return; }
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const att = ws.deserializeAttachment() || { who: null };

    if (msg.type === 'hello') {
      const h = hello(this.room, msg, cryptoRng, Date.now());
      if (h.lobby) { this.send(ws, h.lobby); return; }
      if (h.error) { this.send(ws, h.fatal ? { type: 'fatal', error: h.error, clear: true } : { type: 'error', error: h.error }); if (h.fatal) ws.close(1008, 'bad hello'); return; }
      if (h.reply) await this.save();
      ws.serializeAttachment(h.att);
      if (h.reply) this.send(ws, h.reply);
      this.broadcast();
      return;
    }
    const actor = actorOf(att);
    if (!actor) return;
    const res = reduce(this.room, actor, msg, cryptoRng, Date.now());
    if (res.error) { this.send(ws, { type: 'error', error: res.error }); return; }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws) { try { ws.close(); } catch { /* already closed */ } await this.ready; if (this.room) this.broadcast(); }
  async webSocketError() { await this.ready; if (this.room) this.broadcast(); }
}
