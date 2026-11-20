import { STYLES, buildParams, commonGenres, easeOutQuart, randInt, buildStrip, shuffle, tasteGenreIds, hashStr, mulberry32, dayKey } from "./query.js?v=1795196914";
import { DEMO, DEMO_GENRES } from "./demo.js?v=1795196914";
import { supported, createReel3D } from "./reel3d.js?v=1795196914";
import { sanitizeItem, keyOf, sanitizeTastes, TASTE_GENRES, starsText } from "./seen.js?v=1795196914";
import { initSocial } from "./social.js?v=1795196914";
import { startI18n, tmdbLang, isPT, setLang } from "./i18n.js?v=1795196914";
import { icon } from "./icons.js?v=1795196914";
import { FILMS, PLAIN, validPath, cacheKey } from "./themes.js?v=1795196914";
startI18n();
{ const lb = document.getElementById("langBtn"); if (lb) { lb.textContent = isPT ? "English" : "Português"; lb.lang = isPT ? "en" : "pt-PT"; lb.title = isPT ? "Switch to English" : "Mudar para português"; lb.onclick = () => setLang(isPT ? "en" : "pt"); } }

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d = "") { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};
const API = "https://api.themoviedb.org/3", IMG = "https://image.tmdb.org/t/p/";
const REGIONS = { PT: "Portugal", BR: "Brazil", ES: "Spain", FR: "France", GB: "United Kingdom", US: "United States", DE: "Germany", IT: "Italy" };

const state = {
  type: "movie", genres: new Set(), matchAll: false, providers: new Set(),
  region: store.get("rp_region", "PT"), style: "any", minRating: 0, sound: store.get("rp_sound", "1") === "1",
};
let key = store.get("rp_key");
let demo = !key;
// Shared TMDB access through the AW server, so nobody needs their own key. A personal key still wins if set.
const PROXY = "https://europe-west1-aw-sites-e31c3.cloudfunctions.net/tmdb";
let proxy = false, sharedKey = "";   // sharedKey: a key someone shared with every signed-in ReelPick user
async function checkProxy() {
  if (key) return;
  try { const c = new AbortController(), t = setTimeout(() => c.abort(), 5000); const r = await fetch(PROXY + "?path=/genre/movie/list&language=en-US", { signal: c.signal }); clearTimeout(t); proxy = r.ok; } catch (e) { proxy = false; }
  demo = !key && !proxy;
}
let genreList = [];            // [{name, movie, tv}]
let providerList = [];         // [{id, name, logo}]
const seen = new Map();   // "type:id" -> {id,type,title,year,poster,rating,review,updatedAt}
try {
  JSON.parse(store.get("rp_seen", "[]") || "[]").forEach((x) => { if (typeof x === "string") { const [t, i] = x.split(":"); const o = sanitizeItem({ type: t, id: Number(i), title: "Unknown title" }); if (o) seen.set(x, o); } else { const o = sanitizeItem(x); if (o) seen.set(keyOf(o), o); } });
} catch (e) { /* start empty */ }
let social = { enabled: false, signedIn: () => false, upsert() {}, remove() {}, pushMany() {}, pin: async () => {} };
const saveSeen = () => { store.set("rp_seen", JSON.stringify([...seen.values()])); $("seenBtn").textContent = "My seen list (" + seen.size + ")"; };
function markSeen(it) {
  const k = it.type + ":" + it.id, old = seen.get(k) || {};
  const item = sanitizeItem({ ...old, id: it.id, type: it.type, title: it.title, year: it.year || old.year, poster: it.poster || old.poster, updatedAt: Date.now() });
  seen.set(k, item); saveSeen(); social.upsert(item); return k;
}
let editing = null;
function openEditor(k) {
  const it = seen.get(k); if (!it) return; editing = k;
  $("eTitle").textContent = it.title + (it.year ? " (" + it.year + ")" : "");
  $("eReview").value = it.review || ""; $("ePinText").value = ""; paintStars(it.rating || 0); $("seenEdit").hidden = false; $("seenEdit").dataset.rating = it.rating || 0;
  $("ePinBox").hidden = !social.signedIn(); $("seenEdit").scrollIntoView({ block: "nearest" });
}
// star rows: tap a star for a full star, tap it again for half, a third time to clear
const starRow = (row, n) => [...row.children].forEach((b, i) => { b.classList.toggle("on", i + 1 <= n); b.classList.toggle("half", i + 0.5 === n); });
const nextStar = (cur, i) => (cur === i ? i - 0.5 : cur === i - 0.5 ? 0 : i);
function paintStars(n) { $("seenEdit").dataset.rating = n; starRow($("eStars"), n); }
function renderSeen() {
  const g = $("seenGrid"); g.replaceChildren();
  if (!seen.size) { g.appendChild(el("p", null, "Nothing here yet. Press “Seen it — spin again” on a result to add it.")); return; }
  [...seen.entries()].reverse().forEach(([k, it]) => {
    const d = el("div", "sitem cl"); d.tabIndex = 0; d.setAttribute("role", "button"); d.setAttribute("aria-label", "Rate or review " + it.title);
    if (it.poster) { const i = el("img"); i.src = it.poster; i.alt = ""; i.loading = "lazy"; d.appendChild(i); d.appendChild(el("div", "cap", it.title)); }
    else d.appendChild(el("div", "ph", it.title + (it.year ? " (" + it.year + ")" : "")));
    if (it.rating) d.appendChild(el("div", "rt", starsText(it.rating)));
    const x = el("button", null, "×"); x.type = "button"; x.title = "Remove from seen"; x.setAttribute("aria-label", "Remove " + it.title + " from seen list");
    x.onclick = (ev) => { ev.stopPropagation(); seen.delete(k); saveSeen(); social.remove(k); if (editing === k) $("seenEdit").hidden = true; renderSeen(); };
    d.onclick = () => openEditor(k); d.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openEditor(k); } };
    d.appendChild(x); g.appendChild(d);
  });
}
let current = null, spinning = false, lastWinner = null, audio = null;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let tab = "feed", toastT = 0;
const say = (t) => {
  $("msg").textContent = t || "";
  if (t && tab !== "pick") { const b = $("toast"); b.textContent = t; b.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { b.hidden = true; }, 4200); }
};

