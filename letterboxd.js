// Letterboxd export: read the .zip (or one of its CSV files) and turn it into a list of films to match on TMDB. Pure helpers + a tiny zip reader.

/** RFC 4180 CSV: quotes, doubled quotes, commas and newlines inside quotes. Returns rows of strings. */
export function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const objects = (text) => { const [head, ...rest] = parseCSV(text); if (!head) return []; const h = head.map((x) => x.trim()); return rest.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] || "").trim()]))); };
const keyOf = (o) => (o.Name || "").toLowerCase() + "|" + (o.Year || "");
const half = (v) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0.5 && n <= 5 ? Math.round(n * 2) / 2 : null; };
const time = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? t : 0; };

/**
 * files: { "watched.csv": text, "ratings.csv": text, "reviews.csv": text, "diary.csv": text } (any subset).
 * Returns [{ name, year, rating, review, at }] — one per film, newest data wins.
 */
export function letterboxdFilms(files) {
  const out = new Map();
  const add = (o, extra) => {
    if (!o.Name) return; const k = keyOf(o), cur = out.get(k) || { name: o.Name, year: /^\d{4}$/.test(o.Year) ? o.Year : "", rating: null, review: "", at: 0 };
    const at = time(o["Watched Date"] || o.Date);
    if (!cur.at || (at && at < cur.at)) cur.at = at || cur.at;   // first time it was watched
    Object.assign(cur, extra(cur)); out.set(k, cur);
  };
  objects(files["watched.csv"]).forEach((o) => add(o, () => ({})));
  objects(files["diary.csv"]).forEach((o) => add(o, (c) => ({ rating: half(o.Rating) ?? c.rating })));
  objects(files["ratings.csv"]).forEach((o) => add(o, (c) => ({ rating: half(o.Rating) ?? c.rating })));
  objects(files["reviews.csv"]).forEach((o) => add(o, (c) => ({ rating: half(o.Rating) ?? c.rating, review: (o.Review || c.review || "").replace(/<[^>]+>/g, "").slice(0, 600) })));
  return [...out.values()];
}

/** Minimal zip reader (central directory, stored or deflate) using the browser's DecompressionStream. Returns { name: text } for .csv files. */
export async function readZipCSVs(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), out = {};
  let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not-zip");
  let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
  for (let e = 0; e < n; e++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
    const base = name.split("/").pop().toLowerCase();
    if (!/\.csv$/.test(base) || name.includes("/deleted/") || name.includes("/orphaned/")) continue;
    const lo = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(lo, lo + csize);
    let bytes;
    if (method === 0) bytes = data;
    else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else continue;
    if (name.split("/").length === 1 || !out[base]) out[base] = new TextDecoder().decode(bytes);
  }
  return out;
}
