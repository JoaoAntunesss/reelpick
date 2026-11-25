// Story images (1080x1920) for a review or the year in review, drawn on a canvas and shared with the phone's share sheet.
const W = 1080, H = 1920;
const GOLD = "#f5b82e", TEXT = "#f2f4f7", MUTED = "#a3adba";

function loadImg(src) {
  return new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}
async function fonts() { try { await Promise.all([document.fonts.load('700 64px "Fraunces"'), document.fonts.load('600 40px "Inter"'), document.fonts.load('400 40px "Inter"')]); } catch (e) { /* system fonts */ } }
function cover(ctx, img, x, y, w, h) { const k = Math.max(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k; ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean), lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; if (lines.length === maxLines) break; } else line = t; }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) { let l = lines[maxLines - 1]; while (ctx.measureText(l + "…").width > maxW && l.length) l = l.slice(0, -1); lines[maxLines - 1] = l.replace(/[\s,.;:]+$/, "") + "…"; }
  return lines;
}
function stars(ctx, n, x, y, size) {
  ctx.font = `700 ${size}px Inter, sans-serif`; ctx.textAlign = "left";
  for (let i = 1; i <= 5; i++) {
    const cx = x + (i - 1) * size * 1.1;
    ctx.fillStyle = "#ffffff30"; ctx.fillText("★", cx, y);
    if (n >= i) { ctx.fillStyle = GOLD; ctx.fillText("★", cx, y); }
    else if (n >= i - 0.5) { ctx.save(); ctx.beginPath(); ctx.rect(cx, y - size, size * 0.5, size * 1.3); ctx.clip(); ctx.fillStyle = GOLD; ctx.fillText("★", cx, y); ctx.restore(); }
  }
}
function base(ctx, bg) {
  ctx.fillStyle = "#0d1014"; ctx.fillRect(0, 0, W, H);
  if (bg) { ctx.save(); ctx.filter = "blur(28px) brightness(.55)"; cover(ctx, bg, -60, -60, W + 120, H + 120); ctx.restore(); }
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0d101488"); g.addColorStop(.55, "#0d1014cc"); g.addColorStop(1, "#0d1014f5"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function brand(ctx, handle, site) {
  ctx.textAlign = "center"; ctx.fillStyle = GOLD; ctx.font = '700 54px "Fraunces", Georgia, serif'; ctx.fillText("ReelPick", W / 2, H - 150);
  ctx.fillStyle = MUTED; ctx.font = '400 34px Inter, sans-serif'; ctx.fillText((handle ? "@" + handle + "  ·  " : "") + site, W / 2, H - 96);
}

/** item: {title, year, type, poster, rating, review}; who: {name, handle}; labels: translated strings. */
export async function reviewImage(item, who, labels) {
  await fonts();
  const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
  const poster = await loadImg(item.poster ? item.poster.replace("/w342/", "/w780/") : null);
  base(ctx, poster);
  ctx.textAlign = "center"; ctx.fillStyle = MUTED; ctx.font = '600 36px Inter, sans-serif'; ctx.fillText((labels.by || "").toUpperCase(), W / 2, 190);
  const pw = 560, ph = 840, px = (W - pw) / 2, py = 250;
  if (poster) { ctx.save(); ctx.shadowColor = "#000a"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 28); ctx.clip(); cover(ctx, poster, px, py, pw, ph); ctx.restore(); }
  else { ctx.fillStyle = "#1d2229"; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 28); ctx.fill(); }
  let y = py + ph + 110;
  ctx.fillStyle = TEXT; ctx.font = '700 68px "Fraunces", Georgia, serif';
  wrap(ctx, item.title, W - 160, 2).forEach((l) => { ctx.fillText(l, W / 2, y); y += 80; });
  ctx.fillStyle = MUTED; ctx.font = '400 36px Inter, sans-serif'; ctx.fillText([item.year, labels.type].filter(Boolean).join("  ·  "), W / 2, y); y += 90;
  if (item.rating) { const size = 74, sw = size * 1.1 * 5 - size * 0.1; stars(ctx, item.rating, (W - sw) / 2, y, size); y += 70; }
  if (item.review && !item.spoiler) {
    ctx.fillStyle = TEXT; ctx.font = '400 40px Inter, sans-serif'; ctx.textAlign = "center";
    const lines = wrap(ctx, "“" + item.review + "”", W - 200, Math.max(1, Math.min(5, Math.floor((H - 260 - y) / 56))));
    y += 30; lines.forEach((l) => { ctx.fillText(l, W / 2, y); y += 56; });
  }
  brand(ctx, who.handle, labels.site);
  return c;
}

/** s: computeStats() result for one year. */
export async function recapImage(s, year, who, labels) {
  await fonts();
  const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
  const best = s.best[0], poster = await loadImg(best && best.poster ? best.poster.replace("/w342/", "/w780/") : null);
  base(ctx, poster);
  ctx.textAlign = "center"; ctx.fillStyle = GOLD; ctx.font = '700 46px Inter, sans-serif'; ctx.fillText(String(labels.title).toUpperCase(), W / 2, 200);
  ctx.fillStyle = TEXT; ctx.font = '700 210px "Fraunces", Georgia, serif'; ctx.fillText(String(year), W / 2, 420);
  ctx.fillStyle = MUTED; ctx.font = '400 40px Inter, sans-serif'; ctx.fillText(who.name || "", W / 2, 490);
  const boxes = [[s.total, labels.titles], [s.movies, labels.movies], [s.series, labels.series], [s.reviews, labels.reviews]];
  const bw = 440, bh = 210, gap = 40, x0 = (W - bw * 2 - gap) / 2; let y = 570;
  boxes.forEach(([n, l], i) => {
    const x = x0 + (i % 2) * (bw + gap), yy = y + Math.floor(i / 2) * (bh + gap);
    ctx.fillStyle = "#ffffff12"; ctx.beginPath(); ctx.roundRect(x, yy, bw, bh, 26); ctx.fill();
    ctx.fillStyle = TEXT; ctx.font = '700 96px "Fraunces", Georgia, serif'; ctx.fillText(String(n), x + bw / 2, yy + 118);
    ctx.fillStyle = MUTED; ctx.font = '600 32px Inter, sans-serif'; ctx.fillText(String(l).toUpperCase(), x + bw / 2, yy + 170);
  });
  y += bh * 2 + gap + 110;
  const line = (label, value) => { if (!value) return; ctx.fillStyle = MUTED; ctx.font = '600 32px Inter, sans-serif'; ctx.fillText(String(label).toUpperCase(), W / 2, y); y += 62; ctx.fillStyle = TEXT; ctx.font = '700 54px "Fraunces", Georgia, serif'; wrap(ctx, value, W - 160, 1).forEach((l) => ctx.fillText(l, W / 2, y)); y += 100; };
  line(labels.favGenre, s.topGenres[0] && s.topGenres[0].name);
  line(labels.best, best && best.title);
  line(labels.avg, s.avg ? "★ " + labels.num(s.avg) : "");
  if (s.hours) line(labels.hoursLabel, labels.hours);
  brand(ctx, who.handle, labels.site);
  return c;
}

/** Opens the share sheet with the PNG (phones), or downloads it. Returns "shared" | "downloaded" | "cancelled". */
export async function shareCanvas(canvas, name, text) {
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("canvas");
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return "shared"; } catch (e) { if (e.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
