import { STYLES, buildParams, commonGenres, easeOutQuart, randInt, buildStrip, shuffle } from "./query.js";
import { DEMO, DEMO_GENRES } from "./demo.js";

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
let genreList = [];            // [{name, movie, tv}]
let providerList = [];         // [{id, name, logo}]
let seen = new Set(JSON.parse(store.get("rp_seen", "[]") || "[]"));
let current = null, spinning = false, lastWinner = null, audio = null;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const say = (t) => { $("msg").textContent = t || ""; };

// ------------------------------------------------------------------ TMDB
async function tmdb(path, params = new URLSearchParams()) {
  const headers = { accept: "application/json" };
  const p = new URLSearchParams(params);
  if (key.length > 40) headers.Authorization = "Bearer " + key; else p.set("api_key", key);
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
      const lang = "en-US";
      const [mg, tg] = await Promise.all([tmdb("/genre/movie/list", new URLSearchParams({ language: lang })), tmdb("/genre/tv/list", new URLSearchParams({ language: lang }))]);
      if (state.type === "movie") genreList = mg.genres.map((g) => ({ name: g.name, movie: g.id, tv: null }));
      else if (state.type === "tv") genreList = tg.genres.map((g) => ({ name: g.name, movie: null, tv: g.id }));
      else genreList = commonGenres(mg.genres, tg.genres);
      const pr = new URLSearchParams({ watch_region: state.region, language: "en-US" });
      const [pm, pt] = await Promise.all([tmdb("/watch/providers/movie", pr), tmdb("/watch/providers/tv", pr)]);
      const map = new Map();
      [...pm.results, ...pt.results].forEach((p) => { if (!map.has(p.provider_id)) map.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path, prio: (p.display_priorities || {})[state.region] ?? 999 }); });
      providerList = [...map.values()].sort((a, b) => a.prio - b.prio).slice(0, 24);
    } catch (e) { say(e.message); genreList = []; providerList = []; }
  }
  state.genres = new Set([...state.genres].filter((n) => genreList.some((g) => g.name === n)));
  state.providers = new Set([...state.providers].filter((id) => providerList.some((p) => p.id === id)));
  renderFilters();
}

function renderFilters() {
  $("banner").hidden = !demo;
  if (demo) $("banner").textContent = "Demo mode: a small built-in sample. Add a free TMDB key (footer) for every movie and series, plus platform filters.";
  const gbox = $("genres"); gbox.replaceChildren();
  genreList.forEach((g) => {
    const b = el("button", "chip" + (state.genres.has(g.name) ? " on" : ""), g.name);
    b.setAttribute("aria-pressed", state.genres.has(g.name));
    b.onclick = () => { state.genres.has(g.name) ? state.genres.delete(g.name) : state.genres.add(g.name); renderFilters(); };
    gbox.appendChild(b);
  });
  const pbox = $("providers"); pbox.replaceChildren();
  if (demo) pbox.appendChild(el("p", "hint", "Platform filters need a TMDB key."));
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
  $("seen").onclick = () => { if (current) { seen.add(current.type + ":" + current.id); store.set("rp_seen", JSON.stringify([...seen])); } spin(); };
  $("clearSeen").onclick = () => { seen = new Set(); store.set("rp_seen", "[]"); say("“Seen” list cleared."); };
  $("keyBtn").onclick = () => { $("keyInput").value = key; $("dlg").showModal(); };
  $("dlg").addEventListener("close", () => {
    const v = $("dlg").returnValue;
    if (v === "save") { key = $("keyInput").value.trim(); store.set("rp_key", key); demo = !key; state.providers.clear(); say(""); loadMeta(); }
    else if (v === "demo") { key = ""; store.set("rp_key", ""); demo = true; loadMeta(); }
  });
}
const soundLabel = () => { $("sound").textContent = "Sound: " + (state.sound ? "on" : "off"); $("sound").setAttribute("aria-pressed", state.sound); };

// ------------------------------------------------------------------ candidates
const selectedGenres = (type) => genreList.filter((g) => state.genres.has(g.name)).map((g) => g[type]).filter((x) => x != null);
const filterState = () => ({ genres: { movie: selectedGenres("movie"), tv: selectedGenres("tv") }, matchAll: state.matchAll,
  providers: [...state.providers], region: state.region, style: state.style, minRating: state.minRating, language: "en-US" });

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

async function spin() {
  if (spinning) return;
  spinning = true; $("spin").disabled = true; say(""); $("result").hidden = true;
  try {
    const { pool, filler } = await candidates();
    const fresh = pool.filter((x) => !seen.has(x.type + ":" + x.id));
    if (!fresh.length) { say(pool.length ? "You've seen everything this filter finds. Clear the “seen” list or relax the filters." : "Nothing matches these filters. Try fewer genres or platforms."); return; }
    const winner = fresh[randInt(fresh.length)];
    const strip = buildStrip(filler.length ? filler : pool, winner, 40, 34, lastWinner);
    $("strip").replaceChildren(...strip.map(buildItem));
    await animate(strip, 34);
    $("strip").children[34].classList.add("win"); chime();
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
      const d = await tmdb(`/${it.type}/${it.id}`, new URLSearchParams({ language: "en-US", append_to_response: "watch/providers" }));
      info.overview = d.overview || info.overview; info.genres = (d.genres || []).map((g) => g.name);
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
  $("result").hidden = false;
  $("result").scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
}

// ------------------------------------------------------------------ start
initStatic();
await loadMeta();
// first paint: a calm strip of posters so the machine doesn't look empty
{
  const seed = DEMO.map((x) => ({ ...x, poster: null }));
  $("strip").replaceChildren(...shuffle(seed).slice(0, 12).map(buildItem));
  const vw = $("strip").parentElement.clientWidth; $("strip").style.transform = `translateX(${vw / 2 - 10 - 80}px)`;
}
window.__rp = { state, spin, isDemo: () => demo };
