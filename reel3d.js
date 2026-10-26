import * as THREE from "three";

// 3D slot machine: three vertical reels (drums of posters) in a casino cabinet.
// API: spin(pool, winner, prev) -> Promise, idle(items), setLeverHandler(fn), pullLever().
// All three reels land on the winner (a "jackpot"), stopping left to right.
const N = 12, STEP = (Math.PI * 2) / N, PW = 1.5, PH = 2.25, PITCH = 2.4, R = (N * PITCH) / (Math.PI * 2);
const REELS = 3, SPACING = 1.75, REEL_X = [-SPACING, 0, SPACING];
const easeOutBack = (t, s = 0.9) => { const c3 = s + 1; return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 2.4);
const rand = (n) => Math.floor(Math.random() * n);

export function supported() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function placeholderTexture(title, id) {
  return canvasTex(342, 513, (g) => {
    const h = (id * 47) % 360, grad = g.createLinearGradient(0, 0, 342, 513);
    grad.addColorStop(0, `hsl(${h} 60% 34%)`); grad.addColorStop(1, `hsl(${(h + 60) % 360} 55% 14%)`);
    g.fillStyle = grad; g.fillRect(0, 0, 342, 513);
    g.fillStyle = "#fff"; g.font = "bold 34px system-ui,sans-serif"; g.textBaseline = "bottom";
    const words = String(title).split(" "); let line = "", lines = [];
    words.forEach((w) => { const t = line ? line + " " + w : w; if (g.measureText(t).width > 300 && line) { lines.push(line); line = w; } else line = t; }); lines.push(line);
    lines.slice(-4).forEach((l, i, a) => g.fillText(l, 20, 490 - (a.length - 1 - i) * 40));
  });
}

