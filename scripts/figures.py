"""Editorial figures for the process pages, as SVGs that follow the page's light/dark theme.

    python scripts/figures.py

Numbers come from the project READMEs (2-layer-PCB-LDO, r2r-dac).
"""
from pathlib import Path

MEDIA = Path(__file__).resolve().parent.parent / 'media'
W, H = 1200, 560
FONT = "'Inter Tight','Helvetica Neue',Helvetica,Arial,sans-serif"
STYLE = f"""<style>
  .bg {{ fill: #f2f2f2; }} .ink {{ fill: #111; }} .muted {{ fill: #8a8a8a; }}
  .line {{ stroke: #111; }} .hair {{ stroke: #d6d6d6; }} .track {{ fill: #dcdcdc; }}
  .accent {{ fill: #d4892f; }} .accent-line {{ stroke: #d4892f; }}
  text {{ font-family: {FONT}; }}
  @media (prefers-color-scheme: dark) {{
    .bg {{ fill: #1a1a1a; }} .ink {{ fill: #f2f2f2; }} .muted {{ fill: #7c7c7c; }}
    .line {{ stroke: #f2f2f2; }} .hair {{ stroke: #2e2e2e; }} .track {{ fill: #2f2f2f; }}
  }}
</style>"""


def svg(name, body):
    out = MEDIA / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
                   f'{STYLE}<rect class="bg" width="{W}" height="{H}"/>{body}</svg>\n', encoding='utf-8')
    print(out.relative_to(MEDIA.parent))


def t(x, y, s, size=20, cls='ink', anchor='start', weight=400):
    return (f'<text x="{x}" y="{y}" class="{cls}" font-size="{size}" font-weight="{weight}" '
            f'text-anchor="{anchor}">{s}</text>')


def ldo_window():
    # README: 3.20 V low case, 3.41 V high case, 3.44 V once the 120 uA ADJ current is added.
    x0, x1, v0, v1 = 80, 1120, 3.0, 3.6
    X = lambda v: x0 + (v - v0) / (v1 - v0) * (x1 - x0)
    y = 380
    b = [t(80, 90, 'Worst-case output, every tolerance against me', 22, 'muted'),
         t(76, 196, '3.20 – 3.44 V', 104, 'ink', weight=600)]
    b.append(f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" class="hair" stroke-width="2"/>')
    for k in range(7):
        v = v0 + k * 0.1
        b.append(f'<line x1="{X(v)}" y1="{y - 6}" x2="{X(v)}" y2="{y + 6}" class="hair" stroke-width="2"/>')
        b.append(t(X(v), y + 46, f'{v:.1f}', 20, 'muted', 'middle'))
    b.append(f'<rect x="{X(3.20)}" y="{y - 7}" width="{X(3.41) - X(3.20)}" height="14" rx="7" class="ink"/>')
    b.append(f'<rect x="{X(3.41) - 7}" y="{y - 7}" width="{X(3.44) - X(3.41) + 7}" height="14" rx="7" class="accent"/>')
    b.append(f'<line x1="{X(3.3)}" y1="{y - 40}" x2="{X(3.3)}" y2="{y - 14}" class="line" stroke-width="2"/>')
    b.append(t(X(3.3), y - 52, '3.3 V target', 20, 'ink', 'middle', 500))
    b.append(t(X(3.41), y - 24, '+32 mV from the ADJ pin current', 20, 'muted'))
    b.append(t(80, 500, 'Low: minimum reference, R1 1% high, R2 1% low.   High: the opposite, plus 120 µA through R2.',
               19, 'muted'))
    svg('pcb-ldo/process/window.svg', ''.join(b))


def ldo_thermal():
    # README: 0.85 W at 500 mA, theta_JA 84 C/W with 194 mm^2 of copper, 125 C limit.
    x0, x1, t0, t1 = 80, 1120, 25, 125
    X = lambda v: x0 + (v - t0) / (t1 - t0) * (x1 - x0)
    y = 360
    tj45, tj25 = 45 + 0.85 * 84, 25 + 0.85 * 84
    b = [t(80, 90, 'Calculated junction temperature, 500 mA on a 45 °C day', 22, 'muted'),
         t(76, 196, f'{tj45:.0f} °C', 104, 'ink', weight=600),
         t(80, 244, f'0.85 W × 84 °C/W, with 194 mm² of copper on the tab. {tj25:.0f} °C in a 25 °C room.', 20, 'muted')]
    b.append(f'<rect x="{x0}" y="{y - 7}" width="{x1 - x0}" height="14" rx="7" class="track"/>')
    b.append(f'<rect x="{x0}" y="{y - 7}" width="{X(tj45) - x0}" height="14" rx="7" class="ink"/>')
    b.append(f'<line x1="{x1}" y1="{y - 34}" x2="{x1}" y2="{y + 34}" class="accent-line" stroke-width="3"/>')
    b.append(t(x1, y + 66, '125 °C recommended max', 20, 'ink', 'end', 500))
    b.append(t(x1 - 16, y - 26, f'{125 - tj45:.0f} °C to spare', 20, 'ink', 'end', 500))
    b.append(t(x0, y + 66, '25 °C', 20, 'muted'))
    svg('pcb-ldo/process/thermal.svg', ''.join(b))


def r2r_steps():
    # Vout = 3.3 V x code / 16.
    x0, x1, y0, y1 = 110, 1120, 480, 150      # plot box; y0 is 0 V, y1 is 3.3 V
    X = lambda c: x0 + c / 16 * (x1 - x0)
    Y = lambda v: y0 - v / 3.3 * (y0 - y1)
    b = [t(80, 70, 'Ideal output for every 4-bit code', 22, 'muted'),
         t(80, 118, '16 levels, 0.206 V apart', 44, 'ink', weight=600)]
    for v in (0, 1, 2, 3):
        b.append(f'<line x1="{x0}" y1="{Y(v)}" x2="{x1}" y2="{Y(v)}" class="hair" stroke-width="1.5"/>')
        b.append(t(x0 - 18, Y(v) + 7, f'{v} V', 18, 'muted', 'end'))
    pts = []
    for c in range(16):
        v = 3.3 * c / 16
        pts += [(X(c), Y(v)), (X(c + 1), Y(v))]
    d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    b.append(f'<polyline points="{d}" fill="none" class="line" stroke-width="3" stroke-linejoin="round"/>')
    for c in (0, 4, 8, 12, 15):
        b.append(t((X(c) + X(c + 1)) / 2, y0 + 40, f'{c:04b}', 18, 'muted', 'middle'))
    for c, label in ((8, '1000 → 1.65 V'), (15, '1111 → 3.09 V')):
        cx, cy = (X(c) + X(c + 1)) / 2, Y(3.3 * c / 16)
        b.append(f'<circle cx="{cx}" cy="{cy}" r="6" class="accent"/>')
        b.append(t(cx - 14, cy - 18, label, 20, 'ink', 'end', 500))
    svg('r2r/process/steps.svg', ''.join(b))


if __name__ == '__main__':
    ldo_window()
    ldo_thermal()
    r2r_steps()
