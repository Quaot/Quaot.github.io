"""Compose the Bakfiets pictures into 3:2 plates, from the club's Bakfiets-F26 repository.

    python scripts/compose_bakfiets.py <path to Bakfiets-F26>

Only reads from that folder. Writes media/bakfiets/*.jpg.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'media' / 'bakfiets'


def pad_to_3x2(im, fill=None):
    """Grow the canvas to 3:2 without scaling. fill=None repeats the edge pixels (for gradient backgrounds)."""
    w, h = im.size
    W, H = max(w, round(h * 1.5)), max(h, round(w / 1.5))
    x, y = (W - w) // 2, (H - h) // 2
    if fill is not None:
        out = Image.new('RGB', (W, H), fill)
        out.paste(im, (x, y))
        return out
    out = im.resize((W, H))            # placeholder, overwritten below
    left, right = im.crop((0, 0, 1, h)), im.crop((w - 1, 0, w, h))
    out.paste(left.resize((x, h)), (0, y)) if x else None
    out.paste(right.resize((W - w - x, h)), (x + w, y)) if W - w - x else None
    top, bottom = im.crop((0, 0, w, 1)), im.crop((0, h - 1, w, h))
    out.paste(top.resize((W, y)), (0, 0)) if y else None
    out.paste(bottom.resize((W, H - h - y)), (0, y + h)) if H - h - y else None
    out.paste(im, (x, y))
    return out


def trim(im, bg=(255, 255, 255), margin=12):
    """Crop to the drawing, dropping the empty white around a CAD preview."""
    box = ImageChops.difference(im, Image.new('RGB', im.size, bg)).point(lambda v: 255 if v > 12 else 0).getbbox()
    x0, y0, x1, y1 = box
    return im.crop((max(0, x0 - margin), max(0, y0 - margin), min(im.width, x1 + margin), min(im.height, y1 + margin)))


def side_by_side(a, b, gap=40, pad=60, scale=1.6):
    a = a.resize((round(a.width * scale), round(a.height * scale)), Image.LANCZOS)
    b = b.resize((round(b.width * scale), round(b.height * scale)), Image.LANCZOS)
    h = max(a.height, b.height)
    out = Image.new('RGB', (a.width + b.width + gap + 2 * pad, h + 2 * pad), 'white')
    out.paste(a, (pad, pad + (h - a.height) // 2))
    out.paste(b, (pad + a.width + gap, pad + (h - b.height) // 2))
    return pad_to_3x2(out, 'white')


def on_paper(im):
    """Pad a diagram to 3:2 in its own paper colour."""
    return pad_to_3x2(im, im.getpixel((3, 3)))


def save(im, name):
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(OUT / name, quality=88, optimize=True)
    print(f'media/bakfiets/{name}', im.size)


def main(repo):
    img = lambda rel: Image.open(repo / rel).convert('RGB')
    save(pad_to_3x2(img('docs/images/render-2024.png')), 'bike-render.jpg')
    save(on_paper(img('docs/diagrams/bike-overview.png')), 'bike-labelled.jpg')
    save(side_by_side(trim(img('docs/images/cad-previews/Assem1.png')),
                      trim(img('docs/images/cad-previews/coop_bakfiets_main_asm.png'))), 'assemblies.jpg')
    save(on_paper(img('docs/diagrams/onboarding-path.png')), 'onboarding-path.jpg')
    save(on_paper(img('electrical/diagrams/bakfiets-power-flow.png')), 'power-flow.jpg')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