// ------------------------------------------------------------------ TMDB
async function tmdb(path, params = new URLSearchParams()) {
  const useKey = key || sharedKey;
  if (!useKey && proxy) {
    const q = new URLSearchParams(params); q.set("path", path);
    const r = await fetch(PROXY + "?" + q);
    if (!r.ok) throw new Error("TMDB error " + r.status + ". Try again.");
    return r.json();
  }
  const headers = { accept: "application/json" };
  const p = new URLSearchParams(params);
  if (useKey.length > 40) headers.Authorization = "Bearer " + useKey; else p.set("api_key", useKey);
  const r = await fetch(API + path + "?" + p, { headers });
  if (r.status === 401) throw new Error("TMDB rejected the key. Check it in “TMDB key…”.");
  if (!r.ok) throw new Error("TMDB error " + r.status + ". Try again.");
  return r.json();
}
const norm = (x, type) => ({
  id: x.id, type, title: x.title || x.name || "Untitled",
  year: ((x.release_date || x.first_air_date || "") + "").slice(0, 4), rating: x.vote_average || 0, votes: x.vote_count || 0,
  overview: x.overview || "", poster: x.poster_path ? IMG + "w342" + x.poster_path : null, genreIds: x.genre_ids || [],
});

// ------------------------------------------------------------------ filters UI
function types() { return state.type === "both" ? ["movie", "tv"] : [state.type]; }

async function loadMeta() {
  if (demo) {
    genreList = DEMO_GENRES.map((n) => ({ name: n, movie: n, tv: n }));
    providerList = [];
  } else {
    try {
      const lang = tmdbLang;
      const [mg, tg] = await Promise.all([tmdb("/genre/movie/list", new URLSearchParams({ language: lang })), tmdb("/genre/tv/list", new URLSearchParams({ language: lang }))]);
      if (state.type === "movie") genreList = mg.genres.map((g) => ({ name: g.name, movie: g.id, tv: null }));
      else if (state.type === "tv") genreList = tg.genres.map((g) => ({ name: g.name, movie: null, tv: g.id }));
      else genreList = commonGenres(mg.genres, tg.genres);
      const pr = new URLSearchParams({ watch_region: state.region, language: tmdbLang });
      const [pm, pt] = await Promise.all([tmdb("/watch/providers/movie", pr), tmdb("/watch/providers/tv", pr)]);
      const map = new Map();
      [...pm.results, ...pt.results].forEach((p) => { if (!map.has(p.provider_id)) map.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path, prio: (p.display_priorities || {})[state.region] ?? 999 }); });
      // drop add-on channels and "with ads" duplicates; keep the big ones first (HBO Max, SkyShowtime…)
      const junk = /channel|with ads|amazon video|ad-supported|basic|standard|kids|free|plex|tubi|pluto|rakuten viki|filmzie|curiosity|docsville|spamflix|cultpix|dekkoo|magellan|true story|hoichoi|eventive|kocowa|wow presents/i;
      const BIG = /^(netflix|amazon prime video|disney plus|hbo max|max|skyshowtime|apple tv\+?|apple tv plus|filmin|rtp play|opto|tvi player|movistar|filmin portugal|paramount plus|mubi|crunchyroll|lionsgate)/i;
      const seenName = new Set();
      providerList = [...map.values()].filter((p) => !junk.test(p.name)).filter((p) => { const k = p.name.toLowerCase().replace(/[^a-z]/g, ""); if (seenName.has(k)) return false; seenName.add(k); return true; })
        .sort((a, b) => (BIG.test(b.name) - BIG.test(a.name)) || a.prio - b.prio).slice(0, 30);
    } catch (e) { say(e.message); genreList = []; providerList = []; }
  }
  state.genres = new Set([...state.genres].filter((n) => genreList.some((g) => g.name === n)));
  state.providers = new Set([...state.providers].filter((id) => providerList.some((p) => p.id === id)));
  renderFilters();
}

