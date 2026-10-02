// Checks the built site the way a visitor would see it, and fails if anything is broken or too heavy.
//
//   python scripts/build.py && node scripts/smoke.mjs
//
// Serves site/ itself, starts headless Chrome (CHROME_PATH, or the usual install locations), and visits /,
// /profile/ and every /p/<id>/ at desktop and phone size, light and dark. A page fails on: a script error or
// console error, a request that fails, a broken picture, sideways scrolling, a missing preview card, or going
// over the budget below. The deploy workflow runs this before publishing, so a new project that breaks the
// site or slows it down is caught with a message saying which page and why.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const BUDGET = {
  firstLoadBytes: 1.2 * 1024 * 1024,   // everything fetched before the visitor scrolls, on a phone
  liveCanvases: 4,                      // the home board plus at most three live models at once
};

// ---- a tiny static server that behaves like GitHub Pages ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.stl': 'model/stl', '.pdf': 'application/pdf' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(SITE, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  let status = 200;
  if (!existsSync(file)) { file = join(SITE, '404.html'); status = 404; }
  res.writeHead(status, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- Chrome ----
const chromePath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
if (!chromePath) { console.error('No Chrome found: set CHROME_PATH'); process.exit(2); }
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'smoke-'))}`, '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 50 && !targets; i++) {
  await new Promise((r) => setTimeout(r, 200));
  targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else listeners.forEach((fn) => fn(m));
});
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result.result ? r.result.result.value : undefined;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Runtime.enable');
await send('Network.enable');
await send('Log.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

// ---- what to visit ----
const data = JSON.parse(readFileSync(join(SITE, 'data.json'), 'utf8'));
const ids = data.categories.flatMap((c) => c.projects.map((p) => p.id));
const routes = ['/', '/profile/', ...ids.map((x) => `/p/${x}/`)];
const sizes = [['desktop', 1280, 800, 1, false], ['phone', 390, 844, 3, true]];
const themes = ['light', 'dark'];

let problems = 0;
const report = (where, what) => { problems++; console.log(`  FAIL ${where}: ${what}`); };

for (const [sizeName, w, h, dpr, mobile] of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  for (const theme of themes) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    for (const route of routes) {
      const where = `${route} (${sizeName}, ${theme})`;
      const errors = [];
      let bytes = 0;
      const listen = (m) => {
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
        if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !m.params.response.url.endsWith('favicon.ico')) {
          errors.push(`${m.params.response.status} ${m.params.response.url.replace(BASE, '')}`);
        }
        if (m.method === 'Network.loadingFailed' && !m.params.canceled) errors.push(`failed ${m.params.errorText}`);
        if (m.method === 'Network.loadingFinished') bytes += m.params.encodedDataLength;
      };
      listeners.push(listen);
      await send('Page.navigate', { url: BASE + route });
      await sleep(3500);
      const firstLoad = bytes;
      const state = await evaluate(`(async () => {
        const meta = (p) => document.querySelector('meta[property="' + p + '"]')?.content || '';
        const out = { overflow: document.documentElement.scrollWidth > innerWidth + 1, og: meta('og:image'),
          title: document.title, h1: !!document.querySelector('h1') || location.pathname === '/' };
        for (let y = 0; y < document.body.scrollHeight; y += Math.round(innerHeight * 0.8)) {
          scrollTo(0, y); await new Promise((r) => setTimeout(r, 140));
        }
        await new Promise((r) => setTimeout(r, 1500));
        const canvases = [...document.querySelectorAll('canvas')];
        out.liveCanvases = canvases.length;
        out.lost = canvases.filter((c) => { const g = c.getContext('webgl2') || c.getContext('webgl'); return g && g.isContextLost(); }).length;
        out.broken = [...document.images].filter((i) => i.getAttribute('src') && i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src'));
        return out;
      })()`);
      listeners.splice(listeners.indexOf(listen), 1);
      if (errors.length) report(where, errors.slice(0, 3).join(' | '));
      if (!state) { report(where, 'page did not load'); continue; }
      if (state.overflow) report(where, 'scrolls sideways');
      if (!state.h1) report(where, 'no heading: the page did not render');
      if (state.broken.length) report(where, `broken pictures: ${state.broken.slice(0, 3).join(', ')}`);
      if (state.lost) report(where, `${state.lost} 3D view(s) lost their WebGL context`);
      if (state.liveCanvases > BUDGET.liveCanvases) report(where, `${state.liveCanvases} live 3D views (budget ${BUDGET.liveCanvases})`);
      const og = state.og.replace(/^https?:\/\/[^/]+/, '');
      if (!og || !existsSync(join(SITE, og))) report(where, `preview card missing: ${state.og || 'none'}`);
      if (sizeName === 'phone' && firstLoad > BUDGET.firstLoadBytes) {
        report(where, `first load ${(firstLoad / 1024).toFixed(0)} KB (budget ${(BUDGET.firstLoadBytes / 1024).toFixed(0)} KB)`);
      }
      console.log(`  ok   ${where}  ${(firstLoad / 1024).toFixed(0)} KB first load, ${state.liveCanvases} live 3D`);
    }
  }
}

ws.close();
chrome.kill();
server.close();
console.log(problems ? `\n${problems} problem(s) found.` : '\nAll pages passed.');
process.exit(problems ? 1 : 0);
