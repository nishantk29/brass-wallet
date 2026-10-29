// Brass Wallet: every number and every open-question default lives here. Change a default in this file only.
// Source: Roxley rulebook v2018.11 (numbers only; no rules text is copied). The board stays on the table.

export const RULES_VERSION = 1; // pinned per table: a table keeps the rules it started with

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const START_MONEY = 17;
export const START_INCOME_SPACE = 10; // level 0, income £0
export const START_VP = 0;
export const ROUNDS_PER_ERA = { 2: 10, 3: 9, 4: 8 };
export const ACTIONS_PER_TURN = 2;
export const ACTIONS_FIRST_CANAL_ROUND = 1;

export const LOAN_AMOUNT = 30;
export const LOAN_LEVELS = 3; // income moves back this many LEVELS (not spaces)
export const MIN_LEVEL = -10; // a loan that would end below this level is refused
export const MAX_LEVEL = 30;
export const MAX_SPACE = 99;

export const CANAL_COST = 3;
export const RAIL_COST = 5;
export const DOUBLE_RAIL_COST = 15; // two rail links plus 1 beer
export const MERCHANT_BONUS_MONEY = 5; // Warrington
export const MERCHANT_BONUS_SPACES = 2; // Oxford

// Open question 1: default; confirm against the board (open question).
// Each row: [first space, last space, first level, spaces per level]. The last level (30) has 3 spaces: 97 to 99.
export const INCOME_TRACK = [
  [0, 10, -10, 1],
  [11, 30, 1, 2],
  [31, 60, 11, 3],
  [61, 99, 21, 4],
];

// Open question 2: keep the end-of-era helper (type link VP and tile VP, the app adds them up).
export const SCORING_HELPER = true;
// Open question (seating): a dropped remote player's seat can move to the host phone after a confirm.
export const ALLOW_SEAT_TAKEOVER = true;

export const NAME_MAX = 20;
export const LOG_MAX = 400; // entries kept in the table log
export const UNDO_DEPTH = 30; // per seat

// Player mat colours (OKLCH, from the mockups).
export const COLOURS = [
  { id: 'red', label: 'Red', css: 'oklch(60% 0.17 28)' },
  { id: 'yellow', label: 'Yellow', css: 'oklch(82% 0.14 90)' },
  { id: 'purple', label: 'Purple', css: 'oklch(58% 0.14 300)' },
  { id: 'teal', label: 'Teal', css: 'oklch(68% 0.11 190)' },
];
export const colourOf = (id) => COLOURS.find((c) => c.id === id) || COLOURS[0];

export const roundsFor = (players) => ROUNDS_PER_ERA[players] ?? ROUNDS_PER_ERA[MAX_PLAYERS];
export const actionsFor = (era, round) => (era === 'canal' && round === 1 ? ACTIONS_FIRST_CANAL_ROUND : ACTIONS_PER_TURN);

const rowOfSpace = (s) => INCOME_TRACK.find(([a, b]) => s >= a && s <= b);
export const clampSpace = (s) => Math.max(0, Math.min(MAX_SPACE, Math.trunc(s)));

/** Income level (−10 to 30) of a track space. */
export function levelOfSpace(space) {
  const s = clampSpace(space);
  const [a, , l0, per] = rowOfSpace(s);
  return Math.min(MAX_LEVEL, l0 + Math.floor((s - a) / per));
}
/** The highest space of a level (a loan lands here). */
export function topSpaceOfLevel(level) {
  const l = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
  for (let i = INCOME_TRACK.length - 1; i >= 0; i--) {
    const [a, b, l0, per] = INCOME_TRACK[i];
    if (l >= l0) return Math.min(b, a + (l - l0 + 1) * per - 1);
  }
  return 0;
}
/** Income in £ for a space: the level itself (negative means pay). */
export const incomeOfSpace = (space) => levelOfSpace(space);

/** Space after a loan, or null when the loan is refused (it would end below MIN_LEVEL). */
export function spaceAfterLoan(space) {
  const next = levelOfSpace(space) - LOAN_LEVELS;
  return next < MIN_LEVEL ? null : topSpaceOfLevel(next);
}

/** Next turn order: least spent first; ties keep their current relative order. spent: { id: n }. */
export function nextOrder(order, spent) {
  return order.map((id, i) => ({ id, i, s: spent[id] || 0 })).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.id);
}

export const fmtMoney = (n) => (n < 0 ? '−£' + -n : '£' + n);
export const fmtSigned = (n) => (n < 0 ? '−£' + -n : '+£' + n);
