// Pure helpers for the seen list: validation, merging local + cloud copies, comparing two people. No DOM, no network.

export const keyOf = (x) => x.type + ":" + x.id;
const str = (v, n) => String(v == null ? "" : v).slice(0, n);

/** Returns a clean item (only the allowed fields) or null if it is not a valid title. */
export function sanitizeItem(x) {
  if (!x || (x.type !== "movie" && x.type !== "tv") || !Number.isInteger(Number(x.id))) return null;
  const r = Number(x.rating);
  return {
    type: x.type, id: Number(x.id), title: str(x.title || "Unknown title", 200), year: str(x.year, 4),
    poster: typeof x.poster === "string" && x.poster.startsWith("https://image.tmdb.org/") && x.poster.length <= 200 ? x.poster : null,
    rating: Number.isInteger(r) && r >= 1 && r <= 5 ? r : null,
    review: str(x.review, 600), updatedAt: Number.isFinite(Number(x.updatedAt)) ? Number(x.updatedAt) : 0,
  };
}

/** Newest copy wins. Returns the merged Map and the items the cloud still needs. */
export function mergeSeen(local, cloudItems) {
  const merged = new Map(), toPush = [];
  const cloud = new Map();
  cloudItems.forEach((c) => { const s = sanitizeItem(c); if (s) cloud.set(keyOf(s), s); });
  local.forEach((v, k) => {
    const l = sanitizeItem(v); if (!l) return;
    const c = cloud.get(k);
    if (!c || l.updatedAt > c.updatedAt) { merged.set(k, l); toPush.push(l); } else merged.set(k, c);
  });
  cloud.forEach((c, k) => { if (!merged.has(k)) merged.set(k, c); });
  return { merged, toPush };
}

/** mine / theirs: arrays or Maps of items. Titles both saw first, biggest disagreement on top. */
export function compareLists(mine, theirs) {
  const a = new Map((mine instanceof Map ? [...mine.values()] : mine).map((x) => [keyOf(x), x]));
  const b = new Map((theirs instanceof Map ? [...theirs.values()] : theirs).map((x) => [keyOf(x), x]));
  const both = [], onlyMine = [], onlyTheirs = [];
  a.forEach((m, k) => { const t = b.get(k); if (t) both.push({ key: k, mine: m, theirs: t, diff: m.rating && t.rating ? Math.abs(m.rating - t.rating) : null }); else onlyMine.push(m); });
  b.forEach((t, k) => { if (!a.has(k)) onlyTheirs.push(t); });
  both.sort((x, y) => (y.diff ?? -1) - (x.diff ?? -1));
  const rated = both.filter((x) => x.diff != null);
  const sameTaste = rated.length ? Math.round((100 * rated.filter((x) => x.diff <= 1).length) / rated.length) : null;
  const byRating = (x, y) => (y.rating || 0) - (x.rating || 0);
  return { both, onlyMine: onlyMine.sort(byRating), onlyTheirs: onlyTheirs.sort(byRating), sameTaste, ratedCount: rated.length };
}

/** Nicknames: lowercase letters, digits and underscore, 3 to 20 characters. Returns the clean nickname or null. */
export function normalizeHandle(s) {
  const h = String(s == null ? "" : s).trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(h) ? h : null;
}

/** The title a person pins on their profile, with a short text next to it. */
export function sanitizePinned(p) {
  const it = sanitizeItem(p); if (!it) return null;
  return { type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster, text: str(p.text, 280).trim() };
}

/** Profile photo: only a small JPEG data URL made by ReelPick itself is accepted. */
export const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
export const validPhoto = (p) => typeof p === "string" && p.length <= 24000 && PHOTO_RE.test(p);
export const VISIBILITY = ["private", "friends", "public"];

/** Favourite genres chosen on the profile (max 8) and whether the person prefers movies, series or both. */
export const TASTE_GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western"];
export function sanitizeTastes(t) {
  t = t || {};
  const genres = [...new Set((Array.isArray(t.genres) ? t.genres : []).map((g) => str(g, 24).trim()).filter(Boolean))].slice(0, 8);
  return { genres, type: ["movie", "tv", "both"].includes(t.type) ? t.type : "both" };
}

/** Full profile as stored in users/{uid}. Anything invalid is dropped. */
export function sanitizeProfile(p) {
  p = p || {};
  return {
    name: str(p.name, 40), handle: normalizeHandle(p.handle), photo: validPhoto(p.photo) ? p.photo : null, bio: str(p.bio, 300),
    visibility: VISIBILITY.includes(p.visibility) ? p.visibility : "friends", pinned: p.pinned ? sanitizePinned(p.pinned) : null, tastes: sanitizeTastes(p.tastes),
  };
}
/** Same id on both sides of a friendship. */
export const pairId = (a, b) => (a < b ? a + "_" + b : b + "_" + a);
