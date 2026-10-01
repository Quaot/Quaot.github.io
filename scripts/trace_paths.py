"""Export the top-copper traces of a board as line segments in the layer model's own coordinates,
so the home-page hero can run current along the real tracks.

    python scripts/trace_paths.py cad/pcb-ldo/gerbers/PCB1.GTL media/pcb-ldo/traces.json --outline 0.5,0,17.518,28

The outline must be the one layers.glb was built with (layer_stack.py --outline). Points are [x, z] in mm on the
top-copper plane: x to the right of the board centre, z towards the viewer (Gerber y runs the other way).
"""
import argparse
import json
import re
from pathlib import Path


def segments(gerber_text):
    """Straight draws (D01) made with a round aperture: the tracks, not the pads."""
    round_apertures = {int(n) for n, _ in re.findall(r'%ADD(\d+)C,([\d.]+)\*%', gerber_text)}
    widths = {int(n): float(w) for n, w in re.findall(r'%ADD(\d+)C,([\d.]+)\*%', gerber_text)}
    aperture, x, y, out = None, 0.0, 0.0, []
    for cmd in re.findall(r'[^*%\n]+\*', gerber_text):
        m = re.fullmatch(r'D(\d+)\*', cmd)
        if m and int(m.group(1)) >= 10:
            aperture = int(m.group(1))
            continue
        m = re.fullmatch(r'(?:X(-?\d+))?(?:Y(-?\d+))?D0?([123])\*', cmd)
        if not m:
            continue
        nx = int(m.group(1)) / 1e4 if m.group(1) else x
        ny = int(m.group(2)) / 1e4 if m.group(2) else y
        if m.group(3) == '1' and aperture in round_apertures and (nx, ny) != (x, y):
            out.append((x, y, nx, ny, widths[aperture]))
        x, y = nx, ny
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('gerber', type=Path)
    ap.add_argument('out', type=Path)
    ap.add_argument('--outline', required=True, help='X0,Y0,X1,Y1 in Gerber mm, as used for layers.glb')
    args = ap.parse_args()
    text = args.gerber.read_text()
    assert '%FSLAX44Y44*%' in text and '%MOMM*%' in text, 'expects 4.4 format in millimetres'
    x0, y0, x1, y1 = (float(v) for v in args.outline.split(','))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    segs = [[round(a - cx, 3), round(cy - b, 3), round(c - cx, 3), round(cy - d, 3), w]
            for a, b, c, d, w in segments(text)]
    args.out.write_text(json.dumps({'units': 'mm', 'layer': 'top-copper', 'segments': segs}))
    print(f'{args.out}: {len(segs)} track segments')


if __name__ == '__main__':
    main()
