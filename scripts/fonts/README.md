# Web fonts: sources, subsetting and licences (FONTLOG)

`public/fonts/` holds subset copies of the fonts in `scripts/fonts/src/` (the unmodified upstream files, not deployed).
They are made by hand with `scripts/fonts/subset.py` (fontTools 4.68.0 + brotli 1.2.1), not by a build step; the
output and `manifest.json` are committed. `test/font-subset.test.js` fails if the output, the CSS or the service worker
fall out of step, or if new site copy needs a character that only the extended file has.

Re-run after changing a source font, `fonts.json`, or adding copy with new non-ASCII characters:

    python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools==4.68.0 brotli==1.2.1
    /tmp/fontenv/bin/python scripts/fonts/subset.py          # writes public/fonts/* and scripts/fonts/manifest.json
    /tmp/fontenv/bin/python scripts/fonts/subset.py --check  # exits 1 if the committed output is stale

Then copy the unicode-range values from `manifest.json` into the @font-face rules if they changed, add any new file to
the service worker precache list and restamp it.

## What changed from the source fonts (2026-10-30)
- Same character coverage as the source file. Fonts used on screen are split into a preloaded `-core` file (ASCII,
  common punctuation, every non-ASCII character in the site's own copy) and an `-ext` file with the rest, each behind
  an exact `unicode-range`, so the second file is only downloaded when text needs it. Print-only fonts are one file.
- Hinting removed (TrueType instructions, fpgm/prep/cvt). OpenType features kept: the ones browsers turn on by default
  (ccmp, locl, mark, mkmk, kern, liga, clig, calt, rlig, rvrn) plus tnum (font-variant-numeric:tabular-nums).
  Dropped: frac/numr/dnom, lnum, pnum (the CSS never asks for them).
- Variable axes are left at their full range: limiting them changed pixels (re-rounded outlines), see the PR.
- Pixel diffs at 390 px (Chromium and WebKit) on every screen in the PR were 0.

## Licences
- Bitter (The Bitter Project Authors): SIL OFL 1.1, no Reserved Font Name (`public/fonts/LICENSE-bitter.txt`). Name kept.
- Rubik is not touched here (separate change).
