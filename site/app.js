// Fills the page from data.json, which scripts/build.py writes from data/.
// Three views, picked by the URL hash: #/ (project grid), #/p/<id> (one project), #/profile.
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
      href: l.url, ...(l.url.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {}),
    }, l.label));
  }

  const is3D = (m) => m.type === 'stl' || m.type === 'glb';

  function viewer(m, cls) {
    const v = h('div', { class: 'viewer ' + (cls || '') });
    window.STLViewer.watch(v, m.src, m.type);
    return v;
  }

  // ---- project grid -------------------------------------------------------------
  function tile(p, label) {
    const c = p.cover || {};
    const m = (p.media || [])[0];
    let cover;
    if (c.poster) {
      cover = h('div', { class: 'cover poster', style: `background:${c.poster.bg};color:${c.poster.fg}` },
        c.poster.logo ? h('img', { class: 'logo', src: c.poster.logo, alt: '' }) : null,
        h('span', { class: 'poster-title' }, p.title));
    } else if (c.src) {
      cover = h('div', { class: 'cover' + (c.fit === 'cover' ? ' bleed' : '') }, h('img', { src: c.src, alt: '', loading: 'lazy' }));
    } else if (m && is3D(m)) {
      cover = h('div', { class: 'cover' }, viewer(m, 'still'));
    } else if (m) {
      cover = h('div', { class: 'cover' + (m.dark ? ' dark' : '') }, h('img', { src: m.src, alt: m.alt || '', loading: 'lazy' }));
    } else {
      cover = h('div', { class: 'cover poster' }, h('span', { class: 'poster-title' }, p.title));
    }
    return h('a', { class: 'tile', href: `#/p/${p.id}` }, cover,
      h('div', { class: 'tile-text' },
        h('span', { class: 'tile-title' }, p.title),
        h('span', { class: 'muted' }, label)));
  }

  function gridView(d) {
    return h('div', { class: 'page' },
      h('section', { class: 'lede' },
        h('p', { class: 'big' }, d.tagline || ''),
        d.intro ? h('p', { class: 'big muted' }, d.intro) : null),
      d.hero_layers ? h('figure', { class: 'hero' },
        h('div', { class: 'hero-stage' }, viewer({ src: d.hero_layers.src, type: 'layers' })),
        h('figcaption', { class: 'muted small' }, d.hero_layers.caption || '')) : null,
      d.categories.map((c) => h('section', { class: 'group', id: c.id },
        h('h2', { class: 'group-title' }, c.title),
        h('div', { class: 'grid' }, c.projects.map((p) => tile(p, p.subtitle || c.title))))));
  }

  // ---- one project: text first, then every picture stacked one after another ----
  function frameFor(m) {
    if (is3D(m)) return h('div', { class: 'plate model' }, viewer(m));
    const img = h('img', { src: m.src, alt: m.alt || '', loading: 'lazy' });
    // Small images (CAD previews, icons) sit on a plate instead of being blown up.
    img.addEventListener('load', () => {
      if (img.naturalWidth && img.naturalWidth < 900 && !m.src.endsWith('.svg')) {
        img.style.maxWidth = `${Math.round(img.naturalWidth * 1.6)}px`;
        img.parentElement.classList.add('small');
      }
    });
    return h('div', { class: 'plate' + (m.dark ? ' dark' : '') + (m.src.endsWith('.svg') && !m.wide ? ' drawing' : '') }, img);
  }

  function projectView(d, id) {
    const all = d.categories.flatMap((c) => c.projects.map((p) => ({ p, c })));
    const i = all.findIndex((x) => x.p.id === id);
    if (i < 0) return null;
    const { p, c } = all[i];
    const next = all[(i + 1) % all.length].p;
    const facts = [['When', p.when], ['Role', p.role], ['Status', p.status]].filter(([, v]) => v);
    const media = p.media || [];
    return h('article', { class: 'page project' },
      h('header', { class: 'project-head' },
        h('p', { class: 'muted' }, c.title),
        h('h1', {}, p.title),
        p.subtitle ? h('p', { class: 'big muted' }, p.subtitle) : null),
      h('div', { class: 'project-body' },
        h('div', { class: 'prose' }, h('p', { class: 'summary' }, p.summary)),
        h('dl', { class: 'facts' },
          facts.map(([k, v]) => [h('dt', { class: 'muted' }, k), h('dd', {}, v)]),
          p.stack && p.stack.length ? [h('dt', { class: 'muted' }, 'Tools'), h('dd', {}, p.stack.join(', '))] : null,
          p.links && p.links.length ? [h('dt', { class: 'muted' }, 'Links'), h('dd', { class: 'links' }, linkList(p.links))] : null)),
      media.length ? h('div', { class: 'stack' }, media.map((m, k) =>
        h('figure', { class: 'stack-item' }, frameFor(m),
          h('figcaption', {},
            h('span', { class: 'num muted' }, String(k + 1).padStart(2, '0')),
            h('span', {}, m.caption || ''))))) : null,
      p.points && p.points.length ? h('section', { class: 'notes' },
        h('h2', { class: 'sub' }, 'Notes'),
        h('ul', {}, p.points.map((t) => h('li', {}, t)))) : null,
      h('nav', { class: 'next' },
        h('a', { href: '#/' }, 'All projects'),
        h('a', { href: `#/p/${next.id}` }, h('span', { class: 'muted' }, 'Next '), next.title)));
  }

  // ---- profile ------------------------------------------------------------------
  function profileView(d) {
    const hm = d.hero_model;
    return h('div', { class: 'page profile' },
      h('header', { class: 'project-head' }, h('h1', {}, 'A bit more about me')),
      h('div', { class: 'project-body' },
        h('div', { class: 'prose' }, (d.about || '').split(/\n\s*\n/).map((t) => h('p', {}, t))),
        h('dl', { class: 'facts' },
          h('dt', { class: 'muted' }, 'Elsewhere'), h('dd', { class: 'links' }, linkList(d.links)))),
      hm && hm.src ? h('div', { class: 'stack' }, h('figure', { class: 'stack-item' },
        h('div', { class: 'plate model' }, viewer({ src: hm.src, type: 'stl' })),
        h('figcaption', {}, h('span', {}, hm.caption || '')))) : null);
  }

  // ---- routing ------------------------------------------------------------------
  let data;
  function render() {
    const hash = location.hash.replace(/^#\/?/, '');
    let view, nav = 'projects';
    if (hash.startsWith('p/')) view = projectView(data, hash.slice(2));
    else if (hash === 'profile') { view = profileView(data); nav = 'profile'; }
    if (!view) view = gridView(data);
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    $('[data-view]').replaceChildren(view);
    window.scrollTo(0, 0);
    const title = view.querySelector('h1');
    document.title = title ? `${title.textContent} | ${data.name}` : data.name;
  }

  fetch('data.json').then((r) => r.json()).then((d) => {
    data = d;
    $$('[data-name]').forEach((el) => { el.textContent = d.name; });
    $$('[data-links]').forEach((el) => el.replaceChildren(...linkList(d.links)));
    window.addEventListener('hashchange', render);
    render();
  }).catch(() => {
    $('[data-view]').textContent = 'Could not load data.json. Run python scripts/build.py first.';
  });
})();
