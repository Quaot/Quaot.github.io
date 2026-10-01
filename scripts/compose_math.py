"""Take my own diagrams and graph out of the Math IA PDF as 3:2 plates for the site.

    python scripts/compose_math.py "<path to Math IA.pdf>"

Only pictures are taken from the IA, never its text. Writes media/chess/*.jpg.
"""
import sys
from pathlib import Path

import pymupdf

from compose_physics import render_pages, render_plate

ROOT = Path(__file__).resolve().parent.parent

# Crops in PDF points: (page index, x0, y0, x1, y1), each with its labels.
FIGURES = {
    'rook-board': (6, 185, 172, 447, 434),        # the rook's reach on an empty board
    'rook-blocked': (5, 65, 185, 545, 362),       # four directions, and the same rook blocked
    'rook-anywhere': (7, 70, 188, 515, 352),      # corner, edge and centre give the same count
    'ray-friendly': (12, 150, 105, 450, 260),     # first piece in the way is friendly: stop before it
    'ray-enemy': (13, 150, 105, 450, 260),        # first piece is an enemy: capture it
    'knight-edge': (18, 180, 375, 420, 582),      # knight moves that fall off the board
    'king-edge': (19, 190, 92, 410, 275),
    'mobility': (17, 72, 240, 540, 505),          # expected mobility of each piece as pieces come off
}


PAGES = [(2, 'beginning'), (9, 'middle'), (19, 'end')]   # introduction, the probability, the conclusion


def main(pdf):
    doc = pymupdf.open(pdf)
    out = ROOT / 'media' / 'chess'
    out.mkdir(parents=True, exist_ok=True)
    for name, (i, *box) in FIGURES.items():
        plate = render_plate(doc[i], box)
        plate.save(out / f'{name}.jpg', quality=88, optimize=True)
        print(f'media/chess/{name}.jpg', plate.size)
    render_pages(doc, PAGES, out / 'pages')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
