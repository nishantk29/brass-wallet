// Brass Wallet client. One view of the table for every phone: pass-and-play on one phone (saved in localStorage, no room),
// or a room where each seat is on this phone or on its own phone. The reducer in table.js runs here (local) or in the Room.
import './icons.js';
import * as R from './rules.js';
import { newTable, reduce, viewFor, scoreTotal, midStamper } from './table.js';
import { qrSvg, joinUrl } from './qr.js';
import { wakeReconnect } from './wake.js';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const K = { local: 'brass.local', last: 'brass.last', host: (c) => `brass.host.${c}`, seat: (c) => `brass.seat.${c}`, name: 'brass.name', sel: 'brass.sel' };
const icon = (id, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const ordinal = (n) => ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;
const clock = (t) => { const d = new Date(t); const m = String(d.getMinutes()).padStart(2, '0'); return `${d.getHours() % 12 || 12}:${m}`; };
const money = R.fmtMoney;

// ---- state -------------------------------------------------------------------------------------------------------------
const A = { page: 'start', mode: null, code: '', view: null, sel: null, sheet: null, conn: false, lobby: null, err: '', flash: '', draft: {}, qr: false, busy: false };
let T = null; // local table (pass-and-play)
let ws = null, timer = null, tries = 0, stopWake = null, wanted = false, hostSeated = false;

const seatOf = (id) => A.view?.seats.find((s) => s.id === id);
const me = () => A.view?.me;
const colourCss = (s) => R.colourOf(s.colour).css;
const tok = (s, cls = 'xs') => `<span class="tok ${cls}" style="--tok-bg:${colourCss(s)};--tok-rim:${colourCss(s)}"></span>`;
const canControl = (s) => !!s && ((me().host && s.where === 'local') || me().seatId === s.id);

function flash(msg) { A.flash = msg; render(); clearTimeout(flash.t); flash.t = setTimeout(() => { A.flash = ''; render(); }, 4500); }

// ---- transport ---------------------------------------------------------------------------------------------------------
function saveLocal() { store.set(K.local, JSON.stringify(T)); }
function localView() { A.view = viewFor(T, { host: true }); }
// Each change carries a message id, so the table applies it once (see midStamper in table.js).
const newMid = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('');
const stampMid = midStamper({ newMid });
function send(msg) {
  msg = stampMid(msg);
  if (A.mode === 'local') {
    const r = reduce(T, { host: true }, msg, Math.random, Date.now());
    if (r.error) { flash(r.error); return r; }
    const was = A.view?.phase; saveLocal(); localView();
    if (was === 'setup' && A.view.phase === 'turns') A.sel = defaultSeat()?.id; // first in the turn order
    if (A.sel) store.set(K.sel, A.sel);
    render(); return r;
  }
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); else flash('You’re offline. Reconnecting…');
  return null;
}
function closeSocket() { clearTimeout(timer); if (ws) { ws.onclose = null; try { ws.close(); } catch { /* closed */ } ws = null; } }
function connect() {
  closeSocket();
  const code = A.code;
  const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`);
  ws = s;
  s.onopen = () => {
    tries = 0; A.conn = true;
    const hostKey = store.get(K.host(code));
    const seat = (() => { try { return JSON.parse(store.get(K.seat(code)) || 'null'); } catch { return null; } })();
    if (hostKey) s.send(JSON.stringify({ type: 'hello', hostKey }));
    else if (seat) s.send(JSON.stringify({ type: 'hello', ...seat }));
    else s.send(JSON.stringify({ type: 'hello' }));
    render();
  };
  s.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (s !== ws) return;
    if (m.type === 'view') onView(m.view);
    else if (m.type === 'lobby') { A.lobby = m; A.page = 'join'; render(); }
    else if (m.type === 'joined') { store.set(K.seat(code), JSON.stringify({ seatId: m.seatId, token: m.token })); store.set(K.last, code); A.err = ''; }
    else if (m.type === 'error') { if (A.page === 'join') { A.err = m.error; render(); } else flash(m.error); }
    else if (m.type === 'fatal') {
      if (m.clear) { store.del(K.seat(code)); }
      leaveRoom(m.error);
    }
  };
  s.onclose = () => { if (s !== ws || !wanted) return; A.conn = false; render(); timer = setTimeout(connect, Math.min(8000, 400 * 2 ** tries++)); };
}
function openRoom(code) {
  A.mode = 'room'; A.code = code; wanted = true; hostSeated = false; A.conn = false;
  if (!stopWake) stopWake = wakeReconnect({ getSocket: () => ws, isStopped: () => !wanted, reconnect: () => { clearTimeout(timer); tries = 0; connect(); } });
  connect();
}
function leaveRoom(error = '') {
  wanted = false; closeSocket(); A.mode = null; A.view = null; A.page = 'start'; A.err = error; A.conn = false; A.sheet = null; store.del(K.last);
  try { history.replaceState(null, '', '/'); } catch { /* sandboxed */ }
  render();
}
function onView(v) {
  const was = A.view?.phase;
  A.view = v; A.page = A.page === 'log' ? 'log' : 'table'; A.err = '';
  if (me().host && v.seats.length === 0 && v.phase === 'setup' && !hostSeated) { hostSeated = true; send({ type: 'addSeat', name: store.get(K.name) || '', isHost: true }); }
  if (!A.sel || !seatOf(A.sel) || (was === 'setup' && v.phase === 'turns')) A.sel = defaultSeat()?.id ?? null;
  store.set(K.last, A.code);
  render();
}
function defaultSeat() {
  const v = A.view; if (!v) return null;
  if (!me().host) return seatOf(me().seatId) || v.seats[0];
  const cur = v.order.map(seatOf).find((s) => s && !s.done && s.where === 'local');
  return cur || v.seats.find((s) => s.where === 'local') || v.seats[0];
}

async function startTable() {
  if (A.busy) return; A.busy = true; A.err = ''; render();
  try {
    const res = await fetch('/api/create', { method: 'POST' });
    if (!res.ok) throw new Error('create');
    const { code, hostKey } = await res.json();
    store.set(K.host(code), hostKey);
    try { history.replaceState(null, '', `/?room=${code}`); } catch { /* sandboxed */ }
    A.busy = false; openRoom(code);
  } catch { A.busy = false; A.err = 'Couldn’t reach the server. Check your connection, or play on this phone only.'; render(); }
}
function startLocal(resume) {
  if (resume) { try { T = JSON.parse(store.get(K.local)); } catch { T = null; } }
  if (!T) { T = newTable(); reduce(T, { host: true }, { type: 'addSeat', name: store.get(K.name) || '', isHost: true }, Math.random, Date.now()); }
  A.mode = 'local'; A.code = ''; A.page = 'table'; A.sel = null; saveLocal(); localView(); A.sel = (resume && seatOf(store.get(K.sel))?.id) || defaultSeat()?.id; render();
}
async function joinCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { A.err = 'Room codes have 4 letters.'; return render(); }
  A.busy = true; A.err = ''; render();
  try {
    const res = await fetch(`/api/room/${code}`);
    A.busy = false;
    if (!res.ok) { A.err = 'No table has that code. Check the letters with the host.'; return render(); }
  } catch { A.busy = false; A.err = 'Couldn’t reach the server. Check your connection.'; return render(); }
  openRoom(code);
}

// ---- screens -----------------------------------------------------------------------------------------------------------
const dock = (inner) => `<div class="dock">${inner}</div>`;
const barHtml = (title, sub, right = '') => `<header class="bar rivets"><div style="flex:1"><h1 class="disp">${esc(title)}</h1><p>${esc(sub)}</p></div>${right}</header>`;

function startScreen() {
  const saved = store.get(K.local);
  return `<main style="padding-top:var(--s7);gap:var(--s6)">
 <div><h1 class="disp" style="font-size:3.4rem;line-height:.95">Brass<br>Wallet</h1><p class="tint" style="margin-top:var(--s3)">Money, loans, income and turn order for your Brass: Birmingham table. The board stays on the table.</p></div>
 <div style="display:flex;gap:var(--s3)"><span class="coin cu" style="width:72px;height:72px"><span>£${R.START_MONEY}</span></span><p class="sm tint" style="flex:1;align-self:center">Each player starts with £${R.START_MONEY} and income £0.</p></div>
 <section style="display:grid;gap:var(--s2)"><p class="grp">Join a table</p><form class="field${A.err && A.page === 'start' ? ' err' : ''}" data-form="join"><input id="code" name="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="Room code" aria-label="Room code" value="${esc(A.draft.code || '')}" data-in="code"><button class="add" type="submit"${A.busy ? ' disabled' : ''}>Join</button></form>
 ${A.err ? `<p class="why" role="alert" style="text-align:left;color:oklch(80% 0.1 50)">${esc(A.err)}</p>` : ''}</section>
 <p class="sm tint">No internet? <button class="link" data-act="local">Play on this phone only</button>${saved ? ` <button class="link" data-act="resume">Resume the saved table</button>` : ''}</p>
</main>${dock(`<button class="btn pri" data-act="create"${A.busy ? ' disabled' : ''}>Start a table</button>`)}`;
}

function joinScreen() {
  const l = A.lobby || {};
  const open = l.open || [];
  return `${barHtml('Join table ' + A.code, l.started ? 'The game has started' : 'Pick a name for your seat')}
<main style="padding-top:var(--s5);gap:var(--s4)">
 ${open.length ? `<section><p class="grp">Take an open seat</p><ul class="rows">${open.map((o) => `<li><button class="rowmain" data-act="claim" data-seat="${o.id}"><span class="t"><b>${esc(o.name)}</b><span>Open seat</span></span></button></li>`).join('')}</ul></section>` : ''}
 ${l.started && !open.length ? `<p class="sm tint">This game has started and no seat is open. Ask the host to open one.</p>` : ''}
 ${!l.started ? `<form data-form="name" style="display:grid;gap:var(--s2)"><label class="grp" for="nm">Your name</label><input id="nm" class="well" maxlength="${R.NAME_MAX}" autocomplete="off" value="${esc(A.draft.name ?? store.get(K.name) ?? '')}" data-in="name" placeholder="Your name"></form>` : ''}
 ${A.err ? `<p class="why" role="alert" style="text-align:left;color:oklch(80% 0.1 50)">${esc(A.err)}</p>` : ''}
 <p class="sm"><button class="link" data-act="leave">Back</button></p>
</main>${!l.started ? dock(`<button class="btn pri" data-act="join">Join the table</button>`) : ''}`;
}

function setupScreen(v) {
  const m = me(); const n = v.seats.length;
  if (!m.host) {
    return `${barHtml('Table ' + v.code, 'Waiting for the host to start')}<main style="padding-top:var(--s5);gap:var(--s4)"><p class="sm tint">You’re in. The host starts the game when everyone has a seat.</p>
 <ul class="rows">${v.seats.map((s) => `<li>${tok(s, 's')}<span class="t"><b>${esc(s.name)}${s.id === m.seatId ? ' (you)' : ''}</b><span>${seatWhere(s)}</span></span></li>`).join('')}</ul></main>`;
  }
  const open = v.seats.find((s) => s.open);
  let why = '', fix = '';
  if (n < R.MIN_PLAYERS) { why = 'Add a second player to start.'; fix = `<button class="link" data-act="addSeat">Add a seat on this phone</button>`; }
  else if (open) { why = `${open.name}’s seat is still open.`; fix = `<button class="link" data-act="menu" data-seat="${open.id}">Fix the seat</button>`; }
  const qr = v.code && A.qr ? `<div class="qrbox">${qrSvg(joinUrl(location.origin, v.code), 'QR code to join table ' + v.code)}</div>` : '';
  return `${barHtml('Your table', `${R.MIN_PLAYERS} to ${R.MAX_PLAYERS} players`)}
<main style="padding-top:var(--s5);gap:var(--s4)">
 ${v.code ? `<p class="sm tint" style="display:flex;align-items:center;gap:8px">${icon('qr-f', 'sm')}Players join with code <b style="color:var(--ink);letter-spacing:.08em">${esc(v.code)}</b><button class="link" style="margin-left:auto" data-act="qr">${A.qr ? 'Hide QR' : 'Show QR'}</button></p>${qr}`
   : `<p class="sm tint" style="display:flex;align-items:center;gap:8px">${icon('phone', 'sm')}This table is on this phone only. No room code.</p>`}
 <ul class="rows">${v.seats.map((s) => `<li>${tok(s, 's')}<span class="t"><b>${esc(s.name)}</b><span>${seatWhere(s)}</span></span><button class="more" data-act="menu" data-seat="${s.id}" aria-label="Seat options for ${esc(s.name)}">${icon('more')}</button></li>`).join('')}</ul>
 ${n < R.MAX_PLAYERS ? `<p><button class="link" data-act="addSeat">${icon('users', 'sm')}Add a seat on this phone</button></p>` : ''}
 <p class="xs tint">Pick the colour of your player mat. The first turn order is random.</p>
</main>${dock(`${why ? `<p class="why" id="why">${esc(why)} ${fix}</p>` : ''}<button class="btn pri" data-act="start"${why ? ' disabled aria-describedby="why"' : ''}>Start the canal era</button>`)}`;
}
function seatWhere(s) {
  if (s.open) return 'Open seat, waiting for a phone';
  if (s.where === 'local') return s.host ? 'This phone, host' : 'This phone';
  return s.online ? 'Their own phone' : 'Their own phone, reconnecting…';
}

const eraName = (v) => (v.era === 'canal' ? 'Canal era' : 'Rail era');
const actsHtml = (v, s, ctl) => {
  const dots = Array.from({ length: v.maxActions }, (_, i) => `<i class="${i < s.actions ? 'u' : ''}"></i>`).join('');
  const label = s.actions >= v.maxActions ? `Actions done, ${v.maxActions} of ${v.maxActions}` : `Action ${Math.min(s.actions + 1, v.maxActions)} of ${v.maxActions}`;
  return ctl && v.phase === 'turns' && !s.done
    ? `<button class="acts" data-act="action" data-seat="${s.id}" aria-label="${label}. Tap to count an action.">${dots}${label}</button>`
    : `<span class="acts">${dots}${s.done ? 'Turn ended' : label}</span>`;
};
function coinsHtml(v, s) {
  const c = (cls, face, label, act, extra = '') => `<button class="cn" data-act="${act}" data-seat="${s.id}" ${extra}><span class="coin ${cls}"><span>${face}</span></span>${label}</button>`;
  const links = v.era === 'canal'
    ? c('cu', '£' + R.CANAL_COST, 'Canal link', 'spend', `data-amount="${R.CANAL_COST}" data-kind="canal"`)
    : c('cu', '£' + R.RAIL_COST, 'Rail link', 'spend', `data-amount="${R.RAIL_COST}" data-kind="rail"`) + c('cu', '£' + R.DOUBLE_RAIL_COST, 'Two rail links', 'spend', `data-amount="${R.DOUBLE_RAIL_COST}" data-kind="rail2"`);
  return `<div class="coins">${links}${c('cu', '£…', 'Other cost', 'other')}${c('cu', '+' + R.LOAN_AMOUNT, 'Take a loan', 'loan')}${c('cu', '+' + R.MERCHANT_BONUS_MONEY, 'Merchant', 'merchant')}</div>
<div style="display:flex;gap:var(--s5)"><button class="link" data-act="incomeSheet" data-seat="${s.id}">${icon('up', 'sm')}Income spaces</button><button class="link" data-act="vpSheet" data-seat="${s.id}">${icon('star', 'sm')}Add VP</button></div>`;
}
function logRows(v, filterId, limit) {
  const rows = v.log.filter((l) => !filterId || l.seat === filterId).slice(0, limit);
  return rows.length ? rows.map((l) => `<p class="lg-row${/fixed/.test(l.text) ? ' fix' : ''}"><time>${clock(l.t)}</time><span>${esc(l.text)}</span></p>`).join('') : `<p class="lg-row">Nothing yet.</p>`;
}

function walletScreen(v) {
  const m = me(); const s = seatOf(A.sel) || defaultSeat();
  const ctl = canControl(s);
  const pos = v.order.indexOf(s.id) + 1;
  const own = m.seatId === s.id;
  const title = `${eraName(v)}, round ${v.round} of ${v.rounds}`;
  const sub = m.host ? (v.code ? `Room ${v.code}` : 'On this phone only') : `${s.name}, ${R.colourOf(s.colour).label.toLowerCase()}. You go ${ordinal(pos)}.`;
  const head = barHtml(title, sub, m.host ? `<button class="link q" data-act="page" data-page="log">${icon('book', 'sm')}Log</button>` : actsHtml(v, s, ctl));
  const chips = m.host ? `<nav class="seats" aria-label="Wallets">${v.seats.map((x) => `<button class="seat${x.id === s.id ? ' on' : ''}${x.where === 'remote' ? ' rem' : ''}" style="--c:${colourCss(x)}" data-act="pick" data-seat="${x.id}"${x.id === s.id ? ' aria-current="true"' : ''}><i></i>${esc(x.name)}</button>`).join('')}</nav>` : '';
  const where = s.where === 'local' ? (m.host ? ', on this phone' : '') : ', on their phone';
  const label = own ? `${esc(s.name)}’s money` : `${esc(s.name)}’s money${where}`;
  const acts = m.host ? actsHtml(v, s, ctl) : '';
  const stats = `<div class="sub2" style="margin-top:var(--s3)"><span>Spent <b>${money(s.spent)}</b></span><span>Income <b>${money(s.level)}</b></span><span>Loans <b>${s.loans}</b></span><span>VP <b>${s.vp}</b></span></div>`;
  const below = ctl ? coinsHtml(v, s)
    : `<p class="xs tint">${esc(s.name)} plays on their own phone. ${m.host ? 'You can see and fix their wallet.' : ''}</p>`;
  const rowLabel = m.host ? `<p class="sm tint" style="display:flex;justify-content:space-between;align-items:center;min-height:44px">${label} ${acts}</p>` : `<p class="sm tint">${label}</p>`;
  const hostLinks = m.host ? `<p class="sm" style="display:flex;gap:var(--s5);flex-wrap:wrap"><button class="link" data-act="fixSheet" data-seat="${s.id}">${icon('pen', 'sm')}Fix wallet</button>${s.where === 'remote' && R.ALLOW_SEAT_TAKEOVER ? `<button class="link" data-act="takeSheet" data-seat="${s.id}">Move to this phone</button>` : ''}</p>` : '';
  const ledger = `<section class="ledger" style="padding:var(--s2) 0"><p class="lg-row" style="font-weight:600;align-items:center">${esc(s.name)}’s log${s.canUndo && (ctl || m.host) ? `<button class="link" style="margin-left:auto" data-act="undo" data-seat="${s.id}">Undo last change</button>` : ''}</p>${logRows(v, s.id, 4)}</section>`;
  let dockHtml = '';
  if (ctl && v.phase === 'turns') {
    const waiting = v.seats.filter((x) => !x.done && x.id !== s.id);
    dockHtml = s.done
      ? `<p class="why" id="why">${esc(s.name)} ended their turn. ${waiting.length ? 'Waiting for ' + waiting.map((x) => esc(x.name)).join(', ') + '.' : ''} ${m.host ? '<button class="link" data-act="endRound">End the round now</button>' : ''}</p><button class="btn pri" disabled aria-describedby="why">Turn ended</button>`
      : `<button class="btn pri" data-act="endTurn" data-seat="${s.id}">${own ? 'End my turn' : `End ${esc(s.name)}’s turn`}</button>`;
  } else if (m.host && v.phase === 'turns') dockHtml = `<p class="why">${esc(s.name)} ends their own turn. <button class="link" data-act="endRound">End the round now</button></p>`;
  return `${head}${chips}<main style="padding-top:var(--s5);gap:var(--s5)"><section>${rowLabel}<p class="bal" aria-label="Money ${money(s.money)}">${money(s.money)}</p>${stats}</section>${below}${hostLinks}${ledger}${m.host && v.seats.some((x) => x.where === 'remote') ? `<p class="xs tint">${v.seats.filter((x) => x.where === 'remote').map((x) => esc(x.name)).join(' and ')} play on their own phones. Tap their names to see or fix their wallet.</p>` : ''}</main>${dockHtml ? dock(dockHtml) : ''}`;
}

function roundScreen(v) {
  const m = me(); const last = v.round === v.rounds; const lastGame = last && v.era === 'rail';
  const order = v.nextOrder.map(seatOf);
  const note = (s, i) => { const prev = order[i - 1]; const tie = prev && prev.spent === s.spent; return `spent ${money(s.spent)}${tie ? ', tie kept' : ''}`; };
  const plan = Object.fromEntries(v.plan.map((p) => [p.id, p]));
  const cell = (s) => { const p = plan[s.id]; if (lastGame) return 'no income'; return p.level >= 0 ? `+${money(p.level)}` : `pays ${money(-p.level)}${p.short ? `, short ${money(p.short)}` : ''}`; };
  const cta = lastGame ? 'Score the game' : last ? `Pay income, score the ${v.era} era` : `Pay income, start round ${v.round + 1}`;
  return `${barHtml(`End of round ${v.round}`, `${eraName(v)}, ${v.rounds - v.round} round${v.rounds - v.round === 1 ? '' : 's'} left`)}
<main style="padding-top:var(--s5);gap:var(--s6)">
 <section><h2 class="disp" style="font-size:var(--xl)">Next round’s order</h2><p class="sm tint" style="margin:6px 0 var(--s3)">Least spent goes first. Ties keep this round’s order.</p>
 <ol class="rows">${order.map((s, i) => `<li><span class="disp num" style="font-size:var(--xl);width:28px">${i + 1}</span>${tok(s)}<span class="t"><b>${esc(s.name)}</b></span><span class="tint sm">${note(s, i)}</span></li>`).join('')}</ol></section>
 <section class="ledger" style="padding:var(--s2) 0"><p class="lg-row" style="font-weight:600">Income</p>${v.seats.map((s) => `<p class="lg-row" style="justify-content:space-between"><span>${esc(s.name)}</span><b style="font-variant-numeric:tabular-nums">${cell(s)}</b></p>`).join('')}
 <p class="lg-row" style="font-size:var(--xs);color:oklch(40% 0.02 75)">${lastGame ? 'This was the last round, so no income is paid. ' : ''}Can’t pay? Sell an industry tile for half its cost, rounded down. Still short: lose 1 VP per £1.</p></section>
</main>${dock(m.host ? `<button class="btn pri" data-act="collect">${cta}</button>` : `<p class="why" id="why">The host closes the round.</p><button class="btn pri" disabled aria-describedby="why">${cta}</button>`)}`;
}

function scoringScreen(v) {
  const m = me(); const canal = v.era === 'canal';
  const missing = v.seats.find((s) => scoreTotal(v.scores[s.id]) === null);
  const cell = (s, k) => { const val = v.scores[s.id][k]; return m.host ? `<input inputmode="numeric" pattern="[0-9]*" value="${val ?? ''}" aria-label="${esc(s.name)} ${k}" data-in="score" data-seat="${s.id}" data-k="${k}" id="sc-${s.id}-${k}">` : `${val ?? '…'}`; };
  const rows = v.seats.map((s) => { const t = scoreTotal(v.scores[s.id]); return `<tr><td style="display:flex;align-items:center;gap:8px;min-height:56px">${tok(s)}${esc(s.name)}</td><td>${cell(s, 'links')}</td><td>${cell(s, 'tiles')}</td><td><b>${t ?? '…'}</b></td></tr>`; }).join('');
  const why = missing ? `Type ${esc(missing.name)}’s totals to continue.` : '';
  return `${barHtml(`End of the ${v.era} era`, 'Count on the board, type the totals')}
<main style="padding-top:var(--s5);gap:var(--s5)">
 <div class="ledger" style="padding:var(--s2) var(--s3)"><table class="sc"><tr><th>Player</th><th>Links</th><th>Tiles</th><th>Total VP</th></tr>${rows}</table></div>
 ${canal ? `<section><h2 class="disp" style="font-size:var(--lg)">Before the rail era</h2><ol style="margin-top:var(--s2);display:grid;gap:6px" class="sm tint"><li>1. Score each link, then flipped tiles.</li><li>2. Take level 1 tiles off the board.</li><li>3. Refill merchant beer, reshuffle, draw 8 each.</li></ol></section>`
   : `<p class="sm tint">After this, the game is over. Most VP wins. Ties go to the highest income, then the most money.</p>`}
</main>${dock(m.host ? `${why ? `<p class="why" id="why">${why} <button class="link" data-act="fillZero">Count blanks as 0</button></p>` : ''}<button class="btn pri" data-act="continue"${why ? ' disabled aria-describedby="why"' : ''}>${canal ? 'Start the rail era' : 'Finish the game'}</button>`
  : `<p class="why" id="why">The host types the totals.</p><button class="btn pri" disabled aria-describedby="why">${canal ? 'Start the rail era' : 'Finish the game'}</button>`)}`;
}

function overScreen(v) {
  const ranked = v.final.map(seatOf); const win = ranked[0];
  const tie = ranked.length > 1 && ranked[1].vp === win.vp;
  return `${barHtml('Game over', `${v.seats.length} players`)}
<main style="padding-top:var(--s5);gap:var(--s5)"><div class="win-card"><p class="sm">${tie ? 'Tie on VP, so income decides' : 'Winner'} · ${win.vp} VP</p><h2 class="disp win">${esc(win.name)} wins</h2></div>
 <ol class="rows">${ranked.map((s, i) => `<li><span class="disp num" style="font-size:var(--xl);width:28px">${i + 1}</span>${tok(s)}<span class="t"><b>${esc(s.name)}</b><span>Income ${money(s.level)}, money ${money(s.money)}</span></span><span class="n">${s.vp} VP</span></li>`).join('')}</ol>
 <section class="ledger" style="padding:var(--s2) 0"><p class="lg-row" style="font-weight:600">Table log</p>${logRows(v, null, 6)}</section>
</main>${dock(me().host ? `<button class="btn pri" data-act="again">Play again with the same seats</button>` : `<p class="why">The host can start a new game.</p>`)}`;
}

function logScreen(v) {
  return `${barHtml('Table log', 'Every change, newest first', `<button class="link q" data-act="page" data-page="table">Back</button>`)}
<main style="padding-top:var(--s4)"><section class="ledger" style="padding:var(--s2) 0">${logRows(v, null, R.LOG_MAX)}</section></main>`;
}

// ---- sheets ------------------------------------------------------------------------------------------------------------
function stepper(key, val, fmt, label) {
  return `<li><span class="t"><b>${label[0].toUpperCase() + label.slice(1)}</b></span><span class="stp"><button data-act="step" data-key="${key}" data-d="-1" aria-label="Less ${label}">−</button><b>${fmt(val)}</b><button data-act="step" data-key="${key}" data-d="1" aria-label="More ${label}">+</button></span></li>`;
}
function sheetHtml(v) {
  const sh = A.sheet; if (!sh) return '';
  const s = sh.seat ? seatOf(sh.seat) : null;
  const fresh = !sh.shown; sh.shown = true;
  const wrap = (label, body) => `<div class="${fresh ? 'anim' : ''}"><div class="scrim" data-act="closeSheet"></div><dialog open class="sheet" style="border:0;color:var(--ink);width:auto;margin:0" aria-label="${esc(label)}">${body}</dialog></div>`;
  if (sh.kind === 'other') return wrap('Other cost', `<h2 class="disp" style="font-size:var(--xl)">${esc(s.name)} spends</h2><p class="sm tint">Type the cost in £. It goes back to the bank.</p>
   <form data-form="other" style="display:grid;gap:var(--s3)"><input id="amt" class="well big-in" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Cost in pounds" placeholder="£0" value="${esc(sh.amount ?? '')}" data-in="amount"><button class="btn pri" type="submit">Spend</button></form>`);
  if (sh.kind === 'income') {
    const to = R.clampSpace(s.space + sh.n);
    return wrap('Income spaces', `<h2 class="disp" style="font-size:var(--xl)">Move ${esc(s.name)}’s income</h2><p class="sm tint">Income is £${s.level} now. Count the spaces on the board.</p>
   <ul class="rows">${stepper('n', sh.n, (n) => (n > 0 ? '+' + n : String(n).replace('-', '−')), 'spaces')}</ul><p class="sm">New income <b>${money(R.incomeOfSpace(to))}</b></p><button class="btn pri" data-act="saveIncome"${sh.n === 0 ? ' disabled' : ''}>Move income</button>`);
  }
  if (sh.kind === 'vp') return wrap('Add VP', `<h2 class="disp" style="font-size:var(--xl)">${esc(s.name)}’s VP</h2><p class="sm tint">${s.vp} now. Use minus to take VP away.</p>
   <ul class="rows">${stepper('n', sh.n, (n) => (n > 0 ? '+' + n : String(n).replace('-', '−')), 'VP')}</ul><button class="btn pri" data-act="saveVp"${sh.n === 0 ? ' disabled' : ''}>Save VP</button>`);
  if (sh.kind === 'fix') return wrap(`Fix ${s.name}’s wallet`, `<div style="display:flex;gap:var(--s3);align-items:center">${tok(s, 's')}<h2 class="disp" style="font-size:var(--xl)">Fix ${esc(s.name)}’s wallet</h2></div>
   <p class="sm tint">${s.where === 'remote' ? `${esc(s.name)} plays on their own phone. ` : ''}The fix shows in their log and the table log.</p>
   <ul class="rows">${stepper('money', sh.money, money, 'money')}${stepper('level', sh.level, money, 'income')}${stepper('vp', sh.vp, String, 'VP')}</ul>
   <input class="well" maxlength="80" placeholder="Reason, for the log (optional)" aria-label="Reason" value="${esc(sh.reason || '')}" data-in="reason">
   <div style="display:grid;gap:2px"><button class="btn pri" data-act="saveFix">Save fix</button>${s.canUndo ? `<button class="link" style="justify-self:center" data-act="undoHost" data-seat="${s.id}">Undo ${esc(s.name)}’s last change</button>` : ''}</div>`);
  if (sh.kind === 'take') return wrap('Move seat', `<h2 class="disp" style="font-size:var(--xl)">Move ${esc(s.name)} to this phone?</h2><p class="sm tint">Use this when ${esc(s.name)}’s phone dropped. Their wallet and log stay as they are. Their old phone is cut off from this seat.</p>
   <div style="display:grid;gap:var(--s2)"><button class="btn pri" data-act="takeConfirm" data-seat="${s.id}">Move ${esc(s.name)} here</button><button class="btn sec" data-act="closeSheet">Cancel</button></div>`);
  if (sh.kind === 'menu') {
    const online = A.mode === 'room';
    return wrap('Seat options', `<div style="display:flex;gap:var(--s3);align-items:center">${tok(s, 's')}<h2 class="disp" style="font-size:var(--xl)">${esc(s.name)}</h2></div>
   <form data-form="rename" style="display:grid;gap:var(--s2)"><input id="rn" class="well" maxlength="${R.NAME_MAX}" aria-label="Name" value="${esc(sh.name)}" data-in="rename"><button class="btn sec" type="submit">Save name</button></form>
   <div><p class="grp">Colour</p><div class="sw">${R.COLOURS.map((c) => `<button style="--c:${c.css}" data-act="colour" data-seat="${s.id}" data-colour="${c.id}" aria-label="${c.label}" aria-pressed="${s.colour === c.id}"></button>`).join('')}</div></div>
   <div style="display:grid;gap:2px">${s.where === 'remote' ? `<button class="link" data-act="toLocal" data-seat="${s.id}">Play on this phone instead</button>` : ''}${online && s.where === 'local' && !s.host ? `<button class="link" data-act="release" data-seat="${s.id}">Let them join on their own phone</button>` : ''}${!s.host ? `<button class="link" data-act="remove" data-seat="${s.id}">Remove this seat</button>` : ''}</div>
   <button class="btn sec" data-act="closeSheet">Done</button>`);
  }
  return '';
}

