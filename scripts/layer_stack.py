"""Exploded view of a board's fabrication layers, as a GLB of stacked textured planes.

    python scripts/layer_stack.py <gerber dir> <out.glb> [--prefix PCB1] [--outline X0,Y0,X1,Y1]

Planes, bottom to top: bottom copper, board (with drill holes), top copper,
top solder mask, top silkscreen. Node names are the layer names, so a viewer
can animate the gap between them.
"""
import argparse
import logging
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw
from pygerber.gerberx3.api.v2 import GerberFile

import gerbers_to_glb as g2g

logging.getLogger().setLevel(logging.ERROR)
GAP = 4.0   # mm between planes in the model; the viewer can scale it

LAYERS = [   # name, source, RGBA
    ('bottom-copper', 'GBL', (205, 150, 70, 255)),
    ('board', None, (196, 178, 128, 255)),
    ('top-copper', 'GTL', (214, 160, 78, 255)),
    ('mask', 'GTS', (40, 120, 60, 150)),
    ('silk', 'GTO', (250, 250, 245, 255)),
]


def plane(img, bounds, y, name):
    x0, y0, x1, y1 = bounds
    w, h = x1 - x0, y1 - y0
    v = np.array([[-w / 2, y, h / 2], [w / 2, y, h / 2], [w / 2, y, -h / 2], [-w / 2, y, -h / 2]])
    f = np.array([[0, 1, 2], [0, 2, 3]])
    uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]])
    mat = trimesh.visual.material.PBRMaterial(baseColorTexture=img, metallicFactor=0.0, roughnessFactor=0.7,
                                              alphaMode='BLEND', doubleSided=True)
    return trimesh.Trimesh(v, f, visual=trimesh.visual.TextureVisuals(uv=uv, material=mat), process=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('gerbers', type=Path)
    ap.add_argument('out', type=Path)
    ap.add_argument('--prefix', default='PCB1')
    ap.add_argument('--outline')
    args = ap.parse_args()
    g = lambda ext: str(args.gerbers / f'{args.prefix}.{ext}')
    if args.outline:
        bounds = tuple(float(v) for v in args.outline.split(','))
    else:
        i = GerberFile.from_file(g('GBL')).parse().get_info()
        c = g2g.POUR_CLEARANCE
        bounds = (float(i.min_x_mm) - c, float(i.min_y_mm) - c, float(i.max_x_mm) + c, float(i.max_y_mm) + c)
    x0, y0, x1, y1 = bounds
    tmp = str(args.out.with_suffix('.layer.png'))
    holes = g2g.read_drills(g('TXT'))

    scene = trimesh.Scene()
    for k, (name, ext, rgba) in enumerate(LAYERS):
        if ext:
            m = g2g.layer_mask(g(ext), bounds, tmp)
            if ext == 'GTS':       # mask covers everything except its openings
                m = ~m
        else:
            m = np.ones((round((y1 - y0) * g2g.DPMM), round((x1 - x0) * g2g.DPMM)), bool)
        img = np.zeros(m.shape + (4,), np.uint8)
        img[m] = rgba
        im = Image.fromarray(img, 'RGBA')
        if name in ('board', 'mask'):   # drill holes go through these
            d = ImageDraw.Draw(im)
            for hx, hy, dia in holes:
                cx, cy, r = (hx - x0) * g2g.DPMM, (y1 - hy) * g2g.DPMM, dia / 2 * g2g.DPMM
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0, 0, 0, 0))
        # Height goes in the node transform, so viewers can sort and animate the layers.
        scene.add_geometry(plane(im, bounds, 0.0, name), geom_name=name, node_name=name,
                           transform=trimesh.transformations.translation_matrix((0, (k - 2) * GAP, 0)))
    Path(tmp).unlink(missing_ok=True)
    args.out.write_bytes(scene.export(file_type='glb'))
    print(f'wrote {args.out} ({args.out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
