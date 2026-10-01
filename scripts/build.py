"""Build the site from data/.

Reads data/site.yaml and every data/projects/<category>/*.yaml, checks that
each media file exists, then writes site/data.json and copies media/ into
site/media/. Run it after editing anything in data/ or media/:

    python scripts/build.py
    python scripts/build.py --serve     # build, then preview at http://localhost:8000
"""
import json
import re
import shutil
import sys
from pathlib import Path

import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA, MEDIA, SITE = ROOT / "data", ROOT / "media", ROOT / "site"
REQUIRED = ["title", "summary"]


def load(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def cover_aspect(p):
    """Width over height of the picture the home grid shows, so the two columns can be balanced."""
    src = (p.get("cover") or {}).get("src")
    first = (p.get("media") or [{}])[0]
    if not src and first.get("type") == "image":
        src = first.get("src")
    if not src or src.endswith(".svg"):
        return round(4 / 3, 4)
    with Image.open(ROOT / src) as im:
        return round(im.width / im.height, 4)


def image_aspect(src):
    """Width over height of an image file; SVGs are read from their viewBox."""
    path = ROOT / src
    if src.endswith(".svg"):
        m = re.search(r'viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"', path.read_text(encoding="utf-8"))
        return round(float(m.group(1)) / float(m.group(2)), 4) if m else 1.5
    with Image.open(path) as im:
        return round(im.width / im.height, 4)


def media_aspect(m):
    """The shape a picture keeps on the project page. 3D viewers get a 3:2 stage."""
    if m.get("type") == "image":
        return image_aspect(m["src"])
    if m.get("type") == "pages":
        return image_aspect(m["pages"][0]["src"])
    return 1.5


def main():
    errors = []
    site = load(DATA / "site.yaml")

    def check_media(src, where):
        if src and not (ROOT / src).is_file():
            errors.append(f"{where}: media file not found: {src}")

    for item in (site.get("profile") or {}).get("shelf") or []:
        check_media(item.get("src"), "site.yaml profile shelf")
    check_media((site.get("hero_layers") or {}).get("src"), "site.yaml hero_layers")
    check_media((site.get("hero_layers") or {}).get("traces"), "site.yaml hero_layers")

    categories = []
    for cat in site.get("categories", []):
        folder = DATA / "projects" / cat["id"]
        projects = []
        for path in sorted(folder.glob("*.yaml")):
            p = load(path)
            where = str(path.relative_to(ROOT))
            for key in REQUIRED:
                if not p.get(key):
                    errors.append(f"{where}: missing '{key}'")
            check_media((p.get("cover") or {}).get("src"), where)
            check_media(((p.get("cover") or {}).get("poster") or {}).get("logo"), where)
            for m in p.get("media") or []:
                if m.get("type") == "pages":
                    for pg in m.get("pages") or []:
                        check_media(pg.get("src"), where)
                    continue
                check_media(m.get("src"), where)
                if m.get("type") not in ("image", "stl", "glb"):
                    errors.append(f"{where}: media type must be image, stl, glb or pages, got {m.get('type')!r}")
            p["id"] = path.stem.split("-", 1)[-1]
            if not errors:
                p["cover_aspect"] = cover_aspect(p)
                for m in p.get("media") or []:
                    m["aspect"] = media_aspect(m)
            projects.append(p)
        categories.append({"id": cat["id"], "title": cat.get("title", cat["id"]), "projects": projects})

    if errors:
        print("Build failed:")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    out = dict(site)
    out["categories"] = categories
    (SITE / "data.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    if (SITE / "media").exists():
        shutil.rmtree(SITE / "media")
    shutil.copytree(MEDIA, SITE / "media")
    count = sum(len(c["projects"]) for c in categories)
    print(f"Built {count} projects in {len(categories)} categories -> site/")

    if "--serve" in sys.argv:
        import functools, http.server, socketserver
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
        with socketserver.TCPServer(("", 8000), handler) as httpd:
            print("Preview at http://localhost:8000  (Ctrl+C to stop)")
            httpd.serve_forever()


if __name__ == "__main__":
    main()