// ---- render ------------------------------------------------------------------------------------------------------------
function body() {
  const v = A.view;
  if (A.page === 'start' || (!v && A.page !== 'join')) return startScreen();
  if (A.page === 'join') return joinScreen();
  if (!v) return startScreen();
  if (A.page === 'log') return logScreen(v);
  if (v.phase === 'setup') return setupScreen(v);
  if (v.phase === 'endround') return roundScreen(v);
  if (v.phase === 'scoring') return scoringScreen(v);
  if (v.phase === 'over') return overScreen(v);
  return walletScreen(v);
}
function render() {
  const active = document.activeElement;
  const keep = active && active.id && $app.contains(active) && active.tagName === 'INPUT' ? { id: active.id, val: active.value, s: active.selectionStart, e: active.selectionEnd } : null;
  const v = A.view;
  $app.innerHTML = `${A.mode === 'room' && !A.conn ? `<p class="banner" role="status" id="reconnecting">Reconnecting…</p>` : ''}<div class="screen grain">${body()}</div>${v ? sheetHtml(v) : ''}${A.flash ? `<p class="flash" role="status">${esc(A.flash)}</p>` : ''}`;
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.val; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { /* not text */ } } }
  else if (A.sheet?.focus) { const el = document.getElementById(A.sheet.focus); A.sheet.focus = null; el?.focus(); }
  document.title = v?.phase && v.phase !== 'setup' ? `Brass Wallet: ${v.era} round ${v.round}` : 'Brass Wallet';
}

