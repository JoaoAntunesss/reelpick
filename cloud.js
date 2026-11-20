// Firebase wrapper (Auth with Google + Firestore). Loaded only when firebase-config.js has a config.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, query, where, documentId, limit, orderBy, getCountFromServer, onSnapshot, addDoc, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { sanitizeItem, keyOf, sanitizeProfile, pairId } from "./seen.js";

export async function init(config) {
  const app = initializeApp(config), auth = getAuth(app), db = getFirestore(app), provider = new GoogleAuthProvider();
  const me = () => { if (!auth.currentUser) throw Object.assign(new Error("Not signed in"), { code: "signed-out" }); return auth.currentUser.uid; };
  const userDoc = (uid) => doc(db, "users", uid), seenCol = (uid) => collection(db, "users", uid, "seen");
  const chunks = (a, n = 400) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  const toDoc = (p) => ({ ...sanitizeProfile(p), updatedAt: Date.now() });
  const fromDoc = (s) => (s.exists() ? sanitizeProfile(s.data()) : null);
  const reqOut = (r) => ({ from: r.from, to: r.to, fromName: String(r.fromName || "").slice(0, 40), fromHandle: String(r.fromHandle || "").slice(0, 20), toHandle: String(r.toHandle || "").slice(0, 20), createdAt: r.createdAt || 0 });
  const deleteAll = async (docs) => { for (const part of chunks(docs)) { const b = writeBatch(db); part.forEach((d) => b.delete(d.ref)); await b.commit(); } };

  return {
    onAuth: (cb) => onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, displayName: u.displayName || "" } : null)),
    signIn: () => signInWithPopup(auth, provider),
    signOut: () => signOut(auth),

    async loadMine() {
      const uid = me();
      const [p, s] = await Promise.all([getDoc(userDoc(uid)), getDocs(seenCol(uid))]);
      let posts = [];
      try { posts = (await getDocs(query(collection(db, "users", uid, "posts"), orderBy("at", "desc"), limit(60)))).docs.map((d) => { const x = d.data(); return { id: d.id, text: String(x.text || ""), photo: typeof x.photo === "string" ? x.photo : null, at: x.at || 0 }; }); } catch (e) { /* none */ }
      return { profile: fromDoc(p), items: s.docs.map((d) => d.data()), posts };
    },
    async saveProfile(p) { await setDoc(userDoc(me()), toDoc(p)); },
    /** Claims a nickname (and frees the old one) in one atomic batch. */
    async setHandle(handle, oldHandle, profile) {
      const uid = me();
      const existing = await getDoc(doc(db, "handles", handle));
      if (existing.exists() && existing.data().uid !== uid) throw Object.assign(new Error("Nickname taken"), { code: "taken" });
      const b = writeBatch(db);
      if (!existing.exists()) b.set(doc(db, "handles", handle), { uid });
      if (oldHandle && oldHandle !== handle) b.delete(doc(db, "handles", oldHandle));
      b.set(userDoc(uid), toDoc({ ...profile, handle }));
      await b.commit();
    },
    async saveItem(item) { const s = sanitizeItem(item); if (s) await setDoc(doc(seenCol(me()), keyOf(s)), s); },
    async removeItem(key) { await deleteDoc(doc(seenCol(me()), key)); },
    async pushMany(items) {
      const uid = me();
      for (const part of chunks(items)) { const b = writeBatch(db); part.forEach((i) => { const s = sanitizeItem(i); if (s) b.set(doc(seenCol(uid), keyOf(s)), s); }); await b.commit(); }
    },

    // ---- people
    async findHandle(handle) { const s = await getDoc(doc(db, "handles", handle)); return s.exists() ? s.data().uid : null; },
    async searchHandles(prefix) {
      const q = query(collection(db, "handles"), where(documentId(), ">=", prefix), where(documentId(), "<", prefix + ""), limit(10));
      return (await getDocs(q)).docs.map((d) => ({ handle: d.id, uid: d.data().uid }));
    },
    /** Everyone with a nickname (few users), for friend suggestions. */
    async allHandles(n = 100) { return (await getDocs(query(collection(db, "handles"), limit(n)))).docs.map((d) => ({ handle: d.id, uid: d.data().uid })); },
    // ---- blocking
    async myBlocks() { return (await getDocs(collection(db, "users", me(), "blocks"))).docs.map((d) => ({ uid: d.id, ...d.data() })); },
    async block(uid2, name, handle) {
      const uid = me();
      await setDoc(doc(db, "users", uid, "blocks", uid2), { at: Date.now(), name: String(name || "").slice(0, 40), handle: String(handle || "").slice(0, 20) });
      await Promise.all([deleteDoc(doc(db, "friendships", pairId(uid, uid2))), deleteDoc(doc(db, "requests", uid + "_" + uid2)), deleteDoc(doc(db, "requests", uid2 + "_" + uid))].map((p) => p.catch(() => {})));
    },
    async unblock(uid2) { await deleteDoc(doc(db, "users", me(), "blocks", uid2)); },
    /** Profile card if the rules let me read it, otherwise null. */
    async peek(uid) { try { return fromDoc(await getDoc(userDoc(uid))); } catch (e) { return null; } },
    async loadProfile(uid) {
      let p;
      try { p = await getDoc(userDoc(uid)); } catch (e) { throw Object.assign(new Error("private"), { code: "private" }); }
      if (!p.exists()) throw Object.assign(new Error("private"), { code: "private" });
      let s;
      try { s = await getDocs(seenCol(uid)); } catch (e) { throw Object.assign(new Error("private"), { code: "private" }); }
      let posts = [];
      try { posts = (await getDocs(query(collection(db, "users", uid, "posts"), orderBy("at", "desc"), limit(60)))).docs.map((d) => { const x = d.data(); return { id: d.id, text: String(x.text || ""), photo: typeof x.photo === "string" ? x.photo : null, at: x.at || 0 }; }); } catch (e) { /* none */ }
      return { profile: fromDoc(p), items: s.docs.map((d) => d.data()), posts };
    },
    /** Friends' feed: each friend's latest watched titles (newest first) plus their profile card. Friends whose list I may not read are skipped. */
    async friendFeed(friendList, per = 8) {
      const one = async (f) => {
        try {
          const [p, s, rp, ps] = await Promise.all([getDoc(userDoc(f.uid)).catch(() => null), getDocs(query(seenCol(f.uid), orderBy("updatedAt", "desc"), limit(per))),
            getDocs(query(collection(db, "users", f.uid, "reposts"), orderBy("at", "desc"), limit(per))).catch(() => null),
            getDocs(query(collection(db, "users", f.uid, "posts"), orderBy("at", "desc"), limit(per))).catch(() => null)]);
          const prof = p ? fromDoc(p) : null;
          const reposts = rp ? rp.docs.map((d) => { const x = d.data(), it = sanitizeItem(x.item || {}); return it ? { owner: x.owner, ownerName: x.ownerName || "", ownerHandle: x.ownerHandle || "", item: it, at: x.at || 0 } : null; }).filter(Boolean) : [];
          return { uid: f.uid, profile: prof, name: (prof && prof.name) || f.name || "", handle: (prof && prof.handle) || f.handle || "", items: s.docs.map((d) => sanitizeItem(d.data())).filter(Boolean), reposts,
            posts: ps ? ps.docs.map((d) => { const x = d.data(); return { id: d.id, text: String(x.text || ""), photo: typeof x.photo === "string" ? x.photo : null, at: x.at || 0 }; }) : [] };
        } catch (e) { return { uid: f.uid, profile: null, name: f.name || "", handle: f.handle || "", items: [], hidden: true }; }
      };
      return Promise.all(friendList.slice(0, 40).map(one));
    },
    /** Leaderboard rows: reviews and titles seen for each person we are allowed to read. */
    async board(people) {
      const one = async (x) => {
        try {
          const c = seenCol(x.uid);
          const [p, r, n] = await Promise.all([getDoc(userDoc(x.uid)).catch(() => null), getCountFromServer(query(c, where("review", ">", ""))), getCountFromServer(c)]);
          const prof = p ? fromDoc(p) : null;
          return { uid: x.uid, name: (prof && prof.name) || x.name || "", handle: (prof && prof.handle) || x.handle || "", photo: prof && prof.photo, reviews: r.data().count, seen: n.data().count };
        } catch (e) { return null; }
      };
      const seenIds = new Set(), list = people.filter((x) => x && x.uid && !seenIds.has(x.uid) && seenIds.add(x.uid)).slice(0, 60);
      return (await Promise.all(list.map(one))).filter(Boolean).sort((a, b) => b.reviews - a.reviews || b.seen - a.seen);
    },
    /** Public profiles (anyone signed in may read them). */
    async publicPeople(n = 50) {
      const s = await getDocs(query(collection(db, "users"), where("visibility", "==", "public"), limit(n)));
      return s.docs.map((d) => { const p = fromDoc(d) || {}; return { uid: d.id, name: p.name || "", handle: p.handle || "" }; });
    },
    async loadSocial() {
      const uid = me(), f = collection(db, "friendships"), r = collection(db, "requests");
      const [a, b, inc, out] = await Promise.all([getDocs(query(f, where("a", "==", uid))), getDocs(query(f, where("b", "==", uid))), getDocs(query(r, where("to", "==", uid))), getDocs(query(r, where("from", "==", uid)))]);
      return {
        friends: [...a.docs.map((d) => ({ uid: d.data().b, handle: d.data().hb || "", name: d.data().nb || "" })), ...b.docs.map((d) => ({ uid: d.data().a, handle: d.data().ha || "", name: d.data().na || "" }))],
        incoming: inc.docs.map((d) => reqOut(d.data())), outgoing: out.docs.map((d) => reqOut(d.data())),
      };
    },
    async sendRequest(toUid, toHandle, fromName, fromHandle) {
      const uid = me();
      await setDoc(doc(db, "requests", uid + "_" + toUid), reqOut({ from: uid, to: toUid, fromName, fromHandle, toHandle, createdAt: Date.now() }));
    },
    async cancelRequest(from, to) { await deleteDoc(doc(db, "requests", from + "_" + to)); },
    /** req = the incoming request; mine = my own {name, handle}. Both names are copied so friends with private profiles still show up. */
    async acceptRequest(req, mine) {
      const uid = me(), fromUid = req.from, meFirst = uid < fromUid, bt = writeBatch(db);
      const my = { h: String(mine.handle || "").slice(0, 20), n: String(mine.name || "").slice(0, 40) }, their = { h: String(req.fromHandle || "").slice(0, 20), n: String(req.fromName || "").slice(0, 40) };
      const [A, B] = meFirst ? [my, their] : [their, my];
      bt.set(doc(db, "friendships", pairId(uid, fromUid)), { a: meFirst ? uid : fromUid, b: meFirst ? fromUid : uid, ha: A.h, na: A.n, hb: B.h, nb: B.n, createdAt: Date.now() });
      bt.delete(doc(db, "requests", fromUid + "_" + uid));
      await bt.commit();
    },
    async removeFriend(uid2) { await deleteDoc(doc(db, "friendships", pairId(me(), uid2))); },

    // ------------------------------------------------ likes, comments and reposts on a post (= someone's seen title)
    async postStats(owner, key, col = "seen") {
      const uid = me(), base = ["users", owner, col, key];
      const [l, c] = await Promise.all([getDocs(query(collection(db, ...base, "likes"), limit(500))), getCountFromServer(collection(db, ...base, "comments"))]);
      return { likes: l.size, liked: l.docs.some((d) => d.id === uid), likers: l.docs.slice(0, 20).map((d) => d.data().name || ""), comments: c.data().count };
    },
    async setLike(owner, key, on, name, col = "seen") {
      const ref = doc(db, "users", owner, col, key, "likes", me());
      if (on) await setDoc(ref, { at: Date.now(), name: String(name || "").slice(0, 40) }); else await deleteDoc(ref);
    },
    async loadComments(owner, key, col = "seen") {
      const s = await getDocs(query(collection(db, "users", owner, col, key, "comments"), orderBy("at"), limitToLast(100)));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async addComment(owner, key, text, mine, col = "seen") {
      await addDoc(collection(db, "users", owner, col, key, "comments"), { from: me(), name: String(mine.name || "").slice(0, 40), handle: String(mine.handle || "").slice(0, 20), text: String(text).slice(0, 500), at: Date.now() });
    },
    async deleteComment(owner, key, id, col = "seen") { await deleteDoc(doc(db, "users", owner, col, key, "comments", id)); },
    // ---- photo / text posts
    async createPost(text, photo) { await addDoc(collection(db, "users", me(), "posts"), { text: String(text || "").slice(0, 1000), photo: photo || null, at: Date.now() }); },
    async deletePost(id) { await deleteDoc(doc(db, "users", me(), "posts", id)); },
    async myReposts() { const s = await getDocs(collection(db, "users", me(), "reposts")); return s.docs.map((d) => d.id); },
    async setRepost(owner, ownerName, ownerHandle, item, on) {
      const s = sanitizeItem(item), ref = doc(db, "users", me(), "reposts", owner + "_" + keyOf(s));
      if (!on) return deleteDoc(ref);
      const snap = { type: s.type, id: s.id, title: s.title, year: s.year || "", poster: s.poster || null, rating: s.rating || null, review: s.review || "", updatedAt: s.updatedAt };
      Object.keys(snap).forEach((k) => snap[k] === undefined && delete snap[k]);
      await setDoc(ref, { owner, ownerName: String(ownerName || "").slice(0, 40), ownerHandle: String(ownerHandle || "").slice(0, 20), item: snap, at: Date.now() });
    },

    // ------------------------------------------------ chat (friends only; chat id = friendship id)
    /** Live list of my chats: cb([{id, other, last:{text,from,at}, updatedAt, read}]). Returns unsubscribe. */
    watchChats(cb, onErr) {
      const uid = me();
      return onSnapshot(query(collection(db, "chats"), where("members", "array-contains", uid)), (s) => {
        cb(s.docs.map((d) => { const x = d.data(); return { id: d.id, other: (x.members || []).find((m) => m !== uid) || "", last: x.last || null, updatedAt: x.updatedAt || 0, read: x.read || {} }; }).sort((a, b) => b.updatedAt - a.updatedAt));
      }, onErr);
    },
    /** Live last 60 messages of the chat with a friend. */
    watchMessages(other, cb, onErr) {
      const cid = pairId(me(), other);
      return onSnapshot(query(collection(db, "chats", cid, "msgs"), orderBy("at"), limitToLast(60)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), onErr);
    },
    async sendMessage(other, text, share) {
      const uid = me(), cid = pairId(uid, other), at = Date.now(), members = [uid, other].sort();
      const msg = { from: uid, text: String(text || "").slice(0, 1000), at };
      if (share) msg.share = { type: share.type, id: share.id, title: String(share.title).slice(0, 200), year: String(share.year || "").slice(0, 4), poster: share.poster || null };
      const preview = msg.text || (share ? "“" + msg.share.title + "”" : "");
      await setDoc(doc(db, "chats", cid), { members, last: { text: preview.slice(0, 200), from: uid, at }, updatedAt: at, read: { [uid]: at } }, { merge: true });
      await addDoc(collection(db, "chats", cid, "msgs"), msg);
    },
    async markRead(other) {
      const uid = me(); try { await setDoc(doc(db, "chats", pairId(uid, other)), { read: { [uid]: Date.now() } }, { merge: true }); } catch (e) { /* chat may not exist yet */ }
    },

    async deleteAccount(handle) {
      const uid = me(), f = collection(db, "friendships"), r = collection(db, "requests");
      const lists = await Promise.all([getDocs(seenCol(uid)), getDocs(collection(db, "users", uid, "reposts")), getDocs(collection(db, "users", uid, "blocks")), getDocs(collection(db, "users", uid, "posts")), getDocs(query(f, where("a", "==", uid))), getDocs(query(f, where("b", "==", uid))), getDocs(query(r, where("to", "==", uid))), getDocs(query(r, where("from", "==", uid)))]);
      for (const l of lists) await deleteAll(l.docs);
      try {
        const chats = await getDocs(query(collection(db, "chats"), where("members", "array-contains", uid)));
        for (const c of chats.docs) { const mine = await getDocs(query(collection(db, "chats", c.id, "msgs"), where("from", "==", uid))); await deleteAll(mine.docs); }
      } catch (e) { console.warn("chats", e); }
      const b = writeBatch(db); if (handle) b.delete(doc(db, "handles", handle)); b.delete(userDoc(uid)); await b.commit();
      try { await deleteUser(auth.currentUser); }
      catch (e) { if (e.code === "auth/requires-recent-login") { await reauthenticateWithPopup(auth.currentUser, provider); await deleteUser(auth.currentUser); } else throw e; }
    },
  };
}
