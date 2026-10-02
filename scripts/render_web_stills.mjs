// Ready-made pictures of the site's 3D views, drawn by the site's own viewer so they match it exactly.
// The page shows these until a model is hovered (or centred on a phone), so no 3D work happens on load.
//
//   python scripts/build.py --serve                        (in one terminal: the site at http://localhost:8000)
//   chrome --headless=new --remote-debugging-port=9336     (any Chrome or Edge, in another)
//   node scripts/render_web_stills.mjs [port]
//
// Writes media/stills/<model>.<shape>.<theme>.webp for every 3D cover (4x3), project-page model (3x2) and
// profile shelf item (4x5),
// and media/stills/hero.wide.webp / hero.narrow.webp for the home-page board at rest. Run it again after
// changing a model, then build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'media', 'stills');
const SITE = 'http://localhost:8000/';
const port = process.argv[2] || 9336;
mkdirSync(OUT, { recursive: true });

const name = (src) => src.replace(/^\/?media\//, '').replace(/\.\w+$/, '').replace(/\//g, '-');

// What needs a picture: the first 3D item of any project without a cover picture, and the shelf.
const data = JSON.parse(readFileSync(join(ROOT, 'site', 'data.json'), 'utf8'));
const jobs = new Map();
for (const c of data.categories) {
  for (const p of c.projects) {
    const m = (p.media || [])[0];
    if (!(p.cover || {}).src && m && (m.type === 'stl' || m.type === 'glb')) jobs.set(`${m.src}|4x3`, { src: m.src, type: m.type, shape: '4x3', w: 640, h: 480 });
  }
}
for (const c of data.categories) {   // every model on a project page, shown as a picture until the page wakes
  for (const p of c.projects) {
    for (const m of p.media || []) {
      if (m.type === 'stl' || m.type === 'glb') jobs.set(`${m.src}|3x2`, { src: m.src, type: m.type, shape: '3x2', w: 720, h: 480 });
    }
  }
}
for (const it of (data.profile || {}).shelf || []) jobs.set(`${it.src}|4x5`, { src: it.src, type: it.type, shape: '4x5', w: 400, h: 500 });

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result.result.value;
};
const save = (file, dataUrl) => {
  writeFileSync(join(OUT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`media/stills/${file}`);
};

await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
for (const theme of ['light', 'dark']) {
  for (const job of jobs.values()) {
    await send('Page.navigate', { url: SITE + 'profile/' });   // a page with no hero, so nothing else draws
    await sleep(2500);
    const url = await evaluate(`(async () => {
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      const box = Object.assign(document.createElement('div'), { className: 'viewer still' });
      Object.assign(box.style, { position: 'fixed', left: '0', top: '0', width: '${job.w}px', height: '${job.h}px', zIndex: 99 });
      document.body.append(box);
      STLViewer.watch(box, ${JSON.stringify(job.src)}, ${JSON.stringify(job.type)});
      for (let i = 0; i < 200; i++) {
        const img = box.querySelector('img.snap');
        if (img && img.src.startsWith('data:')) return img.src;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('no picture for ${job.src}');
    })()`);
    save(`${name(job.src)}.${job.shape}.${theme}.webp`, url);
  }
}

// The home-page board at rest, as wide and phone-shaped pictures.
for (const [file, size] of [['hero.wide.webp', [1440, 900, 1.5, false]], ['hero.narrow.webp', [390, 844, 3, true]]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: size[2], mobile: size[3] });
  await send('Page.navigate', { url: SITE });
  await sleep(3000);
  const url = await evaluate(`(async () => {
    const run = document.querySelector('.hero-run');
    scrollTo(0, run.offsetTop);
    dispatchEvent(new Event('scroll'));
    const el = document.querySelector('.hero-viewer');
    for (let i = 0; i < 200 && !(el._v && el._v.ready); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 1500));   // let the layers settle closed
    return new Promise((resolve) => { el._capture = resolve; });
  })()`);
  save(file, url);
}
ws.close();