function renderFilters() {
  $("banner").hidden = !demo;
  if (demo) $("banner").textContent = "Demo mode: a small built-in sample. Add a free TMDB key for every movie and series, plus platform filters.";
  if (demo) { const l = el("a", null, " How to get it"); l.href = "#howto"; $("banner").appendChild(l); }
  const gbox = $("genres"); gbox.replaceChildren();
  genreList.forEach((g) => {
    const b = el("button", "chip" + (state.genres.has(g.name) ? " on" : ""), g.name);
    b.setAttribute("aria-pressed", state.genres.has(g.name));
    b.onclick = () => { state.genres.has(g.name) ? state.genres.delete(g.name) : state.genres.add(g.name); renderFilters(); };
    gbox.appendChild(b);
  });
  const pbox = $("providers"); pbox.replaceChildren();
  if (demo) pbox.appendChild(el("p", "hint", "Platform filters need a TMDB key."));
  if (providerList.length) {
    const all = providerList.every((p) => state.providers.has(p.id));
    const b = el("button", "prov allprov" + (all ? " on" : ""), "All"); b.type = "button"; b.title = "All platforms"; b.setAttribute("aria-pressed", all);
    b.onclick = () => { if (all) state.providers.clear(); else providerList.forEach((p) => state.providers.add(p.id)); renderFilters(); };
    pbox.appendChild(b);
  }
  providerList.forEach((p) => {
    const b = el("button", "prov" + (state.providers.has(p.id) ? " on" : ""));
    b.title = p.name; b.setAttribute("aria-label", p.name); b.setAttribute("aria-pressed", state.providers.has(p.id));
    if (p.logo) { const i = el("img"); i.src = IMG + "w92" + p.logo; i.alt = ""; i.loading = "lazy"; b.appendChild(i); } else b.appendChild(el("span", null, p.name));
    b.onclick = () => { state.providers.has(p.id) ? state.providers.delete(p.id) : state.providers.add(p.id); renderFilters(); };
    pbox.appendChild(b);
  });
  document.querySelectorAll("#typeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.type));
  $("minRatingLabel").textContent = state.minRating ? state.minRating + "+" : "any";
}

function initStatic() {
  Object.entries(STYLES).forEach(([k, v]) => { const o = el("option", null, v.label); o.value = k; $("style").appendChild(o); });
  Object.entries(REGIONS).forEach(([k, v]) => { const o = el("option", null, v); o.value = k; $("region").appendChild(o); });
  $("region").value = state.region;
  $("region").onchange = () => { state.region = $("region").value; store.set("rp_region", state.region); state.providers.clear(); loadMeta(); };
  $("style").onchange = () => { state.style = $("style").value; };
  $("minRating").oninput = () => { state.minRating = Number($("minRating").value); renderFilters(); };
  $("matchAll").onchange = () => { state.matchAll = $("matchAll").checked; };
  document.querySelectorAll("#typeSeg button").forEach((b) => { b.onclick = () => { state.type = b.dataset.v; state.genres.clear(); loadMeta(); }; });
  $("sound").onclick = () => { state.sound = !state.sound; store.set("rp_sound", state.sound ? "1" : "0"); soundLabel(); };
  soundLabel();
  $("spin").onclick = () => spin();
  $("seen").onclick = () => { if (current) markSeen(current); spin(); };
  $("rSend").onclick = () => { if (current && social.shareWith) social.shareWith(current); };
  $("rWant").onclick = async () => { if (current && social.toggleWant) { await social.toggleWant(current); paintWant($("rWant"), current); } };
  $("rRate").onclick = () => { if (!current) return; const k = markSeen(current); renderSeen(); $("seenClear").textContent = "Clear all"; $("seenClear").dataset.armed = ""; $("seenDlg").showModal(); openEditor(k); };
  for (let i = 1; i <= 5; i++) { const b = el("button", null, "★"); b.type = "button"; b.setAttribute("aria-label", i + " star" + (i > 1 ? "s" : "")); b.onclick = () => paintStars(nextStar(Number($("seenEdit").dataset.rating) || 0, i)); $("eStars").appendChild(b); }
  $("eSave").onclick = () => {
    const it = seen.get(editing); if (!it) return; const r = Number($("seenEdit").dataset.rating) || null;
    const item = sanitizeItem({ ...it, rating: r, review: $("eReview").value.trim(), updatedAt: Date.now() }); seen.set(editing, item); saveSeen(); social.upsert(item); renderSeen(); say("Saved.");
  };
  $("eClose").onclick = () => { $("seenEdit").hidden = true; editing = null; };
  $("ePin").onclick = async () => { const it = seen.get(editing); if (it) await social.pin(it, $("ePinText").value.trim()); };
  saveSeen();
  $("seenBtn").onclick = () => { renderSeen(); $("seenClear").textContent = "Clear all"; $("seenClear").dataset.armed = ""; $("seenDlg").showModal(); };
  $("seenClear").onclick = () => { const b = $("seenClear"); if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to confirm"; return; } b.dataset.armed = ""; seen.clear(); saveSeen(); renderSeen(); $("seenClear").textContent = "Clear all"; $("seenClear").dataset.armed = ""; };
  $("seenExport").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify([...seen.values()], null, 1)], { type: "application/json" }));
    const a = el("a"); a.href = url; a.download = "reelpick-seen.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("seenImport").onclick = () => $("seenFile").click();
  $("seenFile").onchange = async () => {
    try {
      const list = JSON.parse(await $("seenFile").files[0].text());
      let n = 0; const added = []; (Array.isArray(list) ? list : []).forEach((x) => { const o = sanitizeItem(x); if (o) { const k = keyOf(o), cur = seen.get(k); if (!cur || o.updatedAt >= cur.updatedAt) { seen.set(k, o); added.push(o); } n++; } });
      social.pushMany(added);
      saveSeen(); renderSeen(); say("Imported " + n + " titles.");
    } catch (e) { say("That file is not a valid ReelPick list."); }
    $("seenFile").value = "";
  };
  const paintKey = () => { const shared = !key && (proxy || sharedKey); document.querySelector(".keybar").hidden = !!shared; $("howto").hidden = !!shared;
    $("keyShareBox").hidden = !(key && social.signedIn && social.signedIn()); const b = $("keyTop"); b.classList.toggle("ok", !!key); b.textContent = key ? "TMDB connected" : "Add your free TMDB key"; b.title = key ? "Change or remove your key" : "Unlock every movie and series plus platform filters"; };
  const openKey = () => { $("keyInput").value = key; paintKey(); $("dlg").showModal(); };
  $("keyShare").onclick = async () => {
    if (!key || !social.shareKey) return;
    try { await social.shareKey(key); say(isPT ? "Chave partilhada. Quem entrar no ReelPick já pode pesquisar tudo." : "Key shared. Everyone who signs in can now search everything."); }
    catch (e) { say("Could not share (" + (e.code || e.message) + ")."); }
  };
  window.rpPaintKey = paintKey;
  $("keyBtn").onclick = openKey; $("keyTop").onclick = openKey; paintKey();
  $("dlg").addEventListener("close", () => {
    const v = $("dlg").returnValue;
    if (v === "save") { key = $("keyInput").value.trim(); store.set("rp_key", key); demo = !key && !sharedKey && !proxy; paintKey(); state.providers.clear(); say(""); loadMeta(); }
    else if (v === "demo") { key = ""; store.set("rp_key", ""); demo = !sharedKey && !proxy; paintKey(); loadMeta(); }
  });
}
const soundLabel = () => { $("sound").textContent = "Sound: " + (state.sound ? "on" : "off"); $("sound").setAttribute("aria-pressed", state.sound); };

// ------------------------------------------------------------------ candidates
const selectedGenres = (type) => genreList.filter((g) => state.genres.has(g.name)).map((g) => g[type]).filter((x) => x != null);
const filterState = () => ({ genres: { movie: selectedGenres("movie"), tv: selectedGenres("tv") }, matchAll: state.matchAll,
  providers: [...state.providers], region: state.region, style: state.style, minRating: state.minRating, language: tmdbLang });

async function candidates() {
  const type = types()[randInt(types().length)];
  if (demo) {
    let pool = DEMO.filter((x) => (state.type === "both" || x.type === state.type));
    const sel = [...state.genres];
    if (sel.length) pool = pool.filter((x) => (state.matchAll ? sel.every((g) => x.genres.includes(g)) : sel.some((g) => x.genres.includes(g))));
    if (state.minRating) pool = pool.filter((x) => x.rating >= state.minRating);
    if (state.style === "classics") pool = pool.filter((x) => x.year < 2000);
    if (state.style === "recent") pool = pool.filter((x) => x.year >= new Date().getFullYear() - 2);
    if (state.style === "acclaimed") pool = pool.filter((x) => x.rating >= 8);
    return { pool: pool.map((x) => ({ ...x, poster: null })), filler: DEMO.map((x) => ({ ...x, poster: null })) };
  }
  const q = buildParams(type, filterState());
  const first = await tmdb("/discover/" + type, new URLSearchParams([...q, ["page", "1"]]));
  const total = Math.min(first.total_pages || 0, 500);
  if (!total || !first.results.length) return { pool: [], filler: [] };
  const page = 1 + randInt(total);
  const data = page === 1 ? first : await tmdb("/discover/" + type, new URLSearchParams([...q, ["page", String(page)]]));
  const toItems = (r) => r.results.map((x) => norm(x, type)).filter((x) => x.poster);
  return { pool: toItems(data), filler: [...toItems(first), ...toItems(data)] };
}

