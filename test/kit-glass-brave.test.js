// Brave-style glass (Nishant 2026-10-30 6:59 PM): 75% tint with a strong static frost; the bottom tab bar is a SOLID navy
// toolbar (no blur) with purple icons and a white selected label on a faint purple highlight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const fam = fs.readFileSync(new URL('../public/family.css', import.meta.url), 'utf8');
const bars = fs.readFileSync(new URL('../public/kit-bars.css', import.meta.url), 'utf8');

test('glass tokens: 75% tint, 36px frost with saturate', () => {
  assert.match(fam, /--f-glass-tint:rgb\(20 20 24 \/ \.75\);/);
  assert.match(fam, /--f-glass-blur:blur\(36px\) saturate\(1\.8\);/);
});

test('navy tab bar tokens', () => {
  for (const t of ['--f-tabbar-bg:#12152B;', '--f-tabbar-ink:#C9C3F2;', '--f-tabbar-icon:#A99BFF;', '--f-tabbar-ink-on:#FFFFFF;', '--f-tabbar-sel:rgb(169 155 255 / .16);']) assert.ok(fam.includes(t), t);
});
