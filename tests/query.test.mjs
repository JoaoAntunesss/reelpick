import test from "node:test";
import assert from "node:assert/strict";
import { buildParams, commonGenres, buildStrip } from "../query.js";

const base = { genres: { movie: [], tv: [] }, providers: [], region: "PT", style: "any", minRating: 0 };

test("default movie params", () => {
  const q = buildParams("movie", base);
  assert.equal(q.get("sort_by"), "popularity.desc");
  assert.equal(q.get("include_adult"), "false");
  assert.equal(q.get("with_genres"), null);
  assert.equal(q.get("with_watch_providers"), null);
});

test("genres OR vs AND", () => {
  const s = { ...base, genres: { movie: [35, 27], tv: [] } };
  assert.equal(buildParams("movie", s).get("with_genres"), "35|27");
  assert.equal(buildParams("movie", { ...s, matchAll: true }).get("with_genres"), "35,27");
});

test("providers need region and flatrate", () => {
  const q = buildParams("tv", { ...base, providers: [8, 119], region: "PT" });
  assert.equal(q.get("with_watch_providers"), "8|119");
  assert.equal(q.get("watch_region"), "PT");
  assert.equal(q.get("with_watch_monetization_types"), "flatrate");
});

test("style date keys differ per type", () => {
  const today = new Date("2026-10-26T00:00:00Z");
  const m = buildParams("movie", { ...base, style: "recent" }, today);
  const t = buildParams("tv", { ...base, style: "recent" }, today);
  assert.equal(m.get("primary_release_date.gte"), "2024-10-26");
  assert.equal(t.get("first_air_date.gte"), "2024-10-26");
  assert.equal(buildParams("movie", { ...base, style: "classics" }).get("primary_release_date.lte"), "1999-12-31");
});

test("min rating never lowers a style's own minimum", () => {
  assert.equal(buildParams("movie", { ...base, style: "acclaimed", minRating: 6 }).get("vote_average.gte"), "8");
  assert.equal(buildParams("movie", { ...base, minRating: 7 }).get("vote_average.gte"), "7");
});

test("common genres match by name", () => {
  const c = commonGenres([{ id: 35, name: "Comedy" }, { id: 28, name: "Action" }], [{ id: 35, name: "Comedy" }, { id: 10759, name: "Action & Adventure" }]);
  assert.deepEqual(c, [{ name: "Comedy", movie: 35, tv: 35 }]);
});

test("strip puts the winner at the index and previous winner first", () => {
  const pool = Array.from({ length: 5 }, (_, i) => ({ type: "movie", id: i }));
  const strip = buildStrip(pool, pool[3], 40, 34, pool[1]);
  assert.equal(strip.length, 40);
  assert.equal(strip[34].id, 3);
  assert.equal(strip[2].id, 1);
});
