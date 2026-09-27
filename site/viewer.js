// Draws an STL (or a textured GLB) as a shaded part with outlined edges, like a technical drawing.
// type 'layers' is a GLB of stacked board layers that slowly pull apart and close again.
// Viewers only start once they scroll into view, and stop rendering when hidden.
(function () {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function mount(el, src, type) {
    if (el._viewer) return;
    el._viewer = true;
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

    const edgeColor = type === 'layers' ? '#5a5a5a' : (cssVar('--edge') || '#1b2430');
    function outline(geometry) {
      return new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 28),
        new THREE.LineBasicMaterial({ color: new THREE.Color(edgeColor) })
      );
    }
    let layers = [];   // [node, resting height] for type 'layers'

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
        scene.add(model);
        const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
        model.position.sub(sphere.center);
        frame(sphere.radius * (type === 'layers' ? 1.15 : 0.9));   // flat boards look lost in a full bounding-sphere frame
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
      if (!el.isConnected) {   // its page was replaced: free the GL context
        controls.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        return;
      }
      requestAnimationFrame(loop);
      if (!visible) return;
      if (layers.length) {
        const t = performance.now() / 1000;
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
    watch(el, src, type) {
      if (typeof THREE === 'undefined') { el.textContent = '3D viewer unavailable'; return; }
      el.dataset.stl = src;
      el.dataset.type = type || 'stl';
      io.observe(el);
    },
  };
})();
