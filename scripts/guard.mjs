#!/usr/bin/env node
// Repo guard: cheap, dependency-free checks for mistakes that keep coming back.
// Each rule below replaced a written instruction. Fix the cause the message names;
// do not add an exception unless the match is a real false positive (guard.config.json "allow").
//
//   node scripts/guard.mjs          scan tracked files (+ built output that exists)
//
// guard.config.json: { "public": bool, "ship": [dirs served to users], "allow": [exact phrases],
//                      "data": [third-party data dirs: secrets/paths only], "gitignore": [required lines] }
// GUARD_EXTRA_HASHES (env, optional): comma-separated extra banned-token hashes kept out of the repo.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const cfg = existsSync('guard.config.json') ? JSON.parse(readFileSync('guard.config.json', 'utf8')) : {};
const isPublic = cfg.public !== false;
const ship = cfg.ship ?? ['public', 'src'];
const allow = cfg.allow ?? [];
const data = cfg.data ?? [];
const TEXT = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.json', '.jsonc',
  '.md', '.txt', '.svg', '.xml', '.webmanifest', '.toml', '.yml', '.yaml', '.py', '.sh', '.vue', '']);
const SKIP = /(^|\/)(node_modules|\.git|package-lock\.json$)/;
const MAX = 3_000_000;

// Banned tokens are stored as short sha256 prefixes so the words themselves never land in a public file.
// Owner name (case-insensitive) -> use the public alias "Hate the Spurs" instead.
const NAME = new Set(['6277a58afca4', '61fbd0ff6853', 'e051d8db330b']);
// Internal helper names (case-sensitive) -> describe the role ("the maintainer") instead.
const BOTS = new Set(['8899ecd1626d', 'f7647fe6c153', '676e2d10c4e5', '8a1db462be75']);
const EXTRA = new Set((process.env.GUARD_EXTRA_HASHES ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const memo = new Map();
const h = (s) => (memo.has(s) ? memo.get(s) : (memo.set(s, hash(s)), memo.get(s)));

const LOCAL_PATH = new RegExp(['', 'workspace', ''].join('\\/') + '|' + ['', 'home', 'box', ''].join('\\/'));
const SECRETS = [
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{50,}/, 'GitHub token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic key'],
  [/\bsk-(proj-)?[A-Za-z0-9]{32,}\b/, 'API key (sk-)'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS key'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\b(api[_-]?key|secret|token|password)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i, 'hard-coded credential'],
];
// Theme is automatic (prefers-color-scheme). A visible Light/Dark switch keeps getting re-added.
const DARK_TOGGLE = [
  />\s*Dark(\s+mode)?\s*</,
  /\b(value|data-theme|data-set-theme)\s*=\s*["']dark["']/i,
  /aria-label\s*=\s*["'][^"']*(?<![\w-])(dark|light)\s+(mode|theme)/i,
  /\btheme-?toggle\b/i,
];

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const built = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p); else built.push(p);
  }
};
for (const d of ship) if (existsSync(d) && statSync(d).isDirectory()) walk(d);
const files = [...new Set([...tracked, ...built])].filter((f) => !SKIP.test(f) && existsSync(f));
const under = (dirs) => (f) => dirs.some((d) => f === d || f.startsWith(d + '/'));
const shipped = under(ship);
const isData = under(data);
const self = (f) => f.endsWith('guard.mjs') || f === 'guard.config.json';

const fails = [];
const fail = (f, line, rule, fix) => fails.push(`${f}${line ? ':' + line : ''}  ${rule}. ${fix}`);

for (const f of tracked) {
  if (isPublic && !f.includes('/') && f.endsWith('.sh')) fail(f, 0, 'shell script at repo root', 'Use a node script under scripts/ or keep it out of the repo.');
}
for (const g of cfg.gitignore ?? []) {
  const gi = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8').split('\n').map((s) => s.trim()) : [];
  if (!gi.includes(g)) fail('.gitignore', 0, `missing "${g}"`, 'Add it; that folder must never be committed.');
  const dir = g.replace(/\/$/, '');
  if (tracked.some((t) => t === dir || t.startsWith(dir + '/'))) fail(dir, 0, 'committed work folder', 'git rm --cached it.');
}

for (const f of files) {
  if (self(f) || !TEXT.has(extname(f).toLowerCase())) continue;
  let st; try { st = statSync(f); } catch { continue; }
  if (!st.isFile() || st.size > MAX) continue;
  const strict = isPublic || shipped(f); // private repos: only what users can see
  let text = readFileSync(f, 'utf8');
  for (const a of allow) text = text.split(a).join(' ');
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    const n = i + 1;
    for (const [re, what] of SECRETS) if (re.test(ln)) fail(f, n, `possible ${what}`, 'Move it to a Worker/Actions secret and rotate it.');
    if (!strict) return;
    if (LOCAL_PATH.test(ln)) fail(f, n, 'machine-local path', 'Use a repo-relative path.');
    if (isData(f)) return;
    if (shipped(f) && !/\.(css)$/.test(f)) for (const re of DARK_TOGGLE) if (re.test(ln)) { fail(f, n, 'light/dark toggle', 'Follow prefers-color-scheme; no visible theme switch.'); break; }
    for (const w of ln.match(/[A-Za-z][A-Za-z]+/g) ?? []) {
      if (NAME.has(h(w.toLowerCase()))) fail(f, n, 'owner real name', 'Use "Hate the Spurs".');
      else if (BOTS.has(h(w))) fail(f, n, 'internal helper name', 'Say "the maintainer" or drop it.');
      else if (EXTRA.size && EXTRA.has(h(w.toLowerCase()))) fail(f, n, 'banned word', 'Remove it.');
    }
  });
}

if (fails.length) {
  console.error(`guard: ${fails.length} problem(s)\n` + fails.slice(0, 50).map((s) => '  ' + s).join('\n'));
  process.exit(1);
}
console.log(`guard: ok (${files.length} files)`);
