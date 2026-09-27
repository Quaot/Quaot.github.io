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
  function tile(p, category) {
    const m = (p.media || [])[0];
    let cover;
    if (!m) cover = h('div', { class: 'cover type' }, h('span', {}, p.title));
    else if (is3D(m)) cover = h('div', { class: 'cover' }, viewer(m, 'still'));
    else cover = h('div', { class: 'cover' }, h('img', { src: m.src, alt: m.alt || '', loading: 'lazy' }));
    return h('a', { class: 'tile', href: `#/p/${p.id}` }, cover,
      h('div', { class: 'tile-text' },
        h('span', { class: 'tile-title' }, p.title),
        h('span', { class: 'muted' }, category)));
  }

  function gridView(d) {
    return h('div', { class: 'page' },
      h('section', { class: 'lede' },
        h('p', { class: 'big' }, d.tagline || ''),
        d.intro ? h('p', { class: 'big muted' }, d.intro) : null),
      d.categories.map((c) => h('section', { class: 'group', id: c.id },
        h('h2', { class: 'group-title muted' }, c.title),
        h('div', { class: 'grid' }, c.projects.map((p) => tile(p, p.subtitle || c.title))))));
  }

  // ---- one project --------------------------------------------------------------
  function mediaBlock(media) {
    const stage = h('div', { class: 'stage' });
    const caption = h('figcaption', { class: 'muted small' });
    function show(i) {
      const m = media[i];
      stage.replaceChildren(is3D(m) ? viewer(m) : h('img', { src: m.src, alt: m.alt || '' }));
      caption.textContent = m.caption || '';
      $$('button', thumbs).forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    }
    const thumbs = h('div', { class: 'thumbs' }, media.length < 2 ? [] : media.map((m, i) => {
      const b = h('button', { type: 'button', 'aria-label': `Show ${is3D(m) ? '3D model' : 'image'} ${i + 1}` },
        is3D(m) ? '3D' : h('img', { src: m.src, alt: '' }));
      b.addEventListener('click', () => show(i));
      return b;
    }));
    show(0);
    return h('figure', { class: 'media' }, stage, caption, thumbs);
  }

  function projectView(d, id) {
    const all = d.categories.flatMap((c) => c.projects.map((p) => ({ p, c })));
    const i = all.findIndex((x) => x.p.id === id);
    if (i < 0) return null;
    const { p, c } = all[i];
    const next = all[(i + 1) % all.length].p;
    const facts = [['Category', c.title], ['When', p.when], ['Role', p.role], ['Status', p.status]]
      .filter(([, v]) => v);
    return h('article', { class: 'page project' },
      h('header', { class: 'project-head' },
        h('h1', {}, p.title),
        p.subtitle ? h('p', { class: 'big muted' }, p.subtitle) : null),
      p.media && p.media.length ? mediaBlock(p.media) : null,
      h('div', { class: 'project-body' },
        h('div', { class: 'prose' },
          h('p', { class: 'summary' }, p.summary),
          p.points && p.points.length ? h('ul', {}, p.points.map((t) => h('li', {}, t))) : null),
        h('dl', { class: 'facts' },
          facts.map(([k, v]) => [h('dt', { class: 'muted' }, k), h('dd', {}, v)]),
          p.stack && p.stack.length ? [h('dt', { class: 'muted' }, 'Tools'), h('dd', {}, p.stack.join(', '))] : null,
          p.links && p.links.length ? [h('dt', { class: 'muted' }, 'Links'), h('dd', { class: 'links' }, linkList(p.links))] : null)),
      h('nav', { class: 'next' },
        h('a', { href: '#/' }, 'All projects'),
        h('a', { href: `#/p/${next.id}` }, h('span', { class: 'muted' }, 'Next '), next.title)));
  }

  // ---- profile ------------------------------------------------------------------
  function profileView(d) {
    const hm = d.hero_model;
    return h('div', { class: 'page profile' },
      hm && hm.src ? h('figure', { class: 'media' },
        h('div', { class: 'stage' }, viewer({ src: hm.src, type: 'stl' })),
        h('figcaption', { class: 'muted small' }, hm.caption || '')) : null,
      h('div', { class: 'project-body' },
        h('div', { class: 'prose' },
          h('h2', { class: 'sub' }, 'A bit more about me'),
          h('p', {}, d.about || ''),
          d.intro ? h('p', {}, d.intro) : null),
        h('dl', { class: 'facts' },
          h('dt', { class: 'muted' }, 'Now'), h('dd', {}, d.tagline || ''),
          h('dt', { class: 'muted' }, 'Elsewhere'), h('dd', { class: 'links' }, linkList(d.links)))));
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
