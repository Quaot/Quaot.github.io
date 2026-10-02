"""Draw the link-preview card and the site icons in the site's own style.

    python scripts/og_image.py

The cards (1200x630) are what LinkedIn, Discord and messages show when a link is pasted:
- the site's card: paper background, the name in Instrument Serif, the tagline, one swatch per project;
- one per project: its colour, its title and category, and its cover picture (or its 3D still);
- the profile's card.
Writes media/og.png, media/og/<id>.png, media/og/profile.png, media/icon-32.png and media/icon-180.png.
Fonts are in scripts/fonts (SIL OFL). Run after adding a project or changing a cover, then build.
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


def projects():
    site = yaml.safe_load((ROOT / 'data' / 'site.yaml').read_text(encoding='utf-8'))
    for path in sorted((ROOT / 'data' / 'projects').glob('*/*.yaml')):
        p = yaml.safe_load(path.read_text(encoding='utf-8'))
        p['id'] = path.stem.split('-', 1)[-1]
        yield p


def luminance(hex_colour):
    ch = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    ch = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in ch]
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]


def readable_on(hex_colour):
    """Ink or paper, whichever has more contrast on this colour (the same rule as the site)."""
    L = luminance(hex_colour)
    ratio = lambda other: (max(L, luminance(other)) + 0.05) / (min(L, luminance(other)) + 0.05)
    return INK if ratio(INK) >= ratio('#f6f0e4') else '#f6f0e4'


def cover_picture(p):
    """The picture that stands for a project: its cover, or the ready-made still of its first 3D model."""
    src = (p.get('cover') or {}).get('src')
    if not src:
        first = (p.get('media') or [{}])[0]
        if first.get('type') in ('stl', 'glb'):
            name = first['src'].removeprefix('media/').rsplit('.', 1)[0].replace('/', '-')
            src = f'media/stills/{name}.4x3.light.webp'
        elif first.get('type') == 'image':
            src = first['src']
    return Image.open(ROOT / src).convert('RGBA') if src and (ROOT / src).exists() else None


def wrap(draw, text, fnt, width):
    lines, line = [], ''
    for word in text.split():
        trial = (line + ' ' + word).strip()
        if draw.textlength(trial, font=fnt) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + ([line] if line else [])


def project_card(p):
    W, H, pad = 1200, 630, 64
    colour = p.get('color', INK)
    ink = readable_on(colour)
    im = Image.new('RGB', (W, H), colour)
    d = ImageDraw.Draw(im)
    # The picture on the right, on a paper panel so drawings and photos both sit well.
    pic = cover_picture(p)
    panel = (W - 560 - pad, pad, W - pad, H - pad)
    d.rectangle(panel, fill=PAPER)
    if pic:
        pw, ph = panel[2] - panel[0], panel[3] - panel[1]
        scale = min(pw / pic.width, ph / pic.height)
        if (p.get('cover') or {}).get('src'):   # photos and screens fill the panel
            scale = max(pw / pic.width, ph / pic.height)
        pic = pic.resize((round(pic.width * scale), round(pic.height * scale)), Image.LANCZOS)
        x, y = (pic.width - pw) // 2, (pic.height - ph) // 2
        pic = pic.crop((max(0, x), max(0, y), max(0, x) + min(pw, pic.width), max(0, y) + min(ph, pic.height)))
        im.paste(pic, (panel[0] + (pw - pic.width) // 2, panel[1] + (ph - pic.height) // 2), pic)
    # Words on the left.
    d.text((pad, pad - 6), 'Justin Gu.', font=font('Regular', 40), fill=ink)
    title_font = font('Regular', 92)
    lines = wrap(d, p['title'], title_font, panel[0] - pad - 40)
    while len(lines) > 3:
        title_font = font('Regular', title_font.size - 8)
        lines = wrap(d, p['title'], title_font, panel[0] - pad - 40)
    y = H - pad - 70 - len(lines) * title_font.size * 0.98
    for line in lines:
        d.text((pad, y), line, font=title_font, fill=ink)
        y += title_font.size * 0.98
    d.text((pad, H - pad - 40), p.get('category', ''), font=font('Italic', 40), fill=ink)
    out = ROOT / 'media' / 'og' / f"{p['id']}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)
    print(out.relative_to(ROOT))


def profile_card():
    W, H, pad = 1200, 630, 72
    im = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(im)
    d.text((pad, 70), 'A bit more', font=font('Regular', 120), fill=INK)
    d.text((pad, 190), 'about me.', font=font('Italic', 120), fill=ACCENT)
    site = yaml.safe_load((ROOT / 'data' / 'site.yaml').read_text(encoding='utf-8'))
    lead = ((site.get('profile') or {}).get('lead') or '').replace('*', '')
    y = 360
    for line in wrap(d, lead, font('Regular', 40), W - 2 * pad)[:3]:
        d.text((pad, y), line, font=font('Regular', 40), fill=MUTED)
        y += 48
    colours = project_colours()
    gap, top, bottom = 6, 540, H - 30
    w = (W - 2 * pad - gap * (len(colours) - 1)) / len(colours)
    for k, c in enumerate(colours):
        d.rectangle((round(pad + k * (w + gap)), top, round(pad + k * (w + gap) + w), bottom), fill=c)
    out = ROOT / 'media' / 'og' / 'profile.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)
    print(out.relative_to(ROOT))


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
    for p in projects():
        project_card(p)
    profile_card()
    icon(32)
    icon(180)
