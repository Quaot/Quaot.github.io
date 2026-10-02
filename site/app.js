// Fills the page from data.json, which scripts/build.py writes from data/.
// Three views, picked by the address: / (project grid), /p/<id>/ (one project), /profile/.
// build.py also writes a small HTML file at each of those addresses with that page's title and preview card,
// so links can be shared and reloaded; old #/ links are redirected.
// Pictures come first and a title sits beside a short description, after mashcreative.co.uk.
// Every project carries its own colour (`color` in its data file), used for its overlay, numbers and plates.
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') el.className = v; else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid);
    return el;
  };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const projectUrl = (id) => `/p/${id}/`;

  function linkList(links) {
    return (links || []).map((l) => h('a', {
      href: l.url, ...(/^http|\.pdf$/.test(l.url) ? { target: '_blank', rel: 'noopener' } : {}),
    }, l.label));
  }

  // *words* in the data become italic serif emphasis.
  const rich = (t) => (t || '').split(/(\*[^*]+\*)/).map((s) => (s.startsWith('*') ? h('em', {}, s.slice(1, -1)) : s));

  // Ink or paper, whichever reads better on a project's colour.
  function onColor(hex) {
    const n = parseInt((hex || '#000').slice(1), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#17150f' : '#f6f0e4';
  }
  const paint = (p) => `--c:${p.color || '#17150f'};--on:${onColor(p.color)}`;
  const num = (k) => String(k + 1).padStart(2, '0');

  const is3D = (m) => m.type === 'stl' || m.type === 'glb';

  // A picture at the right size for where it sits: build.py makes WebP copies at a few widths and records them
  // with the picture's own size (so the page doesn't jump as pictures arrive). `sizes` says how wide it shows.
  let IMG = {};
  function pic(src, { alt = '', sizes = '100vw', eager = false, caption } = {}) {
    const info = IMG[src];
    const set = info && info.set;
    return h('img', {
      src, alt, loading: eager ? 'eager' : 'lazy', decoding: 'async', fetchpriority: eager ? 'high' : null,
      width: info ? info.w : null, height: info ? info.h : null,
      srcset: set && set.length ? set.map(([u, w]) => `${u} ${w}w`).join(', ') : null,
      sizes: set && set.length ? sizes : null,
      'data-full': set && set.length ? set[set.length - 1][0] : null,
      'data-caption': caption,
    });
  }

  // Ready-made pictures of a model (scripts/render_web_stills.mjs), named after its path:
  // /media/pcb-ldo/board.glb at 4:3 -> /media/stills/pcb-ldo-board.4x3.light.webp (and .dark.webp).
  const stillName = (src) => src.replace(/^\/?media\//, '').replace(/\.\w+$/, '').replace(/\//g, '-');
  const stillsFor = (src, shape) => ({
    light: `/media/stills/${stillName(src)}.${shape}.light.webp`, dark: `/media/stills/${stillName(src)}.${shape}.dark.webp`,
  });

  function viewer(m, cls, poster, shape) {
    const v = h('div', { class: 'viewer ' + (cls || ''), role: 'img',
      'aria-label': (m.alt || 'Interactive 3D model') + (cls === 'still' ? '' : ', drag to rotate') });
    window.STLViewer.watch(v, m.src, m.type, { poster, stills: shape ? stillsFor(m.src, shape) : null });
    return v;
  }

  // Every project in one list, in the order set by site.yaml (home grid, previous/next, thumbnails).
  function projects(d) {
    const all = d.categories.flatMap((c) => c.projects.map((p) => ({ ...p, category: p.category || c.title })));
    const rank = (p) => { const k = (d.order || []).indexOf(p.id); return k < 0 ? 1e3 : k; };
    return all.map((p, k) => [p, k]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(([p], n) => ({ ...p, n }));
  }

  // The picture that stands for a project: its cover, else its first image or 3D model.
  function coverOf(p, sizes) {
    const c = p.cover || {};
    const m = (p.media || [])[0];
    if (c.src) return h('div', { class: 'cover' }, pic(c.src, { sizes }));
    if (m && is3D(m)) return h('div', { class: 'cover model' }, viewer(m, 'still', null, '4x3'));
    if (m) return h('div', { class: 'cover' + (m.dark ? ' dark' : '') }, pic(m.src, { sizes }));
    return h('div', { class: 'cover model' });
  }
  const posterOf = (p) => (p.cover || {}).src || null;

  // ---- home: the statement, a colour index, the layer stack, then two masonry columns -------
  function tile(p) {
    return h('a', { class: 'tile', href: projectUrl(p.id), style: `order:${p.n};${paint(p)}`, 'data-project': p.id },
      coverOf(p, '(max-width: 760px) 100vw, 50vw'),
      h('span', { class: 'tile-num' }, num(p.n)),
      h('div', { class: 'tile-text' },
        h('span', { class: 'tile-title' }, p.title),
        h('span', { class: 'tile-cat' }, p.category)));
  }

  function masonry(list) {
    const cols = [h('div', { class: 'col' }), h('div', { class: 'col' })];
    const height = [0, 0];
    list.forEach((p) => {
      const k = height[0] <= height[1] ? 0 : 1;
      cols[k].append(tile(p));
      height[k] += 1 / (p.cover_aspect || 4 / 3);
    });
    return h('div', { class: 'masonry' }, cols);
  }

  function palette(list) {
    return h('nav', { class: 'palette', 'aria-label': 'Projects by colour' }, list.map((p) =>
      h('a', { class: 'swatch', href: projectUrl(p.id), style: paint(p) },
        h('span', { class: 'swatch-num' }, num(p.n)),
        h('span', { class: 'swatch-title' }, p.title))));
  }

  // The home-page board: pinned while you scroll past it, pulling apart into its labelled layers,
  // with current running along its tracks and your name set behind it.
  const LAYER_NAMES = [
    ['silk', 'Silkscreen'], ['mask', 'Solder mask'], ['top-copper', 'Top copper'],
    ['board', 'Board'], ['bottom-copper', 'Bottom copper'],
  ];
  function heroBoard(d) {
    const hl = d.hero_layers;
    const labels = {};
    const labelEls = LAYER_NAMES.map(([key, name]) => (labels[key] = h('span', { class: 'layer-label' }, h('em', {}, name))));
    const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leaders.setAttribute('class', 'hero-leaders');
    leaders.setAttribute('aria-hidden', 'true');
    const v = h('div', { class: 'viewer hero-viewer', role: 'img', 'aria-label':
      'A 3D model of my 3.3 V regulator board. Scrolling separates it into its five layers: bottom copper, the board, '
      + 'top copper, solder mask and silkscreen, with current running along its tracks. Any layer can be dragged out.' });
    const run = h('section', { class: 'hero-run', 'aria-label': hl.caption || 'Circuit board' },
      h('div', { class: 'hero-pin' },
        h('div', { class: 'hero-stage' },
          h('p', { class: 'hero-name', 'aria-hidden': 'true' }, d.name, h('span', {}, '.')),
          v, leaders, h('div', { class: 'hero-labels', 'aria-hidden': 'true' }, labelEls),
          h('div', { class: 'hero-readout' },
            (hl.readout || []).map(([k, val]) => h('span', { class: 'reading' }, h('b', {}, val), ' ', k))),
          h('p', { class: 'hero-hint' }, hl.hint || 'Scroll to take it apart', h('span', { 'aria-hidden': 'true' }, ' ↓')))),
      h('p', { class: 'hero-caption' }, hl.caption || ''));
    // 0 when the pinned stage first fills the screen, 1 when the page has scrolled through its runway.
    const progress = () => {
      const r = run.getBoundingClientRect();
      const travel = run.offsetHeight - innerHeight;
      return travel > 0 ? -r.top / travel : 0;
    };
    window.STLViewer.hero(v, hl.src, { progress, labels, leaders, traces: hl.traces, poster: hl.poster,
      stills: { wide: '/media/stills/hero.wide.webp', narrow: '/media/stills/hero.narrow.webp' } });
    // While the pinned board is under the header, the header stops blurring what is behind it.
    const pin = run.querySelector('.hero-pin');
    new IntersectionObserver(([e]) => document.documentElement.classList.toggle('over-hero', e.isIntersecting && run.isConnected),
      { rootMargin: '0px 0px -95% 0px' }).observe(pin);
    return run;
  }

  function gridView(d) {
    const list = projects(d);
    return h('div', { class: 'page home' },
      h('section', { class: 'lede' },
        h('p', { class: 'statement' }, rich(d.tagline)),
        d.intro ? h('p', { class: 'intro' }, rich(d.intro)) : null),
      palette(list),
      d.hero_layers ? heroBoard(d) : null,
      h('h2', { class: 'section-mark' }, h('em', {}, 'Selected'), ' work'),
      masonry(list));
  }

  // ---- one project: pictures first, then title and description, then the rest ---------------
  function shot(m, { eager, sizes, poster } = {}) {
    if (is3D(m)) {
      return h('div', { class: 'shot model' }, viewer(m, '', poster), h('span', { class: 'hint', 'aria-hidden': 'true' }, 'Drag to rotate'));
    }
    return h('div', { class: 'shot' + (m.dark ? ' dark' : '') + (m.fit ? ' ' + m.fit : ''), 'data-zoom': '' },
      pic(m.src, { alt: m.alt || '', eager, sizes, caption: m.caption || '' }));
  }

  // One picture with its numbered caption. Pictures open in the viewer when clicked.
  function figure(m, k, opts = {}) {
    const media = m.type === 'pages'
      ? h('div', { class: 'sheets' }, m.pages.map((pg) => h('button', { class: 'sheet', type: 'button', 'data-zoom': '',
        'aria-label': `Open the ${pg.label.toLowerCase()} page full size` },
        pic(pg.src, { alt: pg.alt || '', sizes: '(max-width: 760px) 33vw, 30vw',
          caption: `${pg.label}. ${(m.caption || '').replace(/\s*Click to read\.$/, '')}` }),
        h('span', { class: 'sheet-label' }, h('em', {}, pg.label)))))
      : shot(m, opts);
    return h('figure', { class: 'fig' + (m.type === 'pages' ? ' fig-pages' : ''), style: `flex-grow:${m.aspect || 1.5}` }, media,
      m.caption ? h('figcaption', {}, h('span', { class: 'fig-num' }, num(k)), h('span', {}, m.caption)) : null);
  }

  // The pictures after the hero, in rows: an item marked `beside` shares the previous item's row,
  // and a row's pictures are scaled to one height so each keeps its own shape.
  function gallery(items, poster) {
    const rows = [];
    items.forEach((m, k) => {
      if (m.beside && rows.length) rows[rows.length - 1].push([m, k]); else rows.push([[m, k]]);
    });
    return h('div', { class: 'gallery' }, rows.map((row) => {
      const total = row.reduce((s, [m]) => s + (m.aspect || 1.5), 0);
      return h('div', { class: 'row' + (row.length > 1 ? ' multi' : '') + (row[0][0].type === 'pages' ? ' pages' : '') },
        row.map(([m, k]) => figure(m, k + 1, {
          poster, sizes: `(max-width: 760px) 100vw, ${Math.max(20, Math.round((m.aspect || 1.5) / total * 100))}vw` })));
    }));
  }

  function textBlock(head, paragraphs, links) {
    return h('section', { class: 'about' },
      h('header', { class: 'about-head' }, head),
      h('div', { class: 'desc' },
        paragraphs.map((t, k) => h('p', { class: k === 0 ? 'first' : null }, rich(t))),
        links && links.length ? h('p', { class: 'plain-links' }, linkList(links)) : null));
  }

  const paras = (t) => (t || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

  function projectView(d, id) {
    const all = projects(d);
    const i = all.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const p = all[i];
    const next = all[(i + 1) % all.length];
    const prev = all[(i - 1 + all.length) % all.length];
    const step = (x, label) => h('a', { href: projectUrl(x.id), style: paint(x) },
      h('span', { class: 'step-label' }, label), h('span', { class: 'step-title' }, x.title));
    const poster = posterOf(p);
    return h('article', { class: 'page project', style: paint(p) },
      (p.media || []).length ? h('div', { class: 'hero-shot', style: 'view-transition-name: opening' },
        figure(p.media[0], 0, { eager: true, poster, sizes: '(max-width: 1400px) 100vw, 1330px' })) : null,
      textBlock([
        h('span', { class: 'big-num' }, num(p.n)),
        h('h1', {}, p.title),
        h('span', { class: 'cat' }, p.category),
      ], paras(p.summary), p.links),
      (p.media || []).length > 1 ? gallery(p.media.slice(1), poster) : null,
      h('nav', { class: 'next', 'aria-label': 'Other projects' }, step(prev, 'Previous Project'), step(next, 'Next Project')),
      h('section', { class: 'more' },
        h('h2', {}, h('em', {}, 'More'), ' selected projects'),
        h('div', { class: 'thumbs' }, all.filter((x) => x.id !== p.id).map((x) =>
          h('a', { class: 'thumb', href: projectUrl(x.id), style: paint(x), 'data-project': x.id },
            coverOf(x, '(max-width: 760px) 50vw, 200px'),
            h('span', { class: 'thumb-title' }, x.title),
            h('span', { class: 'thumb-cat' }, x.category))))));
  }

  // ---- profile: an opener, headline numbers, a shelf of things I have made, the story, the path so far,
  // skills, what I am doing now, and a way to get in touch. Everything comes from `profile` in site.yaml.
  const STAT_COLOURS = ['bakfiets', 'ai-phillic', 'chess-mobility', 'ib-paper-organizer'];
  function profileView(d) {
    const pr = d.profile || {};
    const all = projects(d);
    const byId = (id) => all.find((x) => x.id === id);
    const tint = (id) => (byId(id) ? paint(byId(id)) : '--c:var(--accent);--on:#f6f0e4');
    const mail = (d.links || []).find((l) => l.url.startsWith('mailto:'));
    const h2 = (lead, rest) => h('h2', { class: 'pf-h2' }, h('em', {}, lead), rest);
    return h('div', { class: 'page profile', style: '--c:#e4572e;--on:#f6f0e4' },
      h('header', { class: 'pf-head' },
        h('h1', {}, 'A bit more ', h('em', {}, 'about me'), '.'),
        pr.lead ? h('p', { class: 'pf-lead' }, rich(pr.lead)) : null),
      pr.stats ? h('section', { class: 'pf-stats', 'aria-label': 'In numbers' }, pr.stats.map(([n, text], k) =>
        h('div', { class: 'stat', style: tint(STAT_COLOURS[k]) },
          h('span', { class: 'stat-num' }, n), h('span', { class: 'stat-text' }, text)))) : null,
      pr.shelf ? h('section', { class: 'pf-shelf' }, h2('Things', ' I have made'),
        h('div', { class: 'shelf' }, pr.shelf.map((it) =>
          h('a', { class: 'shelf-item', href: projectUrl(it.project), style: tint(it.project) },
            h('div', { class: 'shelf-stage' }, viewer({ src: it.src, type: it.type, alt: it.label }, 'still', null, '4x5')),
            h('span', { class: 'shelf-label' }, it.label),
            h('span', { class: 'shelf-go' }, 'View project →'))))) : null,
      textBlock([h2('The', ' longer version')], paras(d.about), [{ label: 'Résumé (PDF)', url: '/media/resume.pdf' }]),
      pr.timeline ? h('section', { class: 'pf-time' }, h2('The path', ' so far'),
        h('ol', { class: 'timeline' }, pr.timeline.map((it) => {
          const inner = [h('span', { class: 'tl-when' }, it.when), h('span', { class: 'tl-what' }, it.what),
            it.detail ? h('span', { class: 'tl-detail' }, it.detail) : null];
          const to = it.project ? h('a', { href: projectUrl(it.project) }, inner)
            : it.link ? h('a', { href: it.link, target: '_blank', rel: 'noopener' }, inner) : h('div', {}, inner);
          return h('li', { class: 'tl-item', style: tint(it.project) }, to);
        }))) : null,
      pr.skills ? h('section', { class: 'pf-skills' }, h2('Tools', ' I use'),
        h('dl', {}, pr.skills.map(([group, items]) => [h('dt', {}, group),
          h('dd', {}, items.map((x) => h('span', { class: 'chip' }, x)))]))) : null,
      d.now && d.now.items ? h('section', { class: 'now' },
        h('h2', {}, h('em', {}, 'Now'), h('span', { class: 'now-when' }, d.now.when || '')),
        h('ol', {}, d.now.items.map((t) => h('li', {}, rich(t))))) : null,
      h('section', { class: 'pf-cta' },
        h('p', {}, 'Looking for a ', h('em', {}, 'co-op'), ' placement.'),
        h('div', { class: 'pf-buttons' },
          h('a', { class: 'btn', href: '/media/resume.pdf', target: '_blank', rel: 'noopener' }, 'Download my résumé'),
          mail ? h('a', { class: 'btn ghost', href: mail.url }, mail.url.slice(7)) : null)));
  }

  // ---- motion: pictures and text rise in as they scroll into view ---------------------------
  const reveal = 'IntersectionObserver' in window && !calm
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' })
    : null;
  function animate(root) {
    if (!reveal) return;
    root.classList.add('motion');
    $$('.shot, .tile, .about, .swatch, .next, .thumb, .now, .fig, .stat, .shelf-item, .tl-item, .pf-skills, .pf-cta', root).forEach((el, k) => {
      if (el.classList.contains('swatch')) el.style.transitionDelay = `${(k % 12) * 45}ms`;
      reveal.observe(el);
    });
  }

  // ---- viewer: every picture on a project page opens large, with arrows and its caption ---------
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Picture viewer', hidden: '' },
    h('button', { class: 'lb-close', type: 'button', 'aria-label': 'Close' }, '×'),
    h('button', { class: 'lb-prev', type: 'button', 'aria-label': 'Previous picture' }, '←'),
    h('figure', { class: 'lb-fig' }, h('img', { alt: '' }), h('figcaption', { 'aria-live': 'polite' }, h('span', { class: 'lb-count' }), h('span', { class: 'lb-cap' }))),
    h('button', { class: 'lb-next', type: 'button', 'aria-label': 'Next picture' }, '→'));
  document.body.append(box);
  let pics = [], at = 0, opener = null;
  function show(k) {
    at = (k + pics.length) % pics.length;
    const img = pics[at];
    $('img', box).src = img.dataset.full || img.currentSrc || img.src;
    $('img', box).alt = img.alt;
    $('.lb-cap', box).textContent = img.dataset.caption || '';
    $('.lb-count', box).textContent = `${num(at)} / ${num(pics.length - 1)}`;
  }
  function openAt(img) {
    pics = $$('[data-zoom] img', $('[data-view]'));
    opener = img.closest('[data-zoom]');
    box.hidden = false;
    document.documentElement.classList.add('lb-open');
    show(pics.indexOf(img));
    $('.lb-close', box).focus();
  }
  function close() {
    box.hidden = true;
    document.documentElement.classList.remove('lb-open');
    if (opener && opener.isConnected) {
      if (!opener.matches('button, a')) opener.setAttribute('tabindex', '-1');
      opener.focus({ preventScroll: true });
    }
  }
  document.addEventListener('click', (e) => {
    const zoom = e.target.closest('[data-zoom]');
    if (zoom && !box.contains(zoom)) { e.preventDefault(); openAt($('img', zoom)); }
  });
  $('.lb-close', box).addEventListener('click', close);
  $('.lb-prev', box).addEventListener('click', () => show(at - 1));
  $('.lb-next', box).addEventListener('click', () => show(at + 1));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
    if (e.key === 'Tab') {   // keep focus on the viewer's own buttons while it is open
      const buttons = $$('button', box);
      const k = buttons.indexOf(document.activeElement);
      e.preventDefault();
      buttons[(k + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
  let touchX = null;
  box.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // ---- routing ------------------------------------------------------------------------------
  let data;
  function route() {
    const path = location.pathname.replace(/\/+$/, '/') || '/';
    const m = path.match(/^\/p\/([^/]+)\/?$/);
    if (m) return { view: projectView(data, decodeURIComponent(m[1])), nav: 'projects' };
    if (/^\/profile\/?$/.test(path)) return { view: profileView(data), nav: 'profile' };
    return { view: gridView(data), nav: 'projects', home: path !== '/' };
  }
  function render({ scroll = true } = {}) {
    let { view, nav } = route();
    if (!view) view = gridView(data);   // an unknown project id
    $$('[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === nav);
      if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (!box.hidden) close();
    document.documentElement.classList.remove('over-hero');
    $('[data-view]').replaceChildren(view);
    animate(view);
    if (scroll) window.scrollTo(0, 0);
    const title = view.querySelector('h1');
    document.title = title ? `${title.textContent} | ${data.name}` : data.name;
  }

  // Page changes inside the site swap the view in place; where the browser supports it, the picture you clicked
  // grows into the next page's opening picture and the rest cross-fades.
  function go(url, push = true) {
    if (push) history.pushState(null, '', url);
    const swap = () => render();
    if (!document.startViewTransition || calm) { swap(); return; }
    document.startViewTransition(swap);
  }
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || /\.\w+$/.test(url.pathname)) return;   // files and other sites load normally
    if (!/^\/(p\/[^/]+\/?|profile\/?)?$/.test(url.pathname)) return;
    e.preventDefault();
    if (url.pathname === location.pathname) { window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }); return; }
    // The picture that was clicked becomes the next page's opening picture.
    $$('[style*="view-transition-name"]').forEach((el) => { el.style.viewTransitionName = ''; });
    const cover = a.querySelector('.cover');
    if (cover) cover.style.viewTransitionName = 'opening';
    go(url.pathname);
  });
  window.addEventListener('popstate', () => go(location.href, false));

  // Links shared before the move to real addresses (#/p/<id>, #/profile) still land on the right page.
  if (location.hash.startsWith('#/')) {
    const old = location.hash.slice(2);
    history.replaceState(null, '', old.startsWith('p/') ? projectUrl(old.slice(2)) : old === 'profile' ? '/profile/' : '/');
  }

  fetch(window.DATA_URL || '/data.json').then((r) => r.json()).then((d) => {
    data = d;
    IMG = d.images || {};
    $$('[data-name]').forEach((el) => { el.textContent = d.name; });
    const mail = (d.links || []).filter((l) => l.url.startsWith('mailto:'));
    $$('[data-links]').forEach((el) => el.replaceChildren(...linkList((d.links || []).filter((l) => !mail.includes(l)))));
    $$('[data-email]').forEach((el) => el.replaceChildren(...mail.map((l) => h('a', { href: l.url }, l.url.slice(7)))));
    // Coming back with the Back button can restore this page from cache with its 3D canvases dead: redraw it.
    window.addEventListener('pageshow', (e) => { if (e.persisted) render({ scroll: false }); });
    render();
  }).catch(() => {
    $('[data-view]').textContent = 'Could not load data.json. Run python scripts/build.py first.';
  });
})();
