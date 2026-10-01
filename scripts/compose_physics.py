"""Take the photos and my own figures out of the Physics IA PDF as 3:2 plates for the site.

    python scripts/compose_physics.py "<path to Physics IA.pdf>"

Only pictures are taken from the IA, never its text. Writes media/physics/*.jpg.
"""
import io
import sys
from pathlib import Path

import pymupdf
import pypdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
W, H, GAP = 1800, 1200, 20
BG = (242, 242, 242)


def crop_to(im, ratio, cx=0.5):
    """Crop the width to the given width/height ratio, centred on cx (0 to 1)."""
    w = round(im.height * ratio)
    x = min(max(0, round(im.width * cx - w / 2)), im.width - w)
    return im.crop((x, 0, x + w, im.height))


# Figure crops in PDF points: (page index, x0, y0, x1, y1).
FIGURES = {
    'model': (4, 70, 175, 330, 392),      # the wheel as modelled: shell, beams, dowels
    'beams': (10, 75, 300, 540, 450),     # hole spacing on the two beams
    'insert': (10, 175, 540, 400, 745),   # one insert, six beams fused
    'setup': (12, 110, 55, 495, 246),     # ramp, release point and camera
    'result': (23, 72, 70, 524, 334),     # energy loss against moment of inertia
}


def figure(doc, name):
    i, *box = FIGURES[name]
    page = doc[i]
    if name == 'setup':
        # The figure labels the camera 240 fps, but the method used 120 fps: blank the label.
        for r in page.search_for('(240 fps)'):
            page.add_redact_annot(r, fill=(1, 1, 1))
        page.apply_redactions()
    save(render_plate(page, box), f'{name}.jpg')


# Sample pages for the Beginning / Middle / End row: (page index, label).
PAGES = [(2, 'beginning'), (15, 'middle'), (24, 'end')]


def render_pages(doc, pages, folder):
    """Render whole IA pages at 150 dpi. Only pages without the title page's candidate code are allowed."""
    folder.mkdir(parents=True, exist_ok=True)
    for i, label in pages:
        page = doc[i]
        text = page.get_text().lower()
        assert 'candidate' not in text and 'lyw096' not in text and 'justin' not in text.replace('adjusting', ''), i
        pix = page.get_pixmap(dpi=150)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        im.save(folder / f'{label}.jpg', quality=85, optimize=True)
        print(f'{folder.relative_to(ROOT)}/{label}.jpg', im.size)


def render_plate(page, box):
    """Render a region of a PDF page at 300 dpi with an even white margin, keeping the drawing's own shape."""
    pix = page.get_pixmap(clip=pymupdf.Rect(*box), dpi=300)
    im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    m = round(0.06 * max(im.size))
    plate = Image.new('RGB', (im.width + 2 * m, im.height + 2 * m), 'white')
    plate.paste(im, (m, m))
    return plate


def save(im, name):
    out = ROOT / 'media' / 'physics' / name
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, quality=88, optimize=True)
    print(out.relative_to(ROOT), im.size)


def main(pdf):
    photos = [Image.open(io.BytesIO(img.data)).convert('RGB')
              for page in pypdf.PdfReader(pdf).pages for img in page.images]
    with_dowels, empty = photos[0], photos[1]
    half = (W - GAP) // 2
    plate = Image.new('RGB', (W, H), BG)
    for k, (im, cx) in enumerate(((empty, 0.52), (with_dowels, 0.5))):
        im = crop_to(im, half / H, cx).resize((half, H), Image.LANCZOS)
        plate.paste(im, (k * (half + GAP), 0))
    save(plate, 'wheel.jpg')
    doc = pymupdf.open(pdf)
    for name in FIGURES:
        figure(doc, name)
    render_pages(doc, PAGES, ROOT / 'media' / 'physics' / 'pages')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
