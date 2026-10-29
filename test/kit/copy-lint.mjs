// Shared copy lint (Nishant 2026-10-28: "Make sure the text is checked to avoid AI wording").
// Import in each game's test gate and run over all user-facing strings (FAQ, roles, narration, buttons, tips).
export const BANNED = [
  /\bdelv(e|es|ing)\b/i, /\bseamless(ly)?\b/i, /\belevat(e|es|ed|ing)\b/i, /\bembark/i, /\bunleash/i,
  /\bimmersive\b/i, /\bexperience the\b/i, /\bwhether you['’]?re\b/i, /\bgame[- ]changer\b/i, /\brobust\b/i,
  /\bleverag(e|es|ed|ing)\b/i, /\btapestry\b/i, /\bunlock(s|ing)? (the|your)\b/i, /\bin today['’]?s\b/i,
  /\bnavigat(e|ing) the\b/i, /\bharness(es|ing)? the\b/i, /\bmeticulous/i, /\bcutting[- ]edge\b/i,
  /\bbuckle up\b/i, /\bthrilling\b/i, /\bep(ic|ically)\b/i, /\bultimate\b/i, /\brealm\b/i,
  /\bit['’]?s worth noting\b/i, /\bfurthermore\b/i, /\bmoreover\b/i, /\bdive (in|into)\b/i,
];
// Heuristics: more than one em dash in a sentence; three comma-separated adjectives before a noun is reviewed by hand.
export function lintCopy(text) {
  const issues = [];
  for (const re of BANNED) { const m = text.match(re); if (m) issues.push(`banned phrase: "${m[0]}"`); }
  for (const s of text.split(/(?<=[.!?])\s+/)) if ((s.match(/\u2014/g) || []).length > 1) issues.push(`em-dash heavy: "${s.slice(0, 60)}..."`);
  return issues;
}