// ------------------------------------------------------------------ reel
function pitch() { const s = $("strip"); return s.children.length > 1 ? s.children[1].offsetLeft - s.children[0].offsetLeft : 160; }
function buildItem(it) {
  const d = el("div", "item");
  if (it.poster) { const i = el("img"); i.src = it.poster; i.alt = ""; i.draggable = false; d.appendChild(i); }
  else { const h = (it.id * 47) % 360; d.style.background = `linear-gradient(160deg,hsl(${h} 60% 32%),hsl(${(h + 60) % 360} 55% 14%))`; d.appendChild(el("div", "ph", it.title)); }
  return d;
}
function click() {
  if (!state.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "square"; o.frequency.value = 900; g.gain.value = 0.03; g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.04);
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.045);
  } catch (e) { /* no audio */ }
}
function chime() {
  if (!state.sound || !audio) return;
  [660, 880, 1320].forEach((f, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; g.gain.value = 0.05;
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5 + i * 0.12); o.connect(g); g.connect(audio.destination); o.start(audio.currentTime + i * 0.12); o.stop(audio.currentTime + 0.7 + i * 0.12); });
}
const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

function animate(strip, winIdx) {
  return new Promise((resolve) => {
    const vw = $("strip").parentElement.clientWidth, p = pitch(), pad = 10;
    const centerX = (i) => vw / 2 - (pad + i * p + (p - 10) / 2);
    const x0 = centerX(2), x1 = centerX(winIdx) + (Math.random() - 0.5) * (p - 10) * 0.6;
    const dur = reduced() ? 400 : 5200, t0 = performance.now();
    let last = -1;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur), x = x0 + (x1 - x0) * easeOutQuart(t);
      $("strip").style.transform = `translateX(${x}px)`;
      const idx = Math.floor((vw / 2 - x - pad) / p);
      if (idx !== last) { last = idx; click(); }
      if (t < 1) requestAnimationFrame(tick); else resolve();
    };
    $("strip").style.transform = `translateX(${x0}px)`;
    requestAnimationFrame(tick);
  });
}

// 2D fallback reel (used when WebGL is not available)
const domReel = {
  kind: "dom",
  idle(items) { $("strip").replaceChildren(...items.slice(0, 12).map(buildItem)); const vw = $("strip").parentElement.clientWidth; $("strip").style.transform = `translateX(${vw / 2 - 10 - 80}px)`; },
  async spin(pool, winner, prev) {
    const strip = buildStrip(pool, winner, 40, 34, prev);
    $("strip").replaceChildren(...strip.map(buildItem));
    await animate(strip, 34);
    $("strip").children[34].classList.add("win"); chime();
  },
};
let reel = domReel;
try { if (supported()) { $("strip").parentElement.classList.add("has3d"); reel = createReel3D($("strip").parentElement, { onTick: click, onWin: chime }); } } catch (e) { $("strip").parentElement.classList.remove("has3d"); reel = domReel; }
if (reel.setLeverHandler) reel.setLeverHandler(() => spin());

async function spin() {
  if (spinning) return;
  spinning = true; $("spin").disabled = true; if (reel.pullLever) reel.pullLever(); say(""); $("result").hidden = true;
  try {
    const { pool, filler } = await candidates();
    const fresh = pool.filter((x) => !seen.has(x.type + ":" + x.id));
    if (!fresh.length) { say(pool.length ? "You've seen everything this filter finds. Clear the “seen” list or relax the filters." : "Nothing matches these filters. Try fewer genres or platforms."); return; }
    const winner = fresh[randInt(fresh.length)];
    await reel.spin(filler.length ? filler : pool, winner, lastWinner);
    lastWinner = winner; current = winner;
    await showResult(winner);
  } catch (e) { say(e.message || "Something went wrong."); }
  finally { spinning = false; $("spin").disabled = false; }
}

// ------------------------------------------------------------------ result
async function showResult(it) {
  let info = { ...it }, provs = [];
  if (!demo) {
    try {
      const d = await tmdb(`/${it.type}/${it.id}`, new URLSearchParams({ language: tmdbLang, append_to_response: "watch/providers" }));
      info.overview = d.overview || info.overview;
      if (!info.overview && isPT) { try { info.overview = (await tmdb(`/${it.type}/${it.id}`, new URLSearchParams({ language: "en-US" }))).overview || ""; } catch (e) { /* none */ } }
      info.genres = (d.genres || []).map((g) => g.name);
      info.runtime = d.runtime || (d.episode_run_time || [])[0]; info.seasons = d.number_of_seasons;
      const reg = ((d["watch/providers"] || {}).results || {})[state.region];
      provs = (reg && reg.flatrate) || [];
    } catch (e) { /* keep basic info */ }
  }
  $("rTitle").textContent = info.title;
  const bits = [info.year, info.type === "tv" ? "Series" + (info.seasons ? " · " + info.seasons + " season" + (info.seasons > 1 ? "s" : "") : "") : "Movie",
    info.runtime ? info.runtime + " min" : "", info.rating ? "★ " + info.rating.toFixed(1) : ""].filter(Boolean);
  $("rMeta").textContent = bits.join(" · ");
  $("rGenres").textContent = (info.genres || []).join(" · ");
  $("rOverview").textContent = info.overview || "No description available.";
  const poster = $("rPoster"); poster.hidden = !info.poster; if (info.poster) poster.src = info.poster;
  const pv = $("rProviders"); pv.replaceChildren();
  if (provs.length) {
    provs.forEach((p) => { const i = el("img"); i.src = IMG + "w92" + p.logo_path; i.alt = p.provider_name; i.title = p.provider_name; pv.appendChild(i); });
    pv.appendChild(el("small", null, "included in " + REGIONS[state.region] + " (via JustWatch)"));
  } else if (!demo) pv.appendChild(el("small", null, "Not on a subscription platform in " + REGIONS[state.region] + " right now."));
  $("rTrailer").href = "https://www.youtube.com/results?search_query=" + encodeURIComponent(info.title + " " + info.year + " trailer");
  $("rSend").hidden = !social.signedIn(); $("rWant").hidden = !social.signedIn() || !social.isWanted; $("rMore").href = "#t/" + it.type + "/" + it.id; paintWant($("rWant"), it);
  $("result").hidden = false; $("result").classList.remove("flip"); void $("result").offsetWidth; $("result").classList.add("flip");
  $("result").scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
}

