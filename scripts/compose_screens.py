"""Compose raw app screenshots into 3:2 plates for the site (Mash-style project images).

    python scripts/compose_screens.py <shots dir>

Raw captures are not committed; the composed JPEGs in media/<app>/screens/ are.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1880, 1253          # 3:2
BG = (242, 242, 242)
# Each app sits on its project colour (the same hex as `color` in its data file).
COLOR = {'ironlog': '#cfe84a', 'ib-paper-organizer': '#1f4fa3', 'youtonomous': '#c8323c', 'ai-phillic': '#c8643b'}


def rounded(im, r):
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), r, fill=255)
    out = Image.new('RGBA', im.size)
    out.paste(im.convert('RGB'), (0, 0), mask)
    return out


def shadow(size, r, blur=28, alpha=60):
    pad = blur * 3
    sh = Image.new('RGBA', (size[0] + pad * 2, size[1] + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((pad, pad + blur // 2, pad + size[0], pad + size[1] + blur // 2), r,
                                         fill=(0, 0, 0, alpha))
    return sh.filter(ImageFilter.GaussianBlur(blur)), pad


def contrast(rgb):
    """Black or white, whichever reads on this colour (for the status bar and home indicator)."""
    return (16, 16, 16) if 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 150 else (245, 245, 245)


def edge_colour(im, rows):
    strip = im.crop((0, rows[0], im.width, rows[1])).resize((1, 1), Image.BOX)
    return strip.getpixel((0, 0))


PHONE_RADIUS, BEZEL = 150, 40


def phone(shot):
    """Put a phone screenshot in a phone: a status bar above and a home-indicator strip below, both in the
    app's own edge colours, inside a dark bezel. The rounded corners then fall on those strips, the way a
    real phone keeps an app inside its safe area, instead of cutting into the app's header and tab bar."""
    w, h = shot.size
    top_h, bottom_h = 150, 120
    top, bottom = edge_colour(shot, (0, 6)), edge_colour(shot, (h - 6, h))
    screen = Image.new('RGB', (w, h + top_h + bottom_h), top)
    screen.paste(Image.new('RGB', (w, bottom_h), bottom), (0, top_h + h))
    screen.paste(shot, (0, top_h))
    d = ImageDraw.Draw(screen)
    ink = contrast(top)
    try:
        font = ImageFont.truetype('arialbd.ttf', 50)
    except OSError:
        font = ImageFont.load_default()
    d.text((110, 52), '9:41', font=font, fill=ink)
    bx = w - 200                                   # battery
    d.rounded_rectangle((bx, 60, bx + 82, 98), 10, outline=ink, width=4)
    d.rounded_rectangle((bx + 8, 68, bx + 64, 90), 5, fill=ink)
    d.rounded_rectangle((bx + 86, 72, bx + 92, 86), 2, fill=ink)
    for k in range(4):                             # signal
        x0 = w - 330 + k * 22
        d.rounded_rectangle((x0, 92 - 10 - k * 9, x0 + 14, 98), 3, fill=ink)
    pill = 400
    d.rounded_rectangle(((w - pill) // 2, top_h + h + bottom_h - 52, (w + pill) // 2, top_h + h + bottom_h - 38),
                        7, fill=contrast(bottom))
    device = Image.new('RGBA', (w + 2 * BEZEL, screen.height + 2 * BEZEL), (0, 0, 0, 0))
    ImageDraw.Draw(device).rounded_rectangle((0, 0, device.width - 1, device.height - 1), PHONE_RADIUS + BEZEL,
                                             fill=(14, 14, 15, 255))
    device.alpha_composite(rounded(screen, PHONE_RADIUS), (BEZEL, BEZEL))
    return device


def place(plate, im, box, r):
    """Fit im into box (x, y, w, h), centred, with a soft shadow. A finished phone (RGBA) keeps its own shape,
    anything else gets rounded corners of radius r."""
    x, y, bw, bh = box
    scale = min(bw / im.width, bh / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    px, py = x + (bw - im.width) // 2, y + (bh - im.height) // 2
    if im.mode == 'RGBA':
        r = round((PHONE_RADIUS + BEZEL) * scale)
        sh, pad = shadow(im.size, r)
        plate.alpha_composite(sh, (px - pad, py - pad))
        plate.alpha_composite(im, (px, py))
        return
    sh, pad = shadow(im.size, r)
    plate.alpha_composite(sh, (px - pad, py - pad))
    plate.alpha_composite(rounded(im, r), (px, py))


def plate_of(images, r, margin=110, gap=60, bg=BG):
    plate = Image.new('RGBA', (W, H), bg)
    n = len(images)
    bw = (W - 2 * margin - gap * (n - 1)) // n
    for i, im in enumerate(images):
        place(plate, im, (margin + i * (bw + gap), margin, bw, H - 2 * margin), r)
    return plate.convert('RGB')


def save(im, rel):
    out = ROOT / 'media' / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, quality=86, optimize=True)
    print(out.relative_to(ROOT), im.size)


def main(shots):
    s = lambda n: Image.open(shots / n).convert('RGB')

    # IronLog: phone screens at 1170x2532.
    save(plate_of([phone(s('il-today.png')), phone(s('il-workout.png')), phone(s('il-progress.png'))], r=90, bg=COLOR['ironlog']), 'ironlog/screens/overview.jpg')
    save(plate_of([phone(s('il-workout.png')), phone(s('il-history.png'))], r=90, bg=COLOR['ironlog']), 'ironlog/screens/workout-history.jpg')

    # IB Paper Organizer: window captures, trimmed to the app's content area.
    lib = s('ibo-library.png')
    search = s('ibo-search.png').crop((11, 84, 1931, 1020))
    viewer = s('ibo-viewer2.png').crop((11, 84, 1931, 1020))
    # The exam page is IB copyright: blur it, keep the app's viewer around it sharp.
    page = (946 - 11, 348 - 84, 1752 - 11, 1020 - 84)
    viewer.paste(viewer.crop(page).filter(ImageFilter.GaussianBlur(9)), page[:2])
    for name, im in (('library', lib), ('search', search), ('viewer', viewer)):
        save(plate_of([im], r=18, margin=90, bg=COLOR['ib-paper-organizer']), f'ib-paper-organizer/screens/{name}.jpg')

    # Youtonomous: native window, 1290x688.
    # AI-Phillic: Expo web build at 390x844, 3x, onboarded as a sample student.
    ai = COLOR['ai-phillic']
    save(plate_of([phone(s('aip-journey-top.png')), phone(s('aip-lesson2.png')), phone(s('aip-quiz.png'))], r=90, bg=ai), 'ai-phillic/screens/lesson.jpg')
    save(plate_of([phone(s('aip-lesson3.png')), phone(s('aip-lesson4.png')), phone(s('aip-scan.png'))], r=90, bg=ai), 'ai-phillic/screens/teaching.jpg')
    save(plate_of([phone(s('aip-progress.png')), phone(s('aip-journey.png')), phone(s('aip-onboarding.png'))], r=90, bg=ai), 'ai-phillic/screens/progress.jpg')

    save(plate_of([s('yt-main-crop.png')], r=10, margin=90, bg=COLOR['youtonomous']), 'youtonomous/screens/player.jpg')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
