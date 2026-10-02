"""Build the site from data/.

Reads data/site.yaml and every data/projects/<category>/*.yaml, checks that each media file exists, then:
- copies media/ into site/media/, adding WebP copies of every picture at a few widths (cached in .cache/),
- writes site/data.json with root-absolute paths and the size and copies of every picture,
- writes one HTML page per address from site/shell.html: index.html, profile/index.html, p/<id>/index.html and
  404.html, each with its own title, description and preview card, and with versioned asset links so a deploy
  is seen at once while unchanged files stay cached.
Run it after editing anything in data/ or media/:

    python scripts/build.py
    python scripts/build.py --serve     # build, then preview at http://localhost:8000
"""
import hashlib
import html
import json
import re
import shutil
import sys
from pathlib import Path

import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA, MEDIA, SITE = ROOT / "data", ROOT / "media", ROOT / "site"
CACHE = ROOT / ".cache" / "variants"
REQUIRED = ["title", "summary"]
WIDTHS = (640, 1280, 1920)          # WebP copies made of every picture, never wider than the original
RASTER = (".jpg", ".jpeg", ".png")


def variants(src):
    """WebP copies of one picture at WIDTHS (and its own width if narrower), made once and cached.
    Returns (width, height, [(url, width), ...])."""
    path = ROOT / src
    with Image.open(path) as im:
        w, h = im.size
        widths = sorted({min(x, w) for x in WIDTHS})
        out = []
        for x in widths:
            rel = Path(src).with_suffix(f".{x}.webp")
            cached = CACHE / rel
            if not cached.exists() or cached.stat().st_mtime < path.stat().st_mtime:
                cached.parent.mkdir(parents=True, exist_ok=True)
                frame = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
                if x != w:
                    frame = frame.resize((x, round(h * x / w)), Image.LANCZOS)
                frame.save(cached, "WEBP", quality=80, method=5)
            out.append(("/" + rel.as_posix(), x))
    return w, h, out


def absolute(value):
    """Make every media/... path in the data root-absolute, so pages at /p/<id>/ find them."""
    if isinstance(value, dict):
        return {k: absolute(v) for k, v in value.items()}
    if isinstance(value, list):
        return [absolute(v) for v in value]
    if isinstance(value, str) and value.startswith("media/"):
        return "/" + value
    return value


def version(data):
    return hashlib.sha1(data if isinstance(data, bytes) else data.encode("utf-8")).hexdigest()[:10]


def plain(text, limit=200):
    """One line of text for a description tag: no *emphasis* marks, cut at a word."""
    text = re.sub(r"\s+", " ", (text or "").replace("*", "")).strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


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

    # Media, plus the WebP copies of every picture the pages use.
    if (SITE / "media").exists():
        shutil.rmtree(SITE / "media")
    shutil.copytree(MEDIA, SITE / "media")
    pictures = set()
    for c in categories:
        for p in c["projects"]:
            pictures.add((p.get("cover") or {}).get("src"))
            for m in p.get("media") or []:
                if m.get("type") == "image":
                    pictures.add(m["src"])
                for pg in m.get("pages") or []:
                    pictures.add(pg["src"])
    images = {}
    for src in sorted(x for x in pictures if x and x.lower().endswith(RASTER)):
        w, h, out = variants(src)
        for url, _ in out:
            shutil.copy2(CACHE / url[len("/"):], SITE / url[len("/"):])
        images["/" + src] = {"w": w, "h": h, "set": out}

    out = absolute(dict(site))
    out["categories"] = absolute(categories)
    out["images"] = images
    data_json = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    (SITE / "data.json").write_text(data_json, encoding="utf-8")

    write_pages(site, categories, images, data_json)
    count = sum(len(c["projects"]) for c in categories)
    print(f"Built {count} projects in {len(categories)} categories, {len(images)} pictures -> site/")

    if "--serve" in sys.argv:
        import functools, http.server, socketserver
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
        with socketserver.TCPServer(("", 8000), handler) as httpd:
            print("Preview at http://localhost:8000  (Ctrl+C to stop)")
            httpd.serve_forever()


def write_pages(site, categories, images, data_json):
    """One HTML file per address, from site/shell.html, each with its own title and preview card."""
    shell = (SITE / "shell.html").read_text(encoding="utf-8")
    base = site.get("url", "https://quaot.github.io").rstrip("/")
    name = site.get("name", "Justin Gu")
    versions = {
        "v_style": version((SITE / "style.css").read_bytes()),
        "v_app": version((SITE / "app.js").read_bytes()),
        "v_viewer": version((SITE / "viewer.js").read_bytes()),
        "v_data": version(data_json),
    }
    og = lambda key: f"{base}/media/og/{key}.png" if (MEDIA / "og" / f"{key}.png").exists() else f"{base}/media/og.png"

    def page(path, title, description, image, preload=""):
        text = shell
        fields = {"title": html.escape(title), "description": html.escape(description), "url": f"{base}{path}",
                  "image": image, "preload": preload, **versions}
        for key, value in fields.items():
            text = text.replace("{{" + key + "}}", value)
        target = SITE / path.strip("/") / "index.html" if path != "/404" else SITE / "404.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def preload_picture(src, sizes):
        info = images.get("/" + src) if src else None
        if not info:
            return ""
        srcset = ", ".join(f"{u} {w}w" for u, w in info["set"])
        return f'<link rel="preload" as="image" imagesrcset="{srcset}" imagesizes="{sizes}" fetchpriority="high">'

    data_preload = f'<link rel="preload" href="/data.json?v={versions["v_data"]}" as="fetch" crossorigin>'
    home_description = plain(site.get("tagline"))
    page("/", name, home_description, og("home"), data_preload)
    page("/404", name, home_description, og("home"), data_preload)
    profile = site.get("profile") or {}
    page("/profile/", f"About | {name}", plain(profile.get("lead") or site.get("about")), og("profile"), data_preload)

    shutil.rmtree(SITE / "p", ignore_errors=True)
    for c in categories:
        for p in c["projects"]:
            first = (p.get("media") or [{}])[0]
            hero = first.get("src") if first.get("type") == "image" else None
            summary = (p.get("summary") or "").split("\n\n")[0]
            page(f"/p/{p['id']}/", f"{p['title']} | {name}", plain(summary), og(p["id"]),
                 data_preload + preload_picture(hero, "(max-width: 1400px) 100vw, 1330px"))


if __name__ == "__main__":
    main()