// ---- events ------------------------------------------------------------------------------------------------------------
const num = (x) => { const n = Number(String(x).replace(/[£\s]/g, '')); return Number.isInteger(n) ? n : NaN; };
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset; const v = A.view;
  const seat = d.seat;
  switch (d.act) {
    case 'create': return startTable();
    case 'local': return startLocal(false);
    case 'resume': return startLocal(true);
    case 'leave': return leaveRoom();
    case 'join': return doJoin();
    case 'claim': return doJoin(seat);
    case 'qr': A.qr = !A.qr; return render();
    case 'page': A.page = d.page; return render();
    case 'pick': A.sel = seat; return render();
    case 'closeSheet': A.sheet = null; return render();
    case 'start': case 'collect': case 'again': case 'endRound': return send({ type: d.act });
    case 'continue': return send({ type: 'continue' });
    case 'fillZero': v.seats.forEach((s) => send({ type: 'scoreZero', seat: s.id })); return;
    case 'addSeat': return send({ type: 'addSeat' });
    case 'spend': return send({ type: 'spend', seat, amount: Number(d.amount), kind: d.kind });
    case 'loan': case 'merchant': case 'endTurn': return send({ type: d.act, seat });
    case 'undo': return send({ type: 'undo', seat });
    case 'action': { const s = seatOf(seat); return send({ type: 'action', seat, n: s.actions >= v.maxActions ? 0 : s.actions + 1 }); }
    case 'other': A.sheet = { kind: 'other', seat, focus: 'amt' }; return render();
    case 'incomeSheet': A.sheet = { kind: 'income', seat, n: 1 }; return render();
    case 'vpSheet': A.sheet = { kind: 'vp', seat, n: 1 }; return render();
    case 'fixSheet': { const s = seatOf(seat); A.sheet = { kind: 'fix', seat, money: s.money, level: s.level, vp: s.vp, reason: '' }; return render(); }
    case 'takeSheet': A.sheet = { kind: 'take', seat }; return render();
    case 'menu': A.sheet = { kind: 'menu', seat, name: seatOf(seat).name }; return render();
    case 'step': {
      const sh = A.sheet; const k = d.key; const dd = Number(d.d);
      if (k === 'n') sh.n += dd; else if (k === 'money') sh.money = Math.max(0, sh.money + dd); else if (k === 'level') sh.level = Math.max(R.MIN_LEVEL, Math.min(R.MAX_LEVEL, sh.level + dd)); else sh.vp += dd;
      return render();
    }
    case 'saveIncome': { const sh = A.sheet; A.sheet = null; return send({ type: 'income', seat: sh.seat, spaces: sh.n }); }
    case 'saveVp': { const sh = A.sheet; A.sheet = null; return send({ type: 'vp', seat: sh.seat, n: sh.n }); }
    case 'saveFix': {
      const sh = A.sheet; const s = seatOf(sh.seat); const msg = { type: 'fix', seat: sh.seat, reason: sh.reason };
      if (sh.money !== s.money) msg.money = sh.money;
      if (sh.level !== s.level) msg.space = R.topSpaceOfLevel(sh.level);
      if (sh.vp !== s.vp) msg.vp = sh.vp;
      if (Object.keys(msg).length === 3) { A.sheet = null; return render(); }
      A.sheet = null; return send(msg);
    }
    case 'undoHost': { const reason = A.sheet?.reason || ''; A.sheet = null; return send({ type: 'undo', seat, reason }); }
    case 'takeConfirm': A.sheet = null; return send({ type: 'toLocal', seat });
    case 'colour': return send({ type: 'colour', seat, colour: d.colour });
    case 'toLocal': case 'release': case 'remove': A.sheet = null; return send({ type: d.act, seat });
    default: break;
  }
});
function doJoin(seat) {
  const name = (A.draft.name ?? store.get(K.name) ?? '').trim();
  if (!seat && !name) { A.err = 'Type your name first.'; return render(); }
  if (!ws || ws.readyState !== 1) { A.err = 'Not connected yet. Try again in a second.'; return render(); }
  if (name) store.set(K.name, name);
  ws.send(JSON.stringify(stampMid({ type: 'hello', join: name || 'Player', seat })));
}
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  const kind = f.dataset.form;
  if (kind === 'join') return joinCode(document.getElementById('code').value);
  if (kind === 'name') return doJoin();
  if (kind === 'other') {
    const n = num(document.getElementById('amt').value); const sh = A.sheet;
    if (!(n > 0)) return flash('Type a whole amount of £1 or more.');
    A.sheet = null; return send({ type: 'spend', seat: sh.seat, amount: n, kind: 'other' });
  }
  if (kind === 'rename') { const sh = A.sheet; A.sheet = null; return send({ type: 'rename', seat: sh.seat, name: sh.name }); }
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-in]'); if (!el) return;
  const k = el.dataset.in;
  if (k === 'code') A.draft.code = el.value.toUpperCase();
  else if (k === 'name') A.draft.name = el.value;
  else if (k === 'amount' && A.sheet) A.sheet.amount = el.value;
  else if (k === 'reason' && A.sheet) A.sheet.reason = el.value;
  else if (k === 'rename' && A.sheet) A.sheet.name = el.value;
  else if (k === 'score') { const raw = el.value.trim(); send({ type: 'score', seat: el.dataset.seat, [el.dataset.k]: raw === '' ? null : num(raw) }); }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && A.sheet) { A.sheet = null; render(); } });

// ---- boot --------------------------------------------------------------------------------------------------------------
(function boot() {
  const q = new URLSearchParams(location.search).get('room');
  const last = store.get(K.last);
  const code = (q || last || '').toUpperCase();
  if (/^[A-Z]{4}$/.test(code) && (store.get(K.host(code)) || store.get(K.seat(code)) || q)) { render(); return openRoom(code); }
  render();
})();
