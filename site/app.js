// Fills the page from data.json, which scripts/build.py writes from data/.
// Three views, picked by the URL hash: #/ (project grid), #/p/<id> (one project), #/profile.
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

  function viewer(m, cls) {
    const v = h('div', { class: 'viewer ' + (cls || '') });
    window.STLViewer.watch(v, m.src, m.type);
    return v;
  }

  // Every project in one list, in the order set by site.yaml (home grid, previous/next, thumbnails).
  function projects(d) {
    const all = d.categories.flatMap((c) => c.projects.map((p) => ({ ...p, category: p.category || c.title })));
    const rank = (p) => { const k = (d.order || []).indexOf(p.id); return k < 0 ? 1e3 : k; };
    return all.map((p, k) => [p, k]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(([p], n) => ({ ...p, n }));
  }

  // The picture that stands for a project: its cover, else its first image or 3D model.
  function coverOf(p) {
    const c = p.cover || {};
    const m = (p.media || [])[0];
    if (c.src) return h('div', { class: 'cover' }, h('img', { src: c.src, alt: '' }));
    if (m && is3D(m)) return h('div', { class: 'cover model' }, viewer(m, 'still'));
    if (m) return h('div', { class: 'cover' + (m.dark ? ' dark' : '') }, h('img', { src: m.src, alt: '' }));
    return h('div', { class: 'cover model' });
  }

  // ---- home: the statement, a colour index, the layer stack, then two masonry columns -------
  function tile(p) {
    return h('a', { class: 'tile', href: `#/p/${p.id}`, style: `order:${p.n};${paint(p)}` }, coverOf(p),
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
      h('a', { class: 'swatch', href: `#/p/${p.id}`, style: paint(p) },
        h('span', { class: 'swatch-num' }, num(p.n)),
        h('span', { class: 'swatch-title' }, p.title))));
  }

  function gridView(d) {
    const list = projects(d);
    return h('div', { class: 'page home' },
      h('section', { class: 'lede' },
        h('p', { class: 'statement' }, rich(d.tagline)),
        d.intro ? h('p', { class: 'intro' }, rich(d.intro)) : null),
      palette(list),
      d.hero_layers ? h('figure', { class: 'hero' },
        h('div', { class: 'hero-stage' }, viewer({ src: d.hero_layers.src, type: 'layers' })),
        h('figcaption', {}, h('span', { class: 'num-inline' }, '↑'), d.hero_layers.caption || '')) : null,
      h('h2', { class: 'section-mark' }, h('em', {}, 'Selected'), ' work'),
      masonry(list));
  }

  // ---- one project: pictures first, then title and description, then the rest ---------------
  function shot(m, first) {
    if (is3D(m)) {
      return h('div', { class: 'shot model' }, viewer(m), h('span', { class: 'hint' }, 'Drag to rotate'));
    }
    return h('div', { class: 'shot' + (m.dark ? ' dark' : '') + (m.fit ? ' ' + m.fit : '') },
      h('img', { src: m.src, alt: m.alt || '', loading: first ? 'eager' : 'lazy' }));
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
    const step = (x, label) => h('a', { href: `#/p/${x.id}`, style: paint(x) },
      h('span', { class: 'step-label' }, label), h('span', { class: 'step-title' }, x.title));
    return h('article', { class: 'page project', style: paint(p) },
      h('div', { class: 'stack' }, (p.media || []).map((m, k) => shot(m, k === 0))),
      textBlock([
        h('span', { class: 'big-num' }, num(p.n)),
        h('h1', {}, p.title),
        h('span', { class: 'cat' }, p.category),
      ], paras(p.summary), p.links),
      h('nav', { class: 'next' }, step(prev, 'Previous Project'), step(next, 'Next Project')),
      h('section', { class: 'more' },
        h('h2', {}, h('em', {}, 'More'), ' selected projects'),
        h('div', { class: 'thumbs' }, all.filter((x) => x.id !== p.id).map((x) =>
          h('a', { class: 'thumb', href: `#/p/${x.id}`, style: paint(x) }, coverOf(x),
            h('span', { class: 'thumb-title' }, x.title),
            h('span', { class: 'thumb-cat' }, x.category))))));
  }

  // ---- profile ------------------------------------------------------------------------------
  function profileView(d) {
    const hm = d.hero_model;
    return h('div', { class: 'page profile', style: '--c:#e4572e;--on:#f6f0e4' },
      hm && hm.src ? h('div', { class: 'stack' }, shot({ src: hm.src, type: 'stl' }, true)) : null,
      textBlock([h('h1', {}, 'A bit more ', h('em', {}, 'about me'), '...')], paras(d.about),
        [{ label: 'Résumé (PDF)', url: 'media/resume.pdf' }]),
      d.now && d.now.items ? h('section', { class: 'now' },
        h('h2', {}, h('em', {}, 'Now'), h('span', { class: 'now-when' }, d.now.when || '')),
        h('ol', {}, d.now.items.map((t) => h('li', {}, rich(t))))) : null);
  }

  // ---- motion: pictures and text rise in as they scroll into view ---------------------------
  const reveal = 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' })
    : null;
  function animate(root) {
    if (!reveal) return;
    root.classList.add('motion');
    $$('.shot, .tile, .about, .swatch, .next, .thumb, .now, .hero', root).forEach((el, k) => {
      if (el.classList.contains('swatch')) el.style.transitionDelay = `${(k % 12) * 45}ms`;
      reveal.observe(el);
    });
  }

  // ---- routing ------------------------------------------------------------------------------
  let data;
  function render() {
    const hash = location.hash.replace(/^#\/?/, '');
    let view, nav = 'projects';
    if (hash.startsWith('p/')) view = projectView(data, hash.slice(2));
    else if (hash === 'profile') { view = profileView(data); nav = 'profile'; }
    if (!view) view = gridView(data);
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    $('[data-view]').replaceChildren(view);
    animate(view);
    window.scrollTo(0, 0);
    const title = view.querySelector('h1');
    document.title = title ? `${title.textContent} | ${data.name}` : data.name;
  }

  fetch('data.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => {
    data = d;
    $$('[data-name]').forEach((el) => { el.textContent = d.name; });
    const mail = (d.links || []).filter((l) => l.url.startsWith('mailto:'));
    $$('[data-links]').forEach((el) => el.replaceChildren(...linkList((d.links || []).filter((l) => !mail.includes(l)))));
    $$('[data-email]').forEach((el) => el.replaceChildren(...mail.map((l) => h('a', { href: l.url }, l.url.slice(7)))));
    window.addEventListener('hashchange', render);
    render();
  }).catch(() => {
    $('[data-view]').textContent = 'Could not load data.json. Run python scripts/build.py first.';
  });
})();
