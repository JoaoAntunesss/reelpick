import * as THREE from "three";

// 3D carousel reel: a ring of posters inside a cabinet. API: spin(pool, winner, prev) -> Promise, idle(items).
const N = 20, STEP = (Math.PI * 2) / N, PW = 1.5, PH = 2.25, R = (N * (PW + 0.25)) / (Math.PI * 2);
const easeOutBack = (t, s = 0.9) => { const c3 = s + 1; return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const rand = (n) => Math.floor(Math.random() * n);

export function supported() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}

function placeholderTexture(title, id) {
  const c = document.createElement("canvas"); c.width = 342; c.height = 513;
  const g = c.getContext("2d"), h = (id * 47) % 360;
  const grad = g.createLinearGradient(0, 0, 342, 513); grad.addColorStop(0, `hsl(${h} 60% 34%)`); grad.addColorStop(1, `hsl(${(h + 60) % 360} 55% 14%)`);
  g.fillStyle = grad; g.fillRect(0, 0, 342, 513);
  g.fillStyle = "#fff"; g.font = "bold 34px system-ui,sans-serif"; g.textBaseline = "bottom";
  const words = String(title).split(" "); let line = "", lines = [];
  words.forEach((w) => { const t = line ? line + " " + w : w; if (g.measureText(t).width > 300 && line) { lines.push(line); line = w; } else line = t; }); lines.push(line);
  lines.slice(-4).forEach((l, i, a) => g.fillText(l, 20, 490 - (a.length - 1 - i) * 40));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createReel3D(host, { onTick = () => {}, onWin = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  scene.add(new THREE.HemisphereLight(0xb9a6ff, 0x120a22, 1.1));
  const pink = new THREE.PointLight(0xff3d81, 30, 20); pink.position.set(-5, 2.5, R + 3); scene.add(pink);
  const cyan = new THREE.PointLight(0x38e8ff, 24, 20); cyan.position.set(5, -2, R + 3); scene.add(cyan);
  const spot = new THREE.SpotLight(0xffe2a8, 0, 30, 0.35, 0.5); spot.position.set(0, 4, R + 8); spot.target.position.set(0, 0, R); scene.add(spot, spot.target);

  // ring + posters
  const ring = new THREE.Group(); scene.add(ring);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.12, R - 0.12, 3.2, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x07040f, side: THREE.BackSide }));
  ring.add(inner);
  [1.62, -1.62].forEach((y) => { const t = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: 0xff3d81 })); t.rotation.x = Math.PI / 2; t.position.y = y; ring.add(t); });
  const slots = [];
  const frameGeo = new THREE.PlaneGeometry(PW + 0.14, PH + 0.14), posterGeo = new THREE.PlaneGeometry(PW, PH);
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group(), a = i * STEP;
    g.position.set(Math.sin(a) * R, 0, Math.cos(a) * R); g.rotation.y = a;
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ color: 0xffc83d })); frame.position.z = -0.01; frame.visible = false;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const poster = new THREE.Mesh(posterGeo, mat);
    g.add(frame, poster); ring.add(g);
    slots.push({ g, frame, poster, mat, item: null, base: g.position.clone() });
  }

  // cabinet
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a1d80, metalness: 0.6, roughness: 0.35 });
  const cab = new THREE.Group(); cab.position.z = R + 1.0; scene.add(cab);
  const mk = (w, h, d, x, y, m = metal) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, 0); cab.add(b); return b; };
  mk(0.6, 4.2, 0.8, -3.5, 0); mk(0.6, 4.2, 0.8, 3.5, 0); mk(7.6, 0.6, 0.8, 0, 2.1); mk(7.6, 0.6, 0.8, 0, -2.1);
  const bulbs = [];
  for (let i = 0; i < 15; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffc83d, emissiveIntensity: 1 }));
    b.position.set(-3.5 + i * 0.5, 2.1, 0.45); cab.add(b); bulbs.push(b); }
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff3d81 });
  [-1, 1].forEach((s) => { const t = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 3), arrowMat); t.rotation.z = -s * Math.PI / 2; t.position.set(s * 3.0, 0, 0.3); cab.add(t); });

  // lever
  const lever = new THREE.Group(); lever.position.set(4.4, -0.9, R + 1.0); scene.add(lever);
  const pivot = new THREE.Group(); lever.add(pivot);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0xcfd3dd, metalness: 0.9, roughness: 0.2 })); stick.position.y = 0.9; pivot.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe0185f, emissive: 0x500020, roughness: 0.3 })); knob.position.y = 1.85; pivot.add(knob);
  lever.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), metal));
  const leverHit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); leverHit.position.y = 1.85; pivot.add(leverHit);
  pivot.rotation.z = -0.5; let leverT = 0, leverAnim = 0;

  // state
  let rot = 0, spinning = false, busy = false, winner = null, winSlot = -1, winT = 1, confetti = null, time = 0, spinStart = 0, spinDur = 0, r0 = 0, r1 = 0, lastTick = 0, resolveSpin = null, onLever = null;
  const loader = new THREE.TextureLoader(); loader.crossOrigin = "anonymous";

  function setSlot(i, item) {
    const s = slots[i]; s.item = item; s.frame.visible = false;
    const apply = (tex) => { if (s.item !== item) return; if (s.mat.map && s.mat.map !== tex) s.mat.map.dispose(); tex.colorSpace = THREE.SRGBColorSpace; s.mat.map = tex; s.mat.needsUpdate = true; };
    if (!item.poster) { apply(placeholderTexture(item.title, item.id)); return Promise.resolve(); }
    return new Promise((res) => {
      const timer = setTimeout(res, 4000);
      loader.load(item.poster, (t) => { clearTimeout(timer); try { apply(t); } catch (e) { apply(placeholderTexture(item.title, item.id)); } res(); }, undefined, () => { clearTimeout(timer); try { apply(placeholderTexture(item.title, item.id)); } catch (e) { /* ignore */ } res(); });
    });
  }
  const frontSlot = () => ((Math.round(-rot / STEP) % N) + N) % N;

  function idle(items) { for (let i = 0; i < N; i++) setSlot(i, items[i % items.length]); }

  async function spin(pool, win, prev) {
    if (busy) return;
    busy = true;
    slots.forEach((s) => { s.frame.visible = false; s.g.scale.setScalar(1); s.g.position.copy(s.base); });
    const front = frontSlot();
    // keep three slots around the front, refresh the rest, put the winner far from the front
    const keep = new Set([front, (front + 1) % N, (front + N - 1) % N]);
    if (prev) setSlot(front, prev);
    const others = pool.filter((x) => !(x.type === win.type && x.id === win.id));
    const bag = (others.length ? others : [win]).slice().sort(() => Math.random() - 0.5);
    winSlot = (front + 8 + rand(5)) % N;
    const jobs = []; let b = 0;
    for (let i = 0; i < N; i++) { if (keep.has(i)) continue; jobs.push(setSlot(i, i === winSlot ? win : bag[b++ % bag.length])); }
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 6000))]);
    winner = win;
    r0 = rot; r1 = -winSlot * STEP; while (r1 > r0 - 4 * Math.PI * 2) r1 -= Math.PI * 2;
    spinStart = performance.now(); spinDur = reduced ? 600 : 5600; lastTick = Math.round(-r0 / STEP);
    spinning = true; pullLever();
    return new Promise((res) => { resolveSpin = res; });
  }

  function pullLever() { leverAnim = 1; leverT = 0; }

  function finish() {
    spinning = false; busy = false; winT = 0;
    const s = slots[winSlot]; s.frame.visible = true;
    if (!reduced) burst();
    if (navigator.vibrate) { try { navigator.vibrate([40, 30, 80]); } catch (e) { /* ignore */ } }
    onWin(); const r = resolveSpin; resolveSpin = null; if (r) r();
  }

  function burst() {
    const n = 220, pos = new Float32Array(n * 3), vel = [], col = new Float32Array(n * 3);
    const pal = [0xffc83d, 0xff3d81, 0x38e8ff, 0xffffff, 0x9d6bff].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.2, R + 1.3], i * 3);
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 7 + 1, Math.random() * 3 + 1));
      const c = pal[rand(pal.length)]; col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, depthWrite: false }));
    scene.add(pts); confetti = { pts, vel, t: 0 };
  }

  // input
  const ray = new THREE.Raycaster(), m = new THREE.Vector2();
  const hitLever = (ev) => { const r = renderer.domElement.getBoundingClientRect(); m.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(m, camera); return ray.intersectObject(leverHit, false).length > 0; };
  renderer.domElement.addEventListener("pointermove", (ev) => { renderer.domElement.style.cursor = hitLever(ev) ? "pointer" : ""; });
  renderer.domElement.addEventListener("click", (ev) => { if (hitLever(ev) && onLever) onLever(); });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const halfW = 4.9, halfH = 2.55, tan = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(halfW / camera.aspect, halfH) / tan;
    camera.position.set(0, 0.2, R + 1.0 + dist); camera.lookAt(0, 0, R); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    let speed = 0;
    if (spinning) {
      const el = now - spinStart, WIND = reduced ? 0 : 380, prev = rot;
      if (el < WIND) rot = r0 + 0.3 * Math.sin((el / WIND) * Math.PI / 2);          // wind-up: back a little before the launch
      else {
        const t = Math.min(1, (el - WIND) / spinDur), base = r0 + 0.3;
        const k = t < 0.85 ? easeOutQuart(t / 0.85) * 0.97 : 0.97 + 0.03 * easeOutBack((t - 0.85) / 0.15, 1.6);
        rot = reduced ? r0 + (r1 - r0) * t : base + (r1 - base) * k;
        if (t >= 1) { rot = r1; finish(); }
      }
      speed = Math.abs(rot - prev) / Math.max(dt, 0.001);
      const idx = Math.round(-rot / STEP); if (idx !== lastTick) { lastTick = idx; onTick(); }
    }
    // fake motion blur: stretch and fade the posters with speed
    const blur = Math.min(1, speed / 16);
    slots.forEach((sl) => { sl.poster.scale.x = 1 + 0.85 * blur; sl.mat.opacity = 1 - 0.4 * blur; });
    ring.rotation.y = rot;
    // dim posters that face away from the camera
    slots.forEach((s, i) => { const a = i * STEP + rot, c = Math.cos(a); const v = 0.25 + 0.75 * Math.max(0, c); s.mat.color.setScalar(v); });
    if (winT < 1) { winT = Math.min(1, winT + dt * 2.5); const e = easeOutBack(winT, 2), s = slots[winSlot]; s.g.scale.setScalar(1 + 0.16 * e); s.g.position.copy(s.base).add(new THREE.Vector3(Math.sin(winSlot * STEP), 0, Math.cos(winSlot * STEP)).multiplyScalar(0.35 * e)); spot.intensity = 260 * e; }
    else if (!spinning && winner) spot.intensity = 220 + 40 * Math.sin(time * 4);
    if (spinning) spot.intensity = 0;
    bulbs.forEach((b, i) => { const sp = spinning ? 14 : 3; b.material.emissiveIntensity = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(time * sp - i * 0.7)); });
    if (leverAnim) { leverT += dt; const u = Math.min(1, leverT / 0.7); pivot.rotation.z = u < 0.3 ? -0.5 + (1.5 * u) / 0.3 : 1.0 - (1.5 * (u - 0.3)) / 0.7; if (u >= 1) { leverAnim = 0; pivot.rotation.z = -0.5; } }
    if (confetti) { const c = confetti; c.t += dt; const p = c.pts.geometry.attributes.position;
      for (let i = 0; i < c.vel.length; i++) { c.vel[i].y -= 9 * dt; p.array[i * 3] += c.vel[i].x * dt; p.array[i * 3 + 1] += c.vel[i].y * dt; p.array[i * 3 + 2] += c.vel[i].z * dt; }
      p.needsUpdate = true; c.pts.material.opacity = Math.max(0, 1 - c.t / 3);
      if (c.t > 3) { scene.remove(c.pts); c.pts.geometry.dispose(); c.pts.material.dispose(); confetti = null; } }
    camera.position.x = Math.sin(time * 0.5) * 0.12;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return { spin, idle, setLeverHandler: (f) => { onLever = f; }, pullLever, kind: "3d", _debug: { slots, get rot() { return rot; }, get winSlot() { return winSlot; } } };
}
