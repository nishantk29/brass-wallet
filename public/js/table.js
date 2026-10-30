// Brass Wallet: the table reducer. Pure (no DOM, no network). One model for pass-and-play, own phones and mixed tables.
// reduce(table, actor, msg, rng, now) -> { ok, data } | { error }. Mutates the table (the room clones before calling).
// actor: { host: boolean, seatId?: string }. A host may act on every local seat; a connected player only on their own seat.
// Seat: { id, name, colour, where: 'local' | 'remote', token?, open?, host?, money, spent, space, vp, loans, actions, done, undo }.
import * as R from './rules.js';

const ok = (data = {}) => ({ ok: true, data });
const err = (error) => ({ error });
export const seatById = (t, id) => t.seats.find((s) => s.id === id);
const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, R.NAME_MAX);
const randToken = (rng) => Array.from({ length: 16 }, () => Math.floor(rng() * 256).toString(16).padStart(2, '0')).join('');
const shuffle = (a, rng) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const isInt = (n) => Number.isInteger(n);

export function newTable(code = '', hostKey = '') {
  return { v: R.RULES_VERSION, code, hostKey, phase: 'setup', seats: [], nextId: 1, era: 'canal', round: 1, rounds: 0, order: [], scores: null, final: null, log: [] };
}

function newSeat(t, name, where, rng, extra = {}) {
  const used = new Set(t.seats.map((s) => s.colour));
  const colour = (R.COLOURS.find((c) => !used.has(c.id)) || R.COLOURS[0]).id;
  return { id: `s${t.nextId++}`, name, colour, where, token: where === 'remote' ? randToken(rng) : undefined, money: R.START_MONEY, spent: 0, space: R.START_INCOME_SPACE, vp: R.START_VP, loans: 0, actions: 0, done: false, undo: [], ...extra };
}

export const levelOf = (s) => R.levelOfSpace(s.space);
export const maxActions = (t) => R.actionsFor(t.era, t.round);
export const nameTaken = (t, name, exceptId) => t.seats.some((s) => s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase());

function log(t, now, seat, text) {
  t.log.unshift({ t: now, seat: seat?.id ?? null, text });
  if (t.log.length > R.LOG_MAX) t.log.length = R.LOG_MAX;
}
const snap = (s) => ({ money: s.money, spent: s.spent, space: s.space, vp: s.vp, loans: s.loans, actions: s.actions });

/** Final ranking: VP, then highest income, then most money (rulebook tie-break). */
export function ranking(t) {
  return t.seats.slice().sort((a, b) => b.vp - a.vp || levelOf(b) - levelOf(a) || b.money - a.money).map((s) => s.id);
}
export const scoreTotal = (sc) => (sc && isInt(sc.links) && isInt(sc.tiles) ? sc.links + sc.tiles : null);
export const scoringComplete = (t) => t.seats.every((s) => scoreTotal(t.scores?.[s.id]) !== null);
export const lastRoundOfGame = (t) => t.era === 'rail' && t.round === t.rounds;
export const lastRoundOfEra = (t) => t.round === t.rounds;
/** What each seat gets or pays at the end of this round: { id, level, pays, short }. */
export function incomePlan(t) {
  return t.seats.map((s) => {
    const level = levelOf(s);
    const pay = level < 0 ? -level : 0;
    return { id: s.id, level, pays: pay, short: Math.max(0, pay - s.money) };
  });
}

function canActOn(t, actor, seat) { return !!seat && ((actor.host && seat.where === 'local') || actor.seatId === seat.id); }
const IN_PLAY = ['turns', 'endround'];

// A message id (`mid`) makes a change happen once: the same message again (a resend, a double-sent tap) is answered ok and
// changes nothing. The table keeps the last MID_KEEP ids it applied.
export const MID_KEEP = 64;
const cleanMid = (m) => (typeof m === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(m) ? m : null);
// The phone side: gives each change a new id, except the same change sent again within SAME_TAP_MS (a double tap or
// double submit), which reuses the last id so the table drops the copy. Repeats over the network always reuse the id.
export const SAME_TAP_MS = 400;
export function midStamper({ windowMs = SAME_TAP_MS, now = () => Date.now(), newMid } = {}) {
  let last = null;
  return (msg) => {
    const key = JSON.stringify(msg); const at = now();
    const mid = last && last.key === key && at - last.at < windowMs ? last.mid : newMid();
    last = { key, at, mid };
    return { ...msg, mid };
  };
}
export function reduce(t, actor, msg, rng = Math.random, now = Date.now()) {
  const mid = cleanMid(msg?.mid);
  if (mid && t.mids?.includes(mid)) return ok({ dup: true });
  const res = reduceOnce(t, actor, msg, rng, now);
  if (mid && res.ok) { (t.mids ||= []).push(mid); if (t.mids.length > MID_KEEP) t.mids.splice(0, t.mids.length - MID_KEEP); }
  return res;
}

