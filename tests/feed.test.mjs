import test from "node:test";
import assert from "node:assert/strict";
import { buildFeed, timeAgo } from "../seen.js";

const it = (id, at, o = {}) => ({ type: "movie", id, title: "T" + id, year: "2020", poster: null, rating: 4, review: "", updatedAt: at, ...o });
const photo = "data:image/jpeg;base64,AAAA";

test("feed merges friends newest first and keeps who watched it", () => {
  const f = buildFeed([
    { uid: "a", name: "Ana", handle: "ana", profile: { photo }, items: [it(1, 100), it(2, 300)] },
    { uid: "b", name: "", handle: "rui", profile: null, items: [it(3, 200)] },
  ]);
  assert.deepEqual(f.map((x) => x.item.id), [2, 3, 1]);
  assert.equal(f[0].name, "Ana"); assert.equal(f[0].photo, photo);
  assert.equal(f[1].name, "@rui"); assert.equal(f[1].photo, null);
});

test("feed drops invalid items, undated items and caps the length", () => {
  const many = Array.from({ length: 60 }, (_, i) => it(i + 1, i + 1));
  const f = buildFeed([{ uid: "a", name: "Ana", items: [...many, { type: "book", id: 1 }, it(99, 0)] }], 40);
  assert.equal(f.length, 40); assert.equal(f[0].item.id, 60);
  assert.ok(!f.some((x) => x.item.id === 99));
});

test("feed ignores a photo that is not a ReelPick avatar", () => {
  const f = buildFeed([{ uid: "a", name: "Ana", profile: { photo: "https://evil/x.png" }, items: [it(1, 5)] }]);
  assert.equal(f[0].photo, null);
});

test("timeAgo", () => {
  const now = 10 * 86400e3;
  assert.equal(timeAgo(now - 10e3, now), "just now");
  assert.equal(timeAgo(now - 5 * 60e3, now), "5 min ago");
  assert.equal(timeAgo(now - 3 * 3600e3, now), "3 h ago");
  assert.equal(timeAgo(now - 86400e3, now), "yesterday");
  assert.equal(timeAgo(now - 3 * 86400e3, now), "3 days ago");
});