// ------------------------------------------------------------------ tastes + pick of the day
let tastes = { genres: [], type: "both" };
try { tastes = sanitizeTastes(JSON.parse(store.get("rp_tastes", "{}") || "{}")); } catch (e) { /* none yet */ }
let uidLocal = store.get("rp_uid"); if (!uidLocal) { uidLocal = Math.random().toString(36).slice(2); store.set("rp_uid", uidLocal); }
const tasteText = () => (tastes.genres.length ? tastes.genres.join(", ") : "not set");
function setTastes(t, fromCloud) {
  tastes = sanitizeTastes(t); store.set("rp_tastes", JSON.stringify(tastes));
  if ($("pTastes")) $("pTastes").textContent = tasteText();
  if (!fromCloud) social.setTastes && social.setTastes(tastes);
  dailyPick(true);
}
let draft = null;
function openTastes() {
  draft = { genres: new Set(tastes.genres), type: tastes.type };
  const paint = () => {
    $("tasteChips").replaceChildren(...TASTE_GENRES.map((g) => { const b = el("button", "chip" + (draft.genres.has(g) ? " on" : ""), g); b.type = "button"; b.setAttribute("aria-pressed", draft.genres.has(g));
      b.onclick = () => { if (draft.genres.has(g)) draft.genres.delete(g); else if (draft.genres.size < 8) draft.genres.add(g); else say("Up to 8 genres."); paint(); }; return b; }));
    document.querySelectorAll("#tasteType button").forEach((b) => b.classList.toggle("on", b.dataset.v === draft.type));
    $("tasteCount").textContent = draft.genres.size + " of 8 selected";
  };
  document.querySelectorAll("#tasteType button").forEach((b) => { b.onclick = () => { draft.type = b.dataset.v; paint(); }; });
  paint(); $("tastesDlg").showModal();
}
$("tasteSave").onclick = () => setTastes({ genres: [...draft.genres], type: draft.type });

const genreCache = {};
async function genreIdsFor(type) {
  if (!genreCache[type]) { const r = await tmdb("/genre/" + type + "/list", new URLSearchParams({ language: "en-US" })); genreCache[type] = r.genres; }
  return tasteGenreIds(tastes.genres, genreCache[type]);
}
async function pickDaily(rng) {
  const type = tastes.type === "both" ? (rng() < 0.5 ? "movie" : "tv") : tastes.type;
  let list;
  if (demo) {
    list = DEMO.filter((x) => x.type === type && x.genres.some((g) => tastes.genres.includes(g))).map((x) => ({ ...x, poster: null }));
    if (!list.length) list = DEMO.filter((x) => x.genres.some((g) => tastes.genres.includes(g))).map((x) => ({ ...x, poster: null }));
  } else {
    const ids = await genreIdsFor(type);
    const q = buildParams(type, { genres: { movie: type === "movie" ? ids : [], tv: type === "tv" ? ids : [] }, matchAll: false, providers: [], style: "any", minRating: 6.5, language: tmdbLang });
    q.set("vote_count.gte", type === "movie" ? "1000" : "300");
    const page = 1 + Math.floor(rng() * 8);
    let data = await tmdb("/discover/" + type, new URLSearchParams([...q, ["page", String(page)]]));
    if (!data.results.length) data = await tmdb("/discover/" + type, new URLSearchParams([...q, ["page", "1"]]));
    list = data.results.map((x) => norm(x, type)).filter((x) => x.poster);
  }
  list = list.filter((x) => !seen.has(x.type + ":" + x.id));
  return list.length ? list[Math.floor(rng() * list.length)] : null;
}
async function dailyPick(force) {
  const box = $("potdBody"); box.replaceChildren();
  if (!tastes.genres.length) {
    const d = el("div"); d.appendChild(el("p", null, "Tell us what you like and get a new pick every day, chosen for you."));
    const b = el("button", null, "Choose my tastes"); b.type = "button"; b.onclick = openTastes; d.appendChild(b); box.appendChild(d); return;
  }
  const day = dayKey(), n = Number(store.get("rp_potd_n_" + day, "0"));
  const seedKey = [day, n, tastes.genres.join(","), tastes.type, demo ? "demo" : "tmdb", uidLocal].join("|");
  let item = null;
  try { const c = JSON.parse(store.get("rp_potd", "null")); if (!force && c && c.seedKey === seedKey && !seen.has(c.item.type + ":" + c.item.id)) item = c.item; } catch (e) { /* recompute */ }
  if (!item) {
    box.appendChild(el("p", "hint", "Choosing today's pick…"));
    try { item = await pickDaily(mulberry32(hashStr(seedKey))); } catch (e) { box.replaceChildren(el("p", "hint", e.message || "Could not load today's pick.")); return; }
    if (item) store.set("rp_potd", JSON.stringify({ seedKey, item }));
  }
  box.replaceChildren();
  if (!item) { box.appendChild(el("p", "hint", "No new suggestion for these tastes right now. Try other genres or clear your seen list.")); const b = el("button", "ghost", "Change my tastes"); b.type = "button"; b.onclick = openTastes; box.appendChild(b); return; }
  if (item.poster) { const i = el("img"); i.src = item.poster; i.alt = ""; box.appendChild(i); }
  const d = el("div"); const h = el("h3"); const ha = el("a", "tlink", item.title); ha.href = "#t/" + item.type + "/" + item.id; ha.translate = false; h.appendChild(ha); d.appendChild(h);
  d.appendChild(el("div", "meta", [item.year, item.type === "tv" ? "Series" : "Movie", item.rating ? "★ " + Number(item.rating).toFixed(1) : ""].filter(Boolean).join(" · ")));
  d.appendChild(el("div", "why", "Because you like " + tastes.genres.slice(0, 3).join(", ")));
  d.appendChild(el("p", "ov", item.overview || ""));
  const row = el("div", "row");
  const tr = el("a", "btn", "Watch trailer"); tr.href = "https://www.youtube.com/results?search_query=" + encodeURIComponent(item.title + " " + item.year + " trailer"); tr.target = "_blank"; tr.rel = "noopener noreferrer";
  const sn = el("button", "ghost", "Seen it"); sn.type = "button"; sn.onclick = () => { markSeen(item); store.set("rp_potd_n_" + day, String(n + 1)); dailyPick(true); };
  const an = el("button", "ghost", "Another pick"); an.type = "button"; an.onclick = () => { store.set("rp_potd_n_" + day, String(n + 1)); dailyPick(true); };
  const tb = el("button", "ghost", "My tastes"); tb.type = "button"; tb.onclick = openTastes;
  row.append(tr, sn, an, tb); d.appendChild(row); box.appendChild(d);
}

