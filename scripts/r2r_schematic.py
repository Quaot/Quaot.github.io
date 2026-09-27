"""Draw the R-2R DAC schematic as a clean SVG, from the same netlist as r2r_dac.cir.

    python scripts/r2r_schematic.py

RT n0-GND, R0 B0-n0, RL0 n0-n1, R1 B1-n1, RL1 n1-n2, R2 B2-n2, RL2 n2-VOUT, R3 B3-VOUT.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'media' / 'r2r' / 'schematic-clean.svg'
INK, MUTED, ACCENT = '#111111', '#8a8a8a', '#d4892f'
FONT = "'Inter Tight','Helvetica Neue',Helvetica,Arial,sans-serif"

W, H = 1200, 560
TOP, BOTTOM = 150, 430          # ladder rail and input terminals
NODES = [300, 500, 700, 900]    # n0, n1, n2, VOUT
parts = []


def line(*pts, color=INK, w=2.5):
    d = ' '.join(f'{x},{y}' for x, y in pts)
    parts.append(f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                 f'stroke-linejoin="round" stroke-linecap="round"/>')


def text(x, y, s, size=22, color=INK, anchor='middle', weight=500):
    parts.append(f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
                 f'fill="{color}" text-anchor="{anchor}">{s}</text>')


def resistor(x0, y0, x1, y1, ref, value, label_side=1):
    """Zig-zag resistor between two points (horizontal or vertical), 80 px body."""
    horiz = y0 == y1
    length = (x1 - x0) if horiz else (y1 - y0)
    mid = length / 2
    body, n = 80, 6
    a, b = mid - body / 2, mid + body / 2
    pts = [(0, 0), (a, 0)]
    for i in range(n):
        pts.append((a + body * (i + 0.5) / n, 12 if i % 2 == 0 else -12))
    pts += [(b, 0), (length, 0)]
    mapped = [(x0 + p, y0 + q) if horiz else (x0 + q, y0 + p) for p, q in pts]
    line(*mapped)
    if horiz:
        text(x0 + mid, y0 - 26, ref, 22)
        text(x0 + mid, y0 + 42, value, 20, MUTED, weight=400)
    else:
        text(x0 + 26 * label_side, y0 + mid - 4, ref, 22, anchor='start' if label_side > 0 else 'end')
        text(x0 + 26 * label_side, y0 + mid + 22, value, 20, MUTED, anchor='start' if label_side > 0 else 'end', weight=400)


def dot(x, y):
    parts.append(f'<circle cx="{x}" cy="{y}" r="6" fill="{INK}"/>')


def terminal(x, y, label, color=INK, below=True):
    parts.append(f'<circle cx="{x}" cy="{y}" r="8" fill="#fff" stroke="{color}" stroke-width="2.5"/>')
    text(x, y + (40 if below else -22), label, 22, color, weight=600)


def ground(x, y):
    line((x, y), (x, y + 18))
    for i, half in enumerate((22, 14, 6)):
        line((x - half, y + 18 + i * 8), (x + half, y + 18 + i * 8))


# Ladder rail: RT's top, then n0 -> n1 -> n2 -> VOUT through the 10k resistors.
x_rt = 140
line((x_rt, TOP), (NODES[0], TOP))
for i in range(3):
    resistor(NODES[i], TOP, NODES[i + 1], TOP, f'RL{i}', '10k')
for x in NODES[:3]:
    dot(x, TOP)

# RT from the left end of the rail to ground.
resistor(x_rt, TOP, x_rt, BOTTOM - 40, 'RT', '20k', label_side=-1)
ground(x_rt, BOTTOM - 40)

# A 20k leg from every node down to its bit input.
for i, x in enumerate(NODES):
    resistor(x, TOP, x, BOTTOM, f'R{i}', '20k')
    terminal(x, BOTTOM, f'B{i}')

# Output.
dot(NODES[3], TOP)
line((NODES[3], TOP), (1060, TOP), color=ACCENT, w=3)
terminal(1060, TOP, 'VOUT', ACCENT, below=False)
text(1060, TOP + 44, 'J2', 18, MUTED, weight=400)
text(W / 2, BOTTOM + 90, 'J1  ·  B0 is the least significant bit, B3 the most', 18, MUTED, weight=400)
text(40, 60, 'V<tspan font-size="15" dy="5">OUT</tspan><tspan dy="-5"> = 3.3 V × code / 16</tspan>', 26, INK,
     anchor='start', weight=500)

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
       f'<rect width="{W}" height="{H}" fill="#f2f2f2"/>' + ''.join(parts) + '</svg>\n')
OUT.write_text(svg, encoding='utf-8')
print(OUT)
