#!/usr/bin/env python3
"""Hand-run web font subsetter. NOT a build step: run it when a source font or the site copy changes, then commit
the output in public/fonts/ and scripts/fonts/manifest.json.

  python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools==4.68.0 brotli==1.2.1
  /tmp/fontenv/bin/python scripts/fonts/subset.py            # rewrites the outputs listed in scripts/fonts/fonts.json
  /tmp/fontenv/bin/python scripts/fonts/subset.py --check    # exits 1 if the committed output is stale

What it does for each font in fonts.json (sources live in scripts/fonts/src/, which is not deployed):
  1. Optionally limits or pins variable axes to the weights the site uses (fontTools.varLib.instancer).
  2. Keeps every character the source font has (same coverage as before, nothing new falls back).
  3. Splits it into a small "core" file (ASCII, common punctuation and every non-ASCII character in the site's own
     copy) and an "ext" file with the rest, each served behind an exact unicode-range. Fonts used only by the print
     page are not split (one file, no extra request).
  4. Drops hinting (instructions, fpgm/prep/cvt) and the OpenType features the site never turns on. Browsers on by
     default (ccmp, locl, mark, mkmk, kern, liga, clig, calt, rlig, rvrn) and the ones the CSS asks for stay.
  5. Renames fonts whose licence reserves their name (SIL OFL Reserved Font Name) and notes the change in the
     version string.
"""
import hashlib, json, os, re, sys, io
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CFG = json.load(open(os.path.join(ROOT, 'scripts/fonts/fonts.json'), encoding='utf-8'))
ASCII = set(range(0x20, 0x7F))

def parse_ranges(s):
    out = set()
    for part in filter(None, (p.strip() for p in s.split(','))):
        part = part.upper().replace('U+', '')
        a, _, b = part.partition('-')
        out |= set(range(int(a, 16), int(b or a, 16) + 1))
    return out

def fmt_ranges(cps):
    cps = sorted(cps); out = []; i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1: j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
        i = j + 1
    return ','.join(out)

def site_chars():
    """Every non-ASCII character in the site's own files (text, \\uXXXX escapes and &#x...; entities)."""
    found = set()
    for d in CFG.get('scan', ['public', 'src']):
        for dp, _, fns in os.walk(os.path.join(ROOT, d)):
            if 'fonts' in dp.split(os.sep): continue
            for fn in fns:
                if not fn.endswith(('.js', '.mjs', '.html', '.css', '.json', '.webmanifest', '.svg', '.txt', '.md')): continue
                t = open(os.path.join(dp, fn), encoding='utf-8', errors='ignore').read()
                found |= {ord(c) for c in t if ord(c) > 0x7E}
                found |= {int(m, 16) for m in re.findall(r'\\u([0-9a-fA-F]{4})', t)}
                found |= {int(m, 16) for m in re.findall(r'\\u\{([0-9a-fA-F]{1,6})\}', t)}
                found |= {int(m, 16) for m in re.findall(r'&#x([0-9a-fA-F]+);', t)}
                found |= {int(m) for m in re.findall(r'&#([0-9]+);', t)}
    return found

def rename(font, frm, to):
    ps_to = to.replace(' ', '')
    for rec in font['name'].names:
        if rec.nameID in (0, 7, 13, 14): continue  # copyright, trademark, licence text/URL keep the original wording
        s = rec.toUnicode()
        if frm in s:
            rec.string = s.replace(frm, ps_to if rec.nameID in (6, 20, 25) else to)

def build(spec, cps, out_path, features):
    font = TTFont(os.path.join(ROOT, spec['src']), recalcTimestamp=False)
    if spec.get('axes'):
        limits = {k: (tuple(v) if isinstance(v, list) else v) for k, v in spec['axes'].items()}
        font = instancer.instantiateVariableFont(font, limits, updateFontNames=False)
        tmp = io.BytesIO(); font.save(tmp); tmp.seek(0); font = TTFont(tmp, recalcTimestamp=False)  # reload: subsetting a lazily loaded instance fails
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.hinting = False
    opts.layout_features = features
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True  # keep .notdef as it was
    opts.glyph_names = False
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=sorted(cps))
    sub.subset(font)
    if spec.get('rename'): rename(font, spec['rename']['from'], spec['rename']['to'])
    for rec in font['name'].names:
        if rec.nameID == 5 and 'subset by' not in rec.toUnicode():
            rec.string = rec.toUnicode() + '; subset by Game Night scripts/fonts/subset.py (Modified Version)'
    buf = io.BytesIO(); font.flavor = 'woff2'; font.save(buf); data = buf.getvalue()
    got = set(TTFont(io.BytesIO(data)).getBestCmap())
    assert got == set(cps), f'{out_path}: cmap mismatch {sorted(set(cps) ^ got)[:10]}'
    return data, font

def main(check=False):
    used = site_chars()
    common = parse_ranges(CFG.get('common', ''))
    manifest = {'note': 'GENERATED by scripts/fonts/subset.py; do not edit', 'fonts': []}
    stale = []
    for spec in CFG['fonts']:
        src = TTFont(os.path.join(ROOT, spec['src']))
        allcp = set(src.getBestCmap())
        have = set()
        for t in ('GSUB', 'GPOS'):
            if t in src and src[t].table.FeatureList: have |= {r.FeatureTag for r in src[t].table.FeatureList.FeatureRecord}
        features = sorted(have & set(CFG['features']))
        parts = [('', allcp)]
        if spec.get('split', True):
            core = allcp & (ASCII | common | used)
            parts = [('-core', core), ('-ext', allcp - core)]
        entry = {'src': spec['src'], 'src_bytes': os.path.getsize(os.path.join(ROOT, spec['src'])), 'features': features,
                 'axes': spec.get('axes'), 'family': spec.get('rename', {}).get('to'), 'files': []}
        for suffix, cps in parts:
            if not cps: continue
            name = f"{spec['out']}{suffix}.woff2"
            data, font = build(spec, cps, name, features)
            path = os.path.join(ROOT, 'public/fonts', name)
            if check:
                if not os.path.exists(path) or open(path, 'rb').read() != data: stale.append(name)
            else:
                open(path, 'wb').write(data)
            entry['files'].append({'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                                   'glyphs': len(font.getGlyphOrder()), 'codepoints': len(cps),
                                   'unicode_range': fmt_ranges(cps), 'name': str(font['name'].getDebugName(1))})
        manifest['fonts'].append(entry)
        print(spec['out'], entry['src_bytes'], '->', ' + '.join(f"{f['file']} {f['bytes']}" for f in entry['files']))
    mpath = os.path.join(ROOT, 'scripts/fonts/manifest.json')
    text = json.dumps(manifest, indent=1, ensure_ascii=False) + '\n'
    if check:
        if not os.path.exists(mpath) or open(mpath, encoding='utf-8').read() != text: stale.append('manifest.json')
        if stale: print('STALE:', ', '.join(stale)); sys.exit(1)
        print('up to date')
    else:
        open(mpath, 'w', encoding='utf-8').write(text)

if __name__ == '__main__':
    main(check='--check' in sys.argv)