// ------------------------------------------------------------------ sections (feed / choose / top)
const TABS = ["feed", "pick", "chat", "top"];
let lastIdle = null;
function showTab(t, focusId) {
  tab = t;
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.dataset.view !== t; });
  document.querySelectorAll(".navtabs a").forEach((a) => { if (a.dataset.tab === t) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (t === "pick" && reel.kind === "dom" && lastIdle && !spinning) reel.idle(lastIdle);
  if (social.onTab) social.onTab(t);
  const target = focusId && document.getElementById(focusId);
  if (target) target.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0);
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (TABS.includes(h)) return showTab(h);
  if (h.startsWith("u/")) return showTab("profile");
  const tm = /^t\/(movie|tv)\/(\d+)$/.exec(h); if (tm) { showTab("title"); renderTitle(tm[1], Number(tm[2])); return; }
  const target = h && document.getElementById(h), view = target && target.closest(".view");
  showTab(view ? view.dataset.view : "feed", view ? h : null);
}
window.addEventListener("hashchange", route);
$("filtersBox").open = window.matchMedia("(min-width: 901px)").matches;

// ------------------------------------------------------------------ install as an app (PWA)
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch((e) => console.warn("sw", e));
let installEvt = null;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("installWrap").hidden = false; });
window.addEventListener("appinstalled", () => { $("installWrap").hidden = true; installEvt = null; });
$("installBtn").onclick = async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; $("installWrap").hidden = true; }
  else say("On iPhone: tap Share, then “Add to Home Screen”.");
};
if (!standalone() && /iphone|ipad|ipod/i.test(navigator.userAgent)) $("installWrap").hidden = false;

function paintWant(b, it) { const on = social.isWanted && social.isWanted(it.type + ":" + it.id); b.textContent = on ? "In your watchlist" : "+ Watchlist"; b.classList.toggle("on", !!on); }

// ------------------------------------------------------------------ title page (#t/movie/123)
const titleCache = new Map();
async function renderTitle(type, id) {
  const k = type + ":" + id, known = seen.get(k) || (current && current.type === type && current.id === id ? current : null);
  $("tName").textContent = known ? known.title : ""; $("tMeta").textContent = ""; $("tTagline").textContent = ""; $("tOverview").textContent = "";
  $("tCrew").replaceChildren(); $("tWhere").replaceChildren(); $("tCast").replaceChildren(); $("tActions").replaceChildren(); $("tHero").style.backgroundImage = "";
  $("tPoster").src = (known && known.poster) || ""; $("tPoster").hidden = !(known && known.poster);
  $("v-title").classList.add("loading");
  let d = titleCache.get(k);
  if (!d && !demo) {
    try {
      d = await tmdb("/" + type + "/" + id, new URLSearchParams({ language: tmdbLang, append_to_response: "credits,watch/providers,videos" }));
      if (!d.overview && isPT) { try { const en = await tmdb("/" + type + "/" + id, new URLSearchParams({ language: "en-US" })); d.overview = en.overview; if (!d.tagline) d.tagline = en.tagline; } catch (e) { /* keep */ } }
      titleCache.set(k, d);
    } catch (e) { say(e.message); }
  }
  if (location.hash !== "#t/" + type + "/" + id) return;
  $("v-title").classList.remove("loading");
  const demoItem = DEMO.find((x) => x.type === type && x.id === id);
  if (!d) $("v-title").classList.add("nohero");
  const item = d ? norm(d, type) : known || (demoItem ? { ...demoItem, poster: null } : { id, type, title: "Unknown title", year: "" });
  if (d) {
    item.title = d.title || d.name || item.title;
    if (d.backdrop_path) $("tHero").style.backgroundImage = "url(" + IMG + "w1280" + d.backdrop_path + ")";
    $("v-title").classList.toggle("nohero", !d.backdrop_path);
    if (d.poster_path) { $("tPoster").src = IMG + "w342" + d.poster_path; $("tPoster").hidden = false; }
  }
  $("tName").textContent = item.title;
  const runtime = d && (d.runtime || (d.episode_run_time || [])[0]), seasons = d && d.number_of_seasons;
  $("tMeta").textContent = [item.year, type === "tv" ? "Series" + (seasons ? " · " + seasons + " season" + (seasons > 1 ? "s" : "") : "") : "Movie", runtime ? runtime + " min" : "",
    d && d.genres ? d.genres.map((g) => g.name).join(", ") : "", d && d.vote_average ? "★ " + d.vote_average.toFixed(1) + " TMDB" : ""].filter(Boolean).join(" · ");
  $("tTagline").textContent = (d && d.tagline) || ""; $("tTagline").hidden = !(d && d.tagline);
  $("tOverview").textContent = (d && d.overview) || (demoItem && demoItem.overview) || "";
  // crew
  const crew = $("tCrew"), addCrew = (label, names) => { if (!names.length) return; const w = el("div"); w.appendChild(el("dt", null, label)); const dd = el("dd", null, names.join(", ")); dd.translate = false; w.appendChild(dd); crew.appendChild(w); };
  if (d && d.credits) {
    if (type === "movie") { addCrew("Directed by", d.credits.crew.filter((c) => c.job === "Director").map((c) => c.name)); addCrew("Written by", [...new Set(d.credits.crew.filter((c) => c.department === "Writing").map((c) => c.name))].slice(0, 3)); }
    else addCrew("Created by", (d.created_by || []).map((c) => c.name));
    const cast = d.credits.cast.slice(0, 12);
    $("tCastSec").hidden = !cast.length;
    cast.forEach((c) => { const ch = el("div", "castchip"); ch.appendChild(el("b", null, c.name)); if (c.character) ch.appendChild(el("span", null, c.character)); $("tCast").appendChild(ch); });
  } else $("tCastSec").hidden = true;
  // where to watch in my country
  const wp = d && d["watch/providers"] && d["watch/providers"].results && d["watch/providers"].results[state.region];
  const where = $("tWhere");
  if (wp) {
    [["flatrate", "Stream"], ["rent", "Rent"], ["buy", "Buy"]].forEach(([kk, label]) => {
      if (!wp[kk] || !wp[kk].length) return; const row = el("div", "wrow"); row.appendChild(el("span", "wl", label));
      wp[kk].slice(0, 8).forEach((p) => { const i = el("img"); i.src = IMG + "w92" + p.logo_path; i.alt = p.provider_name; i.title = p.provider_name; row.appendChild(i); });
      where.appendChild(row);
    });
    if (where.children.length) where.appendChild(el("small", "hint", "Availability in " + REGIONS[state.region] + " (via JustWatch)"));
  } else if (d) where.appendChild(el("small", "hint", "Not on a subscription platform in " + REGIONS[state.region] + " right now."));
  // actions
  const acts = $("tActions"), mk = (label, cls, fn, ic) => { const b = el("button", cls); b.type = "button"; if (ic) b.appendChild(icon(ic, 17)); b.appendChild(el("span", null, label)); b.onclick = fn; acts.appendChild(b); return b; };
  const mine = seen.get(k);
  mk(mine ? "Edit my review" : "Log or rate", "cta", () => openLog(mine || item), mine ? "edit" : "plus");
  if (social.toggleWant) { const wb = mk("+ Watchlist", "ghost", async () => { await social.toggleWant(item); paintWant(wb.lastChild, item); wb.classList.toggle("on", social.isWanted(k)); }, "bookmark"); paintWant(wb.lastChild, item); wb.classList.toggle("on", social.isWanted(k)); }
  const tr = d && d.videos && d.videos.results.find((v) => v.site === "YouTube" && v.type === "Trailer");
  const ta = el("a", "btn ghostbtn"); ta.appendChild(icon("play", 16)); ta.appendChild(el("span", null, "Trailer")); ta.target = "_blank"; ta.rel = "noopener noreferrer";
  ta.href = tr ? "https://www.youtube.com/watch?v=" + encodeURIComponent(tr.key) : "https://www.youtube.com/results?search_query=" + encodeURIComponent(item.title + " " + item.year + " trailer"); acts.appendChild(ta);
  if (social.shareWith && social.signedIn()) mk("Send to a friend", "ghost", () => social.shareWith(item), "send");
  if (social.titleFriends) social.titleFriends(item); else $("tFriends").replaceChildren();
}

