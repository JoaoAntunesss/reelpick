// Accounts, nicknames, friend requests, profiles and comparison. Does nothing unless firebase-config.js has a config.
import { isPT } from "./i18n.js";
import { icon } from "./icons.js";
import { sanitizeItem, mergeSeen, compareLists, normalizeHandle, sanitizePinned, validPhoto, sanitizeProfile, buildFeed, timeAgo } from "./seen.js";

const stars = (n) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "not rated");

async function toPhoto(file) {
  if (!file || !/^image\//.test(file.type) || file.size > 25e6) throw new Error("Choose an image file (up to 25 MB).");
  const bmp = await createImageBitmap(file);
  for (const side of [1280, 1024, 800]) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    for (let q = 0.82; q >= 0.5; q -= 0.08) { const u = c.toDataURL("image/jpeg", q); if (u.length <= 880000) return u; }
  }
  throw new Error("That image is too detailed. Try another one.");
}

async function toAvatar(file) {
  if (!file || !/^image\//.test(file.type) || file.size > 15e6) throw new Error("Choose an image file (up to 15 MB).");
  const bmp = await createImageBitmap(file), s = Math.min(bmp.width, bmp.height), c = document.createElement("canvas");
  c.width = c.height = 160; c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 160, 160);
  for (let q = 0.8; q >= 0.3; q -= 0.1) { const u = c.toDataURL("image/jpeg", q); if (validPhoto(u)) return u; }
  throw new Error("That image is too detailed. Try another one.");
}

