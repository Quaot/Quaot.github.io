"""Draw the link-preview card and the site icons in the site's own style.

    python scripts/og_image.py

The card (1200x630) is what LinkedIn, Discord and messages show when the link is pasted: paper background,
the name in Instrument Serif, the tagline, and one swatch per project in its colour, in the home page's order.
Writes media/og.png, media/icon-32.png and media/icon-180.png. Fonts are in scripts/fonts (SIL OFL).
"""
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path(__file__).resolve().parent / 'fonts'
PAPER, INK, MUTED, ACCENT = '#f1ebdf', '#17150f', '#7d7465', '#e4572e'


def font(style, size):
    return ImageFont.truetype(str(FONTS / f'InstrumentSerif-{style}.ttf'), size)


def project_colours():
    site = yaml.safe_load((ROOT / 'data' / 'site.yaml').read_text(encoding='utf-8'))
    found = {}
    for path in (ROOT / 'data' / 'projects').glob('*/*.yaml'):
        p = yaml.safe_load(path.read_text(encoding='utf-8'))
        found[path.stem.split('-', 1)[-1]] = p.get('color', INK)
    order = site.get('order') or sorted(found)
    return [found[i] for i in order if i in found]


def card():
    W, H, pad = 1200, 630, 72
    im = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(im)
    d.text((pad, 58), 'Justin Gu', font=font('Regular', 128), fill=INK)
    name_w = d.textlength('Justin Gu', font=font('Regular', 128))
    d.text((pad + name_w - 4, 58), '.', font=font('Regular', 128), fill=ACCENT)
    # One line of the tagline, with the same italic accents as the home page.
    x, y = pad, 228
    for text, style, colour in (('Electrical Engineering', 'Italic', ACCENT), (' student at Waterloo,', 'Regular', INK)):
        d.text((x, y), text, font=font(style, 54), fill=colour)
        x += d.textlength(text, font=font(style, 54))
    x, y = pad, 290
    for text, style, colour in (('project lead of ', 'Regular', INK), ('Bakfiets', 'Italic', ACCENT),
                                (' at Electrium Mobility.', 'Regular', INK)):
        d.text((x, y), text, font=font(style, 54), fill=colour)
        x += d.textlength(text, font=font(style, 54))
    d.text((pad, 380), 'Circuit boards, 3D printed parts and software.', font=font('Regular', 34), fill=MUTED)
    # The colour index, as on the home page.
    colours = project_colours()
    gap, top, bottom = 6, 470, H - pad + 14
    w = (W - 2 * pad - gap * (len(colours) - 1)) / len(colours)
    for k, c in enumerate(colours):
        x0 = pad + k * (w + gap)
        d.rectangle((round(x0), top, round(x0 + w), bottom), fill=c)
    im.save(ROOT / 'media' / 'og.png', optimize=True)
    print('media/og.png', im.size, len(colours), 'swatches')


def icon(size):
    im = Image.new('RGB', (size, size), ACCENT)
    d = ImageDraw.Draw(im)
    f = font('Italic', round(size * 0.95))
    box = d.textbbox((0, 0), 'J', font=f)
    d.text(((size - (box[2] - box[0])) / 2 - box[0], (size - (box[3] - box[1])) / 2 - box[1]), 'J', font=f, fill=PAPER)
    im.save(ROOT / 'media' / f'icon-{size}.png', optimize=True)
    print(f'media/icon-{size}.png')


if __name__ == '__main__':
    card()
    icon(32)
    icon(180)
