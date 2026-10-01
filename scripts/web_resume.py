"""Make the public copy of the résumé: the same PDF with the phone number taken out of the contact line.

    python scripts/web_resume.py "<path to résumé PDF>"

The contact line is redacted and redrawn from the original without the phone item (and without the stray
separator at the end of the line), centred again, with its links moved to match. Writes media/resume.pdf.
"""
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent


def main(src):
    original = pymupdf.open(src)
    page0 = original[0]
    spans = [s for b in page0.get_text('dict')['blocks'] for l in b.get('lines', []) for s in l['spans']]
    phone = next(s for s in spans if '991' in s['text'])
    line = [s for s in spans if abs(s['bbox'][1] - phone['bbox'][1]) < 3 or abs(s['bbox'][3] - phone['bbox'][3]) < 3]
    line.sort(key=lambda s: s['bbox'][0])
    y0 = min(s['bbox'][1] for s in line) - 1.5
    y1 = max(s['bbox'][3] for s in line) + 1.5
    # Keep everything after the phone's separator, and drop a separator left dangling at the end.
    k = line.index(phone)
    keep = line[k + 2:]
    if keep and keep[-1]['text'].strip() == '|':
        keep = keep[:-1]
    x0, x1 = keep[0]['bbox'][0], keep[-1]['bbox'][2]
    centre = (line[0]['bbox'][0] + line[-1]['bbox'][2]) / 2
    dx = centre - (x0 + x1) / 2

    out = pymupdf.open()
    out.insert_pdf(original)
    page = out[0]
    links = [l for l in page.get_links() if l['from'].y1 < y1 + 4 and l['from'].y0 > y0 - 4]
    page.add_redact_annot(pymupdf.Rect(0, y0, page.rect.width, y1), fill=(1, 1, 1))
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
    page.show_pdf_page(pymupdf.Rect(x0 + dx, y0, x1 + dx, y1), original, 0, clip=pymupdf.Rect(x0, y0, x1, y1))
    for l in page.get_links():
        if l['from'].y1 < y1 + 4 and l['from'].y0 > y0 - 4:
            page.delete_link(l)
    for l in links:
        if 'tel:' in (l.get('uri') or ''):
            continue
        r = l['from']
        page.insert_link({'kind': pymupdf.LINK_URI, 'uri': l['uri'], 'from': pymupdf.Rect(r.x0 + dx, r.y0, r.x1 + dx, r.y1)})

    out.set_metadata({'title': 'Justin Gu, résumé', 'author': 'Justin Gu'})
    dest = ROOT / 'media' / 'resume.pdf'
    out.save(dest, garbage=4, deflate=True)
    text = pymupdf.open(dest)[0].get_text()
    assert '991' not in text and 'tel:' not in str(pymupdf.open(dest)[0].get_links())
    print(dest.relative_to(ROOT), 'written, phone removed')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