export function createReel3D(host, { onTick = () => {}, onWin = () => {}, onStop = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  scene.add(new THREE.HemisphereLight(0xc9b8ff, 0x1a0f2e, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d0, 1.4); key.position.set(2, 6, R + 12); scene.add(key);
  const pink = new THREE.PointLight(0xff3d81, 90, 40); pink.position.set(-6, 1, R + 5); scene.add(pink);
  const cyan = new THREE.PointLight(0x38e8ff, 70, 40); cyan.position.set(6, -2, R + 5); scene.add(cyan);
  const spot = new THREE.SpotLight(0xffe2a8, 0, 40, 0.5, 0.5); spot.position.set(0, 3, R + 12); spot.target.position.set(0, 0, R); scene.add(spot, spot.target);

  // ---------------------------------------------------------------- reels
  const texCache = new Map();
  const loader = new THREE.TextureLoader(); loader.crossOrigin = "anonymous";
  const frameGeo = new THREE.PlaneGeometry(PW + 0.16, PH + 0.16), posterGeo = new THREE.PlaneGeometry(PW, PH);
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x0c0718, roughness: 0.9 });
  const reels = REELS === 3 && REEL_X.map((x) => {
    const g = new THREE.Group(); g.position.x = x; scene.add(g);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.04, R - 0.04, PW + 0.1, 48), drumMat); core.rotation.z = Math.PI / 2; g.add(core);
    const slots = [];
    for (let i = 0; i < N; i++) {
      const a = i * STEP, cell = new THREE.Group();
      cell.position.set(0, Math.sin(a) * R, Math.cos(a) * R); cell.rotation.x = -a;
      const frame = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ color: 0xffc83d })); frame.position.z = -0.01; frame.visible = false;
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
      const poster = new THREE.Mesh(posterGeo, mat);
      cell.add(frame, poster); g.add(cell);
      slots.push({ cell, frame, poster, mat, item: null, base: cell.position.clone(), out: new THREE.Vector3(0, Math.sin(a), Math.cos(a)) });
    }
    return { g, slots, rot: 0, winSlot: -1, r0: 0, r1: 0, dur: 0, done: true, speed: 0 };
  });

  // ---------------------------------------------------------------- cabinet
  const body = new THREE.MeshStandardMaterial({ color: 0x3b1672, metalness: 0.35, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14091f, metalness: 0.2, roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.5, roughness: 0.35, emissive: 0x4a3300 });
  const ZC = R + 0.5;   // front panels: depth 0.6 around z = ZC
  const cab = new THREE.Group(); scene.add(cab);
  const box = (w, h, d, x, y, z, m = body) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); cab.add(b); return b; };
  const WX = 2.7, WY = 1.95, BW = 3.95;
  box(2 * BW, 0.65, 0.6, 0, WY + 0.325, ZC); box(2 * BW, 0.65, 0.6, 0, -WY - 0.325, ZC);               // bars above and below the window
  box(BW - WX, 2 * (WY + 0.65), 0.6, -(WX + BW) / 2, 0, ZC); box(BW - WX, 2 * (WY + 0.65), 0.6, (WX + BW) / 2, 0, ZC); // side cheeks
  box(2 * BW + 0.3, 1.35, 0.8, 0, 3.25, ZC + 0.1, body);                                                      // marquee box
  box(2 * BW + 0.3, 1.35, 0.8, 0, -3.25, ZC + 0.35, body);                                                     // button deck (sticks out)
  [-1, 1].forEach((s) => box(0.2, 7.9, 1.0, s * (BW + 0.1), 0, ZC, gold));                                      // gold side rails
  box(2 * WX + 0.1, 0.1, 0.7, 0, WY + 0.02, ZC + 0.05, gold); box(2 * WX + 0.1, 0.1, 0.7, 0, -WY - 0.02, ZC + 0.05, gold); // window trim
  [-1, 1].forEach((s) => box(0.1, 2 * WY, 0.7, s * WX, 0, ZC + 0.05, gold));
  [-1, 1].forEach((s) => box(0.16, 2 * WY, 0.5, s * SPACING / 2 + 0, 0, ZC - 0.05, dark));                      // reel dividers
  // back wall so nothing shows behind the machine
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshBasicMaterial({ color: 0x07040f })); back.position.z = -R - 2; scene.add(back);

  // marquee sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2 * BW - 0.4, 1.0), new THREE.MeshBasicMaterial({ map: canvasTex(1400, 180, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#3a0d6b"); gr.addColorStop(1, "#14061f"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = "900 124px Inter,system-ui,sans-serif";
    g.shadowColor = "#ffc83d"; g.shadowBlur = 36; g.fillStyle = "#ffe08a"; g.fillText("REELPICK", w / 2, h / 2 + 6);
    g.shadowBlur = 0; g.fillStyle = "#ff3d81"; g.font = "70px system-ui"; g.fillText("★ ★ ★", 200, h / 2); g.fillText("★ ★ ★", w - 200, h / 2);
  }) })); sign.position.set(0, 3.25, ZC + 0.52); cab.add(sign);

  // bulbs around the marquee and the window
  const bulbs = [], bulbGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const addBulb = (x, y, z) => { const m = new THREE.MeshBasicMaterial({ color: 0x4a3300 }); const b = new THREE.Mesh(bulbGeo, m); b.position.set(x, y, z); cab.add(b); bulbs.push(b); };
  const perim = [];
  for (let x = -3.6; x <= 3.61; x += 0.4) { perim.push([x, 3.95]); }
  for (let y = 3.6; y >= 2.55; y -= 0.35) perim.push([3.75, y]);
  for (let x = 3.6; x >= -3.61; x -= 0.4) perim.push([x, 2.58]);
  for (let y = 2.9; y <= 3.6; y += 0.35) perim.push([-3.75, y]);
  perim.forEach(([x, y]) => addBulb(x, y, ZC + 0.55));
  const wp = [];
  for (let x = -2.4; x <= 2.41; x += 0.4) wp.push([x, WY + 0.32]);
  for (let y = WY; y >= -WY; y -= 0.45) wp.push([3.3, y]);
  for (let x = 2.4; x >= -2.41; x -= 0.4) wp.push([x, -WY - 0.32]);
  for (let y = -WY; y <= WY; y += 0.45) wp.push([-3.3, y]);
  wp.forEach(([x, y]) => addBulb(x, y, ZC + 0.32));

  // glass sheen, top/bottom shading and payline
  const overlay = (w, h, z, map, y = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false })); m.position.set(0, y, z); cab.add(m); return m; };
  const shade = canvasTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(0,0,0,.85)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  overlay(2 * WX, 1.1, ZC + 0.3, shade, WY - 0.55);
  const shadeB = overlay(2 * WX, 1.1, ZC + 0.3, shade, -WY + 0.55); shadeB.rotation.z = Math.PI;
  overlay(2 * WX, 2 * WY, ZC + 0.33, canvasTex(256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "rgba(255,255,255,.16)"); gr.addColorStop(0.35, "rgba(255,255,255,0)"); gr.addColorStop(0.7, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,.07)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xff2a4d, transparent: true, opacity: 0.9 });
  const payline = new THREE.Mesh(new THREE.BoxGeometry(2 * WX, 0.045, 0.02), lineMat); payline.position.set(0, 0, ZC + 0.34); cab.add(payline);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff3d81 });
  [-1, 1].forEach((s) => { const t = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 3), arrowMat); t.rotation.z = s * Math.PI / 2; t.position.set(s * (WX + 0.3), 0, ZC + 0.31); cab.add(t); });

  // button deck
  const deckZ = ZC + 0.78;
  const slotBox = box(1.6, 0.36, 0.1, -2.4, -3.1, deckZ, dark);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xffc83d })); slit.position.set(-2.4, -3.1, deckZ + 0.06); cab.add(slit);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.3), new THREE.MeshBasicMaterial({ map: canvasTex(340, 60, (g, w, h) => { g.fillStyle = "#14091f"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffc83d"; g.font = "bold 34px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("1 PULL = 1 PICK", w / 2, h / 2 + 2); }) })); label.position.set(-2.4, -3.5, deckZ + 0.01); cab.add(label);
  const btns = [[0xff3d81, -0.55], [0xffc83d, 0.2], [0x38e8ff, 0.95]].map(([c, x]) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.3 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.18, 24), m); b.rotation.x = Math.PI / 2; b.position.set(x, -3.2, deckZ + 0.05); cab.add(b); return m; });
  box(1.9, 0.5, 0.15, 2.5, -3.35, deckZ - 0.02, dark); // payout tray

  // ---------------------------------------------------------------- lever (right side)
  const lever = new THREE.Group(); lever.position.set(BW + 0.75, -0.6, ZC); scene.add(lever);
  const pivot = new THREE.Group(); lever.add(pivot);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dbe6, metalness: 0.7, roughness: 0.25 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.1, 14), steel); stick.position.y = 1.05; pivot.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), new THREE.MeshStandardMaterial({ color: 0xe0185f, emissive: 0x600028, roughness: 0.25 })); knob.position.y = 2.2; pivot.add(knob);
  const baseP = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 20), gold); baseP.rotation.z = Math.PI / 2; lever.add(baseP);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.3), body); arm.position.x = -0.35; lever.add(arm);
  const leverHit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); leverHit.position.y = 2.2; pivot.add(leverHit);
  pivot.rotation.x = -0.25; let leverT = 0, leverAnim = 0;

  // ---------------------------------------------------------------- state
  let spinning = false, busy = false, winner = null, winT = 1, confetti = null, time = 0, spinStart = 0, lastTick = 0, resolveSpin = null, onLever = null, stopped = 0;

  const inUse = (t) => reels.some((r) => r.slots.some((s) => s.mat.map === t));
  function trim() {
    if (texCache.size <= 70) return;
    for (const [k, v] of texCache) { if (texCache.size <= 55) break; if (v.tex && !inUse(v.tex)) { v.tex.dispose(); texCache.delete(k); } }
  }
  function getTex(item) {
    const k = item.poster || ("ph:" + item.id + item.title);
    let e = texCache.get(k); if (e) return e.promise;
    e = { tex: null }; texCache.set(k, e);
    const ph = () => placeholderTexture(item.title, item.id);
    e.promise = !item.poster ? Promise.resolve(e.tex = ph()) : new Promise((res) => {
      const timer = setTimeout(() => { res(null); }, 4000);
      loader.load(item.poster, (t) => { clearTimeout(timer); t.colorSpace = THREE.SRGBColorSpace; e.tex = t; res(t); }, undefined, () => { clearTimeout(timer); try { e.tex = ph(); } catch (er) { /* ignore */ } res(e.tex); });
    });
    return e.promise;
  }
  function setSlot(reel, i, item) {
    const s = reel.slots[i]; s.item = item; s.frame.visible = false;
    return getTex(item).then((tex) => { if (s.item !== item || !tex) return; s.mat.map = tex; s.mat.needsUpdate = true; }).catch(() => {});
  }
  const frontSlot = (r) => ((Math.round(-r.rot / STEP) % N) + N) % N;
  function idle(items) { reels.forEach((r, k) => { for (let i = 0; i < N; i++) setSlot(r, i, items[(i + k * 4) % items.length]); }); trim(); }

  async function spin(pool, win, prev) {
    if (busy) return;
    busy = true;
    reels.forEach((r) => r.slots.forEach((s) => { s.frame.visible = false; s.cell.scale.setScalar(1); s.cell.position.copy(s.base); }));
    const others = pool.filter((x) => !(x.type === win.type && x.id === win.id));
    const jobs = [];
    reels.forEach((r, k) => {
      const front = frontSlot(r), keep = new Set([front, (front + 1) % N, (front + N - 1) % N]);
      if (prev) jobs.push(setSlot(r, front, prev));
      const bag = (others.length ? others : [win]).slice().sort(() => Math.random() - 0.5);
      r.winSlot = (front + 5 + rand(4)) % N;
      let b = 0;
      for (let i = 0; i < N; i++) { if (keep.has(i)) continue; jobs.push(setSlot(r, i, i === r.winSlot ? win : bag[b++ % bag.length])); }
    });
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 6000))]);
    winner = win; stopped = 0;
    reels.forEach((r, k) => {
      r.r0 = r.rot; r.r1 = -r.winSlot * STEP; while (r.r1 > r.r0 - (4 + k) * Math.PI * 2) r.r1 -= Math.PI * 2;
      r.dur = reduced ? 600 : 3900 + k * 750; r.done = false;
    });
    spinStart = performance.now(); lastTick = Math.round(-reels[0].r0 / STEP);
    spinning = true; pullLever();
    return new Promise((res) => { resolveSpin = res; });
  }

  function pullLever() { leverAnim = 1; leverT = 0; }

  function finish() {
    spinning = false; busy = false; winT = 0;
    reels.forEach((r) => { r.slots[r.winSlot].frame.visible = true; });
    if (!reduced) burst();
    if (navigator.vibrate) { try { navigator.vibrate([40, 30, 80]); } catch (e) { /* ignore */ } }
    trim();
    onWin(); const r = resolveSpin; resolveSpin = null; if (r) r();
  }

  function burst() {
    const n = 260, pos = new Float32Array(n * 3), vel = [], col = new Float32Array(n * 3);
    const pal = [0xffc83d, 0xff3d81, 0x38e8ff, 0xffffff, 0x9d6bff].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * 2.0, (Math.random() - 0.3) * 1.4, ZC + 1.0], i * 3);
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 8 + 1, Math.random() * 3 + 1));
      const c = pal[rand(pal.length)]; col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }));
    scene.add(pts); confetti = { pts, vel, t: 0 };
  }

  // ---------------------------------------------------------------- input
  const ray = new THREE.Raycaster(), m = new THREE.Vector2();
  const hitLever = (ev) => { const r = renderer.domElement.getBoundingClientRect(); m.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(m, camera); return ray.intersectObject(leverHit, false).length > 0; };
  renderer.domElement.addEventListener("pointermove", (ev) => { renderer.domElement.style.cursor = hitLever(ev) ? "pointer" : ""; });
  renderer.domElement.addEventListener("click", (ev) => { if (hitLever(ev) && onLever) onLever(); });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const halfW = 5.5, halfH = 4.35, tan = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(halfW / camera.aspect, halfH) / tan;
    camera.position.set(0, 0.25, ZC + 0.8 + dist); camera.lookAt(0, 0.25, ZC); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (spinning) {
      const el = now - spinStart, WIND = reduced ? 0 : 380; let allDone = true;
      reels.forEach((r, k) => {
        if (r.done) { r.speed = 0; return; }
        const prev = r.rot;
        if (el < WIND) { r.rot = r.r0 + 0.3 * Math.sin((el / WIND) * Math.PI / 2); allDone = false; }
        else {
          const t = Math.min(1, (el - WIND) / r.dur), base = r.r0 + 0.3;
          const e = t < 0.85 ? easeOutQuart(t / 0.85) * 0.97 : 0.97 + 0.03 * easeOutBack((t - 0.85) / 0.15, 1.6);
          r.rot = reduced ? r.r0 + (r.r1 - r.r0) * t : base + (r.r1 - base) * e;
          if (t >= 1) { r.rot = r.r1; r.done = true; onStop(k); } else allDone = false;
        }
        r.speed = Math.abs(r.rot - prev) / Math.max(dt, 0.001);
      });
      const idx = Math.round(-reels[0].rot / STEP); if (idx !== lastTick) { lastTick = idx; onTick(); }
      if (allDone) finish();
    }
    reels.forEach((r) => {
      r.g.rotation.x = -r.rot;
      const blur = Math.min(1, r.speed / 9);
      r.slots.forEach((s, i) => {
        const a = i * STEP + r.rot, c = Math.cos(a);
        s.cell.visible = c > -0.05;
        s.mat.color.setScalar(0.3 + 0.7 * Math.max(0, c));
        s.mat.opacity = 1 - 0.45 * blur;
        s.poster.scale.y = 1 + 0.8 * blur;
      });
    });
    if (winT < 1) {
      winT = Math.min(1, winT + dt * 2.5); const e = easeOutBack(winT, 2);
      reels.forEach((r) => { const s = r.slots[r.winSlot]; s.cell.scale.setScalar(1 + 0.12 * e); s.cell.position.copy(s.base).addScaledVector(s.out, 0.35 * e); });
      spot.intensity = 300 * e;
    } else if (!spinning && winner) spot.intensity = 260 + 40 * Math.sin(time * 4);
    if (spinning) spot.intensity = 0;
    const win = !spinning && winner && winT >= 0;
    bulbs.forEach((b, i) => {
      const sp = spinning ? 12 : win ? 7 : 2.2, v = 0.5 + 0.5 * Math.sin(time * sp - i * 0.55);
      b.material.color.setRGB(0.3 + 0.7 * v, 0.2 + 0.58 * v, 0.02 + 0.22 * v);
    });
    btns.forEach((mt, i) => { mt.emissiveIntensity = spinning || win ? 0.4 + 0.9 * (0.5 + 0.5 * Math.sin(time * 9 + i * 2)) : 0.5; });
    lineMat.opacity = win ? 0.5 + 0.5 * Math.sin(time * 10) : spinning ? 1 : 0.8;
    if (leverAnim) { leverT += dt; const u = Math.min(1, leverT / 0.8); pivot.rotation.x = u < 0.3 ? -0.25 + (1.75 * u) / 0.3 : 1.5 - (1.75 * (u - 0.3)) / 0.7; if (u >= 1) { leverAnim = 0; pivot.rotation.x = -0.25; } }
    if (confetti) { const c = confetti; c.t += dt; const p = c.pts.geometry.attributes.position;
      for (let i = 0; i < c.vel.length; i++) { c.vel[i].y -= 9 * dt; p.array[i * 3] += c.vel[i].x * dt; p.array[i * 3 + 1] += c.vel[i].y * dt; p.array[i * 3 + 2] += c.vel[i].z * dt; }
      p.needsUpdate = true; c.pts.material.opacity = Math.max(0, 1 - c.t / 3);
      if (c.t > 3) { scene.remove(c.pts); c.pts.geometry.dispose(); c.pts.material.dispose(); confetti = null; } }
    camera.position.x = Math.sin(time * 0.5) * 0.15;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  const mid = reels[1];
  return { spin, idle, setLeverHandler: (f) => { onLever = f; }, pullLever, kind: "3d", _debug: { slots: mid.slots, reels, get rot() { return mid.rot; }, get winSlot() { return mid.winSlot; } } };
}
