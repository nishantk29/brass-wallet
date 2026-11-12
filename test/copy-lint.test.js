import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lintCopy, BANNED } from './kit/copy-lint.mjs';

// Every user-facing file: string literals, template text and the HTML pages.
const files = ['public/js/app.js', 'public/js/table.js', 'public/js/room.js', 'public/js/rules.js', 'src/worker.js', 'public/index.html', 'public/404.html'];
const strings = (src) => [...src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*?)\1/g)].map((m) => m[2]).concat([...src.matchAll(/>([^<>{}$]{6,})</g)].map((m) => m[1]));
test('copy: no banned phrases in any user-facing string', () => {
  const bad = [];
  for (const f of files) for (const s of strings(fs.readFileSync(f, 'utf8'))) { const i = lintCopy(s); if (i.length) bad.push(`${f}: ${s.slice(0, 50)} ${i}`); }
  assert.deepEqual(bad, []);
});
test('copy: shared banned-phrase list also clean', () => {
  const bad = [];
  for (const f of files) for (const s of strings(fs.readFileSync(f, 'utf8'))) for (const re of BANNED) if (re.test(s)) bad.push(`${f}: ${s.slice(0, 50)}`);
  assert.deepEqual(bad, []);
});
test('copy: no em dashes in UI files, no Limelight or Roxley art', () => {
  for (const f of files) assert.ok(!fs.readFileSync(f, 'utf8').includes('—'), `${f} has an em dash`);
  assert.ok(!/limelight/i.test(fs.readFileSync('public/styles.css', 'utf8')));
});
test('copy: error text is sentence case and plain', () => {
  const src = fs.readFileSync('public/js/table.js', 'utf8');
  for (const m of src.matchAll(/err\('([^']+)'\)/g)) assert.match(m[1], /^[A-Z0-9]/, m[1]);
});
