> **Moved.** This site now lives at **[justin.brogu.ca](https://justin.brogu.ca)**. This repo only publishes
> redirects from the old quaot.github.io addresses (see `redirect/` and `.github/workflows/pages.yml`).

# Portfolio

My portfolio site, [quaot.github.io](https://quaot.github.io). All the content lives in small YAML files, and a
Python script turns them into the pages.

```
data/
  site.yaml              name, tagline, home board, profile, links, order of projects
  projects/
    hardware/*.yaml      one file per project
    software/*.yaml
media/                   pictures and 3D models, grouped by project (media/stills: ready-made 3D pictures)
scripts/                 build.py plus the tools that make pictures, cards and fonts (below)
site/
  shell.html             the page shell; build.py writes one copy per address from it
  app.js, viewer.js      the pages and the 3D viewer
  style.css, fonts/
```

## Add or change a project

1. Copy an existing file in `data/projects/<category>/` and edit it. The part after the number in the file name
   is the project's address: `05-rolling-wheel.yaml` is `/p/rolling-wheel/`.
2. Put its pictures and models in `media/<project>/` and list them under `media:`.
3. Add its id to `order:` in `data/site.yaml` to place it on the home page.
4. Build and preview:

   ```
   pip install pyyaml pillow
   python scripts/build.py --serve
   ```

   Then open http://localhost:8000. The build stops with a message if a file is missing or a project has no title
   or summary.

### Project fields

| Field | What it does |
|---|---|
| `title`, `category` | Shown on the page, the home tile and the preview card |
| `color` | The project's colour: hover panel, numbers, plates, preview card. Text on it is chosen for contrast |
| `summary` | The description. Blank lines start new paragraphs, `*words*` become italic |
| `links` | `label` and `url`, listed under the description |
| `cover.src` | The picture on the home tile and thumbnails (otherwise the first item of `media`) |
| `media` | The pictures, in order. The first opens the page, full width |

Each `media` item:

| Field | What it does |
|---|---|
| `type` | `image`, `stl` or `glb` (3D, drag to rotate), or `pages` (a Beginning/Middle/End row of document pages) |
| `src`, `alt` | The file, and a description for screen readers |
| `caption` | One numbered line under the picture, also shown in the full-screen viewer |
| `beside: true` | Sits in the same row as the item before it. Pictures in a row are scaled to one height |
| `dark: true` | A dark backing for pictures with a dark background |
| `pages` | For `type: pages`: a list of `src`, `label` and `alt` |

### Site fields (`data/site.yaml`)

`tagline`, `intro` (home page, `*italic*` allowed); `hero_layers` (the home board: model, `traces`, `poster`,
`readout`, `hint`, `caption`); `profile` (`lead`, `stats`, `shelf`, `timeline`, `skills`); `about`; `now`
(the dated list on the profile, update each term); `links`; `order`; `url` (set this if the site moves to its
own domain).

## Scripts

| Command | Makes |
|---|---|
| `python scripts/build.py` | The site: pages, `data.json`, WebP copies of every picture |
| `node scripts/smoke.mjs` | Checks every page in Chrome at phone and desktop size, light and dark (see below) |
| `node scripts/render_web_stills.mjs` | Ready-made pictures of every 3D view, drawn by the site's own viewer. Run it after changing a model, with the site served and Chrome running headless on port 9336 |
| `python scripts/og_image.py` | The link-preview cards, one per project, and the icons |
| `python scripts/make_fonts.py` | The subset web fonts in `site/fonts` |
| `python scripts/compose_screens.py <shots>` | App screenshots placed in phone frames on the project colour |
| `python scripts/compose_physics.py <pdf>`, `compose_math.py <pdf>` | Figures and sample pages from the IAs. Pages with the candidate code are refused |
| `python scripts/compose_bakfiets.py <repo>` | The Bakfiets pictures, from the club's repository |
| `python scripts/trace_paths.py ...` | The board's copper tracks, for the current on the home board |
| `python scripts/web_resume.py <pdf>` | The public résumé, with the phone number removed |
| `python scripts/figures.py`, `render_stills.py` | Charts and process renders |

To export a SolidWorks part for the 3D viewer: **File > Save As > STL**, resolution Coarse or Fine so the file
stays under a few MB. Then run `render_web_stills.mjs` so it gets its ready-made picture.

## Speed

Pages stay quick as projects are added:
- three.js is only fetched when a 3D view is about to go live. Small 3D views show ready-made pictures and come
  alive on hover (on phones, when centred). Live models start after the first scroll, touch or pointer move,
  and at most three run at once.
- Pictures are served as WebP at the width they are shown, with their size set so nothing jumps.
- Fonts are self-hosted and subset, and asset links carry a version, so a deploy is seen at once.

`scripts/smoke.mjs` enforces a budget: at most 1.2 MB fetched before a phone visitor scrolls, and at most four
live 3D views. A page over budget fails the check with a message saying which page and why.

## Publishing

Pushing to `main` runs `.github/workflows/pages.yml`: it builds the site, runs the smoke check, and only if every
page passes publishes `site/` to GitHub Pages. In the repo's **Settings > Pages**, the source is **GitHub Actions**.

Generated files (`site/index.html`, `site/404.html`, `site/p/`, `site/profile/`, `site/data.json`, `site/media/`
and `.cache/`) aren't committed.
