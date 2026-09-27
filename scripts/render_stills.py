"""Render the process stills in media/ with tools/still.html and headless Edge.

One-off tool, not part of the site build; the PNGs are committed. Model files
outside this repo (the 3d-printing project) are read from PRINTS.

    python scripts/render_stills.py [name ...]
"""
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PRINTS = Path(r'C:\Users\Justin\Desktop\3d-printing\projects')
SM = PRINTS / 'ib-physics-sensor-mount' / 'stl'
SF = PRINTS / 'switch-fidget' / 'out' / 'stl'

# name: (output, [models], type, view options, size)
JOBS = {
    'insert-versions': ('printing/process/insert-versions.png',
                        [SM / f'Inside V{n}.stl' for n in (2, 3, 4, 5)], 'stl', dict(az=0, el=62, gap=16), (2000, 760)),
    'fit-tests': ('printing/process/fit-tests.png',
                  [SM / n for n in ('36-2mm.stl', '44+0mm.stl', '44+2mm.stl', 'TESTCircleinset V2.stl')],
                  'stl', dict(az=20, el=38, gap=10), (2000, 900)),
    'mount-final': ('printing/process/mount-final.png', [SM / 'Circle V4.stl', SM / 'insert2.stl'],
                    'stl', dict(az=30, el=32, gap=20), (2000, 1000)),
    'switch-coupons': ('printing/process/switch-coupons.png', [SF / 'switch_coupon.stl', SF / 'stem_coupon.stl'],
                       'stl', dict(az=15, el=45, gap=10), (2000, 800)),
    'switch-parts': ('printing/process/switch-parts.png', [SF / 'cap.stl', SF / 'housing.stl', SF / 'keycap.stl'],
                     'stl', dict(az=30, el=30, gap=12), (2000, 900)),
    'ldo-layers': ('pcb-ldo/process/layers.png', [ROOT / 'media/pcb-ldo/layers.glb'], 'glb',
                   dict(az=35, el=30, bg='141414', lc='5a5a5a'), (1600, 1500)),
    'ldo-assembled': ('pcb-ldo/process/assembled.png', [ROOT / 'media/pcb-ldo/board.glb'], 'glb',
                      dict(az=-30, el=30), (1600, 1100)),
    'r2r-assembled': ('r2r/process/assembled.png', [ROOT / 'media/r2r/board.glb'], 'glb',
                      dict(az=-30, el=32), (1600, 1100)),
    'r2r-layers': ('r2r/process/layers.png', [ROOT / 'media/r2r/layers.glb'], 'glb',
                   dict(az=35, el=30, bg='141414', lc='5a5a5a'), (1600, 1300)),
}


def url(path):
    return 'file:///' + quote(str(path).replace('\\', '/'), safe='/:')


def render(name):
    out, models, kind, view, (w, h) = JOBS[name]
    q = '&'.join([f'src={",".join(url(m) for m in models)}', f'type={kind}', f'w={w}', f'h={h}']
                 + [f'{k}={v}' for k, v in view.items()])
    dest = ROOT / 'media' / out
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([EDGE, '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                    '--allow-file-access-from-files', '--hide-scrollbars', f'--window-size={w},{h + 200}',
                    '--virtual-time-budget=20000', f'--screenshot={dest}',
                    f'{url(ROOT / "tools/still.html")}?{q}'], capture_output=True, timeout=120)
    Image.open(dest).crop((0, 0, w, h)).save(dest, optimize=True)
    print(f'{name}: {dest.relative_to(ROOT)}')


if __name__ == '__main__':
    for n in sys.argv[1:] or JOBS:
        render(n)
