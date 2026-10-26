// Firebase wrapper (Auth with Google + Firestore). Loaded only when firebase-config.js has a config.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, query, where, documentId, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
      return { profile: fromDoc(p), items: s.docs.map((d) => d.data()) };
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
    /** Profile card if the rules let me read it, otherwise null. */
    async peek(uid) { try { return fromDoc(await getDoc(userDoc(uid))); } catch (e) { return null; } },
    async loadProfile(uid) {
      let p;
      try { p = await getDoc(userDoc(uid)); } catch (e) { throw Object.assign(new Error("private"), { code: "private" }); }
      if (!p.exists()) throw Object.assign(new Error("private"), { code: "private" });
      let s;
      try { s = await getDocs(seenCol(uid)); } catch (e) { throw Object.assign(new Error("private"), { code: "private" }); }
      return { profile: fromDoc(p), items: s.docs.map((d) => d.data()) };
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

    async deleteAccount(handle) {
      const uid = me(), f = collection(db, "friendships"), r = collection(db, "requests");
      const lists = await Promise.all([getDocs(seenCol(uid)), getDocs(query(f, where("a", "==", uid))), getDocs(query(f, where("b", "==", uid))), getDocs(query(r, where("to", "==", uid))), getDocs(query(r, where("from", "==", uid)))]);
      for (const l of lists) await deleteAll(l.docs);
      const b = writeBatch(db); if (handle) b.delete(doc(db, "handles", handle)); b.delete(userDoc(uid)); await b.commit();
      try { await deleteUser(auth.currentUser); }
      catch (e) { if (e.code === "auth/requires-recent-login") { await reauthenticateWithPopup(auth.currentUser, provider); await deleteUser(auth.currentUser); } else throw e; }
    },
  };
}