// ------------------------------------------------------------------ log / edit what I watched (search TMDB)
let logItem = null, logTimer = 0, logSeq = 0;
function logStars(n) { $("logEdit").dataset.rating = n; starRow($("logStars"), n); $("logStarTxt").textContent = n ? String(n).replace(".", isPT ? "," : ".") + " / 5" : ""; }
for (let i = 1; i <= 5; i++) { const b = el("button", null, "★"); b.type = "button"; b.setAttribute("aria-label", i + " star" + (i > 1 ? "s" : "")); b.onclick = () => logStars(nextStar(Number($("logEdit").dataset.rating) || 0, i)); $("logStars").appendChild(b); }
function logShowEdit(it) {
  logItem = it; const k = it.type + ":" + it.id, cur = seen.get(k);
  $("logFind").hidden = true; $("logEdit").hidden = false; $("logH").textContent = cur ? "Edit" : "Log a movie or series";
  $("logPoster").src = it.poster || ""; $("logPoster").hidden = !it.poster;
  $("logTitle").textContent = it.title; $("logMeta").textContent = [it.year, it.type === "tv" ? "Series" : "Movie"].filter(Boolean).join(" · ");
  $("logReview").value = (cur && cur.review) || ""; logStars((cur && cur.rating) || 0); $("logSpoiler").checked = !!(cur && cur.spoiler);
  $("logRemove").hidden = !cur; $("logRemove").dataset.armed = ""; $("logRemove").textContent = "Remove from watched";
}
function logShowFind() { logItem = null; $("logFind").hidden = false; $("logEdit").hidden = true; $("logH").textContent = "Log a movie or series"; setTimeout(() => $("logQ").focus(), 50); }
async function logSearch() {
  const q = $("logQ").value.trim(), box = $("logResults"), seq = ++logSeq;
  if (q.length < 2) { box.replaceChildren(el("p", "hint", demo ? "Demo mode: only the built-in sample can be searched. Add a free TMDB key to search every movie and series." : "Type at least 2 letters.")); return; }
  let list = [];
  if (demo) list = DEMO.filter((x) => x.title.toLowerCase().includes(q.toLowerCase())).map((x) => ({ ...x, poster: null }));
  else {
    box.replaceChildren(el("p", "hint", "Searching…"));
    try {
      const r = await tmdb("/search/multi", new URLSearchParams({ query: q, language: tmdbLang, include_adult: "false" }));
      list = r.results.filter((x) => x.media_type === "movie" || x.media_type === "tv").map((x) => norm(x, x.media_type)).slice(0, 15);
    } catch (e) { if (seq === logSeq) box.replaceChildren(el("p", "hint", e.message)); return; }
  }
  if (seq !== logSeq) return;
  box.replaceChildren();
  if (!list.length) { box.appendChild(el("p", "hint", "Nothing found.")); return; }
  list.forEach((it) => {
    const b = el("button", "lres"); b.type = "button";
    if (it.poster) { const i = el("img"); i.src = it.poster.replace("/w342/", "/w92/"); i.alt = ""; i.loading = "lazy"; b.appendChild(i); } else b.appendChild(el("span", "noposter"));
    const t = el("span", "lt"); const tt = el("b", null, it.title); tt.translate = false; t.appendChild(tt); t.appendChild(el("small", null, [it.year, it.type === "tv" ? "Series" : "Movie"].filter(Boolean).join(" · "))); b.appendChild(t);
    if (seen.has(it.type + ":" + it.id)) b.appendChild(el("span", "lseen", "Already watched"));
    b.onclick = () => logShowEdit(it);
    box.appendChild(b);
  });
}
$("logQ").addEventListener("input", () => { clearTimeout(logTimer); logTimer = setTimeout(logSearch, 350); });
$("logBack").onclick = logShowFind;
$("logSave").onclick = () => {
  if (!logItem) return;
  const k = markSeen(logItem), cur = seen.get(k), r = Number($("logEdit").dataset.rating) || null;
  const rv = $("logReview").value.trim(), base = { ...cur }; delete base.spoiler;
  const item = sanitizeItem({ ...base, rating: r, review: rv, spoiler: !!rv && $("logSpoiler").checked, updatedAt: Date.now() });
  seen.set(k, item); saveSeen(); social.upsert(item); renderSeen();
  $("logDlg").close(); say("Saved."); if (social.seenChanged) social.seenChanged();
  if (social.isWanted && social.isWanted(k) && social.toggleWant) social.toggleWant(item);   // watched: leave the watchlist
  if (/^#t\//.test(location.hash)) route();
};
$("logRemove").onclick = () => {
  const b = $("logRemove"); if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to confirm"; return; }
  const k = logItem.type + ":" + logItem.id; seen.delete(k); saveSeen(); social.remove(k); renderSeen();
  $("logDlg").close(); say("Removed."); if (social.seenChanged) social.seenChanged(); if (/^#t\//.test(location.hash)) route();
};
function openLog(it) {
  $("logQ").value = ""; $("logResults").replaceChildren();
  if (it) logShowEdit(it); else { logShowFind(); logSearch(); }
  $("logDlg").showModal(); if (!it) $("logQ").focus();
}
window.openLog = openLog;
$("logBtn").onclick = () => openLog();

// ------------------------------------------------------------------ background themes
let bdPaths = {}; try { bdPaths = JSON.parse(store.get("rp_bd", "{}")) || {}; } catch (e) { bdPaths = {}; }
const bdUrl = (path, size) => IMG + size + path;
function applyTheme(t) {
  const bg = $("bg"); document.body.classList.remove("has-bg", "has-photo"); bg.style.backgroundImage = ""; document.body.style.background = "";
  const plain = PLAIN.find((x) => x.key === t);
  if (plain && t !== "dark") { document.body.classList.add("has-bg"); document.body.style.background = plain.css; document.body.style.backgroundAttachment = "fixed"; }
  if (t === "custom") { const u = store.get("rp_bg_custom", ""); if (/^data:image\/jpeg;base64,/.test(u)) { document.body.classList.add("has-bg", "has-photo"); bg.style.backgroundImage = "url(" + u + ")"; } return; }
  const m = /^film:(\w+)$/.exec(t || "");
  if (m && validPath(bdPaths[m[1]])) { document.body.classList.add("has-bg", "has-photo"); bg.style.backgroundImage = "url(" + bdUrl(bdPaths[m[1]], "w1280") + ")"; }
}
async function resolveBackdrops() {
  const missing = () => FILMS.filter((f) => !validPath(bdPaths[cacheKey(f)]));
  if (!missing().length) return;
  if (social.readBackdrops) { const shared = await social.readBackdrops(); Object.entries(shared || {}).forEach(([k, v]) => { if (validPath(v)) bdPaths[k] = v; }); }
  let added = false;
  if (key || sharedKey || proxy) await Promise.all(missing().map(async (f) => { try { const d = await tmdb("/" + (f.type === "tv" ? "tv" : "movie") + "/" + f.id, new URLSearchParams({ language: "en-US" })); if (validPath(d.backdrop_path)) { bdPaths[cacheKey(f)] = d.backdrop_path; added = true; } } catch (e) { /* skip */ } }));
  store.set("rp_bd", JSON.stringify(bdPaths));
  if (added && social.writeBackdrops) social.writeBackdrops(Object.fromEntries(FILMS.filter((f) => validPath(bdPaths[cacheKey(f)])).map((f) => [cacheKey(f), bdPaths[cacheKey(f)]])));
}
function paintThemes() {
  const cur = store.get("rp_theme", "dark"), grid = $("themeGrid"); grid.replaceChildren();
  const opt = (k, title, styler) => {
    const b = el("button", "themeopt" + (cur === k ? " on" : "")); b.type = "button"; b.setAttribute("aria-pressed", cur === k);
    const sw = el("span", "sw"); styler(sw); b.appendChild(sw); const t = el("span", "tt", title); if (k.startsWith("film:")) t.translate = false; b.appendChild(t);
    b.onclick = () => { store.set("rp_theme", k); applyTheme(k); paintThemes(); };
    grid.appendChild(b);
  };
  grid.appendChild(el("h4", "tgh", "Your photo"));
  const mine = store.get("rp_bg_custom", "");
  if (/^data:image\/jpeg;base64,/.test(mine)) opt("custom", "My photo", (sw) => { sw.style.backgroundImage = "url(" + mine + ")"; });
  const up = el("button", "themeopt upl"); up.type = "button"; const usw = el("span", "sw"); usw.appendChild(icon("camera", 26)); up.appendChild(usw); up.appendChild(el("span", "tt", mine ? "Change photo" : "Use a photo from your phone"));
  up.onclick = () => $("bgFile").click(); grid.appendChild(up);
  grid.appendChild(el("h4", "tgh", "Colours"));
  PLAIN.forEach((p) => opt(p.key, p.title, (sw) => { sw.style.background = p.css; }));
  let unresolved = 0;
  const group = (label, list) => {
    const ok = list.filter((f) => validPath(bdPaths[cacheKey(f)])); unresolved += list.length - ok.length; if (!ok.length) return;
    grid.appendChild(el("h4", "tgh", label));
    ok.forEach((f) => opt("film:" + cacheKey(f), f.title, (sw) => { sw.style.backgroundImage = "url(" + bdUrl(bdPaths[cacheKey(f)], "w300") + ")"; }));
  };
  group("Movies", FILMS.filter((f) => f.type !== "tv")); group("Series", FILMS.filter((f) => f.type === "tv"));
  $("themeHint").hidden = !unresolved || !!key || !!sharedKey || proxy;
}
$("bgFile").onchange = async () => {
  const f = $("bgFile").files[0]; $("bgFile").value = ""; if (!f) return;
  try {
    if (!/^image\//.test(f.type)) throw new Error("Choose an image file (up to 25 MB).");
    const bmp = await createImageBitmap(f); let url = "";
    for (const side of [1920, 1600, 1280]) {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      url = c.toDataURL("image/jpeg", 0.78); if (url.length < 1500000) break;
    }
    localStorage.setItem("rp_bg_custom", url); store.set("rp_theme", "custom"); applyTheme("custom"); paintThemes();
  } catch (e) { say(e.name === "QuotaExceededError" ? "That photo is too big for this browser. Try another one." : e.message || "Something went wrong."); }
};
$("themeBtn").onclick = async () => { paintThemes(); $("themeDlg").showModal(); await resolveBackdrops(); paintThemes(); };
window.openThemes = () => $("themeBtn").click();
applyTheme(store.get("rp_theme", "dark"));

// ------------------------------------------------------------------ start
route();
await checkProxy();
initStatic();
await loadMeta();
// first paint: posters on the reel so the machine does not look empty
lastIdle = shuffle(DEMO.map((x) => ({ ...x, poster: null }))); reel.idle(lastIdle);
window.rpSharedKey = (k) => {
  if (key || !k || k === sharedKey) return;
  sharedKey = k; demo = false; if (window.rpPaintKey) window.rpPaintKey(); loadMeta(); dailyPick(true);
  resolveBackdrops().then(() => applyTheme(store.get("rp_theme", "dark")));
  if (/^#t\//.test(location.hash)) route();
};
social = await initSocial({ $, el, seen, saveSeen, renderSeen, say, tastes: { get: () => tastes, set: (t) => setTastes(t, true) }, onNewProfile: openTastes, openTastes });
dailyPick(false);
if (social.onTab) social.onTab(tab);
if (tab === "title") route();
resolveBackdrops().then(() => applyTheme(store.get("rp_theme", "dark")));
window.__rp = { state, spin, isDemo: () => demo, reel: () => reel };
