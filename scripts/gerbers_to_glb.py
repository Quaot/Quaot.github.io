"""Build a textured 3D model (GLB) of a bare two-layer board from its Gerbers.

One-off tool, not part of the site build. The output GLB is committed under media/.

    python scripts/gerbers_to_glb.py <gerber dir> <out.glb> [--prefix PCB1]

Reads <prefix>.GTL/GBL (copper), .GTS/GBS (solder mask), .GTO (top silk) and
<prefix>.TXT (Excellon drill, metric). The board outline is not in the Gerbers,
so it is taken as the bottom copper pour's extent plus the pour clearance.
Needs pygerber 2.4, shapely >= 2.1, trimesh, numpy and Pillow.
"""
import argparse
import logging
import re
from pathlib import Path

import numpy as np
import shapely
import shapely.affinity
import trimesh
from PIL import Image
from pygerber.common.rgba import RGBA
from pygerber.gerberx3.api.v2 import ColorScheme, GerberFile
from shapely.geometry import Point, box

logging.getLogger().setLevel(logging.ERROR)   # pygerber warns about 4-digit coordinates

DPMM = 40             # texture pixels per mm
THICKNESS = 1.6       # mm
POUR_CLEARANCE = 0.3  # mm, gap between the bottom pour and the board edge

MASK = (34, 102, 52)
MASK_OVER_COPPER = (58, 132, 66)
PAD = (205, 170, 92)       # exposed copper, gold finish
BARE = (186, 164, 116)     # mask opening with no copper
SILK = (238, 238, 232)
EDGE = (176, 158, 110)     # FR4 seen from the side
BARREL = (190, 150, 80)

_WHITE, _BLACK = RGBA.from_rgba(255, 255, 255, 255), RGBA.from_rgba(0, 0, 0, 255)
_MONO = ColorScheme(background_color=_BLACK, clear_color=_BLACK, solid_color=_WHITE,
                    clear_region_color=_BLACK, solid_region_color=_WHITE)


def layer_mask(path, bounds, tmp):
    """Rasterise one Gerber layer onto the board's pixel grid, as a bool array."""
    x0, y0, x1, y1 = bounds
    parsed = GerberFile.from_file(path).parse()
    info = parsed.get_info()
    parsed.render_raster(tmp, color_scheme=_MONO, dpmm=DPMM)
    img = np.asarray(Image.open(tmp).convert('L')) > 127
    w, h = round((x1 - x0) * DPMM), round((y1 - y0) * DPMM)
    out = np.zeros((h, w), bool)
    # Rendered image: top-left pixel is (min_x, max_y) of that layer.
    col = round((float(info.min_x_mm) - x0) * DPMM)
    row = round((y1 - float(info.max_y_mm)) * DPMM)
    ih, iw = img.shape
    r0, c0 = max(row, 0), max(col, 0)
    r1, c1 = min(row + ih, h), min(col + iw, w)
    if r1 > r0 and c1 > c0:
        out[r0:r1, c0:c1] = img[r0 - row:r1 - row, c0 - col:c1 - col]
    return out


def read_drills(path):
    """Excellon, metric 4:4 with leading zeros kept. Returns [(x, y, diameter)]."""
    tools, holes, tool, x, y = {}, [], None, 0.0, 0.0
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if m := re.fullmatch(r'T(\d+)F\d+S\d+C([\d.]+)', line):
            tools[m[1]] = float(m[2])
        elif m := re.fullmatch(r'T(\d+)', line):
            tool = m[1]
        elif re.fullmatch(r'(X-?\d+)?(Y-?\d+)?', line) and line:
            if m := re.search(r'X(-?\d+)', line):
                x = int(m[1]) / 10 ** (len(m[1].lstrip('-')) - 4)
            if m := re.search(r'Y(-?\d+)', line):
                y = int(m[1]) / 10 ** (len(m[1].lstrip('-')) - 4)
            holes.append((x, y, tools[tool]))
    return holes


def texture(copper, mask_open, silk=None):
    img = np.empty(copper.shape + (3,), np.uint8)
    img[:] = MASK
    img[copper] = MASK_OVER_COPPER
    img[mask_open] = BARE
    img[mask_open & copper] = PAD
    if silk is not None:
        img[silk & ~mask_open] = SILK
    return Image.fromarray(img)


