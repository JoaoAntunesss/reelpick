import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeItem, mergeSeen, compareLists } from "../seen.js";

const it = (id, o = {}) => ({ type: "movie", id, title: "T" + id, year: "2020", poster: null, rating: null, review: "", updatedAt: 0, ...o });

test("sanitize drops unknown fields and bad values", () => {
  const s = sanitizeItem({ type: "movie", id: "5", title: "x".repeat(500), rating: 9, review: "r".repeat(900), poster: "http://evil/x.jpg", extra: 1 });
  assert.equal(s.id, 5); assert.equal(s.title.length, 200); assert.equal(s.rating, null); assert.equal(s.review.length, 600); assert.equal(s.poster, null);
  assert.equal("extra" in s, false);
  assert.equal(sanitizeItem({ type: "book", id: 1 }), null);
  assert.equal(sanitizeItem({ type: "tv", id: "abc" }), null);
  assert.equal(sanitizeItem({ type: "tv", id: 1, poster: "https://image.tmdb.org/t/p/w342/a.jpg" }).poster, "https://image.tmdb.org/t/p/w342/a.jpg");
});

test("merge: newest wins, local-only is pushed, cloud-only is kept", () => {
  const local = new Map([["movie:1", it(1, { rating: 5, updatedAt: 200 })], ["movie:2", it(2, { rating: 3, updatedAt: 50 })], ["movie:3", it(3)]]);
  const cloud = [it(1, { rating: 2, updatedAt: 100 }), it(2, { rating: 4, updatedAt: 100 }), it(4, { updatedAt: 10 })];
  const { merged, toPush } = mergeSeen(local, cloud);
  assert.equal(merged.get("movie:1").rating, 5);   // local newer
  assert.equal(merged.get("movie:2").rating, 4);   // cloud newer
  assert.ok(merged.has("movie:3") && merged.has("movie:4"));
  assert.deepEqual(toPush.map((x) => x.id).sort(), [1, 3]);
});

test("compare: overlap, differences and who-saw-what", () => {
  const mine = [it(1, { rating: 5 }), it(2, { rating: 3 }), it(3, { rating: 4 })];
  const theirs = [it(1, { rating: 1 }), it(2, { rating: 3 }), it(9, { rating: 5 }), it(8, { rating: 2 })];
  const c = compareLists(mine, theirs);
  assert.deepEqual(c.both.map((x) => x.mine.id), [1, 2]);       // biggest disagreement first
  assert.equal(c.both[0].diff, 4);
  assert.deepEqual(c.onlyMine.map((x) => x.id), [3]);
  assert.deepEqual(c.onlyTheirs.map((x) => x.id), [9, 8]);       // best rated first
  assert.equal(c.sameTaste, 50);
});

test("compare handles empty and unrated lists", () => {
  const c = compareLists(new Map(), [it(1)]);
  assert.equal(c.both.length, 0); assert.equal(c.sameTaste, null); assert.equal(c.onlyTheirs.length, 1);
  assert.equal(compareLists([it(1)], [it(1)]).both[0].diff, null);
});

import { normalizeHandle, sanitizePinned } from "../seen.js";
test("nicknames", () => {
  assert.equal(normalizeHandle("@Joao_99"), "joao_99");
  assert.equal(normalizeHandle("ab"), null);
  assert.equal(normalizeHandle("has space"), null);
  assert.equal(normalizeHandle("x".repeat(21)), null);
  assert.equal(normalizeHandle(null), null);
});
test("pinned recommendation", () => {
  const p = sanitizePinned({ type: "tv", id: 3, title: "Dark", year: "2017", text: "  Watch it in order.  ".padEnd(400, "x"), poster: "https://evil/x" });
  assert.equal(p.text.length <= 280, true); assert.equal(p.poster, null); assert.equal(p.type, "tv");
  assert.equal(sanitizePinned({ type: "x", id: 1 }), null);
});

import { sanitizeProfile, validPhoto, pairId } from "../seen.js";
test("profile sanitising", () => {
  const p = sanitizeProfile({ name: "Ana", handle: "@Ana_1", photo: "data:image/svg+xml;base64,AAA", bio: "b".repeat(500), visibility: "weird" });
  assert.equal(p.handle, "ana_1"); assert.equal(p.photo, null); assert.equal(p.bio.length, 300); assert.equal(p.visibility, "friends");
  assert.equal(validPhoto("data:image/jpeg;base64,/9j/4AAQ"), true);
  assert.equal(validPhoto("data:image/jpeg;base64," + "A".repeat(30000)), false);
  assert.equal(validPhoto("javascript:alert(1)"), false);
});
test("pair id is symmetric", () => { assert.equal(pairId("b", "a"), pairId("a", "b")); assert.equal(pairId("a", "b"), "a_b"); });

import { sanitizeTastes } from "../seen.js";
test("tastes are cleaned and capped", () => {
  const t = sanitizeTastes({ genres: ["Horror", "Horror", " Comedy ", "", ...Array.from({ length: 12 }, (_, i) => "G" + i)], type: "weird" });
  assert.equal(t.genres.length, 8); assert.equal(t.genres[0], "Horror"); assert.equal(t.genres[1], "Comedy"); assert.equal(t.type, "both");
  assert.deepEqual(sanitizeTastes(null), { genres: [], type: "both" });
  assert.deepEqual(sanitizeProfile({ name: "A", tastes: { genres: ["Drama"], type: "tv" } }).tastes, { genres: ["Drama"], type: "tv" });
});
