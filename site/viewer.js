// Draws an STL (or a textured GLB) as a shaded part with outlined edges, like a technical drawing.
// type 'layers' is a GLB of stacked board layers that slowly pull apart and close again.
// With hero options (STLViewer.hero) the layers follow the page's scroll instead, tilt toward the cursor,
// name themselves on labels, lift when pointed at, and carry pulses of current along the real tracks.
// Viewers only start once they scroll into view, and stop rendering when hidden.
(function () {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function mount(el, src, type) {
    if (el._viewer) return;
    const hero = el._hero;   // { progress(), labels: {layer name: element}, leaders: <svg>, traces: url }
    el._viewer = true;
    const loading = document.createElement('div');
    loading.className = 'loading label';
    loading.textContent = 'Loading model';
    el.appendChild(loading);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    el.appendChild(renderer.domElement);

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
      const walk = (i, fromStart) => {
        const pts = [];
        let [x1, z1, x2, z2] = segments[i];
        if (!fromStart) [x1, z1, x2, z2] = [x2, z2, x1, z1];
        pts.push([x1, z1], [x2, z2]);
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
      for (const i of order) if (!used.has(i)) paths.push(walk(i, true));
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
    function stepCurrent(t) {
      if (current) current.uniforms.uTime.value = t;
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

    if (hero) {
      window.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        pointer.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        aimX = Math.max(-1, Math.min(1, pointer.x));
        aimY = Math.max(-1, Math.min(1, pointer.y));
      }, { passive: true });
      el.addEventListener('pointerleave', () => { if (!drag) { pointer.set(9, 9); aimX = aimY = 0; } });
      // Grab a layer and it comes out with the pointer, then springs back into the stack when let go.
      el.addEventListener('pointerdown', (e) => {
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
      });
      const release = () => { drag = null; el.classList.remove('dragging'); };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);   // e.g. a phone turned the gesture into a scroll
      // Phones: tilt the phone to tilt the board, where the browser allows it without asking.
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma == null) return;
        aimX = Math.max(-1, Math.min(1, e.gamma / 30));
        aimY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      }, { passive: true });
    }

    function frame(r) {
      loading.remove();
      camera.position.set(r * 2.1, r * 1.5, r * 2.6);
      controls.target.set(0, 0, 0);
      controls.minDistance = r * 1.4;
      controls.maxDistance = r * 8;
      controls.update();
    }
    const failed = () => { loading.textContent = 'Model failed to load'; };

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
      }, undefined, failed);
    }

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
    new ResizeObserver(resize).observe(el);
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', resize, { once: true });   // moved to another screen
    resize();

    let visible = true;
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(el);
    (function loop() {
      if (!el.isConnected) {   // its page was replaced: free the GL context
        controls.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        return;
      }
      requestAnimationFrame(loop);
      if (!visible) return;
      const t = performance.now() / 1000;
      if (hero && layers.length && stage) {
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
        stepCurrent(calm ? 0 : t);
        if (size) placeLabels(Math.max(0, Math.min(1, (spread - 0.45) / 0.5)).toFixed(3));
        renderer.render(scene, camera);
        return;
      }
      if (layers.length) {
        const spread = 0.18 + 0.82 * (0.5 - 0.5 * Math.cos(t * 0.5));
        for (const [n, y] of layers) n.position.y = y * spread;
      }
      controls.update();
      renderer.render(scene, camera);
    })();
  }

  // Start a viewer when it first comes near the screen.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { io.unobserve(e.target); mount(e.target, e.target.dataset.stl, e.target.dataset.type); }
    }
  }, { rootMargin: '200px' });

  window.STLViewer = {
    // The home-page board. options: { progress, labels, leaders, traces }, see mount().
    hero(el, src, options) {
      el._hero = options;
      this.watch(el, src, 'layers');
    },
    watch(el, src, type) {
      if (typeof THREE === 'undefined') { el.textContent = '3D viewer unavailable'; return; }
      el.dataset.stl = src;
      el.dataset.type = type || 'stl';
      io.observe(el);
    },
  };
})();
