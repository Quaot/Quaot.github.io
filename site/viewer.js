// Draws an STL (or a textured GLB) as a shaded part with outlined edges, like a technical drawing.
// type 'layers' is a GLB of stacked board layers that slowly pull apart and close again.
// With hero options (STLViewer.hero) the layers follow the page's scroll instead, tilt toward the cursor,
// name themselves on labels, lift when pointed at, and carry pulses of current along the real tracks.
//
// Keeping it light:
// - three.js is fetched only when the first model is about to be shown, with only the loader that model needs.
// - Small views (home tiles, thumbnails, the profile shelf, class "still") show a picture of the model, made
//   ahead of time by scripts/render_web_stills.mjs (light and dark). They come alive while hovered (or, on
//   phones, while centred on screen) and go back to a picture after. Without a ready-made picture, one is drawn.
// - The home-page board shows its ready-made picture at once and starts the live model on the first scroll,
//   pointer move, touch or key press, or once the page has been idle a moment.
// - Any viewer that scrolls well out of sight turns back into a picture and frees its WebGL context, and no more
//   than LIVE_MAX of them (besides the hero) run at once.
// - A context the browser drops is rebuilt; a model that fails to download is retried, then a picture is shown.
(function () {
  const CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/';
  const LIVE_MAX = 3;
  const scripts = {};
  const script = (url) => scripts[url] || (scripts[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => { delete scripts[url]; reject(new Error(url)); };
    document.head.append(s);
  }));
  async function three(type) {
    await script(`${CDN}build/three.min.js`);
    await Promise.all([
      script(`${CDN}examples/js/controls/OrbitControls.js`),
      script(`${CDN}examples/js/loaders/${type === 'stl' ? 'STLLoader' : 'GLTFLoader'}.js`),
    ]);
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  const dark = () => document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

  // Pictures of models already drawn, so a model is only ever rendered once per size and theme.
  const snaps = new Map();
  const snapKey = (el) => `${el.dataset.stl}|${dark() ? 'd' : 'l'}|${Math.round(el.clientWidth / 40)}x${Math.round(el.clientHeight / 40)}`;
  function showPicture(el, url, onError) {
    let img = el.querySelector(':scope > img.snap');
    if (!img) {
      img = document.createElement('img');
      img.className = 'snap';
      img.alt = '';
      img.decoding = 'async';
      el.prepend(img);
    }
    img.onerror = onError || null;
    img.src = url;
    img.style.visibility = '';
  }
  // The ready-made picture for this view, in the page's current theme.
  const madePicture = (el) => el.dataset[dark() ? 'stillDark' : 'stillLight'];

  const live = new Set();   // running viewers other than the hero, oldest first

  function start(el) {
    if (el._v) return;
    el._v = { starting: true };
    if (!el._hero) {
      if (live.size >= LIVE_MAX) [...live][0]._v?.release?.();   // make room: the oldest goes back to a picture
    }
    three(el.dataset.type).then(() => { if (el.isConnected) mount(el); else el._v = null; }, () => {
      el._v = null;
      fallback(el);
    });
  }

  function fallback(el) {
    const poster = el.dataset.poster;
    if (poster) showPicture(el, poster);
    else if (!el.querySelector('img.snap')) el.textContent = '3D view unavailable';
  }

  function mount(el) {
    const src = el.dataset.stl, type = el.dataset.type;
    const hero = el._hero;   // { progress(), labels: {layer name: element}, leaders: <svg>, traces: url }
    const still = el.classList.contains('still');
    const loading = document.createElement('div');
    loading.className = 'loading label';
    loading.textContent = 'Loading model';
    if (!el.querySelector('img.snap')) el.appendChild(loading);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      loading.remove();
      el._v = null;
      fallback(el);
      return;
    }
    el.appendChild(renderer.domElement);
    renderer.domElement.style.opacity = '0';   // the picture stays on top until the first live frame is drawn
    const state = el._v = { alive: true, ready: false, releasing: false, snapOnly: still && !el._active };
    if (!hero) live.add(el);

    // Browsers drop WebGL contexts under GPU pressure, after a tab sits in the background, or when a page comes
    // back from the back/forward cache. A dropped context leaves a blank canvas, so start this viewer again.
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (!state.alive) return;
      state.alive = false;
      live.delete(el);
      setTimeout(() => {
        if (!el.isConnected) return;
        renderer.domElement.remove();
        el._v = null;
        if (hero || !still || el._active) start(el);
      }, 250);
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(1, 2, 1.5);
    scene.add(key);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.4;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    if (hero) { controls.enabled = false; controls.autoRotate = false; }

    const edgeColor = type === 'layers' ? '#5a5a5a' : (cssVar('--edge') || '#1b2430');
    function outline(geometry) {
      return new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 28),
        new THREE.LineBasicMaterial({ color: new THREE.Color(edgeColor) })
      );
    }
    let layers = [];   // [node, resting height] for type 'layers'
    let stage = null, size = null, current = null, heroModel = null;
    const lift = new Map();   // layer -> how far pointing at it has raised it (eased)
    let spread = 0.1, tiltX = 0, tiltY = 0, aimX = 0, aimY = 0, hovered = null;
    const pointer = new THREE.Vector2(9, 9), ray = new THREE.Raycaster();
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;   // no drifting current or tilting
    const pull = new Map();   // layer -> how far it has been dragged out of the stack (model space, mm)
    let drag = null;
    const hitPoint = new THREE.Vector3(), zero = new THREE.Vector3();
    const layerOf = (o) => {
      for (; o; o = o.parent) {
        const found = layers.find(([n]) => n === o);
        if (found) return found[0];
      }
      return null;
    };

    // Current along the tracks. Segments that share an end are joined into continuous paths, each drawn as a
    // soft ribbon: the copper glows faintly as if powered, and bright pulses with fading tails run along it.
    function chain(segments) {
      const key = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`;
      const ends = new Map();
      segments.forEach(([x1, z1, x2, z2], i) => {
        for (const k of [key(x1, z1), key(x2, z2)]) ends.set(k, [...(ends.get(k) || []), i]);
      });
      const used = new Set(), paths = [];
      const walk = (i) => {
        const [x1, z1, x2, z2] = segments[i];
        const pts = [[x1, z1], [x2, z2]];
        used.add(i);
        for (;;) {
          const [x, z] = pts[pts.length - 1];
          const next = (ends.get(key(x, z)) || []).find((j) => !used.has(j));
          if (next == null) return pts;
          used.add(next);
          const [a, b, c, d] = segments[next];
          pts.push(key(a, b) === key(x, z) ? [c, d] : [a, b]);
        }
      };
      // Start from the loose ends first so each path runs end to end.
      const order = [...segments.keys()].sort((i, j) => {
        const deg = (k) => (ends.get(k) || []).length;
        const [a, b] = segments[i], [c, d] = segments[j];
        return (deg(key(a, b)) === 2) - (deg(key(c, d)) === 2);
      });
      for (const i of order) if (!used.has(i)) paths.push(walk(i));
      return paths;
    }

    function ribbon(paths, half) {
      const pos = [], dist = [], side = [], seed = [], index = [];
      for (const pts of paths) {
        const s0 = Math.random() * 40;
        let d = 0;
        const base = pos.length / 3;
        for (let i = 0; i < pts.length; i++) {
          const [x, z] = pts[i];
          if (i) d += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          let tx = b[0] - a[0], tz = b[1] - a[1];
          const tl = Math.hypot(tx, tz) || 1;
          tx /= tl; tz /= tl;
          for (const sd of [-1, 1]) {
            pos.push(x - tz * half * sd, 0.08, z + tx * half * sd);
            dist.push(d); side.push(sd); seed.push(s0);
          }
          if (i) {
            const k = base + (i - 1) * 2;
            index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
      geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
      geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
      geo.setIndex(index);
      return geo;
    }

    function addCurrent(model, url) {
      const copper = model.children.find((n) => n.name === 'top-copper');
      if (!copper) return;
      fetch(url).then((r) => r.json()).then(({ segments }) => {
        const material = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 } },
          vertexShader: `
            attribute float aDist; attribute float aSide; attribute float aSeed;
            varying float vDist; varying float vSide;
            void main() {
              vDist = aDist + aSeed; vSide = aSide;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: `
            uniform float uTime;
            varying float vDist; varying float vSide;
            void main() {
              float s = abs(vSide);
              float core = exp(-s * s * 18.0);            // the trace itself
              float halo = exp(-s * s * 3.0) * 0.45;      // light spilling onto the board
              float q = fract((vDist - uTime * 7.0) / 11.0);
              float pulse = pow(q, 7.0) * smoothstep(1.0, 0.965, q);   // sharp head, long fading tail
              float glow = core * (0.16 + 1.9 * pulse) + halo * pulse;
              vec3 amber = vec3(1.0, 0.56, 0.18);
              vec3 hot = vec3(1.0, 0.95, 0.82);
              gl_FragColor = vec4(mix(amber, hot, clamp(pulse * core * 1.4, 0.0, 1.0)) * glow, 1.0);
            }`,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(ribbon(chain(segments), 0.42), material);
        mesh.renderOrder = 10;
        copper.add(mesh);
        current = material;
      }).catch(() => {});
    }

    // Labels: each layer's name sits in a column to the right, joined to the layer's edge by a thin line.
    const anchor = new THREE.Vector3();
    function placeLabels(show) {
      const w = el.clientWidth, h = el.clientHeight;
      const column = w * (w < 700 ? 0.58 : 0.72);
      let lines = '';
      for (const [n] of layers) {
        const label = hero.labels[n.name];
        if (!label) continue;
        anchor.set(size.x / 2, 0, size.z * 0.18);
        n.localToWorld(anchor);
        anchor.project(camera);
        const ax = (anchor.x + 1) / 2 * w, ay = (1 - anchor.y) / 2 * h;
        const lx = Math.min(Math.max(column, ax + 28), w - label.offsetWidth - 14);   // never off the right edge
        label.style.transform = `translate(${lx.toFixed(1)}px, ${ay.toFixed(1)}px)`;
        label.style.opacity = show;
        label.classList.toggle('on', hovered === n);
        lines += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${(lx - 8).toFixed(1)}" y2="${ay.toFixed(1)}"/>`
          + `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.5"/>`;
      }
      hero.leaders.setAttribute('viewBox', `0 0 ${w} ${h}`);
      hero.leaders.innerHTML = lines;
      hero.leaders.style.opacity = show;
    }

    if (hero && !el._wired) {
      el._wired = true;   // listeners survive a rebuilt viewer, so they read the current one through el._input
      const input = el._input = { aimX: 0, aimY: 0, pointer: { x: 9, y: 9 }, down: null, up: null };
      window.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        input.pointer.x = (e.clientX - r.left) / r.width * 2 - 1;
        input.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        input.aimX = Math.max(-1, Math.min(1, input.pointer.x));
        input.aimY = Math.max(-1, Math.min(1, input.pointer.y));
      }, { passive: true });
      el.addEventListener('pointerleave', () => { if (!el.classList.contains('dragging')) { input.pointer.x = input.pointer.y = 9; input.aimX = input.aimY = 0; } });
      el.addEventListener('pointerdown', (e) => input.down?.(e));
      el.addEventListener('pointerup', () => input.up?.());
      el.addEventListener('pointercancel', () => input.up?.());   // e.g. a phone turned the gesture into a scroll
      // Phones: tilt the phone to tilt the board, where the browser allows it without asking.
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma == null) return;
        input.aimX = Math.max(-1, Math.min(1, e.gamma / 30));
        input.aimY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      }, { passive: true });
    }
    if (hero) {
      const input = el._input;
      // Grab a layer and it comes out with the pointer, then springs back into the stack when let go.
      input.down = (e) => {
        if (!heroModel || e.button > 0) return;
        const r = el.getBoundingClientRect();
        pointer.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObjects(layers.map(([n]) => n), true).find((x) => x.object.isMesh);
        const node = hit && layerOf(hit.object);
        if (!node) return;
        const normal = camera.getWorldDirection(new THREE.Vector3());
        drag = {
          node, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
          start: heroModel.worldToLocal(hit.point.clone()), from: (pull.get(node) || new THREE.Vector3()).clone(),
        };
        hovered = node;
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
      };
      input.up = () => { drag = null; el.classList.remove('dragging'); };
    }

    function frame(r) {
      loading.remove();
      const aspect = el.clientWidth / (el.clientHeight || 1);
      if (aspect < 1) r *= Math.pow(1 / aspect, 0.8);   // tall boxes (the profile shelf): step back so it fits across
      camera.position.set(r * 2.1, r * 1.5, r * 2.6);
      controls.target.set(0, 0, 0);
      controls.minDistance = r * 1.4;
      controls.maxDistance = r * 8;
      controls.update();
    }
    // A model that fails to download is tried twice more, then a picture (if there is one) stands in.
    let tries = 0;
    const failed = () => {
      if (tries++ < 2 && el.isConnected && state.alive) setTimeout(load, 900 * tries);
      else { loading.remove(); fallback(el); }
    };

    function load() {
      if (type === 'glb' || type === 'layers') {
        // Textured model (e.g. a PCB), already Y-up and centred. Keep its own colours.
        renderer.outputEncoding = THREE.sRGBEncoding;
        new THREE.GLTFLoader().load(src, (gltf) => {
          const model = gltf.scene;
          const meshes = [];
          model.traverse((o) => { if (o.isMesh) meshes.push(o); });
          for (const o of meshes) {
            o.material.polygonOffset = true;
            o.material.polygonOffsetFactor = 1;
            o.material.polygonOffsetUnits = 1;
            if (o.material.transparent) o.material.depthWrite = false;   // stacked see-through layers
            o.add(outline(o.geometry));   // child, so it follows the mesh's transform
          }
          if (type === 'layers') {
            layers = model.children.map((n) => [n, n.position.y]);
            controls.autoRotateSpeed = 0.6;
          }
          if (hero) {
            stage = new THREE.Group();
            stage.add(model);
            scene.add(stage);
            heroModel = model;
            if (hero.traces) addCurrent(model, hero.traces);
          } else {
            scene.add(model);
          }
          const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
          model.position.sub(sphere.center);
          frame(sphere.radius * (type === 'layers' ? 1.15 : 0.9));   // flat boards look lost in a full bounding-sphere frame
          if (hero) {
            size = new THREE.Box3().setFromObject(layers[0][0]).getSize(new THREE.Vector3());
            // Pull back further on tall, narrow screens so the whole stack fits with room for the labels,
            // and on phones aim right of the board so it sits left of the label column.
            const aspect = el.clientWidth / el.clientHeight;
            const back = 3.3 * Math.pow(Math.max(1, 1.3 / aspect), 0.8);
            const narrow = el.clientWidth < 700;
            camera.position.set(narrow ? sphere.radius * 0.3 : 0, sphere.radius * back * 0.95, sphere.radius * back);
            controls.target.set(narrow ? sphere.radius * 0.3 : 0, sphere.radius * 0.18, 0);   // a little low, clear of the header
            controls.update();
          }
          state.ready = true;
        }, undefined, failed);
      } else {
        new THREE.STLLoader().load(src, (geometry) => {
          geometry.rotateX(-Math.PI / 2);   // CAD files are Z-up, three.js is Y-up
          geometry.center();
          geometry.computeBoundingSphere();
          const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            color: new THREE.Color(cssVar('--model') || '#d8dde3'),
            roughness: 0.75, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
          }));
          scene.add(body, outline(geometry));
          frame(geometry.boundingSphere.radius);
          state.ready = true;
        }, undefined, failed);
      }
    }
    load();

    // Draw at the screen's own density (3x on most phones) so the model is as sharp as the pictures
    // around it, but keep each canvas under about 6 million pixels so large viewers stay smooth.
    function resize() {
      const w = el.clientWidth, h = el.clientHeight || w * 0.75;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3, Math.sqrt(6e6 / (w * h))));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const resizer = new ResizeObserver(resize);
    resizer.observe(el);
    resize();

    let visible = true;
    const seen = new IntersectionObserver((e) => { visible = e[0].isIntersecting; });
    seen.observe(el);

    // Back to a picture: draw one last frame, keep it as an image, and give the context back.
    function dispose() {
      state.alive = false;
      live.delete(el);
      resizer.disconnect();
      seen.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      if (el._v === state) el._v = null;
    }
    state.release = () => { state.releasing = true; if (!state.ready) dispose(); };

    let first = true;
    (function loop() {
      if (!state.alive) return;          // the context was lost: a fresh viewer has taken over
      if (!el.isConnected) { dispose(); return; }   // its page was replaced
      if (state.releasing || (state.snapOnly && state.ready)) {
        controls.update();
        renderer.render(scene, camera);
        try {
          const url = renderer.domElement.toDataURL('image/webp', 0.9);
          snaps.set(snapKey(el), url);
          showPicture(el, url);
        } catch (e) { /* a picture is a nicety; the model was already shown */ }
        dispose();
        return;
      }
      requestAnimationFrame(loop);
      if (!visible) return;
      const t = performance.now() / 1000;
      if (hero && layers.length && stage) {
        const input = el._input;
        pointer.set(input.pointer.x, input.pointer.y);
        aimX = input.aimX; aimY = input.aimY;
        const p = Math.max(0, Math.min(1, hero.progress()));
        const ease = p * p * (3 - 2 * p);
        spread += (0.1 + 1.45 * ease - spread) * 0.12;
        if (!calm) {
          tiltX += (aimX - tiltX) * 0.06;
          tiltY += (aimY - tiltY) * 0.06;
        }
        stage.rotation.set(-0.12 * tiltY, -0.55 + ease * 1.05 + tiltX * 0.28, 0.05 * tiltX);
        stage.updateMatrixWorld(true);
        ray.setFromCamera(pointer, camera);
        if (drag) {
          if (ray.ray.intersectPlane(drag.plane, hitPoint)) {
            const moved = heroModel.worldToLocal(hitPoint.clone()).sub(drag.start);
            pull.set(drag.node, drag.from.clone().add(moved).clampLength(0, 34));
          }
          hovered = drag.node;
        } else {
          const hit = ray.intersectObjects(layers.map(([n]) => n), true).find((x) => x.object.isMesh);
          hovered = hit ? layerOf(hit.object) : null;
        }
        el.classList.toggle('can-grab', !!hovered && !drag);
        for (const [n, y] of layers) {
          const was = lift.get(n) || 0;
          const l = was + ((hovered === n && spread > 0.45 && !drag ? 1.6 : 0) - was) * 0.15;
          lift.set(n, l);
          const pl = pull.get(n) || zero;
          if (!drag || drag.node !== n) pl.lerp(zero, 0.085);   // spring back once let go
          n.position.set(pl.x, y * spread + l + pl.y, pl.z);
        }
        if (current) current.uniforms.uTime.value = calm ? 0 : t;
        if (size) placeLabels(Math.max(0, Math.min(1, (spread - 0.45) / 0.5)).toFixed(3));
      } else {
        if (layers.length) {
          const s = 0.18 + 0.82 * (0.5 - 0.5 * Math.cos(t * 0.5));
          for (const [n, y] of layers) n.position.y = y * s;
        }
        controls.update();
      }
      renderer.render(scene, camera);
      if (el._capture && state.ready) { el._capture(renderer.domElement.toDataURL('image/webp', 0.9)); el._capture = null; }
      if (first && state.ready) {
        first = false;
        renderer.domElement.style.opacity = '';   // the live model now covers the picture
        const picture = el.querySelector(':scope > img.snap');
        if (picture) picture.style.visibility = 'hidden';   // the canvas is see-through: don't show both
      }
    })();
  }

  const hoverable = matchMedia('(hover: hover)').matches;
  // Interactive viewers start when they come near the screen and go back to a picture when far away.
  // Still views get their picture when near, and come alive only while hovered or centred.
  const near = new IntersectionObserver((entries) => {
    for (const { target: el, isIntersecting } of entries) {
      const still = el.classList.contains('still');
      if (isIntersecting) {
        if (still && hoverable && !el._hoverWired) {
          // Wired here, not in watch(): by now the view sits inside its link (tile, thumbnail, shelf item).
          el._hoverWired = true;
          const host = el.closest('a') || el.parentElement;
          host.addEventListener('pointerenter', () => setActive(el, true));
          host.addEventListener('pointerleave', () => setActive(el, false));
        }
        if (still) {
          const cached = snaps.get(snapKey(el)), made = madePicture(el);
          if (made && !el._pictured) {
            el._pictured = true;
            showPicture(el, made, () => { if (!el._v) start(el); });   // missing file: draw one instead
          } else if (cached) showPicture(el, cached);
          else if (!el._v && !made) start(el);   // draw it once to get its picture
        } else if (!el._v) start(el);
      } else if (el._v?.release && !el._hero) el._v.release();
    }
  }, { rootMargin: '400px 0px' });

  const centred = new IntersectionObserver((entries) => {
    for (const { target: el, isIntersecting } of entries) setActive(el, isIntersecting);
  }, { rootMargin: '-38% 0px -38% 0px' });
  function setActive(el, on) {
    el._active = on;
    if (on) {
      if (el._v?.snapOnly) el._v.snapOnly = false;   // it was only drawing its picture: keep it running
      else if (!el._v) start(el);
    } else if (el._v?.release) el._v.release();
  }

  window.STLViewer = {
    // The home-page board. options: { progress, labels, leaders, traces }, see mount().
    hero(el, src, options) {
      el._hero = options;
      this.watch(el, src, 'layers', { poster: options.poster, stills: options.stills });
    },
    watch(el, src, type, options = {}) {
      el.dataset.stl = src;
      el.dataset.type = type || 'stl';
      if (options.poster) el.dataset.poster = options.poster;
      for (const [k, v] of Object.entries(options.stills || {})) el.dataset['still' + k[0].toUpperCase() + k.slice(1)] = v;
      if (el._hero) {   // the hero never turns back into a picture once it is live
        const made = el.dataset[innerWidth < 700 ? 'stillNarrow' : 'stillWide'];
        if (made) showPicture(el, made);
        let go = () => {
          go = () => {};
          for (const [type, fn] of wake) removeEventListener(type, fn);
          new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); if (el.isConnected) start(el); } },
            { rootMargin: '200px' }).observe(el);
        };
        // A real scroll only: the page itself jumps to the top when a view is drawn.
        const wake = ['scroll', 'pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel']
          .map((type) => [type, () => { if (type !== 'scroll' || scrollY > 40) go(); }]);
        for (const [type, fn] of wake) addEventListener(type, fn, { passive: true });
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
        addEventListener('load', () => setTimeout(() => idle(() => go(), { timeout: 2000 }), 2500), { once: true });
        if (document.readyState === 'complete') setTimeout(() => idle(() => go(), { timeout: 2000 }), 2500);
        return;
      }
      near.observe(el);
      if (el.classList.contains('still') && !hoverable) centred.observe(el);
    },
  };
})();
