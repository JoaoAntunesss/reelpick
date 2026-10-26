// Pure helpers (no DOM): build TMDB discover parameters and a few utilities. Tested with `node --test`.

const pick = (v, type) => (v && typeof v === "object" ? v[type] : v);

export const STYLES = {
  any:       { label: "Anything",           p: {} },
  crowd:     { label: "Crowd pleasers",     p: { "vote_count.gte": { movie: 5000, tv: 1500 } } },
  gems:      { label: "Hidden gems",        p: { "vote_average.gte": 7.3, "vote_count.gte": { movie: 300, tv: 150 }, "vote_count.lte": { movie: 3000, tv: 1500 } } },
  acclaimed: { label: "Critically acclaimed", p: { "vote_average.gte": 8, "vote_count.gte": { movie: 2000, tv: 500 } } },
  classics:  { label: "Classics (before 2000)", p: { before: "1999-12-31", "vote_count.gte": { movie: 1000, tv: 200 } } },
  recent:    { label: "Recent (last 2 years)",  p: { sinceYears: 2, "vote_count.gte": { movie: 100, tv: 50 } } },
  short:     { label: "Short & sweet (< 100 min)", p: { "with_runtime.lte": 100, "vote_count.gte": { movie: 300, tv: 100 } } },
};

const iso = (d) => d.toISOString().slice(0, 10);

/** state: {genres:{movie:[ids],tv:[ids]}, matchAll, providers:[ids], region, style, minRating} */
export function buildParams(type, state, today = new Date()) {
  const q = new URLSearchParams();
  const dateKey = type === "movie" ? "primary_release_date" : "first_air_date";
  q.set("include_adult", "false");
  q.set("sort_by", "popularity.desc");
  q.set("language", state.language || "en-US");
  q.set("vote_count.gte", String(type === "movie" ? 100 : 50));
  const st = STYLES[state.style] || STYLES.any;
  for (const [k, raw] of Object.entries(st.p)) {
    const v = pick(raw, type);
    if (k === "before") q.set(dateKey + ".lte", v);
    else if (k === "sinceYears") { const d = new Date(today); d.setUTCFullYear(d.getUTCFullYear() - v); q.set(dateKey + ".gte", iso(d)); }
    else q.set(k, String(v));
  }
  if (state.minRating) { const cur = Number(q.get("vote_average.gte") || 0); q.set("vote_average.gte", String(Math.max(cur, state.minRating))); }
  const g = (state.genres && state.genres[type]) || [];
  if (g.length) q.set("with_genres", g.join(state.matchAll ? "," : "|"));
  if (state.providers && state.providers.length) {
    q.set("with_watch_providers", state.providers.join("|"));
    q.set("watch_region", state.region || "PT");
    q.set("with_watch_monetization_types", "flatrate");
  }
  return q;
}

/** Genre names that exist in both lists (used for the "Both" mode). */
export function commonGenres(movieList, tvList) {
  const tv = new Map(tvList.map((g) => [g.name.toLowerCase(), g.id]));
  return movieList.filter((g) => tv.has(g.name.toLowerCase())).map((g) => ({ name: g.name, movie: g.id, tv: tv.get(g.name.toLowerCase()) }));
}

export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const randInt = (n) => Math.floor(Math.random() * n);
export function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = randInt(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; }
/** Build the reel: `len` items, the winner at `winIdx`, `first` (previous winner) at index 2. */
export function buildStrip(pool, winner, len = 40, winIdx = 34, first = null) {
  const others = pool.filter((x) => !(x.type === winner.type && x.id === winner.id));
  const fill = others.length ? others : [winner];
  const out = [];
  let bag = [];
  for (let i = 0; i < len; i++) { if (!bag.length) bag = shuffle(fill); out.push(bag.pop()); }
  out[winIdx] = winner;
  if (first) out[2] = first;
  return out;
}