export async function initSocial(ctx) {
  const { $, el, seen, saveSeen, renderSeen, say } = ctx;
  const hasTastes = (t) => t && t.genres && t.genres.length;
  const off = { enabled: false, signedIn: () => false, upsert() {}, remove() {}, pushMany() {}, pin: async () => {} };
  let cfg = null;
  try { cfg = (await import("./firebase-config.js")).firebaseConfig; } catch (e) { /* no config file */ }
  if (!cfg) return off;
  let cloud;
  try { cloud = await (await import("./cloud.js")).init(cfg); } catch (e) { console.warn("Cloud unavailable:", e); return off; }

  let blocked = new Map();   // uid -> {name, handle}
  const isBlocked = (uid) => blocked.has(uid);
  let me = null, profile = null, friends = [], incoming = [], outgoing = [], wasIn = false, keepLocal = false, tab = "find", lastSearch = "";
  const guard = (p) => Promise.resolve(p).catch((e) => { console.warn(e); say("Could not talk to your account (" + (e.code || e.message) + ")."); });
  const confirmBtn = (btn, label) => { if (btn.dataset.armed === "1") { btn.dataset.armed = ""; btn.textContent = label; return true; } btn.dataset.armed = "1"; btn.textContent = "Click again to confirm"; setTimeout(() => { btn.dataset.armed = ""; btn.textContent = label; }, 4000); return false; };
  const link = () => (profile && profile.handle ? location.origin + location.pathname + "?p=" + profile.handle : "");
  const me_ = () => ({ name: profile.name, handle: profile.handle || "" });

  function avatar(photo, name, cls = "") {
    if (validPhoto(photo)) { const i = el("img", "avatar " + cls); i.src = photo; i.alt = ""; return i; }
    const d = el("div", "avatar " + cls, (String(name || "?").trim()[0] || "?").toUpperCase()); d.style.background = "hsl(" + ([...String(name)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360) + " 45% 32%)"; return d;
  }
  const relation = (uid) => (me && uid === me.uid ? "me" : friends.some((f) => f.uid === uid) ? "friend" : incoming.some((r) => r.from === uid) ? "incoming" : outgoing.some((r) => r.to === uid) ? "outgoing" : "none");

  function paintAccount() {
    $("account").hidden = false;
    $("signIn").hidden = !!me; $("who").hidden = !me; $("friendsBtn").hidden = !me; $("profileBtn").hidden = !me; $("signOut").hidden = !me;
    if (me && profile) $("who").textContent = profile.name + (profile.handle ? "  @" + profile.handle : "");
    $("ePinBox").hidden = !me;
    $("feed").hidden = !me; $("welcome").hidden = !!me; $("composer").hidden = !me;
    if (me && profile) { $("compAv").replaceChildren(avatar(profile.photo, profile.name, "sm")); }
    if (me && profile) $("meAv").replaceChildren(avatar(profile.photo, profile.name, "sm"));
    $("reqBadge").hidden = !incoming.length; $("reqBadge").textContent = incoming.length;
    if (me) $("friendsBtn").title = incoming.length ? incoming.length + " pending friend request(s)" : "People";
  }
  async function loadBlocks() { try { blocked = new Map((await cloud.myBlocks()).map((b) => [b.uid, b])); } catch (e) { console.warn("blocks", e); } }
  async function refreshSocial() { const s = await cloud.loadSocial(); friends = s.friends; incoming = s.incoming; outgoing = s.outgoing; paintAccount(); }

  async function syncDown(user) {
    const data = await cloud.loadMine();
    profile = data.profile || sanitizeProfile({ name: (user.displayName || "Me").split(" ")[0] || "Me", visibility: "friends" });
    if (data.profile && hasTastes(data.profile.tastes)) ctx.tastes.set(data.profile.tastes);          // tastes saved in the account win
    else if (hasTastes(ctx.tastes.get())) { profile.tastes = ctx.tastes.get(); await guard(cloud.saveProfile(profile)); }    // first sign-in: keep the local ones
    else if (!data.profile) setTimeout(() => ctx.onNewProfile && ctx.onNewProfile(), 400);                                  // brand-new profile: ask what they like
    if (!data.profile) await guard(cloud.saveProfile(profile));
    const { merged, toPush } = mergeSeen(seen, data.items);
    seen.clear(); merged.forEach((v, k) => seen.set(k, v));
    saveSeen(); renderSeen();
    if (toPush.length) await guard(cloud.pushMany(toPush));
    await refreshSocial();
  }

  async function onAuth(user) {
    me = user;
    if (user) {
      wasIn = true;
      await loadBlocks();
      try { await syncDown(user); } catch (e) { console.warn(e); say("Signed in, but the cloud could not be read (" + (e.code || e.message) + "). Check the Firestore rules."); }
      paintAccount(); loadFeed(true); startChats(); if (curTab === "profile") onTab("profile"); paintNotifBtn(); delete lbCache.friends; delete lbCache.all; if (curTab === "top") loadBoard(true);
      const nick = normalizeHandle(new URLSearchParams(location.search).get("p"));
      if (nick && profile) { history.replaceState(null, "", location.pathname + location.hash); const uid = await guard(cloud.findHandle(nick)); if (uid) openProfile(uid, { handle: nick }); else say("Nobody uses the nickname @" + nick + "."); }
    } else {
      profile = null; friends = []; blocked = new Map(); sugg = null; $("suggest").hidden = true; incoming = []; outgoing = []; $("feedFriends").replaceChildren(); $("feedList").replaceChildren(); feedAt = 0;
      if (wasIn && !keepLocal) { seen.clear(); saveSeen(); renderSeen(); }   // the list stays in the account
      wasIn = false; keepLocal = false; stopChats(); paintAccount(); delete lbCache.friends; delete lbCache.all; if (curTab === "top") loadBoard(true);
      const nick = normalizeHandle(new URLSearchParams(location.search).get("p"));
      if (nick) say("Sign in with Google to see @" + nick + "'s profile.");
    }
  }

  // ---------------------------------------------------------------- my profile
  function paintPinned(box, p, removable) {
    box.replaceChildren();
    if (!p) { box.appendChild(el("p", "hint", "Nothing pinned yet. Open My seen list, pick a title and use “Pin as my recommendation”.")); return; }
    if (p.poster) { const i = el("img"); i.src = p.poster; i.alt = ""; box.appendChild(i); }
    const d = el("div"); d.appendChild(el("b", null, p.title + (p.year ? " (" + p.year + ")" : ""))); d.appendChild(el("p", null, p.text || ""));
    if (removable) { const b = el("button", "ghost", "Remove pin"); b.type = "button"; b.onclick = async () => { profile.pinned = null; await guard(cloud.saveProfile(profile)); paintPinned(box, null, true); }; d.appendChild(b); }
    box.appendChild(d);
  }
  const paintMyAvatar = () => { $("pAvatar").replaceChildren(avatar(profile.photo, profile.name, "lg")); $("meAv").replaceChildren(avatar(profile.photo, profile.name, "sm")); };
  function openProfileDlg() {
    $("pTastes").textContent = hasTastes(profile.tastes) ? profile.tastes.genres.join(", ") : "not set"; $("pName").value = profile.name; $("pHandle").value = profile.handle || ""; $("pBio").value = profile.bio || ""; $("pVis").value = profile.visibility;
    $("pLink").value = link() || "Set a nickname to get a link"; paintPinned($("pPinned"), profile.pinned, true); paintMyAvatar();
    INFO_LABELS.forEach(([k]) => { $("pi_" + k).value = (profile.info && profile.info[k]) || ""; });
    $("pDelete").textContent = "Delete my account and data"; paintBlocked(); $("profileDlg").showModal();
  }
  function paintBlocked() {
    const box = $("pBlocked"); box.replaceChildren();
    if (!blocked.size) { box.appendChild(el("p", "hint", "You haven't blocked anyone.")); return; }
    blocked.forEach((b, uid) => box.appendChild(personRow({ name: b.name || "@" + b.handle, handle: b.name ? b.handle : "", actions: [["Unblock", async () => { await guard(cloud.unblock(uid)); blocked.delete(uid); paintBlocked(); loadSuggestions(true); loadFeed(true); }, true]] })));
  }
  async function saveProfileFields() {
    profile.name = $("pName").value.trim().slice(0, 40) || profile.name;
    profile.bio = $("pBio").value.trim().slice(0, 300); profile.visibility = $("pVis").value;
    const info = {}; INFO_LABELS.forEach(([k]) => { const v = $("pi_" + k).value.trim().slice(0, 80); if (v) info[k] = v; }); profile.info = Object.keys(info).length ? info : null;
    await guard(cloud.saveProfile(profile)); paintAccount(); say("Profile saved."); if (curTab === "profile" && prUid === me.uid) renderProfilePage(me.uid);
  }
  async function saveHandle() {
    const h = normalizeHandle($("pHandle").value);
    if (!h) { say("Nickname: 3 to 20 letters, numbers or _ ."); return; }
    try { await cloud.setHandle(h, profile.handle, profile); profile.handle = h; $("pLink").value = link(); paintAccount(); say("Nickname saved: @" + h); }
    catch (e) { say(e.code === "taken" ? "That nickname is taken. Try another." : "Could not save the nickname (" + (e.code || e.message) + ")."); }
  }

  // ---------------------------------------------------------------- people dialog
  function personRow(opts) {
    const r = el("div", "frow"); r.appendChild(avatar(opts.photo, opts.name, "sm"));
    const m = el("div", "meta2"); m.appendChild(el("b", null, opts.name)); if (opts.handle) m.appendChild(el("small", null, "@" + opts.handle)); if (opts.sub) m.appendChild(el("small", null, opts.sub)); r.appendChild(m);
    (opts.actions || []).forEach(([label, fn, ghost]) => { const b = el("button", ghost ? "ghost" : null, label); b.type = "button"; b.onclick = fn; r.appendChild(b); });
    return r;
  }
  async function act(fn) { await guard(fn()); await guard(refreshSocial()); paintPeople(); loadFeed(true); }
  const sendReq = (uid, handle) => act(() => cloud.sendRequest(uid, handle, profile.name, profile.handle || ""));
  const accept = (req) => act(() => cloud.acceptRequest(req, me_()));
  const cancelReq = (from, to) => act(() => cloud.cancelRequest(from, to));
  const unfriend = (uid) => act(() => cloud.removeFriend(uid));

  function actionsFor(uid, handle) {
    const rel = relation(uid), a = [];
    if (rel === "friend") a.push(["Remove", (e) => { if (confirmBtn(e.target, "Remove")) unfriend(uid); }, true]);
    else if (rel === "incoming") a.push(["Accept", () => accept(incoming.find((r) => r.from === uid))], ["Decline", () => cancelReq(uid, me.uid), true]);
    else if (rel === "outgoing") a.push(["Request sent · Cancel", () => cancelReq(me.uid, uid), true]);
    else if (rel === "none") a.push(["Add friend", () => sendReq(uid, handle)]);
    return a;
  }
  async function paintPeople() {
    ["tFind", "tReq", "tFr"].forEach((id, i) => $(id).classList.toggle("sel", ["find", "req", "fr"][i] === tab));
    $("tReq").textContent = "Requests" + (incoming.length ? " (" + incoming.length + ")" : ""); $("tFr").textContent = "Friends (" + friends.length + ")";
    $("pplFind").hidden = tab !== "find";
    const box = $("pplList"); box.replaceChildren();
    if (tab === "req") {
      if (!incoming.length && !outgoing.length) box.appendChild(el("p", "hint", "No pending requests."));
      incoming.forEach((r) => box.appendChild(personRow({ name: r.fromName || "@" + r.fromHandle, handle: r.fromHandle, sub: "wants to be your friend", actions: [["Accept", () => accept(r)], ["Decline", () => cancelReq(r.from, me.uid), true]] })));
      outgoing.forEach((r) => box.appendChild(personRow({ name: "@" + r.toHandle, sub: "request sent", actions: [["Cancel", () => cancelReq(me.uid, r.to), true]] })));
    } else if (tab === "fr") {
      if (!friends.length) box.appendChild(el("p", "hint", "No friends yet. Search a nickname in “Find people”."));
      for (const f of friends) {
        const row = personRow({ name: f.name || "@" + f.handle, handle: f.handle, actions: [["View", () => { $("friendsDlg").close(); openProfile(f.uid, { handle: f.handle }); }], ["Remove", (e) => { if (confirmBtn(e.target, "Remove")) unfriend(f.uid); }, true]] });
        box.appendChild(row);
        cloud.peek(f.uid).then((c) => { if (c && (c.photo || c.name)) row.replaceWith(personRow({ name: c.name || f.name, handle: c.handle || f.handle, photo: c.photo, sub: c.bio ? c.bio.slice(0, 70) : "", actions: [["View", () => { $("friendsDlg").close(); openProfile(f.uid, { handle: c.handle || f.handle }); }], ["Remove", (e) => { if (confirmBtn(e.target, "Remove")) unfriend(f.uid); }, true]] })); });
      }
    } else if (lastSearch) {
      box.appendChild(el("p", "hint", "Searching…"));
      let found = []; try { found = await cloud.searchHandles(lastSearch); } catch (e) { box.replaceChildren(el("p", "hint", "Search failed (" + (e.code || e.message) + ").")); return; }
      found = found.filter((x) => x.uid !== me.uid && !isBlocked(x.uid)); box.replaceChildren();
      if (!found.length) box.appendChild(el("p", "hint", "Nobody found with a nickname starting with “" + lastSearch + "”."));
      for (const f of found) { const c = await cloud.peek(f.uid);
        box.appendChild(personRow({ name: (c && c.name) || "@" + f.handle, handle: c && c.name ? f.handle : "", photo: c && c.photo, sub: c ? (c.bio || "").slice(0, 70) : "Profile not shown", actions: [...(c ? [["View", () => { $("friendsDlg").close(); openProfile(f.uid, { handle: f.handle }); }, true]] : []), ...actionsFor(f.uid, f.handle)] })); }
    } else {
      box.appendChild(el("p", "hint", "Type a nickname (or the first letters) and press Search."));
      const sg = await loadSuggestions(false);
      if (sg.length && tab === "find" && !lastSearch) { box.appendChild(el("h4", null, "People you may know")); sg.forEach((p) => box.appendChild(personRow({ name: p.name || "@" + p.handle, handle: p.name ? p.handle : "", photo: p.photo, sub: p.bio ? p.bio.slice(0, 70) : "", actions: [...(p.visible ? [["View", () => { $("friendsDlg").close(); openProfile(p.uid, { handle: p.handle }); }, true]] : []), ...actionsFor(p.uid, p.handle)] }))); }
    }
  }
  const runSearch = () => { const v = $("fNick").value.trim().replace(/^@/, "").toLowerCase(); if (!/^[a-z0-9_]{2,20}$/.test(v)) { say("Type at least 2 letters or numbers."); return; } lastSearch = v; tab = "find"; paintPeople(); };

  // ---------------------------------------------------------------- view someone's profile
  function rowFor(it, lines, diff) {
    const r = el("div", "rrow" + (diff ? " diff" : ""));
    if (it.poster) { const i = el("img"); i.src = it.poster; i.alt = ""; i.loading = "lazy"; r.appendChild(i); } else r.appendChild(el("img"));
    const d = el("div"); d.appendChild(el("div", "t", it.title + (it.year ? " (" + it.year + ")" : "") + (it.type === "tv" ? " · series" : "")));
    lines.forEach(([who, rating, text]) => { const l = el("div"); if (who) l.appendChild(el("span", "who", who + "  ")); l.appendChild(el("span", "s", stars(rating))); if (text) l.appendChild(el("p", "rv", text)); d.appendChild(l); });
    r.appendChild(d); return r;
  }
  function paintReviews(body, items) {
    body.replaceChildren();
    const shown = items.filter((i) => i.rating || i.review).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!shown.length) body.appendChild(el("p", "hint", "No ratings or reviews yet."));
    shown.forEach((i) => body.appendChild(rowFor(i, [[null, i.rating, i.review]])));
    const rest = items.filter((i) => !(i.rating || i.review));
    if (rest.length) { body.appendChild(el("h4", null, "Also seen (" + rest.length + ")")); body.appendChild(el("p", "hint", rest.map((i) => i.title).join(" · "))); }
  }
  function paintCompare(body, items, name) {
    body.replaceChildren();
    const c = compareLists(seen, items);
    body.appendChild(el("p", null, "You both saw " + c.both.length + " title" + (c.both.length === 1 ? "" : "s") + "." + (c.sameTaste == null ? " Rate some in common to see your taste match." : " Taste match: " + c.sameTaste + "% (within 1 star, on " + c.ratedCount + " rated in common).")));
    if (c.both.length) { body.appendChild(el("h4", null, "You both saw")); c.both.forEach((x) => body.appendChild(rowFor(x.mine, [["You", x.mine.rating, x.mine.review], [name, x.theirs.rating, x.theirs.review]], x.diff >= 2))); }
    if (c.onlyTheirs.length) { body.appendChild(el("h4", null, name + " saw, you haven't")); c.onlyTheirs.forEach((i) => body.appendChild(rowFor(i, [[name, i.rating, i.review]]))); }
    if (c.onlyMine.length) { body.appendChild(el("h4", null, "You saw, " + name + " hasn't")); c.onlyMine.forEach((i) => body.appendChild(rowFor(i, [["You", i.rating, i.review]]))); }
  }
  // ---------------------------------------------------------------- profile page (#u/<uid>)
  const hints = new Map();
  function openProfile(uid, hint = {}) {
    if (!uid) return; hints.set(uid, hint);
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    const h = "#u/" + uid; if (location.hash === h) renderProfilePage(uid); else location.hash = h;
  }
  let prTab = "posts", prUid = null;
  const INFO_LABELS = [["movie", "Favourite movie"], ["series", "Favourite series"], ["director", "Favourite director"], ["actor", "Favourite actor"], ["watching", "Watching now"], ["city", "City"]];
  function stat(n, label) { const d = el("div", "pstat"); d.appendChild(el("b", null, String(n))); d.appendChild(el("span", null, label)); return d; }
  async function renderProfilePage(uid) {
    if (!me) { $("prName").textContent = ""; $("prBody").replaceChildren(emptyCard("Sign in to see profiles.", "Sign in with Google", () => $("signIn").click())); return; }
    const mine = uid === me.uid; if (prUid !== uid) prTab = "posts"; prUid = uid;
    $("prBody").replaceChildren(el("p", "hint", "Loading…"));
    let data = null;
    try { data = await cloud.loadProfile(uid); } catch (e) { if (e.code !== "private") { say("Could not open the profile."); } }
    if (prUid !== uid) return;
    const hint = hints.get(uid) || {}, p = data ? data.profile : null, items = data ? data.items.map(sanitizeItem).filter(Boolean) : [], posts = data ? data.posts || [] : [];
    const handle = (p && p.handle) || hint.handle || "", name = (p && p.name) || (handle ? "@" + handle : "This person");
    $("prAv").replaceChildren(avatar(p && p.photo, name, "xl"));
    $("prName").textContent = name; $("prHandle").textContent = handle ? "@" + handle : "";
    const reviews = items.filter((i) => i.review);
    const st = $("prStats"); st.replaceChildren();
    if (data) { st.append(stat(posts.length, posts.length === 1 ? "post" : "posts"), stat(reviews.length, reviews.length === 1 ? "review" : "reviews"), stat(items.length, "watched")); if (mine) st.append(stat(friends.length, friends.length === 1 ? "friend" : "friends")); }
    $("prBio").textContent = (p && p.bio) || ""; $("prBio").hidden = !(p && p.bio);
    const info = $("prInfo"); info.replaceChildren();
    INFO_LABELS.forEach(([k, label]) => { const v = p && p.info && p.info[k]; if (!v) return; const w = el("div"); w.appendChild(el("dt", null, label)); const dd = el("dd", null, v); dd.translate = false; w.appendChild(dd); info.appendChild(w); });
    info.hidden = !info.children.length;
    const tb = $("prTastes"); tb.replaceChildren();
    if (p && hasTastes(p.tastes)) p.tastes.genres.forEach((g) => tb.appendChild(el("span", "tag", g)));
    tb.hidden = !tb.children.length;
    const pin = $("prPinned"); pin.replaceChildren();
    if (p && p.pinned) { const c = el("div", "pcard"); if (p.pinned.poster) { const i = el("img"); i.src = p.pinned.poster; i.alt = ""; c.appendChild(i); }
      const d = el("div"); d.appendChild(el("div", "lbl", "Recommends")); d.appendChild(el("h4", null, p.pinned.title + (p.pinned.year ? " (" + p.pinned.year + ")" : ""))); if (p.pinned.text) { const t = el("p", null, p.pinned.text); t.translate = false; d.appendChild(t); } c.appendChild(d); pin.appendChild(c); }
    // actions
    const act = $("prActions"); act.replaceChildren();
    const btn = (label, cls, fn) => { const b = el("button", cls || "", label); b.type = "button"; b.onclick = fn; act.appendChild(b); return b; };
    if (mine) {
      btn("Edit profile", "cta sm", openProfileDlg);
      btn("Share profile", "ghost sm", async () => { const l = link(); if (!l) { say("Set a nickname to get a link"); return; } try { await navigator.clipboard.writeText(l); say("Link copied."); } catch (e) { say(l); } });
    } else {
      const r = relation(uid);
      const label = { friend: "Friends", incoming: "Accept friend request", outgoing: "Request sent · Cancel", none: "Add friend" }[r];
      const fb = btn(label, r === "none" || r === "incoming" ? "cta sm" : "ghost sm", async () => {
        const rr = relation(uid);
        if (rr === "friend") { if (!confirmBtn(fb, "Remove friend")) return; await guard(cloud.removeFriend(uid)); }
        else if (rr === "incoming") await guard(cloud.acceptRequest(incoming.find((q) => q.from === uid), me_()));
        else if (rr === "outgoing") await guard(cloud.cancelRequest(me.uid, uid));
        else await guard(cloud.sendRequest(uid, handle, profile.name, profile.handle || ""));
        await guard(refreshSocial()); renderProfilePage(uid); loadFeed(true);
      });
      if (r === "friend") btn("Message", "ghost sm", () => openChat(uid));
      const bl = btn("Block", "ghost sm danger", async () => {
        if (!confirmBtn(bl, "Block")) return;
        try { await cloud.block(uid, name.replace(/^@/, ""), handle); blocked.set(uid, { name: p && p.name || "", handle }); say("Blocked. They can no longer see your profile, posts or message you."); }
        catch (e) { say("Could not block (" + (e.code || e.message) + ")."); return; }
        await guard(refreshSocial()); loadFeed(true); loadSuggestions(true); delete lbCache.friends; delete lbCache.all; if (chatWith === uid) closeChat(); location.hash = "feed";
      });
    }
    // tabs
    $("prTabs").hidden = !data;
    $("prTabs").querySelector('[data-t="common"]').hidden = mine;
    if (!data) { $("prBody").replaceChildren(emptyCard(relation(uid) === "friend" ? "This person made their profile private." : "This profile is not visible to you. Send a friend request to see more, if they allow friends to view it.")); return; }
    const entry = (extra) => ({ uid, name, handle, photo: p && p.photo, by: null, ...extra });
    const paintTab = () => {
      $("prTabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b.dataset.t === prTab));
      const body = $("prBody"); body.replaceChildren();
      if (prTab === "posts") {
        if (!posts.length) { body.appendChild(emptyCard(mine ? "Share a photo or a thought from the feed." : "No posts yet.")); return; }
        const g = el("div", "pgrid");
        posts.forEach((x) => {
          const t = el("button", "ptile" + (x.photo ? "" : " txt")); t.type = "button";
          if (x.photo) { const i = el("img"); i.src = x.photo; i.alt = ""; i.loading = "lazy"; t.appendChild(i); } else { const q = el("span", null, x.text); q.translate = false; t.appendChild(q); }
          t.onclick = () => { $("postDlgBody").replaceChildren(photoCard(entry({ post: x, at: x.at }))); $("postDlg").showModal(); };
          g.appendChild(t);
        });
        body.appendChild(g);
      } else if (prTab === "reviews") {
        const list = items.filter((i) => i.rating || i.review).sort((a, b) => b.updatedAt - a.updatedAt);
        if (!list.length) { body.appendChild(emptyCard("No ratings or reviews yet.")); return; }
        list.forEach((it) => body.appendChild(postCard(entry({ item: it, at: it.updatedAt }))));
      } else if (prTab === "seen") {
        if (!items.length) { body.appendChild(emptyCard("Nothing logged yet")); return; }
        const g = el("div", "sgrid");
        [...items].sort((a, b) => b.updatedAt - a.updatedAt).forEach((it) => {
          const c = el("div", "sposter"); c.title = it.title + (it.year ? " (" + it.year + ")" : "");
          if (it.poster) { const i = el("img"); i.src = it.poster; i.alt = it.title; i.loading = "lazy"; c.appendChild(i); } else c.appendChild(el("span", null, it.title));
          if (it.rating) c.appendChild(el("b", "srate", "★".repeat(it.rating)));
          g.appendChild(c);
        });
        body.appendChild(g);
      } else paintCompare(body, items, name);
    };
    $("prTabs").querySelectorAll("button").forEach((b) => { b.onclick = () => { prTab = b.dataset.t; paintTab(); }; });
    paintTab();
  }


  // ---------------------------------------------------------------- wiring
  $("signIn").onclick = () => cloud.signIn().catch((e) => { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") say("Sign-in failed (" + (e.code || e.message) + ")."); });
  $("signOut").onclick = () => { $("profileDlg").close(); cloud.signOut(); };
  $("signIn2").onclick = () => $("signIn").click();
  $("profileBtn").onclick = () => openProfile(me.uid);
  $("pHandleSave").onclick = saveHandle;
  $("pTastesBtn").onclick = () => { $("profileDlg").close(); ctx.openTastes(); };
  $("pSave").addEventListener("click", saveProfileFields);
  $("pPhotoBtn").onclick = () => $("pPhotoFile").click();
  $("pPhotoFile").onchange = async () => { try { profile.photo = await toAvatar($("pPhotoFile").files[0]); await guard(cloud.saveProfile(profile)); paintMyAvatar(); } catch (e) { say(e.message); } $("pPhotoFile").value = ""; };
  $("pPhotoDel").onclick = async () => { profile.photo = null; await guard(cloud.saveProfile(profile)); paintMyAvatar(); };
  $("pCopy").onclick = async () => { const l = link(); if (!l) return; try { await navigator.clipboard.writeText(l); say("Link copied."); } catch (e) { $("pLink").select(); say("Press Ctrl+C to copy."); } };
  $("pDelete").onclick = async () => {
    if (!confirmBtn($("pDelete"), "Delete my account and data")) return;
    try { keepLocal = true; await cloud.deleteAccount(profile.handle); $("profileDlg").close(); say("Your account and cloud data were deleted."); }
    catch (e) { keepLocal = false; say("Could not delete (" + (e.code || e.message) + "). Try signing in again."); }
  };
  $("friendsBtn").onclick = async () => { await guard(refreshSocial()); tab = incoming.length ? "req" : "find"; paintPeople(); $("friendsDlg").showModal(); };
  $("tFind").onclick = () => { tab = "find"; paintPeople(); }; $("tReq").onclick = () => { tab = "req"; paintPeople(); }; $("tFr").onclick = () => { tab = "fr"; paintPeople(); };
  $("fAdd").onclick = runSearch;
  $("fNick").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });

  paintAccount();

  // ---------------------------------------------------------------- friends' feed
  let feedBusy = false, feedAt = 0;
  const emptyCard = (text, label, fn) => { const d = el("div", "card empty"); d.appendChild(el("p", null, text)); if (label) { const b = el("button", "cta", label); b.type = "button"; b.onclick = fn; d.appendChild(b); } return d; };
  const typeLabel = (t) => (t === "tv" ? (isPT ? "Série" : "Series") : "Movie");
  function paintFeedFriends(people) {
    const box = $("feedFriends"); box.replaceChildren();
    const add = el("button", "story add"); add.type = "button"; add.title = "Find people";
    add.appendChild(el("span", "ring", "+")); add.appendChild(el("b", null, "Add")); add.onclick = () => $("friendsBtn").click(); box.appendChild(add);
    const fresh = (p) => p.items.length && Date.now() - p.items[0].updatedAt < 3 * 864e5;
    for (const p of [...people].sort((a, b) => (b.items[0] ? b.items[0].updatedAt : 0) - (a.items[0] ? a.items[0].updatedAt : 0))) {
      const name = p.name || (p.handle ? "@" + p.handle : "Friend");
      const c = el("button", "story" + (fresh(p) ? " new" : "")); c.type = "button"; c.title = "Open " + name + "'s profile";
      const ring = el("span", "ring"); ring.appendChild(avatar(p.profile && p.profile.photo, name)); c.appendChild(ring);
      c.appendChild(el("b", null, name));
      c.onclick = () => openProfile(p.uid, { handle: p.handle });
      box.appendChild(c);
    }
  }
  let myReposts = new Set();
  const postKey = (it) => it.type + ":" + it.id;
  function paintFeedList(entries, noFriends) {
    const box = $("feedList"); box.replaceChildren();
    if (noFriends) box.appendChild(emptyCard("Add friends in People to see what they are watching and what they thought of it.", "Find people", () => $("friendsBtn").click()));
    if (!entries.length) { if (!noFriends) box.appendChild(emptyCard("Your friends have not logged anything yet. When they mark a title as seen, it shows up here.")); return; }
    for (const e of entries) if (!isBlocked(e.uid) && !(e.by && isBlocked(e.by.uid))) box.appendChild(postCard(e));
  }
  function postCard(e) {
    if (e.post) return photoCard(e);
    const a = el("article", "fitem"), it = e.item, mine = e.uid === me.uid, key = postKey(it), rid = e.uid + "_" + key;
    if (e.by) { const rp = el("div", "rphead"); rp.appendChild(icon("repeat", 15)); rp.appendChild(el("b", null, e.by.uid === me.uid ? "You" : e.by.name)); rp.appendChild(el("span", null, e.by.uid === me.uid ? "shared it" : "shared")); a.appendChild(rp); }
    const who = el("button", "fwho"); who.type = "button"; who.onclick = () => openProfile(e.uid, { handle: e.handle });
    const ph = e.photo || (mine && profile ? profile.photo : null) || (people.get(e.uid) || {}).photo;
    who.appendChild(avatar(ph, e.name, "sm"));
    const w = el("span"); w.appendChild(el("b", null, mine ? "You" : e.name)); w.appendChild(document.createTextNode(mine ? (it.review ? " wrote a review" : " watched it") : it.review ? " reviewed" : " watched")); who.appendChild(w);
    who.appendChild(el("small", null, timeAgo(it.updatedAt)));
    a.appendChild(who);
    const body = el("div", "fbody");
    if (it.poster) { const i = el("img"); i.src = it.poster; i.alt = ""; i.loading = "lazy"; body.appendChild(i); }
    const d = el("div");
    d.appendChild(el("h3", null, it.title + (it.year ? " (" + it.year + ")" : "")));
    const meta = el("div", "fmeta"); meta.appendChild(el("span", "ftype", typeLabel(it.type)));
    if (it.rating) meta.appendChild(el("span", "fstars", "★".repeat(it.rating) + "☆".repeat(5 - it.rating)));
    d.appendChild(meta);
    const rv = el("p", it.review ? "freview" : "freview none", it.review ? "“" + it.review + "”" : "No review, just watched."); if (it.review) rv.translate = false; d.appendChild(rv);
    body.appendChild(d); a.appendChild(body);

    socialBar(a, e, "seen", key, mine, rid, true);
    return a;
  }
  function socialBar(a, e, col, key, mine, rid, shareable) {
    // actions: like · comments · repost · send
    const bar = el("div", "pacts"), st = { likes: 0, liked: false, comments: 0, likers: [] };
    const like = el("button", "pact like"); like.type = "button"; like.title = "Like";
    const com = el("button", "pact com"); com.type = "button"; com.title = "Comments";
    const rp = el("button", "pact rp" + (rid && myReposts.has(rid) ? " on" : "")); rp.type = "button"; rp.title = "Share on my feed";
    const dm = el("button", "pact dm"); dm.type = "button"; dm.title = "Send to a friend";
    const likers = el("p", "likers");
    const paint = () => {
      like.classList.toggle("on", st.liked); like.replaceChildren(icon("heart", 19, st.liked), el("span", null, st.likes ? String(st.likes) : ""));
      com.replaceChildren(icon("comment", 19), el("span", null, st.comments ? String(st.comments) : ""));
      rp.replaceChildren(icon("repeat", 19), el("span", null, rp.classList.contains("on") ? "Shared" : "Share"));
      const names = st.likers.filter(Boolean); likers.hidden = !names.length; likers.replaceChildren();
      if (names.length) { likers.appendChild(el("span", null, "Liked by")); const n = el("b", null, " " + names.slice(0, 3).join(", ") + (st.likes > 3 ? " +" + (st.likes - 3) : "")); n.translate = false; likers.appendChild(n); }
    };
    dm.replaceChildren(icon("send", 18));
    paint();
    like.onclick = async () => {
      const on = !st.liked; st.liked = on; st.likes += on ? 1 : -1; const nm = profile.name || ""; st.likers = on ? [nm, ...st.likers] : st.likers.filter((x) => x !== nm); paint();
      like.classList.add("pop"); setTimeout(() => like.classList.remove("pop"), 300);
      try { await cloud.setLike(e.uid, key, on, profile.name, col); } catch (err) { st.liked = !on; st.likes += on ? -1 : 1; paint(); say("Could not save the like (" + (err.code || err.message) + ")."); }
    };
    rp.onclick = async () => {
      const on = !rp.classList.contains("on"); rp.classList.toggle("on", on); paint();
      try { await cloud.setRepost(e.uid, e.name, e.handle, e.item, on); if (on) { myReposts.add(rid); say("Shared on your feed."); } else myReposts.delete(rid); }
      catch (err) { rp.classList.toggle("on", !on); paint(); say(err.code === "permission-denied" ? "This post can't be shared (private profile)." : "Could not share (" + (err.code || err.message) + ")."); }
    };
    dm.onclick = () => shareWith(e.item);
    const box = el("div", "comments"); box.hidden = true;
    com.onclick = () => { box.hidden = !box.hidden; if (!box.hidden) loadComments(); };
    async function loadComments() {
      box.replaceChildren(el("p", "hint", "Loading…"));
      let list = []; try { list = await cloud.loadComments(e.uid, key, col); } catch (err) { box.replaceChildren(el("p", "hint", "Could not load comments (" + (err.code || err.message) + ").")); return; }
      list = list.filter((c) => !isBlocked(c.from)); st.comments = list.length; paint(); box.replaceChildren();
      for (const c of list) {
        const r = el("div", "cmt");
        const nm = el("button", "cname", c.from === me.uid ? "You" : c.name || "@" + c.handle); nm.type = "button"; nm.onclick = () => openProfile(c.from, { handle: c.handle });
        r.appendChild(nm);
        const t = el("span", "ctxt", c.text); t.translate = false; r.appendChild(t);
        r.appendChild(el("small", null, timeAgo(c.at)));
        if (c.from === me.uid || mine) { const x = el("button", "cdel", "×"); x.type = "button"; x.title = "Delete comment"; x.onclick = async () => { try { await cloud.deleteComment(e.uid, key, c.id, col); loadComments(); } catch (err) { say("Could not delete (" + (err.code || err.message) + ")."); } }; r.appendChild(x); }
        box.appendChild(r);
      }
      const f = el("form", "cform"); const inp = el("input"); inp.maxLength = 500; inp.placeholder = "Write a comment…"; inp.setAttribute("aria-label", "Write a comment…");
      const send = el("button", "cta sm", "Post"); send.type = "submit"; f.append(inp, send);
      f.onsubmit = async (ev) => { ev.preventDefault(); const v = inp.value.trim(); if (!v) return; send.disabled = true;
        try { await cloud.addComment(e.uid, key, v, me_(), col); await loadComments(); } catch (err) { say("Could not post the comment (" + (err.code || err.message) + ")."); send.disabled = false; } };
      box.appendChild(f);
      if (!list.length) inp.focus();
    }
    bar.append(like, com); if (!mine && shareable) bar.append(rp, dm);
    a.append(bar, likers, box);
    cloud.postStats(e.uid, key, col).then((x) => { Object.assign(st, x); paint(); }).catch(() => {});
  }
  function photoCard(e) {
    const a = el("article", "fitem ppost"), x = e.post, mine = e.uid === me.uid;
    const head = el("div", "phead2");
    const who = el("button", "fwho"); who.type = "button"; who.onclick = () => openProfile(e.uid, { handle: e.handle });
    who.appendChild(avatar(e.photo || (mine && profile ? profile.photo : null) || (people.get(e.uid) || {}).photo, e.name, "sm"));
    const w = el("span"); w.appendChild(el("b", null, mine ? "You" : e.name)); if (e.handle) { const h = el("small", "hdl", " @" + e.handle); h.translate = false; w.appendChild(h); } who.appendChild(w);
    who.appendChild(el("small", null, timeAgo(x.at)));
    head.appendChild(who);
    if (mine) { const del = el("button", "ghost sm pdel", "Delete"); del.type = "button"; del.onclick = async () => { if (!confirmBtn(del, "Delete")) return; try { await cloud.deletePost(x.id); a.remove(); } catch (err) { say("Could not delete (" + (err.code || err.message) + ")."); } }; head.appendChild(del); }
    a.appendChild(head);
    if (x.text) { const t = el("p", "ptext", x.text); t.translate = false; a.appendChild(t); }
    if (x.photo && /^data:image\/jpeg;base64,/.test(x.photo)) { const im = el("img", "pphoto"); im.src = x.photo; im.alt = ""; im.loading = "lazy"; im.onclick = () => im.classList.toggle("full"); a.appendChild(im); }
    socialBar(a, e, "posts", x.id, mine, null, false);
    return a;
  }
  async function loadFeed(force) {
    if (!me || feedBusy || (!force && Date.now() - feedAt < 60e3)) return;
    const list = $("feedList");
    feedBusy = true;
    if (!list.children.length) list.replaceChildren(el("p", "hint", "Loading your friends' feed…"));
    try {
      const [peopleList, rps] = await Promise.all([cloud.friendFeed([{ uid: me.uid, name: profile.name, handle: profile.handle }, ...friends]), cloud.myReposts().catch(() => [])]);
      myReposts = new Set(rps); feedAt = Date.now();
      paintFeedFriends(peopleList.filter((p) => p.uid !== me.uid && !isBlocked(p.uid))); paintFeedList(buildFeed(peopleList), !friends.length);
      loadSuggestions(false); loadMiniTop();
    } catch (e) { console.warn(e); list.replaceChildren(el("p", "hint", "Could not load the feed (" + (e.code || e.message) + ").")); }
    feedBusy = false;
  }
  $("feedRefresh").onclick = () => loadFeed(true);

  // ---------------------------------------------------------------- leaderboard
  let lbScope = "friends", lbBusy = false; const lbCache = {};
  function paintBoard(rows) {
    const box = $("lbList"); box.replaceChildren();
    if (!rows.length) { box.appendChild(el("li", "hint", "Nobody here yet.")); return; }
    rows.forEach((r, i) => {
      const li = el("li", "lbrow" + (me && r.uid === me.uid ? " mine" : "") + (i < 3 ? " podium p" + (i + 1) : ""));
      li.appendChild(el("span", "rank", String(i + 1)));
      const who = el("button", "lbwho"); who.type = "button"; who.onclick = () => openProfile(r.uid, { handle: r.handle });
      const name = r.name || (r.handle ? "@" + r.handle : "Friend");
      who.appendChild(avatar(r.photo, name, "sm"));
      const t = el("span"); t.appendChild(el("b", null, me && r.uid === me.uid ? name + " (you)" : name)); if (r.handle) t.appendChild(el("small", null, "@" + r.handle)); who.appendChild(t);
      li.appendChild(who);
      const n = el("span", "lbn"); n.appendChild(el("b", null, String(r.reviews))); n.appendChild(el("small", null, r.reviews === 1 ? "review" : "reviews")); li.appendChild(n);
      li.appendChild(el("span", "lbseen", r.seen + " seen"));
      box.appendChild(li);
    });
  }
  function paintMiniTop(rows) {
    const box = $("miniTopList"), top = (rows || []).filter((r) => r.reviews > 0).slice(0, 3);
    box.replaceChildren();
    if (!top.length) { box.appendChild(el("li", "hint", "No reviews yet. Write the first one!")); return; }
    top.forEach((r, i) => {
      const li = el("li", "mtrow p" + (i + 1)); li.appendChild(el("span", "rank", String(i + 1)));
      const name = me && r.uid === me.uid ? "You" : r.name || "@" + r.handle;
      const w = el("button", "lbwho"); w.type = "button"; w.onclick = () => openProfile(r.uid, { handle: r.handle });
      w.appendChild(avatar(r.photo, name, "sm")); const t = el("span"); t.appendChild(el("b", null, name)); w.appendChild(t); li.appendChild(w);
      const n = el("span", "lbn"); n.appendChild(el("b", null, String(r.reviews))); n.appendChild(el("small", null, r.reviews === 1 ? "review" : "reviews")); li.appendChild(n);
      box.appendChild(li);
    });
  }
  async function loadMiniTop() {
    if (!me) return;
    if (!lbCache.friends || Date.now() - (lbCache.friendsAt || 0) > 300e3) {
      try { lbCache.friends = await cloud.board([{ uid: me.uid, name: profile.name, handle: profile.handle }, ...friends].filter((x) => !isBlocked(x.uid))); lbCache.friendsAt = Date.now(); } catch (e) { console.warn("minitop", e); return; }
    }
    paintMiniTop(lbCache.friends);
  }
  async function loadBoard(force) {
    if (!me) { $("lbList").replaceChildren(emptyCard("Sign in to see who writes the most reviews.", "Sign in with Google", () => $("signIn").click())); return; }
    if (lbCache[lbScope] && !force) return paintBoard(lbCache[lbScope]);
    if (lbBusy) return; lbBusy = true; const scope = lbScope;
    $("lbList").replaceChildren(el("li", "hint", "Counting reviews…"));
    try {
      const mine = { uid: me.uid, name: profile.name, handle: profile.handle };
      const people = scope === "friends" ? [mine, ...friends] : [mine, ...(await cloud.publicPeople(50))];
      lbCache[scope] = (await cloud.board(people.filter((x) => !isBlocked(x.uid)))); if (scope === "friends") { lbCache.friendsAt = Date.now(); paintMiniTop(lbCache.friends); }
      if (scope === lbScope) paintBoard(lbCache[scope]);
    } catch (e) { console.warn(e); $("lbList").replaceChildren(el("li", "hint", "Could not load the leaderboard (" + (e.code || e.message) + ").")); }
    lbBusy = false;
  }
  document.querySelectorAll("#lbSeg button").forEach((b) => { b.onclick = () => { lbScope = b.dataset.v; document.querySelectorAll("#lbSeg button").forEach((x) => x.classList.toggle("on", x === b)); loadBoard(false); }; });
  let curTab = "feed";
  const onTab = (t) => { curTab = t; if (t === "profile") { const m = location.hash.match(/^#u\/(.+)$/); if (m) renderProfilePage(decodeURIComponent(m[1])); } if (t === "top") loadBoard(false); if (t === "feed") loadFeed(false); if (t === "chat") { paintChatList(); paintNotifBtn(); if (chatWith) cloud.markRead(chatWith); } paintBadge(); };

  // ---------------------------------------------------------------- new post (text + photo)
  let compPhoto = null;
  const paintComp = () => {
    const pv = $("compPrev"); pv.hidden = !compPhoto; pv.replaceChildren();
    if (compPhoto) { const i = el("img"); i.src = compPhoto; i.alt = ""; const x = el("button", "ghost sm", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove"); x.onclick = () => { compPhoto = null; paintComp(); }; pv.append(i, x); }
    const n = $("compText").value.length; $("compCount").textContent = n > 800 ? n + "/1000" : "";
    $("compPost").disabled = !compPhoto && !$("compText").value.trim();
  };
  $("compText").addEventListener("input", paintComp);
  $("compPhoto").onclick = () => $("compFile").click();
  $("compFile").onchange = async () => { const f = $("compFile").files[0]; $("compFile").value = ""; if (!f) return; $("compPost").disabled = true; try { compPhoto = await toPhoto(f); } catch (e) { say(e.message); } paintComp(); };
  $("composer").onsubmit = async (ev) => {
    ev.preventDefault(); const text = $("compText").value.trim(); if (!text && !compPhoto) return;
    $("compPost").disabled = true;
    try { await cloud.createPost(text, compPhoto); $("compText").value = ""; compPhoto = null; paintComp(); say("Posted."); loadFeed(true); }
    catch (e) { say("Could not post (" + (e.code || e.message) + ")."); $("compPost").disabled = false; }
  };

  // ---------------------------------------------------------------- friend suggestions (few users: show everyone with a nickname)
  let sugg = null, suggAt = 0;
  async function loadSuggestions(force) {
    if (!me) return [];
    if (!sugg || force || Date.now() - suggAt > 120e3) {
      let all = []; try { all = await cloud.allHandles(100); } catch (e) { console.warn("suggestions", e); }
      const skip = new Set([me.uid, ...friends.map((f) => f.uid), ...outgoing.map((r) => r.to), ...incoming.map((r) => r.from), ...blocked.keys()]);
      const uniq = new Map(); all.forEach((h) => { if (h.uid && !skip.has(h.uid) && !uniq.has(h.uid)) uniq.set(h.uid, h); });
      const list = [...uniq.values()].sort(() => Math.random() - 0.5).slice(0, 12);
      sugg = await Promise.all(list.map(async (h) => { const c = await cloud.peek(h.uid); return { uid: h.uid, handle: h.handle, name: c ? c.name : "", photo: c ? c.photo : null, bio: c ? c.bio : "", visible: !!c }; }));
      suggAt = Date.now();
    }
    paintSuggestions(); return sugg;
  }
  function paintSuggestions() {
    const box = $("suggestList"), list = (sugg || []).filter((p) => relation(p.uid) === "none" && !isBlocked(p.uid));
    $("suggest").hidden = !me || !list.length; box.replaceChildren();
    for (const p of list) {
      const name = p.name || "@" + p.handle;
      const c = el("div", "scard");
      const top = el("button", "sopen"); top.type = "button"; top.onclick = () => openProfile(p.uid, { handle: p.handle });
      top.appendChild(avatar(p.photo, name)); top.appendChild(el("b", null, name)); if (p.name) top.appendChild(el("small", null, "@" + p.handle));
      c.appendChild(top);
      const add = el("button", "cta sm", "Add friend"); add.type = "button";
      add.onclick = async () => { add.disabled = true; add.textContent = "request sent"; await guard(cloud.sendRequest(p.uid, p.handle, profile.name, profile.handle || "")); await guard(refreshSocial()); setTimeout(paintSuggestions, 1200); };
      const x = el("button", "sx", "×"); x.type = "button"; x.title = "Hide"; x.onclick = () => { sugg = sugg.filter((q) => q.uid !== p.uid); paintSuggestions(); };
      c.append(add, x); box.appendChild(c);
    }
  }

  // ---------------------------------------------------------------- chat
  let chats = [], unChats = null, unMsgs = null, chatWith = null, pendingShare = null, lastSeenAt = 0;
  const people = new Map();   // uid -> {name, handle, photo}
  const fmtTime = (t) => { const d = new Date(t), today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : timeAgo(t); };
  const unread = (c) => c.last && c.last.from !== me.uid && c.last.at > (c.read[me.uid] || 0) && !(chatWith === c.other && curTab === "chat" && !document.hidden);
  async function personOf(uid) {
    if (people.has(uid)) return people.get(uid);
    const f = friends.find((x) => x.uid === uid) || {};
    const base = { name: f.name || "", handle: f.handle || "", photo: null }; people.set(uid, base);
    const c = await cloud.peek(uid); if (c) Object.assign(base, { name: c.name || base.name, handle: c.handle || base.handle, photo: c.photo || null });
    return base;
  }
  const nameOf = (p) => p.name || (p.handle ? "@" + p.handle : "Friend");
  function paintBadge() {
    const n = me ? chats.filter(unread).length : 0;
    $("chatBadge").hidden = !n; $("chatBadge").textContent = n;
    document.title = (n ? "(" + n + ") " : "") + document.title.replace(/^\(\d+\) /, "");
  }
  async function paintChatList() {
    const box = $("chatList");
    if (!me) { box.replaceChildren(emptyCard("Sign in to talk with your friends about movies and series.", "Sign in with Google", () => $("signIn").click())); return; }
    if (!friends.length) { box.replaceChildren(emptyCard("Add friends to start a conversation.", "Find people", () => $("friendsBtn").click())); return; }
    const byOther = new Map(chats.map((c) => [c.other, c]));
    const order = [...friends].sort((a, b) => ((byOther.get(b.uid) || {}).updatedAt || 0) - ((byOther.get(a.uid) || {}).updatedAt || 0));
    const rows = await Promise.all(order.map(async (f) => {
      const p = await personOf(f.uid), c = byOther.get(f.uid);
      const r = el("button", "crow" + (chatWith === f.uid ? " sel" : "") + (c && unread(c) ? " unread" : "")); r.type = "button";
      r.appendChild(avatar(p.photo, nameOf(p), "sm"));
      const t = el("span", "ctext"); t.appendChild(el("b", null, nameOf(p)));
      const sm = el("small"); if (c && c.last) { if (c.last.from === me.uid) sm.appendChild(el("span", null, "You:")); const lt = el("span", null, " " + c.last.text); lt.translate = false; sm.appendChild(lt); } else sm.textContent = "Say hello";
      t.appendChild(sm); r.appendChild(t);
      if (c && c.last) r.appendChild(el("time", null, fmtTime(c.last.at)));
      r.onclick = () => openChat(f.uid);
      return r;
    }));
    box.replaceChildren(...rows);
  }
  function shareCard(sh, cls) {
    const a = el("a", "shcard " + (cls || "")); a.href = "https://www.themoviedb.org/" + sh.type + "/" + sh.id; a.target = "_blank"; a.rel = "noopener noreferrer";
    if (sh.poster) { const i = el("img"); i.src = sh.poster; i.alt = ""; i.loading = "lazy"; a.appendChild(i); }
    const d = el("span"); d.appendChild(el("b", null, sh.title)); d.appendChild(el("small", null, [sh.year, typeLabel(sh.type)].filter(Boolean).join(" · "))); a.appendChild(d);
    return a;
  }
  function paintMsgs(list) {
    const box = $("msgs"), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.replaceChildren();
    if (!list.length) box.appendChild(el("p", "hint cempty", "No messages yet. Recommend something!"));
    let prevDay = "";
    for (const m of list) {
      const day = new Date(m.at).toDateString();
      if (day !== prevDay) { prevDay = day; box.appendChild(el("div", "cday", new Date(m.at).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }))); }
      const b = el("div", "bubble " + (m.from === me.uid ? "mine" : "theirs"));
      if (m.share) b.appendChild(shareCard(m.share));
      if (m.text) { const t = el("p", null, m.text); t.translate = false; b.appendChild(t); }
      b.appendChild(el("time", null, new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
      box.appendChild(b);
    }
    if (atEnd || list.length && list[list.length - 1].from === me.uid) box.scrollTop = box.scrollHeight;
  }
  function paintShareBox() {
    const box = $("shareBox"); box.hidden = !pendingShare; box.replaceChildren();
    if (!pendingShare) return;
    box.appendChild(shareCard(pendingShare, "draft"));
    const x = el("button", "ghost sm", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove"); x.onclick = () => { pendingShare = null; paintShareBox(); }; box.appendChild(x);
  }
  async function openChat(uid, share) {
    if (!me) return;
    if (location.hash !== "#chat") location.hash = "chat";
    chatWith = uid; if (share) pendingShare = share;
    const p = await personOf(uid);
    const who = $("chatWho"); who.replaceChildren(avatar(p.photo, nameOf(p), "sm"), el("b", null, nameOf(p)));
    who.onclick = () => openProfile(uid, { handle: p.handle });
    $("convo").hidden = false; $("convoEmpty").hidden = true; $("v-chat").classList.add("open");
    paintShareBox(); $("msgs").replaceChildren(el("p", "hint cempty", "Loading…"));
    if (unMsgs) unMsgs();
    unMsgs = cloud.watchMessages(uid, (list) => { if (chatWith !== uid) return; paintMsgs(list); cloud.markRead(uid); }, (e) => { console.warn(e); $("msgs").replaceChildren(el("p", "hint", "Could not load messages (" + (e.code || e.message) + ").")); });
    paintChatList(); paintBadge();
    if (window.matchMedia("(min-width: 701px)").matches) $("chatInput").focus();
  }
  function closeChat() {
    if (unMsgs) unMsgs(); unMsgs = null; chatWith = null; pendingShare = null;
    $("convo").hidden = true; $("convoEmpty").hidden = false; $("v-chat").classList.remove("open"); paintChatList();
  }
  $("chatBack").onclick = closeChat;
  $("chatForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const text = $("chatInput").value.trim(); if (!chatWith || (!text && !pendingShare)) return;
    const sh = pendingShare; $("chatInput").value = ""; pendingShare = null; paintShareBox();
    try { await cloud.sendMessage(chatWith, text, sh); }
    catch (e) { console.warn(e); $("chatInput").value = text; pendingShare = sh; paintShareBox(); say("Could not send (" + (e.code || e.message) + ")."); }
  };
  function notify(c) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    personOf(c.other).then((p) => {
      const title = nameOf(p), opts = { body: c.last.text, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "chat-" + c.other, data: { url: location.pathname + "#chat" } };
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then((r) => r.showNotification(title, opts)).catch(() => {}); else new Notification(title, opts);
    });
  }
  function startChats() {
    if (unChats) unChats();
    lastSeenAt = Date.now();
    unChats = cloud.watchChats((list) => {
      for (const c of list) if (c.last && c.last.at > lastSeenAt && c.last.from !== me.uid && (document.hidden || chatWith !== c.other || curTab !== "chat")) notify(c);
      lastSeenAt = Math.max(lastSeenAt, ...list.map((c) => (c.last ? c.last.at : 0)));
      chats = list; paintBadge(); if (curTab === "chat") paintChatList();
    }, (e) => console.warn("chats", e));
  }
  function stopChats() { if (unChats) unChats(); unChats = null; chats = []; closeChat(); paintBadge(); people.clear(); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && chatWith && curTab === "chat") { cloud.markRead(chatWith); paintBadge(); } });
  const paintNotifBtn = () => { $("notifBtn").hidden = !me || !("Notification" in window) || Notification.permission !== "default"; };
  $("notifBtn").onclick = async () => { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } paintNotifBtn(); };

  // share a title with a friend
  function shareWith(item) {
    if (!me) { say("Sign in with Google to send it to a friend."); return; }
    if (!friends.length) { say("Add friends first, in People."); return; }
    const sh = { type: item.type, id: item.id, title: item.title, year: String(item.year || ""), poster: item.poster || null };
    const box = $("pickList"); box.replaceChildren();
    friends.forEach((f) => {
      const r = el("button", "crow"); r.type = "button";
      personOf(f.uid).then((p) => { r.replaceChildren(avatar(p.photo, nameOf(p), "sm"), el("b", null, nameOf(p))); });
      r.textContent = f.name || "@" + f.handle;
      r.onclick = () => { $("pickDlg").close(); openChat(f.uid, sh); };
      box.appendChild(r);
    });
    $("pickDlg").showModal();
  }
  cloud.onAuth(onAuth);

  return {
    enabled: true, signedIn: () => !!me, onTab, shareWith,
    upsert: (item) => { if (me) guard(cloud.saveItem(item)); },
    remove: (key) => { if (me) guard(cloud.removeItem(key)); },
    pushMany: (items) => { if (me && items.length) guard(cloud.pushMany(items)); },
    setTastes: async (t) => { if (!me || !profile) return; profile.tastes = t; await guard(cloud.saveProfile(profile)); },
    pin: async (item, text) => { if (!me) return; profile.pinned = sanitizePinned({ ...item, text }); await guard(cloud.saveProfile(profile)); say("Pinned on your profile: " + item.title); },
  };
}
