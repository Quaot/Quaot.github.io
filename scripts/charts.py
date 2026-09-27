"""Process charts, drawn from numbers in the project READMEs. Output PNGs are committed.

    python scripts/charts.py
"""
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
BG, INK, MUTED, ACCENT = '#f2f2f2', '#111111', '#9a9a9a', '#d4892f'
plt.rcParams.update({
    'font.family': ['Arial', 'DejaVu Sans'], 'font.size': 24, 'axes.edgecolor': INK, 'axes.labelcolor': INK,
    'xtick.color': INK, 'ytick.color': INK, 'axes.spines.top': False, 'axes.spines.right': False,
    'figure.facecolor': BG, 'axes.facecolor': BG, 'savefig.facecolor': BG,
})


def save(fig, rel):
    out = ROOT / 'media' / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=100)
    plt.close(fig)
    print(out.relative_to(ROOT))


def ldo_tolerance():
    # 2-layer-PCB-LDO README: 3.20 V low case, 3.41 V high case, 3.44 V with ADJ-pin current.
    # JEDEC JESD8C: normal 3.0-3.6 V, narrow 3.15-3.45 V.
    fig, ax = plt.subplots(figsize=(16, 6.5))
    ax.axvspan(3.0, 3.6, color='#e2e2e2', lw=0)
    ax.axvspan(3.15, 3.45, color='#cfcfcf', lw=0)
    ax.text(3.005, 0.93, 'JEDEC normal\n3.0 to 3.6 V', color=MUTED, va='top')
    ax.text(3.16, 0.93, 'JEDEC narrow range 3.15 to 3.45 V', color=INK, va='top')
    ax.plot([3.20, 3.44], [0.45, 0.45], color=ACCENT, lw=10, solid_capstyle='butt')
    ax.plot([3.20, 3.41], [0.45, 0.45], color=INK, lw=2)
    for x, label, y, ha in ((3.20, '3.20 V\nlow Vref, R1 +1%, R2 -1%', 0.24, 'center'),
                            (3.41, '3.41 V', 0.62, 'center'),
                            (3.44, '3.44 V\n+ 120 µA ADJ current', 0.24, 'left')):
        ax.plot([x, x], [0.38, 0.52], color=INK, lw=1.5)
        ax.text(x - (0.012 if ha == 'left' else 0), y, label, ha=ha, va='center', fontsize=21)
    ax.set_xlim(2.95, 3.65)
    ax.set_ylim(0, 1)
    ax.set_yticks([])
    ax.spines['left'].set_visible(False)
    ax.set_xlabel('Output voltage (V)')
    fig.tight_layout(pad=2)
    save(fig, 'pcb-ldo/process/tolerance.png')


def ldo_thermal():
    # README: 0.85 W at 500 mA, theta_JA 84 C/W with 194 mm^2 of top copper, 125 C limit.
    fig, ax = plt.subplots(figsize=(16, 7))
    ta = [0, 60]
    ax.plot(ta, [t + 0.85 * 84 for t in ta], color=INK, lw=2.5)
    ax.axhline(125, color=ACCENT, lw=2)
    ax.text(1, 127, '125 °C maximum junction temperature', color=ACCENT)
    for t in (25, 45):
        tj = t + 0.85 * 84
        ax.plot([t], [tj], 'o', color=INK, ms=9)
        ax.text(t + 1.2, tj - 9, f'{tj:.0f} °C at {t} °C ambient', fontsize=21)
    ax.set_xlim(0, 60)
    ax.set_ylim(60, 140)
    ax.set_xlabel('Ambient temperature (°C)')
    ax.set_ylabel('Junction temperature (°C)')
    fig.tight_layout(pad=2)
    save(fig, 'pcb-ldo/process/thermal.png')


def r2r_staircase():
    # Vout = 3.3 V x code / 16 (r2r_dac.cir, README).
    codes = list(range(16))
    v = [3.3 * c / 16 for c in codes]
    fig, ax = plt.subplots(figsize=(16, 7))
    ax.step(codes + [16], v + [v[-1]], where='post', color=INK, lw=2.5)
    ax.plot([0, 16], [0, 3.3], color=MUTED, lw=1, ls='--')
    ax.text(15.9, 3.33, '3.3 V', color=MUTED, ha='right', va='bottom', fontsize=21)
    ax.text(8.25, 1.2, 'code 8 = 1.65 V', fontsize=21)
    ax.text(15.1, 3.09 - 0.25, '15 = 3.09 V', fontsize=21, color=ACCENT)
    ax.set_xticks(range(16), [f'{c:04b}' for c in codes], fontsize=17, rotation=90)
    ax.set_xlim(0, 16.2)
    ax.set_ylim(0, 3.5)
    ax.set_xlabel('Input code (B3 B2 B1 B0)')
    ax.set_ylabel('Output (V)')
    fig.tight_layout(pad=2)
    save(fig, 'r2r/process/staircase.png')


if __name__ == '__main__':
    ldo_tolerance()
    ldo_thermal()
    r2r_staircase()
