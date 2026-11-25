// Numbers for the profile statistics and the year in review. Pure: no DOM, no network.
// meta(key) -> { genres: ["Drama", ...], runtime: minutes } | null  (looked up from TMDB and cached by the caller)
import { watchedAt } from "./seen.js?v=1795619163";

export const yearOf = (it) => { const t = watchedAt(it); return t ? new Date(t).getFullYear() : null; };

/** Years that have at least one title, newest first. */
export function yearsIn(items) { return [...new Set(items.map(yearOf).filter(Boolean))].sort((a, b) => b - a); }

/** items: sanitized seen items. year: a number, or null for all time. */
export function computeStats(items, year = null, meta = () => null) {
  const list = items.filter((it) => !year || yearOf(it) === year);
  const rated = list.filter((it) => it.rating);
  const hist = Array.from({ length: 10 }, (_, i) => ({ stars: (i + 1) / 2, n: 0 }));
  rated.forEach((it) => { hist[Math.round(it.rating * 2) - 1].n++; });
  const genres = new Map(); let minutes = 0, withMeta = 0;
  list.forEach((it) => {
    const m = meta(it.type + ":" + it.id); if (!m) return; withMeta++;
    (m.genres || []).forEach((g) => genres.set(g, (genres.get(g) || 0) + 1));
    if (it.type === "movie" && m.runtime) minutes += m.runtime;
  });
  const months = Array.from({ length: 12 }, () => 0);
  if (year) list.forEach((it) => { months[new Date(watchedAt(it)).getMonth()]++; });
  const topGenres = [...genres.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([name, n]) => ({ name, n }));
  const best = [...rated].sort((a, b) => b.rating - a.rating || watchedAt(b) - watchedAt(a)).slice(0, 5);
  const topMonth = year && list.length ? months.indexOf(Math.max(...months)) : null;
  return {
    total: list.length, movies: list.filter((it) => it.type === "movie").length, series: list.filter((it) => it.type === "tv").length,
    reviews: list.filter((it) => it.review).length, rated: rated.length,
    avg: rated.length ? Math.round((rated.reduce((s, it) => s + it.rating, 0) / rated.length) * 10) / 10 : null,
    hist, topGenres, hours: Math.round(minutes / 60), best, months, topMonth, metaCoverage: list.length ? withMeta / list.length : 1,
  };
}
