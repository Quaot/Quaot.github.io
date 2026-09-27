"""Pull the preview image SolidWorks embeds in a .SLDPRT/.SLDASM (no SolidWorks needed).

    python scripts/sw_preview.py <file> <out.png>

The preview is a deflate-compressed PNG inside the file. It is scanned for,
then white is made transparent so it sits on any background.
"""
import sys
import zlib

import numpy as np
from PIL import Image
from io import BytesIO


def find_png(data):
    for i in range(len(data)):
        try:
            out = zlib.decompressobj(-15).decompress(data[i:i + 600000])
        except zlib.error:
            continue
        if out[:4] == b'\x89PNG' and len(out) > 2000:
            return out
    return None


def main(src, dest):
    png = find_png(open(src, 'rb').read())
    if not png:
        sys.exit(f'no preview in {src}')
    im = np.asarray(Image.open(BytesIO(png)).convert('RGBA')).copy()
    white = (im[..., :3].min(axis=2) > 245)
    im[white, 3] = 0
    out = Image.fromarray(im)
    out = out.crop(out.getbbox())
    out.save(dest)
    print(dest, out.size)


if __name__ == '__main__':
    main(*sys.argv[1:3])
