"""Make the site's own web fonts from the OFL sources in scripts/fonts, so pages don't wait on Google Fonts.

    pip install fonttools brotli
    python scripts/make_fonts.py

Keeps Latin plus the symbols the site uses (°, Ω, ±, ×, arrows, superscripts) and, for Inter Tight, only the
400 to 600 weights. Writes site/fonts/*.woff2.
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'fonts'
OUT = ROOT / 'site' / 'fonts'
UNICODES = ('U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+03A9,U+2000-206F,U+2070-209F,U+20AC,'
            'U+2122,U+2190-21FF,U+2212,U+2215,U+2248,U+2264-2265,U+223C')


def make(src, out, weights=None):
    font = TTFont(SRC / src)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    if weights:   # after subsetting: trimming a whole variable font first trips fontTools' lazy tables
        font = instancer.instantiateVariableFont(font, {'wght': weights})
    OUT.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(OUT / out)
    print(f'site/fonts/{out}', (OUT / out).stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    make('InstrumentSerif-Regular.ttf', 'instrument-serif.woff2')
    make('InstrumentSerif-Italic.ttf', 'instrument-serif-italic.woff2')
    make('InterTight[wght].ttf', 'inter-tight.woff2', weights=(400, 600))