// eslint-disable-next-line complexity
function reduceOnce(t, actor, msg, rng, now) {
  const host = !!actor.host;
  const hostOnly = () => (host ? null : err('Only the host can do that.'));
  const seat = msg.seat ? seatById(t, msg.seat) : null;
  const need = () => (!seat ? err('Pick a seat.') : !canActOn(t, actor, seat) ? err(`Only ${seat.where === 'remote' ? seat.name : 'the host'} can change ${seat.name}’s wallet.`) : null);

  if (msg.type === 'join') { // a player on their own phone
    const name = cleanName(msg.name);
    if (!name) return err('Type your name first.');
    if (msg.seat) { // take an open seat
      const s = seatById(t, msg.seat);
      if (!s || !s.open) return err('That seat is taken.');
      s.token = randToken(rng); s.open = false;
      log(t, now, s, `${s.name} joined on their own phone.`);
      return ok({ seatId: s.id, token: s.token });
    }
    if (t.phase !== 'setup') return err('That game has started. Ask the host for an open seat.');
    if (t.seats.length >= R.MAX_PLAYERS) return err(`The table is full (${R.MAX_PLAYERS} players).`);
    if (nameTaken(t, name)) return err('Someone already has that name. Pick another.');
    const s = newSeat(t, name, 'remote', rng); t.seats.push(s);
    return ok({ seatId: s.id, token: s.token });
  }

  if (t.phase === 'over' && msg.type !== 'again') return err('The game is over.');

  switch (msg.type) {
    // ---- seating (host) -------------------------------------------------------------------------------------------
    case 'addSeat': {
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'setup') return err('Seats can only be added before the game starts.');
      if (t.seats.length >= R.MAX_PLAYERS) return err(`The table is full (${R.MAX_PLAYERS} players).`);
      let name = cleanName(msg.name);
      if (!name) { let n = t.seats.length + 1; while (nameTaken(t, `Player ${n}`)) n++; name = `Player ${n}`; }
      if (nameTaken(t, name)) return err('Someone already has that name. Pick another.');
      const s = newSeat(t, name, 'local', rng, msg.isHost ? { host: true } : {}); t.seats.push(s);
      return ok({ seatId: s.id });
    }
    case 'rename': {
      const e = hostOnly(); if (e) return e;
      const name = cleanName(msg.name);
      if (!seat) return err('Pick a seat.');
      if (!name) return err('Type a name first.');
      if (nameTaken(t, name, seat.id)) return err('Someone already has that name. Pick another.');
      const old = seat.name; seat.name = name;
      if (t.phase !== 'setup') log(t, now, seat, `Host renamed ${old} to ${name}.`);
      return ok();
    }
    case 'colour': {
      const e = hostOnly(); if (e) return e;
      if (!seat) return err('Pick a seat.');
      if (!R.COLOURS.some((c) => c.id === msg.colour)) return err('Pick one of the four colours.');
      const other = t.seats.find((s) => s.id !== seat.id && s.colour === msg.colour);
      if (other) other.colour = seat.colour; // swap, so colours stay unique
      seat.colour = msg.colour;
      return ok();
    }
    case 'release': { // the seat becomes open: a person can take it on their own phone
      const e = hostOnly(); if (e) return e;
      if (!seat || seat.host) return err('That seat can’t be released.');
      seat.where = 'remote'; seat.token = undefined; seat.open = true;
      if (t.phase !== 'setup') log(t, now, seat, `Host opened ${seat.name}’s seat for a phone to join.`);
      return ok();
    }
    case 'toLocal': { // move a seat onto the host phone (also the seat takeover for a dropped player)
      const e = hostOnly(); if (e) return e;
      if (!seat) return err('Pick a seat.');
      if (seat.where === 'remote' && t.phase !== 'setup' && !R.ALLOW_SEAT_TAKEOVER) return err('Seats can’t move mid-game.');
      seat.where = 'local'; seat.token = undefined; seat.open = false;
      if (t.phase !== 'setup') log(t, now, seat, `Host took over ${seat.name}’s seat on the host phone.`);
      return ok();
    }
    case 'remove': {
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'setup') return err('Seats can only be removed before the game starts.');
      if (!seat || seat.host) return err('That seat can’t be removed.');
      t.seats = t.seats.filter((s) => s.id !== seat.id);
      return ok();
    }
    case 'start': {
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'setup') return err('The game has already started.');
      if (t.seats.length < R.MIN_PLAYERS) return err(`You need at least ${R.MIN_PLAYERS} players.`);
      if (t.seats.some((s) => s.open)) return err('A seat is still open. Remove it or give it to a phone.');
      t.order = shuffle(t.seats.map((s) => s.id), rng);
      t.era = 'canal'; t.round = 1; t.rounds = R.roundsFor(t.seats.length); t.phase = 'turns'; t.scores = null; t.final = null;
      t.log = [];
      log(t, now, null, `Canal era started. ${t.rounds} rounds. First turn order: ${t.order.map((id) => seatById(t, id).name).join(', ')}.`);
      return ok();
    }
    case 'again': {
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'over') return err('The game isn’t over yet.');
      Object.assign(t, { phase: 'setup', era: 'canal', round: 1, rounds: 0, order: [], scores: null, final: null, log: [] });
      for (const s of t.seats) Object.assign(s, { money: R.START_MONEY, spent: 0, space: R.START_INCOME_SPACE, vp: R.START_VP, loans: 0, actions: 0, done: false, undo: [] });
      return ok();
    }
    default: break;
  }

  // ---- in-play wallet changes ---------------------------------------------------------------------------------------
  const wallet = (label, fn, text) => {
    const e = need(); if (e) return e;
    if (t.phase !== 'turns') return err('The round is over. Finish the round first.');
    const before = snap(seat);
    const r = fn(); if (r) return r;
    seat.undo.push({ label, snap: before }); if (seat.undo.length > R.UNDO_DEPTH) seat.undo.shift();
    log(t, now, seat, typeof text === 'function' ? text() : text);
    return ok();
  };

  switch (msg.type) {
    case 'spend': {
      const amount = msg.amount;
      const kinds = { canal: 'a canal link', rail: 'a rail link', rail2: 'two rail links', other: 'a build' };
      const what = kinds[msg.kind] || kinds.other;
      return wallet('spend', () => {
        if (!isInt(amount) || amount <= 0 || amount > 999) return err('Type a whole amount of £1 or more.');
        if (amount > seat.money) return err(`${seat.name} only has ${R.fmtMoney(seat.money)}. Take a loan first, or fix the balance.`);
        seat.money -= amount; seat.spent += amount; return null;
      }, () => `${seat.name} spent ${R.fmtMoney(amount)} on ${what}.`);
    }
    case 'loan': {
      let before = 0, after = 0;
      return wallet('loan', () => {
        const to = R.spaceAfterLoan(seat.space);
        if (to === null) return err(`${seat.name} can’t take a loan: income can’t go below −£10.`);
        before = R.incomeOfSpace(seat.space); after = R.incomeOfSpace(to);
        seat.money += R.LOAN_AMOUNT; seat.space = to; seat.loans += 1; return null;
      }, () => `${seat.name} took a loan: +£${R.LOAN_AMOUNT}. Income ${R.fmtMoney(before)} to ${R.fmtMoney(after)}.`);
    }
    case 'merchant':
      return wallet('merchant', () => { seat.money += R.MERCHANT_BONUS_MONEY; return null; }, `${seat.name} took a merchant bonus: +£${R.MERCHANT_BONUS_MONEY}.`);
    case 'income': {
      const n = msg.spaces;
      let before = 0, after = 0;
      return wallet('income', () => {
        if (!isInt(n) || n === 0 || Math.abs(n) > R.MAX_SPACE) return err('Pick a number of spaces.');
        before = R.incomeOfSpace(seat.space); seat.space = R.clampSpace(seat.space + n); after = R.incomeOfSpace(seat.space); return null;
      }, () => `${seat.name} moved income ${n > 0 ? '+' : '−'}${Math.abs(n)} spaces. Income ${R.fmtMoney(before)} to ${R.fmtMoney(after)}.`);
    }
    case 'vp': {
      const n = msg.n;
      return wallet('vp', () => { if (!isInt(n) || n === 0 || Math.abs(n) > 999) return err('Type a whole number of VP.'); seat.vp += n; return null; },
        () => `${seat.name} ${n > 0 ? 'gained' : 'lost'} ${Math.abs(n)} VP.`);
    }
    case 'action': { // the action counter: not a money change, so not logged or undoable
      const e = need(); if (e) return e;
      if (t.phase !== 'turns') return err('The round is over. Finish the round first.');
      const max = maxActions(t);
      if (!isInt(msg.n) || msg.n < 0 || msg.n > max) return err(`Actions go from 0 to ${max} this round.`);
      seat.actions = msg.n;
      return ok();
    }
    case 'endTurn': {
      const e = need(); if (e) return e;
      if (t.phase !== 'turns') return err('The round is over. Finish the round first.');
      if (seat.done) return err(`${seat.name} has already ended their turn.`);
      seat.done = true; seat.actions = 0;
      log(t, now, seat, `${seat.name} ended their turn.`);
      if (t.seats.every((s) => s.done)) t.phase = 'endround';
      return ok();
    }
    case 'endRound': { // host skip: closes the round when someone forgot to end their turn
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'turns') return err('Not now.');
      for (const s of t.seats) { s.done = true; s.actions = 0; }
      t.phase = 'endround';
      log(t, now, null, `Host ended round ${t.round}.`);
      return ok();
    }
    case 'collect': { // end of round: new turn order, income, next round (or era scoring)
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'endround') return err('Not now.');
      const spentNow = Object.fromEntries(t.seats.map((s) => [s.id, s.spent]));
      t.order = R.nextOrder(t.order, spentNow);
      const lastGame = lastRoundOfGame(t);
      if (lastGame) log(t, now, null, `Round ${t.round} done. No income after the last round of the game.`);
      else {
        for (const p of incomePlan(t)) {
          const s = seatById(t, p.id);
          if (p.level >= 0) { s.money += p.level; log(t, now, s, `${s.name} collected round ${t.round} income: £${p.level}.`); }
          else if (p.short === 0) { s.money -= p.pays; log(t, now, s, `${s.name} paid round ${t.round} income: £${p.pays}.`); }
          else { const paid = s.money; s.money = 0; log(t, now, s, `${s.name} owed £${p.pays} and paid £${paid}. Short £${p.short}: sell industry tiles, then lose VP.`); }
        }
      }
      for (const s of t.seats) s.undo = [];
      log(t, now, null, `Next turn order: ${t.order.map((id) => seatById(t, id).name).join(', ')}.`);
      if (lastRoundOfEra(t)) { t.phase = 'scoring'; t.scores = Object.fromEntries(t.seats.map((s) => [s.id, { links: null, tiles: null }])); }
      else { t.round += 1; t.phase = 'turns'; }
      for (const s of t.seats) { s.spent = 0; s.done = false; s.actions = 0; }
      return ok();
    }
    case 'score': { // type one player's link VP and tile VP from the board
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'scoring') return err('Not now.');
      if (!seat) return err('Pick a seat.');
      const cur = t.scores[seat.id];
      for (const k of ['links', 'tiles']) {
        if (msg[k] === undefined) continue;
        if (msg[k] === null || msg[k] === '') { cur[k] = null; continue; }
        if (!isInt(msg[k]) || msg[k] < 0 || msg[k] > 999) return err('Type a whole number from 0 up.');
        cur[k] = msg[k];
      }
      return ok();
    }
    case 'scoreZero': { // fix for a blank row: count it as 0
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'scoring' || !seat) return err('Not now.');
      const cur = t.scores[seat.id];
      if (cur.links === null) cur.links = 0;
      if (cur.tiles === null) cur.tiles = 0;
      return ok();
    }
    case 'continue': { // after era scoring: rail era, or the end of the game
      const e = hostOnly(); if (e) return e;
      if (t.phase !== 'scoring') return err('Not now.');
      if (msg.fill) for (const s of t.seats) { const c = t.scores[s.id]; if (c.links === null) c.links = 0; if (c.tiles === null) c.tiles = 0; } // host skip: blanks count as 0
      if (!scoringComplete(t)) { const s = t.seats.find((x) => scoreTotal(t.scores[x.id]) === null); return err(`Type ${s.name}’s totals to continue.`); }
      for (const s of t.seats) {
        const tot = scoreTotal(t.scores[s.id]); s.vp += tot; s.undo = [];
        log(t, now, s, `${s.name} scored ${tot} VP for the ${t.era} era (links ${t.scores[s.id].links}, tiles ${t.scores[s.id].tiles}).`);
      }
      if (t.era === 'canal') { t.era = 'rail'; t.round = 1; t.phase = 'turns'; log(t, now, null, 'Rail era started.'); }
      else { t.phase = 'over'; t.final = ranking(t); log(t, now, null, `Game over. ${seatById(t, t.final[0]).name} wins.`); }
      t.scores = null;
      return ok();
    }
    // ---- fixes and undo --------------------------------------------------------------------------------------------
    case 'fix': {
      const e = hostOnly(); if (e) return e;
      if (!seat) return err('Pick a seat.');
      if (!IN_PLAY.includes(t.phase) && t.phase !== 'scoring') return err('Not now.');
      const reason = String(msg.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'No reason given';
      const parts = [];
      const next = {};
      if (msg.money !== undefined) { if (!isInt(msg.money) || msg.money < 0 || msg.money > 9999) return err('Money is a whole number, £0 or more.'); next.money = msg.money; }
      if (msg.space !== undefined) { if (!isInt(msg.space) || msg.space < 0 || msg.space > R.MAX_SPACE) return err(`Income space goes from 0 to ${R.MAX_SPACE}.`); next.space = msg.space; }
      if (msg.vp !== undefined) { if (!isInt(msg.vp) || Math.abs(msg.vp) > 999) return err('VP is a whole number.'); next.vp = msg.vp; }
      if (!Object.keys(next).length) return err('Change something first.');
      const before = snap(seat);
      if (next.money !== undefined && next.money !== seat.money) parts.push([`money: ${R.fmtMoney(seat.money)} to ${R.fmtMoney(next.money)}`]);
      if (next.space !== undefined && next.space !== seat.space) parts.push([`income: ${R.fmtMoney(R.incomeOfSpace(seat.space))} to ${R.fmtMoney(R.incomeOfSpace(next.space))}`]);
      if (next.vp !== undefined && next.vp !== seat.vp) parts.push([`VP: ${seat.vp} to ${next.vp}`]);
      if (!parts.length) return err('Nothing changed.');
      Object.assign(seat, next);
      seat.undo.push({ label: 'fix', snap: before }); if (seat.undo.length > R.UNDO_DEPTH) seat.undo.shift();
      for (const [p] of parts) log(t, now, seat, `Host fixed ${seat.name}’s ${p}. ${reason}.`);
      return ok();
    }
    case 'undo': { // the seat's owner or the host undoes that seat's last change
      if (!IN_PLAY.includes(t.phase)) return err('Nothing to undo now.');
      const isOwner = seat && actor.seatId === seat.id;
      if (!seat || !(host || isOwner)) return err('Only the host or the seat’s owner can undo.');
      const last = seat.undo.pop();
      if (!last) return err(`${seat.name} has nothing to undo.`);
      Object.assign(seat, last.snap);
      const reason = String(msg.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const who = host && !isOwner ? 'Host undid' : `${seat.name} undid`;
      log(t, now, seat, `${who} ${host && !isOwner ? seat.name + '’s' : 'their'} last change${last.label === 'fix' ? ' (a fix)' : ''}.${reason ? ' ' + reason + '.' : ''}`);
      return ok();
    }
    default: return err('Unknown action.');
  }
}

