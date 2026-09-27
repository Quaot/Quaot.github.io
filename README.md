# Portfolio

My portfolio site. All the content lives in small YAML files; a Python script turns them into the page.

```
data/
  site.yaml              name, tagline, about, links, the model at the top
  projects/
    hardware/*.yaml      one file per project; the number sets the order
    software/*.yaml
media/                   images and STL models, grouped by project
scripts/build.py         checks data/ and media/, writes site/data.json
site/                    the page itself: plain HTML, CSS and JavaScript
```

## Add or change a project

1. Copy an existing file in `data/projects/<category>/` and edit it.
2. Put its images or STL files in `media/<project>/` and list them under `media:`.
   Each item is `type: image` or `type: stl`, with a `src` and a `caption`.
3. Build and preview:

   ```
   pip install pyyaml
   python scripts/build.py --serve
   ```

   Then open http://localhost:8000. The build stops with a message if a file is
   missing or a project has no title or summary.

To export a SolidWorks part for the 3D viewer: **File > Save As > STL**, and set
the resolution to Coarse or Fine so the file stays under a few MB.

## Publishing

Pushing to `main` runs `.github/workflows/pages.yml`, which builds the site and
publishes `site/` to GitHub Pages. In the repo's **Settings > Pages**, set the
source to **GitHub Actions** once.

`site/data.json` and `site/media/` are generated, so they aren't committed.
