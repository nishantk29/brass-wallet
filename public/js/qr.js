// Tiny QR encoder: byte mode, error correction M, versions 1 to 10 (up to 213 bytes). Draws to an SVG string.
// [EC codewords per block, blocks, data codewords per block, (blocks, data codewords) of the longer blocks]
const EC = [0, [10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27], [18, 4, 31], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
const ALIGN = [0, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const EXP = new Uint8Array(512); const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsRemainder(data, n) {
  let g = [1];
  for (let i = 0; i < n; i++) { const h = new Array(g.length + 1).fill(0); g.forEach((c, j) => { h[j] ^= c; h[j + 1] ^= mul(c, EXP[i]); }); g = h; }
  const r = new Array(n).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); }
  return r;
}

const bch = (v, gen, bits, top) => { let r = v; for (let i = 0; i < bits; i++) r = (r << 1) ^ ((r >>> top) * gen); return r; };

// text -> { size, version, mask, rows: boolean[][] } (rows[y][x] is true for a dark module)
export function encodeQR(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1;
  const cap = (k) => { const [, b1, d1, b2 = 0, d2 = 0] = EC[k]; return b1 * d1 + b2 * d2; };
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > cap(v) * 8) v++;
  if (v > 10) throw new RangeError('QR payload too long');
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap(v) * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0xec; data.length < cap(v); p ^= 0xec ^ 0x11) data.push(p);

  const [ecLen, b1, d1, b2 = 0, d2 = 0] = EC[v];
  const blocks = []; let at = 0;
  for (let i = 0; i < b1 + b2; i++) { const d = data.slice(at, at += i < b1 ? d1 : d2); blocks.push({ d, e: rsRemainder(d, ecLen) }); }
  const words = [];
  for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach((b) => { if (i < b.d.length) words.push(b.d[i]); });
  for (let i = 0; i < ecLen; i++) blocks.forEach((b) => words.push(b.e[i]));
  const stream = words.flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (w >>> i) & 1));

  const size = 17 + 4 * v;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) { m[y][x] = !!dark; fn[y][x] = true; } };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  }
  const a = ALIGN[v];
  a.forEach((cx, i) => a.forEach((cy, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === a.length - 1) || (i === a.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = (mask) => {
    const f = ((mask << 10) | bch(mask, 0x537, 10, 9)) ^ 0x5412; // data bits: ECC M (00) then the mask
    const bit = (i) => (f >>> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);
  if (v >= 7) {
    const f = (v << 12) | bch(v, 0x1f25, 12, 11);
    for (let i = 0; i < 18; i++) { const x = size - 11 + (i % 3); const y = Math.floor(i / 3); const d = (f >>> i) & 1; set(x, y, d); set(y, x, d); }
  }
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j; const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && k < stream.length) m[y][x] = !!stream[k++];
    }
  }

  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0];
  const flip = (mask) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x]; };
  let best = 0; let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    flip(mask); format(mask);
    const s = penalty(m, size);
    if (s < bestScore) { bestScore = s; best = mask; }
    flip(mask);
  }
  flip(best); format(best);
  return { size, version: v, mask: best, rows: m };
}

function penalty(m, n) {
  let p = 0; let dark = 0;
  const line = (get) => {
    let run = 1; let hist = 0;
    for (let i = 0; i < n; i++) {
      const c = get(i);
      if (i && c === get(i - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
      hist = ((hist << 1) | (c ? 1 : 0)) & 0x7ff;
      if (i >= 10 && (hist === 0x5d || hist === 0x5d0)) p += 40; // 1011101 with four light modules on a side
    }
  };
  for (let i = 0; i < n; i++) { line((j) => m[i][j]); line((j) => m[j][i]); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) dark++;
    if (x && y && m[y][x] === m[y][x - 1] && m[y][x] === m[y - 1][x] && m[y][x] === m[y - 1][x - 1]) p += 3;
  }
  return p + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
}

// The exact URL a player opens to join a room; the lobby QR, the copy button and Share all use it.
export const joinUrl = (origin, code) => `${origin}/?room=${code}`;

// SVG markup: black on white with a 4-module quiet zone. Row runs share one path.
export function qrSvg(text, label = 'QR code') {
  const { size, rows } = encodeQR(text);
  let d = '';
  rows.forEach((row, y) => { for (let x = 0; x < size; x++) { if (!row[x]) continue; let e = x; while (e < size && row[e]) e++; d += `M${x + 4} ${y + 4}h${e - x}v1h-${e - x}z`; x = e; } });
  const n = size + 8;
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
