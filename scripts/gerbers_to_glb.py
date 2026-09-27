"""Build a textured 3D model (GLB) of a bare two-layer board from its Gerbers.

One-off tool, not part of the site build. The output GLB is committed under media/.

    python scripts/gerbers_to_glb.py <gerber dir> <out.glb> [--prefix PCB1]
        [--outline X0,Y0,X1,Y1] [--parts board.step]

Reads <prefix>.GTL/GBL (copper), .GTS/GBS (solder mask), .GTO (top silk) and
<prefix>.TXT (Excellon drill, metric). The board outline is not in the Gerbers,
so it is taken as the bottom copper pour's extent plus the pour clearance,
unless --outline gives it. --parts adds the components from the board's STEP
export (converted with cascadio), dropping the STEP's untextured board body.
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


def step_parts(step, bounds, centre):
    """Component meshes from a STEP export, moved into the board's frame."""
    import tempfile
    import cascadio
    with tempfile.TemporaryDirectory() as tmp:
        glb = str(Path(tmp) / 'parts.glb')
        cascadio.step_to_glb(str(step), glb, tol_linear=0.02, tol_angular=0.3)
        meshes = trimesh.load(glb).dump()
    x0, y0, x1, y1 = bounds
    cx, cy = centre
    # STEP is in metres, Z up, board top at z = 0. Ours: mm, Y up, centred.
    m = np.array([[1000, 0, 0, -cx], [0, 0, 1000, THICKNESS / 2], [0, -1000, 0, cy], [0, 0, 0, 1]], float)
    for mesh in meshes:
        lo, hi = mesh.bounds * 1000
        is_board = (abs(lo[0] - x0) < 0.05 and abs(hi[0] - x1) < 0.05 and abs(lo[1] - y0) < 0.05
                    and abs(hi[1] - y1) < 0.05 and abs(hi[2] - lo[2] - THICKNESS) < 0.05)
        if not is_board:
            mesh.apply_transform(m)
            yield mesh.metadata.get('name', 'part'), mesh


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('gerbers', type=Path)
    ap.add_argument('out', type=Path)
    ap.add_argument('--prefix', default='PCB1')
    ap.add_argument('--outline', help='board extent in Gerber mm: X0,Y0,X1,Y1')
    ap.add_argument('--parts', type=Path, help='STEP export of the assembled board')
    ap.add_argument('--boxes', type=Path, help='JSON list of simple part bodies (see cad/r2r-dac/make_pcb.py)')
    args = ap.parse_args()
    g = lambda ext: str(args.gerbers / f'{args.prefix}.{ext}')

    if args.outline:
        bounds = tuple(float(v) for v in args.outline.split(','))
    else:
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

    if args.boxes:
        import json
        for name, x, y, z, (sx, sy, sz), colour in json.loads(args.boxes.read_text()):
            part = trimesh.creation.box((sx, sz, sy))
            part.apply_translation((x - cx, THICKNESS / 2 + z + sz / 2, -(y - cy)))
            rgb = [int(colour[i:i + 2], 16) for i in (1, 3, 5)]
            part.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
                baseColorFactor=rgb + [255], metallicFactor=0.3 if rgb[0] > 150 else 0.0, roughnessFactor=0.5))
            scene.add_geometry(part, geom_name=name)

    if args.parts:
        for name, mesh in step_parts(args.parts, (x0, y0, x1, y1), (cx, cy)):
            scene.add_geometry(mesh, geom_name=name)

    args.out.write_bytes(scene.export(file_type='glb'))
    print(f'wrote {args.out} ({args.out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
