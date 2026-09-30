"""Compose raw app screenshots into 3:2 plates for the site (Mash-style project images).

    python scripts/compose_screens.py <shots dir>

Raw captures are not committed; the composed JPEGs in media/<app>/screens/ are.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

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


def place(plate, im, box, r):
    """Fit im into box (x, y, w, h), centred, with rounded corners and a soft shadow."""
    x, y, bw, bh = box
    scale = min(bw / im.width, bh / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    px, py = x + (bw - im.width) // 2, y + (bh - im.height) // 2
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
    save(plate_of([s('il-today.png'), s('il-workout.png'), s('il-progress.png')], r=90, bg=COLOR['ironlog']), 'ironlog/screens/overview.jpg')
    save(plate_of([s('il-workout.png'), s('il-history.png')], r=90, bg=COLOR['ironlog']), 'ironlog/screens/workout-history.jpg')

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
    save(plate_of([s('aip-journey-top.png'), s('aip-lesson2.png'), s('aip-quiz.png')], r=90, bg=ai), 'ai-phillic/screens/lesson.jpg')
    save(plate_of([s('aip-lesson3.png'), s('aip-lesson4.png'), s('aip-scan.png')], r=90, bg=ai), 'ai-phillic/screens/teaching.jpg')
    save(plate_of([s('aip-progress.png'), s('aip-journey.png'), s('aip-onboarding.png')], r=90, bg=ai), 'ai-phillic/screens/progress.jpg')

    save(plate_of([s('yt-main-crop.png')], r=10, margin=90, bg=COLOR['youtonomous']), 'youtonomous/screens/player.jpg')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
