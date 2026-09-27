"""Concept two-layer layout for the 4-bit R-2R DAC (github.com/Quaot/R-2R_DAC).

Writes fab-style Gerbers and an Excellon drill file into gerbers/, then
scripts/gerbers_to_glb.py turns them into the 3D model on the site:

    python cad/r2r-dac/make_pcb.py
    python scripts/gerbers_to_glb.py cad/r2r-dac/gerbers media/r2r/board.glb --prefix R2R

Netlist matches r2r_dac.cir: RT n0-GND, R0 B0-n0, RL0 n0-n1, R1 B1-n1, RL1 n1-n2,
R2 B2-n2, RL2 n2-VOUT, R3 B3-VOUT. J1 = B0..B3 (pin 1 = B0), J2 = VOUT, GND.
0805 resistors, 2.54 mm headers, 0.3 mm tracks, bottom-layer ground pour.
Not fabricated; it has not been through a DRC in an EDA tool.
"""
from pathlib import Path

from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

OUT = Path(__file__).parent / 'gerbers'
W, H = 33.0, 20.0          # board, mm
EDGE_CLEAR = 0.3           # copper pour to board edge
POUR_CLEAR = 0.35          # pour to non-GND copper
TRACK = 0.3
MASK_GROW = 0.05
PAD_0805 = (1.025, 1.4)    # along the part, across it
PITCH_0805 = 1.825
HDR_PAD, HDR_DRILL = 1.7, 1.0
VIA_PAD, VIA_DRILL = 0.8, 0.4

# ---- parts -------------------------------------------------------------------
# 0805 resistors: (ref, centre, vertical?). Ladder nodes sit on y = 15.
NODE_Y, BIT_Y = 15.0, 10.0
resistors = [('RT', (5.0, NODE_Y), False)]
for i, x in enumerate((9.0, 15.0, 21.0, 27.0)):
    resistors.append((f'R{i}', (x, BIT_Y), True))
for i, x in enumerate((12.0, 18.0, 24.0)):
    resistors.append((f'RL{i}', (x, NODE_Y), False))

J1 = [(11.19 + 2.54 * i, 2.8) for i in range(4)]   # B0..B3
J2 = [(30.5, 16.27), (30.5, 13.73)]                 # VOUT, GND
GND_VIA = (2.4, NODE_Y)


def pads_of(centre, vertical):
    x, y = centre
    d = PITCH_0805 / 2
    return [(x, y + d), (x, y - d)] if vertical else [(x - d, y), (x + d, y)]


pads = {ref: pads_of(c, v) for ref, c, v in resistors}

# ---- tracks (top layer), as polylines --------------------------------------------
tracks = [
    [(pads['RT'][1][0], NODE_Y), (pads['RL0'][0][0], NODE_Y)],     # n0
    [pads['R0'][0], (9.0, NODE_Y)],
    [pads['RL0'][1], pads['RL1'][0]],                              # n1
    [pads['R1'][0], (15.0, NODE_Y)],
    [pads['RL1'][1], pads['RL2'][0]],                              # n2
    [pads['R2'][0], (21.0, NODE_Y)],
    [pads['RL2'][1], (27.0, NODE_Y), (28.27, J2[0][1]), J2[0]],    # VOUT
    [pads['R3'][0], (27.0, NODE_Y)],
    [pads['RT'][0], GND_VIA],                                      # GND
    # Bit lines, 45 degree bends, fanned into J1.
    [pads['R0'][1], (9.0, 7.19), (11.19, 5.0), J1[0]],
    [pads['R1'][1], (15.0, 6.27), (13.73, 5.0), J1[1]],
    [pads['R2'][1], (21.0, 7.5), (17.5, 7.5), (16.27, 6.27), J1[2]],
    [pads['R3'][1], (27.0, 6.0), (20.04, 6.0), (18.81, 4.77), J1[3]],
]
holes = [(x, y, HDR_DRILL) for x, y in J1 + J2] + [(*GND_VIA, VIA_DRILL)]

