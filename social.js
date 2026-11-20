// Accounts, nicknames, friend requests, profiles and comparison. Does nothing unless firebase-config.js has a config.
import { isPT } from "./i18n.js";
import { sanitizeItem, mergeSeen, compareLists, normalizeHandle, sanitizePinned, validPhoto, sanitizeProfile, buildFeed, timeAgo } from "./seen.js";

const stars = (n) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "not rated");

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
    $("feed").hidden = !me; $("welcome").hidden = !!me;
    if (me && profile) $("meAv").replaceChildren(avatar(profile.photo, profile.name, "sm"));
    $("reqBadge").hidden = !incoming.length; $("reqBadge").textContent = incoming.length;
    if (me) $("friendsBtn").title = incoming.length ? incoming.length + " pending friend request(s)" : "People";
  }
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
      try { await syncDown(user); } catch (e) { console.warn(e); say("Signed in, but the cloud could not be read (" + (e.code || e.message) + "). Check the Firestore rules."); }
      paintAccount(); loadFeed(true); startChats(); paintNotifBtn(); delete lbCache.friends; delete lbCache.all; if (curTab === "top") loadBoard(true);
      const nick = normalizeHandle(new URLSearchParams(location.search).get("p"));
      if (nick && profile) { history.replaceState(null, "", location.pathname + location.hash); const uid = await guard(cloud.findHandle(nick)); if (uid) openProfile(uid, { handle: nick }); else say("Nobody uses the nickname @" + nick + "."); }
    } else {
      profile = null; friends = []; incoming = []; outgoing = []; $("feedFriends").replaceChildren(); $("feedList").replaceChildren(); feedAt = 0;
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
    $("pDelete").textContent = "Delete my account and data"; $("profileDlg").showModal();
  }
  async function saveProfileFields() {
    profile.name = $("pName").value.trim().slice(0, 40) || profile.name;
    profile.bio = $("pBio").value.trim().slice(0, 300); profile.visibility = $("pVis").value;
    await guard(cloud.saveProfile(profile)); paintAccount(); say("Profile saved.");
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
      found = found.filter((x) => x.uid !== me.uid); box.replaceChildren();
      if (!found.length) box.appendChild(el("p", "hint", "Nobody found with a nickname starting with “" + lastSearch + "”."));
      for (const f of found) { const c = await cloud.peek(f.uid);
        box.appendChild(personRow({ name: (c && c.name) || "@" + f.handle, handle: c && c.name ? f.handle : "", photo: c && c.photo, sub: c ? (c.bio || "").slice(0, 70) : "Profile not shown", actions: [...(c ? [["View", () => { $("friendsDlg").close(); openProfile(f.uid, { handle: f.handle }); }, true]] : []), ...actionsFor(f.uid, f.handle)] })); }
    } else box.appendChild(el("p", "hint", "Type a nickname (or the first letters) and press Search."));
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
  async function openProfile(uid, hint = {}) {
    let data = null;
    try { data = await cloud.loadProfile(uid); } catch (e) { if (e.code !== "private") { say("Could not open the profile."); return; } }
    const p = data ? data.profile : null, items = data ? data.items.map(sanitizeItem).filter(Boolean) : [];
    const handle = (p && p.handle) || hint.handle || "", name = (p && p.name) || (handle ? "@" + handle : "This person");
    const head = $("vHead"); head.replaceChildren(avatar(p && p.photo, name, "lg"));
    const t = el("div"); t.appendChild(el("h3", null, name)); if (handle) t.appendChild(el("span", null, "@" + handle + (data ? " · " + items.length + " titles seen" : "")));
    if (p && p.bio) t.appendChild(el("p", "bio", p.bio));
    if (p && hasTastes(p.tastes)) { const l = el("p", "tasteline-chips"); l.textContent = "Likes: " + p.tastes.genres.join(" · ") + (p.tastes.type === "both" ? "" : " (" + (p.tastes.type === "tv" ? "series" : "movies") + ")"); t.appendChild(l); }
    head.appendChild(t);
    const pin = $("vPinned"); pin.replaceChildren();
    if (p && p.pinned) { const c = el("div", "pcard"); if (p.pinned.poster) { const i = el("img"); i.src = p.pinned.poster; i.alt = ""; c.appendChild(i); }
      const d = el("div"); d.appendChild(el("div", "lbl", "Recommends")); d.appendChild(el("h4", null, p.pinned.title + (p.pinned.year ? " (" + p.pinned.year + ")" : ""))); if (p.pinned.text) d.appendChild(el("p", null, p.pinned.text)); c.appendChild(d); pin.appendChild(c); }
    const body = $("vBody"), tR = $("vTabR"), tC = $("vTabC"), tabs = tR.parentElement;
    tabs.hidden = !data;
    if (!data) { body.replaceChildren(el("p", "hint", relation(uid) === "friend" ? "This person made their profile private." : "This profile is not visible to you. Send a friend request to see more, if they allow friends to view it.")); }
    else { const show = (w) => { tR.classList.toggle("sel", w === "r"); tC.classList.toggle("sel", w === "c"); (w === "r" ? paintReviews : (b, i) => paintCompare(b, i, name))(body, items); };
      tR.onclick = () => show("r"); tC.onclick = () => show("c"); tC.hidden = uid === me.uid; show("r"); }
    const btn = $("vAdd"), paintBtn = () => { const r = relation(uid); btn.hidden = r === "me"; btn.textContent = { friend: "Remove friend", incoming: "Accept friend request", outgoing: "Request sent · Cancel", none: "Add friend" }[r] || ""; btn.className = r === "friend" || r === "outgoing" ? "ghost" : ""; $("vMsg").hidden = r !== "friend"; };
    $("vMsg").onclick = () => { $("viewDlg").close(); openChat(uid); };
    paintBtn();
    btn.onclick = async () => { const r = relation(uid);
      if (r === "friend") { if (!confirmBtn(btn, "Remove friend")) return; await guard(cloud.removeFriend(uid)); }
      else if (r === "incoming") await guard(cloud.acceptRequest(incoming.find((q) => q.from === uid), me_()));
      else if (r === "outgoing") await guard(cloud.cancelRequest(me.uid, uid));
      else await guard(cloud.sendRequest(uid, handle, profile.name, profile.handle || ""));
      await guard(refreshSocial()); paintBtn(); };
    $("viewDlg").showModal();
  }

  // ---------------------------------------------------------------- wiring
  $("signIn").onclick = () => cloud.signIn().catch((e) => { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") say("Sign-in failed (" + (e.code || e.message) + ")."); });
  $("signOut").onclick = () => { $("profileDlg").close(); cloud.signOut(); };
  $("signIn2").onclick = () => $("signIn").click();
  $("profileBtn").onclick = openProfileDlg;
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
  function paintFeedList(entries) {
    const box = $("feedList"); box.replaceChildren();
    if (!entries.length) { box.appendChild(emptyCard("Your friends have not logged anything yet. When they mark a title as seen, it shows up here.")); return; }
    for (const e of entries) {
      const a = el("article", "fitem"), it = e.item;
      const who = el("button", "fwho"); who.type = "button"; who.onclick = () => openProfile(e.uid, { handle: e.handle });
      who.appendChild(avatar(e.photo, e.name, "sm"));
      const w = el("span"); w.appendChild(el("b", null, e.name)); w.appendChild(document.createTextNode(it.review ? " reviewed" : " watched")); who.appendChild(w);
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
      const rep = el("button", "ghost sm freply", "💬 Reply"); rep.type = "button"; rep.onclick = () => openChat(e.uid, it); a.appendChild(rep);
      box.appendChild(a);
    }
  }
  async function loadFeed(force) {
    if (!me || feedBusy || (!force && Date.now() - feedAt < 60e3)) return;
    const list = $("feedList"), strip = $("feedFriends");
    if (!friends.length) { paintFeedFriends([]); list.replaceChildren(emptyCard("Add friends in People to see what they are watching and what they thought of it.", "Find people", () => $("friendsBtn").click())); return; }
    feedBusy = true;
    if (!list.children.length) list.replaceChildren(el("p", "hint", "Loading your friends' feed…"));
    try {
      const people = await cloud.friendFeed(friends);
      feedAt = Date.now();
      paintFeedFriends(people); paintFeedList(buildFeed(people));
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
      li.appendChild(el("span", "rank", i < 3 ? ["🥇", "🥈", "🥉"][i] : String(i + 1)));
      const who = el("button", "lbwho"); who.type = "button"; who.onclick = () => (me && r.uid === me.uid ? openProfileDlg() : openProfile(r.uid, { handle: r.handle }));
      const name = r.name || (r.handle ? "@" + r.handle : "Friend");
      who.appendChild(avatar(r.photo, name, "sm"));
      const t = el("span"); t.appendChild(el("b", null, me && r.uid === me.uid ? name + " (you)" : name)); if (r.handle) t.appendChild(el("small", null, "@" + r.handle)); who.appendChild(t);
      li.appendChild(who);
      const n = el("span", "lbn"); n.appendChild(el("b", null, String(r.reviews))); n.appendChild(el("small", null, r.reviews === 1 ? "review" : "reviews")); li.appendChild(n);
      li.appendChild(el("span", "lbseen", r.seen + " seen"));
      box.appendChild(li);
    });
  }
  async function loadBoard(force) {
    if (!me) { $("lbList").replaceChildren(emptyCard("Sign in to see who writes the most reviews.", "Sign in with Google", () => $("signIn").click())); return; }
    if (lbCache[lbScope] && !force) return paintBoard(lbCache[lbScope]);
    if (lbBusy) return; lbBusy = true; const scope = lbScope;
    $("lbList").replaceChildren(el("li", "hint", "Counting reviews…"));
    try {
      const mine = { uid: me.uid, name: profile.name, handle: profile.handle };
      const people = scope === "friends" ? [mine, ...friends] : [mine, ...(await cloud.publicPeople(50))];
      lbCache[scope] = await cloud.board(people);
      if (scope === lbScope) paintBoard(lbCache[scope]);
    } catch (e) { console.warn(e); $("lbList").replaceChildren(el("li", "hint", "Could not load the leaderboard (" + (e.code || e.message) + ").")); }
    lbBusy = false;
  }
  document.querySelectorAll("#lbSeg button").forEach((b) => { b.onclick = () => { lbScope = b.dataset.v; document.querySelectorAll("#lbSeg button").forEach((x) => x.classList.toggle("on", x === b)); loadBoard(false); }; });
  let curTab = "feed";
  const onTab = (t) => { curTab = t; if (t === "top") loadBoard(false); if (t === "feed") loadFeed(false); if (t === "chat") { paintChatList(); paintNotifBtn(); if (chatWith) cloud.markRead(chatWith); } paintBadge(); };

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
      const sm = el("small"); if (c && c.last) { if (c.last.from === me.uid) sm.appendChild(el("span", null, "You:")); const lt = el("span", null, " " + c.last.text); lt.translate = false; sm.appendChild(lt); } else sm.textContent = "Say hello 👋";
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
