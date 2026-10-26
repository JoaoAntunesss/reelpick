// Accounts, nicknames, friend requests, profiles and comparison. Does nothing unless firebase-config.js has a config.
import { sanitizeItem, mergeSeen, compareLists, normalizeHandle, sanitizePinned, validPhoto, sanitizeProfile } from "./seen.js";

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
      paintAccount();
      const nick = normalizeHandle(new URLSearchParams(location.search).get("p"));
      if (nick && profile) { history.replaceState(null, "", location.pathname); const uid = await guard(cloud.findHandle(nick)); if (uid) openProfile(uid, { handle: nick }); else say("Nobody uses the nickname @" + nick + "."); }
    } else {
      profile = null; friends = []; incoming = []; outgoing = [];
      if (wasIn && !keepLocal) { seen.clear(); saveSeen(); renderSeen(); }   // the list stays in the account
      wasIn = false; keepLocal = false; paintAccount();
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
  const paintMyAvatar = () => $("pAvatar").replaceChildren(avatar(profile.photo, profile.name, "lg"));
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
  async function act(fn) { await guard(fn()); await guard(refreshSocial()); paintPeople(); }
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
    const btn = $("vAdd"), paintBtn = () => { const r = relation(uid); btn.hidden = r === "me"; btn.textContent = { friend: "Remove friend", incoming: "Accept friend request", outgoing: "Request sent · Cancel", none: "Add friend" }[r] || ""; btn.className = r === "friend" || r === "outgoing" ? "ghost" : ""; };
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
  $("signOut").onclick = () => cloud.signOut();
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

  cloud.onAuth(onAuth);
  paintAccount();
  return {
    enabled: true, signedIn: () => !!me,
    upsert: (item) => { if (me) guard(cloud.saveItem(item)); },
    remove: (key) => { if (me) guard(cloud.removeItem(key)); },
    pushMany: (items) => { if (me && items.length) guard(cloud.pushMany(items)); },
    setTastes: async (t) => { if (!me || !profile) return; profile.tastes = t; await guard(cloud.saveProfile(profile)); },
    pin: async (item, text) => { if (!me) return; profile.pinned = sanitizePinned({ ...item, text }); await guard(cloud.saveProfile(profile)); say("Pinned on your profile: " + item.title); },
  };
}
