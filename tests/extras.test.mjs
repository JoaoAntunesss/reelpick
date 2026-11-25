import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeItem, sanitizeSeasons, watchedAt } from "../seen.js";
import { computeStats, yearsIn } from "../stats.js";
import { parseCSV, letterboxdFilms } from "../letterboxd.js";

test("seasons: only series, valid half stars, numeric keys", () => {
  assert.deepEqual(sanitizeSeasons({ 1: 4, 2: 3.5, x: 5, 3: 7, 4: 2.3, 0: 4 }), { 1: 4, 2: 3.5 });
  assert.equal(sanitizeSeasons({}), null);
  assert.deepEqual(sanitizeItem({ type: "tv", id: 1, title: "S", seasons: { 1: 5 } }).seasons, { 1: 5 });
  assert.equal("seasons" in sanitizeItem({ type: "movie", id: 1, title: "M", seasons: { 1: 5 } }), false);
});

test("firstAt is kept and used as the watched date", () => {
  const it = sanitizeItem({ type: "movie", id: 1, title: "M", firstAt: 100, updatedAt: 900 });
  assert.equal(it.firstAt, 100); assert.equal(watchedAt(it), 100);
  assert.equal(watchedAt(sanitizeItem({ type: "movie", id: 2, title: "N", updatedAt: 900 })), 900);
});

test("stats: totals, average, genres, hours and the year filter", () => {
  const d = (y, m) => new Date(y, m, 10).getTime();
  const items = [
    { type: "movie", id: 1, title: "A", rating: 5, review: "great", firstAt: d(2026, 0) },
    { type: "movie", id: 2, title: "B", rating: 3, firstAt: d(2026, 0) },
    { type: "tv", id: 3, title: "C", rating: 4, firstAt: d(2026, 5) },
    { type: "movie", id: 4, title: "D", firstAt: d(2025, 3) },
  ].map(sanitizeItem);
  const meta = (k) => ({ "movie:1": { genres: ["Drama"], runtime: 120 }, "movie:2": { genres: ["Drama", "Comedy"], runtime: 60 }, "tv:3": { genres: ["Crime"], runtime: 50 } })[k] || null;
  assert.deepEqual(yearsIn(items), [2026, 2025]);
  const s = computeStats(items, 2026, meta);
  assert.equal(s.total, 3); assert.equal(s.movies, 2); assert.equal(s.series, 1); assert.equal(s.reviews, 1);
  assert.equal(s.avg, 4); assert.equal(s.hours, 3); assert.equal(s.topGenres[0].name, "Drama"); assert.equal(s.topGenres[0].n, 2);
  assert.equal(s.months[0], 2); assert.equal(s.topMonth, 0); assert.equal(s.best[0].title, "A");
  assert.equal(computeStats(items, null, meta).total, 4);
});

test("CSV with quotes, commas and newlines", () => {
  assert.deepEqual(parseCSV('a,b\n"x, y","he said ""hi""\nbye"\n'), [["a", "b"], ["x, y", 'he said "hi"\nbye']]);
});

test("Letterboxd: merges watched, ratings and reviews per film", () => {
  const f = letterboxdFilms({
    "watched.csv": "Date,Name,Year,Letterboxd URI\n2024-01-05,Heat,1995,u1\n2024-02-01,Up,2009,u2\n",
    "ratings.csv": "Date,Name,Year,Letterboxd URI,Rating\n2024-01-06,Heat,1995,u1,4.5\n",
    "reviews.csv": "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2024-01-06,Heat,1995,u1,4.5,,\"So <b>good</b>, really\",,2024-01-04\n",
  });
  const heat = f.find((x) => x.name === "Heat");
  assert.equal(f.length, 2); assert.equal(heat.rating, 4.5); assert.equal(heat.review, "So good, really"); assert.equal(heat.year, "1995");
  assert.equal(new Date(heat.at).toISOString().slice(0, 10), "2024-01-04");
});
