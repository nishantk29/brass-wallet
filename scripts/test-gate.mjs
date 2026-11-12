// @ts-check
// Reusable deploy gate: runs `node --test` over a glob and reports { ok, pass, fail }. No dependencies.
// Use in another repo: copy this one file into its scripts/ folder and, at the top of its build-deploy script, before
// anything is written:   const g = await runGate({ cwd: process.cwd() });
//                        if (!g.ok) { console.error(`Deploy file NOT written: ${g.fail} test(s) failed`); process.exit(1); }
// CLI: `node scripts/test-gate.mjs [glob]` exits 1 on any failure (also when no test files match or the run crashes).
//      `node scripts/test-gate.mjs --types [glob]` also type-checks every file that opts in with `// @ts-check` (see typeCheck).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Node 20 has no glob in --test, so expand "dir/*.test.js" ourselves (a wildcard in the last path segment only).
/** @param {string} cwd @param {string} pattern @returns {string[]} */
export function expandGlob(cwd, pattern) {
  const dir = path.dirname(pattern), base = path.basename(pattern);
  if (!base.includes('*')) return fs.existsSync(path.join(cwd, pattern)) ? [pattern] : [];
  const re = new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const abs = path.join(cwd, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));
}

// Inside another `node --test` run (the gate's own test) this variable would make the child emit machine output, not TAP.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'));

/** @typedef {{ ok: boolean, pass: number, fail: number }} GateResult */

/**
 * @param {{ cwd?: string, files?: string | string[], quiet?: boolean }} [o]
 * @returns {Promise<GateResult>}
 */
export function runGate({ cwd = process.cwd(), files = 'test/*.test.js', quiet = false } = {}) {
  const list = (Array.isArray(files) ? files : [files]).flatMap((g) => expandGlob(cwd, g));
  if (!list.length) { if (!quiet) console.error(`test gate: no test files match ${files}`); return Promise.resolve({ ok: false, pass: 0, fail: 1 }); }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...list], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv });
    let out = '';
    /** @type {string[]} */
    const failed = [];
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { if (!quiet) process.stderr.write(d); });
    child.on('error', (e) => { if (!quiet) console.error('test gate: could not start node --test:', e.message); resolve({ ok: false, pass: 0, fail: 1 }); });
    child.on('close', (code) => {
      const n = (/** @type {string} */ k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] || 0);
      for (const m of out.matchAll(/^not ok \d+ - (.*)$/gm)) failed.push(m[1]);
      let pass = n('pass'), fail = n('fail');
      if (code !== 0 && fail === 0) fail = 1; // crashed run: never report green
      if (code === 0 && pass === 0) fail = 1; // nothing ran
      if (!quiet) {
        console.log(`test gate: ${list.length} files, ${pass} passed, ${fail} failed`);
        for (const f of failed.slice(0, 20)) console.log(`  FAILED: ${f}`);
      }
      resolve({ ok: code === 0 && fail === 0, pass, fail });
    });
  });
}

// ---- type check (opt-in per file) ----
// JSDoc types checked by TypeScript without a build step: a file opts in with `// @ts-check` in its first 5 lines, and
// `tsc --noEmit --allowJs` checks exactly those files (and what they import). Nothing changes at runtime.
// tsc comes from $TSC, then <repo>/node_modules/.bin/tsc (TypeScript is an optional dev tool). With no tsc the check
// reports `skipped` and does not fail, so the deploy gate keeps working on a machine without TypeScript.
const TS_DIRS = ['scripts', 'src', 'public/js', 'test/e2e'];
/** @param {string} cwd @returns {string[]} */
export function tsCheckFiles(cwd) {
  /** @type {string[]} */
  const out = [];
  for (const d of TS_DIRS) {
    const abs = path.join(cwd, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).sort()) {
      if (!/\.(m?js)$/.test(f)) continue;
      const head = fs.readFileSync(path.join(abs, f), 'utf8').split('\n', 5).join('\n');
      if (/^\s*\/\/\s*@ts-check\b/m.test(head)) out.push(path.join(d, f));
    }
  }
  return out;
}
/** @param {string} cwd @returns {{ tsc: string, types: string } | null} */
function findTsc(cwd) {
  const cands = [process.env.TSC, path.join(cwd, 'node_modules/.bin/tsc')].filter(Boolean);
  for (const c of /** @type {string[]} */ (cands)) if (fs.existsSync(c)) return { tsc: c, types: path.resolve(path.dirname(c), '..', '@types') };
  return null;
}
/**
 * @param {{ cwd?: string, quiet?: boolean }} [o]
 * @returns {Promise<{ ok: boolean, files: number, errors: number, skipped?: string }>}
 */
export function typeCheck({ cwd = process.cwd(), quiet = false } = {}) {
  const files = tsCheckFiles(cwd);
  const say = (/** @type {string} */ m) => { if (!quiet) console.log(m); };
  if (!files.length) { say('type check: no files opt in with // @ts-check'); return Promise.resolve({ ok: true, files: 0, errors: 0, skipped: 'no files' }); }
  const t = findTsc(cwd);
  if (!t) { say(`type check: skipped (${files.length} files opt in, but no TypeScript here; set TSC=...)`); return Promise.resolve({ ok: true, files: files.length, errors: 0, skipped: 'no tsc' }); }
  const args = ['--noEmit', '--allowJs', '--checkJs', '--skipLibCheck', '--strict', 'false', '--noImplicitAny', '--target', 'es2022', '--module', 'nodenext',
    '--moduleResolution', 'nodenext', '--lib', 'es2023,dom,dom.iterable', '--typeRoots', t.types, '--types', 'node', '--pretty', 'false', ...files];
  return new Promise((resolve) => {
    const child = spawn(t.tsc, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { say(`type check: could not start tsc: ${e.message}`); resolve({ ok: false, files: files.length, errors: 1 }); });
    child.on('close', (code) => {
      const errors = (out.match(/error TS\d+/g) || []).length || (code ? 1 : 0);
      say(`type check: ${files.length} files, ${errors} errors`);
      if (errors && !quiet) console.log(out.split('\n').filter((l) => /error TS/.test(l)).slice(0, 20).map((l) => '  ' + l).join('\n'));
      resolve({ ok: code === 0, files: files.length, errors });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2); const types = args.includes('--types');
  const glob = args.find((a) => !a.startsWith('--')) || 'test/*.test.js';
  const { ok } = await runGate({ cwd: process.cwd(), files: glob });
  const tc = types ? await typeCheck({ cwd: process.cwd() }) : { ok: true };
  process.exit(ok && tc.ok ? 0 : 1);
}
