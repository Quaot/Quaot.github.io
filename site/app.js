// Fills the page from data.json, which scripts/build.py writes from data/.
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') el.className = v; else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  };

  function linkButtons(links) {
    return (links || []).map((l) => h('a', {
      href: l.url, ...(l.url.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {}),
    }, l.label));
  }

  function mediaBlock(media) {
    const stage = h('div', { class: 'stage frame' });
    const caption = h('figcaption', { class: 'label' });
    function show(i) {
      const m = media[i];
      stage.replaceChildren();
      if (m.type === 'stl') {
        const v = h('div', { class: 'viewer' });
        stage.append(v);
        window.STLViewer.watch(v, m.src);
      } else {
        stage.append(h('img', { src: m.src, alt: m.alt || '', loading: 'lazy' }));
      }
      caption.textContent = m.caption || '';
      $$('button', thumbs).forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    }
    const thumbs = h('div', { class: 'thumbs' }, media.length < 2 ? [] : media.map((m, i) => {
      const b = h('button', { type: 'button', 'aria-label': `Show ${m.type === 'stl' ? '3D model' : 'image'} ${i + 1}` },
        m.type === 'stl' ? '3D' : h('img', { src: m.src, alt: '' }));
      b.addEventListener('click', () => show(i));
      return b;
    }));
    const fig = h('figure', { class: 'media', style: 'margin:0' }, stage, caption, thumbs);
    show(0);
    return fig;
  }

  function project(p) {
    const hasMedia = p.media && p.media.length;
    const body = h('div', { class: 'body' },
      h('p', { class: 'label' }, p.when || ''),
      h('h3', {}, p.title),
      p.subtitle ? h('p', { class: 'subtitle' }, p.subtitle) : null,
      h('div', { class: 'meta label' },
        p.role ? h('span', {}, 'Role ', h('b', {}, p.role)) : null,
        p.status ? h('span', { class: 'status' }, p.status) : null),
      h('p', { class: 'summary' }, p.summary),
      p.points && p.points.length ? h('ul', {}, p.points.map((t) => h('li', {}, t))) : null,
      p.stack && p.stack.length ? h('div', { class: 'stack' }, p.stack.map((s) => h('span', {}, s))) : null,
      h('div', { class: 'links' }, linkButtons(p.links)));
    return h('article', { class: 'project' + (hasMedia ? '' : ' text-only'), id: p.id },
      hasMedia ? mediaBlock(p.media) : null, body);
  }

  fetch('data.json').then((r) => r.json()).then((d) => {
    document.title = d.name;
    $$('[data-name]').forEach((el) => { el.textContent = d.name; });
    $('[data-tagline]').textContent = d.tagline || '';
    $('[data-intro]').textContent = d.intro || '';
    $('[data-about]').textContent = d.about || '';
    $('[data-year]').textContent = new Date().getFullYear();
    $$('[data-links]').forEach((el) => el.replaceChildren(...linkButtons(d.links)));

    if (d.hero_model && d.hero_model.src) {
      window.STLViewer.watch($('[data-hero-viewer]'), d.hero_model.src);
      $('[data-hero-caption]').textContent = d.hero_model.caption || '';
    } else {
      $('.hero-model').remove();
    }

    const host = $('[data-categories]');
    d.categories.forEach((c, i) => {
      host.append(h('section', { id: c.id },
        h('h2', { class: 'section-title' }, h('span', { class: 'num' }, String(i + 1).padStart(2, '0')), c.title),
        h('div', { class: 'dim' }),
        c.projects.map(project)));
    });
    $('#about .num').textContent = String(d.categories.length + 1).padStart(2, '0');
  }).catch(() => {
    $('[data-categories]').textContent = 'Could not load data.json. Run python scripts/build.py first.';
  });
})();