# ---- silkscreen: a small stroke font ------------------------------------------------
# Glyphs on a 4 x 6 grid, as lists of polylines.
FONT = {
    '0': [[(1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0)]],
    '1': [[(1, 5), (2, 6), (2, 0)], [(1, 0), (3, 0)]],
    '2': [[(0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (0, 0), (4, 0)]],
    '3': [[(0, 6), (4, 6), (2, 3.5), (4, 2.5), (4, 1), (3, 0), (0, 0)]],
    '4': [[(3, 0), (3, 6), (0, 2), (4, 2)]],
    'A': [[(0, 0), (0, 4), (2, 6), (4, 4), (4, 0)], [(0, 3), (4, 3)]],
    'B': [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)], [(3, 3), (4, 2), (4, 1), (3, 0), (0, 0)]],
    'C': [[(4, 6), (1, 6), (0, 5), (0, 1), (1, 0), (4, 0)]],
    'D': [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 1), (3, 0), (0, 0)]],
    'G': [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1), (4, 3), (2, 3)]],
    'I': [[(1, 6), (3, 6)], [(2, 6), (2, 0)], [(1, 0), (3, 0)]],
    'J': [[(1, 6), (4, 6)], [(3, 6), (3, 1), (2, 0), (1, 0), (0, 1)]],
    'L': [[(0, 6), (0, 0), (4, 0)]],
    'N': [[(0, 0), (0, 6), (4, 0), (4, 6)]],
    'O': [[(1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0)]],
    'R': [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)], [(2, 3), (4, 0)]],
    'T': [[(0, 6), (4, 6)], [(2, 6), (2, 0)]],
    'U': [[(0, 6), (0, 1), (1, 0), (3, 0), (4, 1), (4, 6)]],
    'V': [[(0, 6), (2, 0), (4, 6)]],
    '-': [[(1, 3), (3, 3)]],
    ' ': [],
}


def text(s, x, y, h=1.0, anchor='left'):
    """Polylines for a string with its baseline-left (or centre) at x, y."""
    k, adv = h / 6, h * 0.95
    if anchor == 'center':
        x -= (len(s) * adv - (adv - 4 * k)) / 2
    out = []
    for i, ch in enumerate(s):
        for line in FONT[ch]:
            out.append([(x + i * adv + px * k, y + py * k) for px, py in line])
    return out


SILK_W = 0.15
silk = []
for ref, (x, y), vertical in resistors:
    d = PAD_0805[1] / 2 + 0.25            # body lines beside the pads
    if vertical:
        silk += [[(x - d, y - 0.35), (x - d, y + 0.35)], [(x + d, y - 0.35), (x + d, y + 0.35)]]
        silk += text(ref, x + 1.25, y - 0.5)
    else:
        silk += [[(x - 0.35, y - d), (x + 0.35, y - d)], [(x - 0.35, y + d), (x + 0.35, y + d)]]
        silk += text(ref, x, y + 1.35, anchor='center')


