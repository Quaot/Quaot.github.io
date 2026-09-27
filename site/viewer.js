// Draws an STL as a shaded part with outlined edges, like a technical drawing.
// Viewers only start once they scroll into view, and stop rendering when hidden.
(function () {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function mount(el, src) {
    if (el._viewer) return;
    el._viewer = true;
    el.style.position = el.style.position || 'relative';
    const loading = document.createElement('div');
    loading.className = 'loading label';
    loading.textContent = 'Loading model';
    el.appendChild(loading);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    new THREE.STLLoader().load(src, (geometry) => {
      loading.remove();
      geometry.rotateX(-Math.PI / 2);   // CAD files are Z-up, three.js is Y-up
      geometry.center();
      geometry.computeBoundingSphere();
      const r = geometry.boundingSphere.radius;

      const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: new THREE.Color(cssVar('--model') || '#d8dde3'),
        roughness: 0.75, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      }));
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 28),
        new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar('--edge') || '#1b2430') })
      );
      scene.add(body, edges);
      camera.position.set(r * 2.1, r * 1.5, r * 2.6);
      controls.target.set(0, 0, 0);
      controls.minDistance = r * 1.4;
      controls.maxDistance = r * 8;
      controls.update();
    }, undefined, () => { loading.textContent = 'Model failed to load'; });

    function resize() {
      const w = el.clientWidth, h = el.clientHeight || w * 0.75;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(el);
    resize();

    let visible = true;
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(el);
    (function loop() {
      requestAnimationFrame(loop);
      if (!visible || !el.isConnected) return;
      controls.update();
      renderer.render(scene, camera);
    })();
  }

  // Start a viewer when it first comes near the screen.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { io.unobserve(e.target); mount(e.target, e.target.dataset.stl); }
    }
  }, { rootMargin: '200px' });

  window.STLViewer = {
    watch(el, src) {
      if (typeof THREE === 'undefined') { el.textContent = '3D viewer unavailable'; return; }
      el.dataset.stl = src;
      io.observe(el);
    },
  };
})();