// ---- views -----------------------------------------------------------------------------------------------------------
// What one phone gets. Money and VP are public at a Brass table (spends are made openly), so the only secrets are the
// rejoin tokens and the host key: they never appear in any view.
export function viewFor(t, viewer, connected = new Set()) {
  const seats = t.seats.map((s) => ({
    id: s.id, name: s.name, colour: s.colour, where: s.where, open: !!s.open, host: !!s.host, online: s.where === 'local' ? true : connected.has(s.id),
    money: s.money, spent: s.spent, space: s.space, level: levelOf(s), vp: s.vp, loans: s.loans, actions: s.actions, done: s.done, canUndo: s.undo.length > 0,
  }));
  return {
    code: t.code, phase: t.phase, era: t.era, round: t.round, rounds: t.rounds, maxActions: t.phase === 'setup' ? 0 : maxActions(t), order: t.order.slice(),
    seats, me: { host: !!viewer.host, seatId: viewer.seatId ?? null },
    scores: t.scores ? JSON.parse(JSON.stringify(t.scores)) : null, final: t.final ? t.final.slice() : null,
    plan: t.phase === 'endround' ? incomePlan(t) : null, nextOrder: t.phase === 'endround' ? R.nextOrder(t.order, Object.fromEntries(t.seats.map((s) => [s.id, s.spent]))) : null,
    log: t.log.map((l) => ({ ...l })),
  };
}