def rect(x0, y0, x1, y1):
    return [[(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]]


silk += rect(J1[0][0] - 1.4, 1.4, J1[-1][0] + 1.4, 4.2)
silk += text('J1', J1[0][0] - 3.8, 2.3)
for (px, _), name in zip(J1, ('B0', 'B1', 'B2', 'B3')):
    silk += text(name, px - 1.55, 4.55, h=0.7)   # left of each track, so they don't overlap
silk += rect(29.1, 12.33, 31.9, 17.67)
silk += text('J2', 29.45, 18.2)
silk += text('4-BIT', 26.2, 3.3, h=1.0, anchor='center')
silk += text('R-2R DAC', 26.2, 1.4, h=1.0, anchor='center')


# ---- copper pour (bottom): whole board, clear of every non-GND pad --------------
def pour():
    area = box(EDGE_CLEAR, EDGE_CLEAR, W - EDGE_CLEAR, H - EDGE_CLEAR)
    keep_out = [Point(p).buffer(HDR_PAD / 2 + POUR_CLEAR) for p in J1 + [J2[0]]]
    return area.difference(unary_union(keep_out))


# ---- writers ------------------------------------------------------------------------
def fmt(v):
    return f'{round(v * 1e6):d}'


class Gerber:
    def __init__(self, name, function):
        self.lines = ['%FSLAX46Y46*%', '%MOMM*%', f'%TF.FileFunction,{function}*%', '%LPD*%']
        self.apertures = {}
        self.name = name

    def ap(self, shape, *dims):
        key = (shape, dims)
        if key not in self.apertures:
            code = 10 + len(self.apertures)
            self.apertures[key] = code
            self.lines.insert(3, f'%ADD{code}{shape},{"X".join(f"{d:.4f}" for d in dims)}*%')
        self.lines.append(f'D{self.apertures[key]}*')

    def flash(self, x, y):
        self.lines.append(f'X{fmt(x)}Y{fmt(y)}D03*')

    def path(self, pts):
        (x, y), *rest = pts
        self.lines.append(f'X{fmt(x)}Y{fmt(y)}D02*')
        for x, y in rest:
            self.lines.append(f'X{fmt(x)}Y{fmt(y)}D01*')

    def region(self, ring):
        self.lines += ['G36*']
        self.path(list(ring.coords))
        self.lines += ['G37*']

    def polarity(self, dark):
        self.lines.append('%LPD*%' if dark else '%LPC*%')

    def save(self):
        (OUT / self.name).write_text('\n'.join(self.lines + ['M02*']) + '\n')


def pads_layer(g, grow, smd=True):
    if smd:
        for ref, _, vertical in resistors:
            w, h = PAD_0805
            if vertical:
                w, h = h, w
            g.ap('R', w + 2 * grow, h + 2 * grow)
            for x, y in pads[ref]:
                g.flash(x, y)
    g.ap('R', HDR_PAD + 2 * grow, HDR_PAD + 2 * grow)      # pin 1 square
    g.flash(*J1[0])
    g.flash(*J2[0])
    g.ap('C', HDR_PAD + 2 * grow)
    for p in J1[1:] + J2[1:]:
        g.flash(*p)


def main():
    OUT.mkdir(exist_ok=True)
    prefix = 'R2R'

    top = Gerber(f'{prefix}.GTL', 'Copper,L1,Top')
    pads_layer(top, 0)
    top.ap('C', TRACK)
    for t in tracks:
        top.path(t)
    top.ap('C', VIA_PAD)
    top.flash(*GND_VIA)
    top.save()

    bot = Gerber(f'{prefix}.GBL', 'Copper,L2,Bot')
    p = pour()
    bot.region(p.exterior)
    bot.polarity(False)
    for ring in p.interiors:
        bot.region(ring)
    bot.polarity(True)
    pads_layer(bot, 0, smd=False)
    bot.ap('C', VIA_PAD)
    bot.flash(*GND_VIA)
    bot.save()

    for name, fn, smd in (('GTS', 'Soldermask,Top', True), ('GBS', 'Soldermask,Bot', False)):
        g = Gerber(f'{prefix}.{name}', fn)
        pads_layer(g, MASK_GROW, smd=smd)
        g.save()

    silk_g = Gerber(f'{prefix}.GTO', 'Legend,Top')
    silk_g.ap('C', SILK_W)
    for line in silk:
        silk_g.path(line)
    silk_g.save()

    edge = Gerber(f'{prefix}.GKO', 'Profile,NP')
    edge.ap('C', 0.1)
    edge.path([(0, 0), (W, 0), (W, H), (0, H), (0, 0)])
    edge.save()

    tools = sorted({d for *_, d in holes})
    drill = ['M48', 'METRIC,LZ,0000.0000'] + [f'T{i + 1:02d}F00S00C{d:.4f}' for i, d in enumerate(tools)] + ['%']
    for i, d in enumerate(tools):
        drill.append(f'T{i + 1:02d}')
        drill += [f'X{round(x * 1e4):08d}Y{round(y * 1e4):08d}' for x, y, dd in holes if dd == d]
    (OUT / f'{prefix}.TXT').write_text('\n'.join(drill + ['M30']) + '\n')

    check_clearance()
    write_parts()
    print(f'wrote {len(list(OUT.iterdir()))} files to {OUT}')


def write_parts():
    """Simple component bodies for the 3D model (scripts/gerbers_to_glb.py --boxes).

    Each box: name, centre x/y in board mm, bottom z (0 = top of board), size, colour.
    0805 resistors are a dark body with tinned end caps; headers a black base with gold pins.
    """
    import json
    boxes = []
    body, cap = (1.3, 1.25, 0.5), (0.35, 1.25, 0.5)
    for ref, (x, y), vertical in resistors:
        for dx, size, colour in ((0, body, '#1e1e1e'), (-0.825, cap, '#c9c9c9'), (0.825, cap, '#c9c9c9')):
            sx, sy, sz = size
            cx, cy = (x, y + dx) if vertical else (x + dx, y)
            boxes.append([ref, cx, cy, 0.0, (sy, sx, sz) if vertical else (sx, sy, sz), colour])
    for ref, pins, along_x in (('J1', J1, True), ('J2', J2, False)):
        xs, ys = [p[0] for p in pins], [p[1] for p in pins]
        n = len(pins)
        size = (n * 2.54, 2.54, 2.5) if along_x else (2.54, n * 2.54, 2.5)
        boxes.append([ref, sum(xs) / n, sum(ys) / n, 0.0, size, '#151515'])
        for x, y in pins:
            boxes.append([ref, x, y, -3.0 - 1.6, (0.64, 0.64, 3.0 + 1.6 + 8.5), '#d6ab45'])
    (OUT.parent / 'parts.json').write_text(json.dumps(boxes, indent=1))


# Net of each track (same order as `tracks`) and of each pad, for the clearance check.
TRACK_NETS = ['n0', 'n0', 'n1', 'n1', 'n2', 'n2', 'VOUT', 'VOUT', 'GND', 'B0', 'B1', 'B2', 'B3']
PAD_NETS = {'RT': ('GND', 'n0'), 'R0': ('n0', 'B0'), 'R1': ('n1', 'B1'), 'R2': ('n2', 'B2'),
            'R3': ('VOUT', 'B3'), 'RL0': ('n0', 'n1'), 'RL1': ('n1', 'n2'), 'RL2': ('n2', 'VOUT')}
MIN_CLEAR = 0.2


def check_clearance():
    """Top-layer copper on different nets must be at least MIN_CLEAR apart."""
    shapes = {}
    add = lambda net, geom: shapes.setdefault(net, []).append(geom)
    for t, net in zip(tracks, TRACK_NETS):
        add(net, LineString(t).buffer(TRACK / 2))
    for ref, _, vertical in resistors:
        w, h = PAD_0805
        if vertical:
            w, h = h, w
        for (x, y), net in zip(pads[ref], PAD_NETS[ref]):
            add(net, box(x - w / 2, y - h / 2, x + w / 2, y + h / 2))
    for p, net in zip(J1 + J2, ('B0', 'B1', 'B2', 'B3', 'VOUT', 'GND')):
        add(net, Point(p).buffer(HDR_PAD / 2))
    add('GND', Point(GND_VIA).buffer(VIA_PAD / 2))
    merged = {n: unary_union(g) for n, g in shapes.items()}
    names = sorted(merged)
    worst = min((merged[a].distance(merged[b]), a, b) for i, a in enumerate(names) for b in names[i + 1:])
    print(f'closest different-net copper: {worst[0]:.3f} mm ({worst[1]} / {worst[2]})')
    assert worst[0] >= MIN_CLEAR, 'clearance violation'
    for n, g in merged.items():
        if n != 'GND':   # GND joins through the bottom pour instead
            assert g.geom_type == 'Polygon', f'net {n} is not connected'
    gnd = pour()
    assert gnd.geom_type == 'Polygon' and gnd.contains(Point(GND_VIA)) and gnd.contains(Point(J2[1]))


if __name__ == '__main__':
    main()