def face(poly, z, bounds, flip):
    """Triangulate a board face. Gerber (x, y) maps to three.js (x, z=-y), Y up."""
    x0, y0, x1, y1 = bounds
    tris = shapely.get_parts(shapely.constrained_delaunay_triangles(poly))
    verts, uvs, faces = [], [], []
    for t in tris:
        pts = list(t.exterior.coords)[:3]
        if shapely.geometry.LinearRing(pts).is_ccw == flip:
            pts.reverse()
        for px, py in pts:
            verts.append((px, z, -py))
            uvs.append(((px - x0) / (x1 - x0), (py - y0) / (y1 - y0)))
        n = len(verts)
        faces.append((n - 3, n - 2, n - 1))
    return np.array(verts), np.array(faces), np.array(uvs)


def wall(ring, outward):
    coords = list(ring.coords)
    if ring.is_ccw != outward:
        coords.reverse()
    verts, faces = [], []
    for (ax, ay), (bx, by) in zip(coords, coords[1:]):
        n = len(verts)
        lo, hi = -THICKNESS / 2, THICKNESS / 2
        verts += [(ax, lo, -ay), (bx, lo, -by), (bx, hi, -by), (ax, hi, -ay)]
        faces += [(n, n + 2, n + 1), (n, n + 3, n + 2)]
    return trimesh.Trimesh(verts, faces, process=False)


def solid(color):
    return trimesh.visual.material.PBRMaterial(
        baseColorFactor=list(color) + [255], metallicFactor=0.0, roughnessFactor=0.8, doubleSided=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('gerbers', type=Path)
    ap.add_argument('out', type=Path)
    ap.add_argument('--prefix', default='PCB1')
    args = ap.parse_args()
    g = lambda ext: str(args.gerbers / f'{args.prefix}.{ext}')

    pour = GerberFile.from_file(g('GBL')).parse().get_info()
    bounds = (float(pour.min_x_mm) - POUR_CLEARANCE, float(pour.min_y_mm) - POUR_CLEARANCE,
              float(pour.max_x_mm) + POUR_CLEARANCE, float(pour.max_y_mm) + POUR_CLEARANCE)
    x0, y0, x1, y1 = bounds
    print(f'board {x1 - x0:.2f} x {y1 - y0:.2f} mm')

    tmp = str(args.out.with_suffix('.layer.png'))
    layers = {ext: layer_mask(g(ext), bounds, tmp) for ext in ('GTL', 'GBL', 'GTS', 'GBS', 'GTO')}
    Path(tmp).unlink()
    top = texture(layers['GTL'], layers['GTS'], layers['GTO'])
    bottom = texture(layers['GBL'], layers['GBS'])

    holes = read_drills(g('TXT'))
    board = box(*bounds)
    for x, y, d in holes:
        board = board.difference(Point(x, y).buffer(d / 2, quad_segs=12))
    print(f'{len(holes)} holes')

    # Centre on the origin (baked into the vertices) so the viewer can orbit it directly.
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    board = shapely.affinity.translate(board, -cx, -cy)
    bounds = (x0 - cx, y0 - cy, x1 - cx, y1 - cy)

    scene = trimesh.Scene()
    for name, z, flip, img in (('top', THICKNESS / 2, False, top), ('bottom', -THICKNESS / 2, True, bottom)):
        v, f, uv = face(board, z, bounds, flip)
        mat = trimesh.visual.material.PBRMaterial(baseColorTexture=img, metallicFactor=0.0, roughnessFactor=0.6)
        scene.add_geometry(trimesh.Trimesh(v, f, visual=trimesh.visual.TextureVisuals(uv=uv, material=mat),
                                           process=False), geom_name=name)
    edge = wall(board.exterior, outward=True)
    edge.visual = trimesh.visual.TextureVisuals(material=solid(EDGE))
    scene.add_geometry(edge, geom_name='edge')
    barrels = trimesh.util.concatenate([wall(r, outward=False) for r in board.interiors])
    barrels.visual = trimesh.visual.TextureVisuals(material=solid(BARREL))
    scene.add_geometry(barrels, geom_name='barrels')

    args.out.write_bytes(scene.export(file_type='glb'))
    print(f'wrote {args.out} ({args.out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
