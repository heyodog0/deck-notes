// notes-store.mjs — the ONLY backend-specific code. Both the deck UI (notes.mjs)
// and the speaker window (speaker.mjs) import makeFirebaseStore from here, so to
// self-host (e.g. PocketBase) you replace just this file with an adapter exposing
// the same shape: { onAuth, signInGoogle, signInAnon, signOut, subscribe, upsert, remove }.

const V = "https://www.gstatic.com/firebasejs/10.12.0";

export const deckKey = (d) => String(d || "").replace(/[^a-z0-9]+/gi, "");

export async function makeFirebaseStore(cfg) {
  const { initializeApp } = await import(`${V}/firebase-app.js`);
  const F = await import(`${V}/firebase-firestore.js`);
  const A = await import(`${V}/firebase-auth.js`);

  const app = initializeApp(cfg.firebaseConfig);
  const db = F.getFirestore(app);
  const auth = A.getAuth(app);
  const col = F.collection(db, cfg.collection || "notes");
  const provider = new A.GoogleAuthProvider();

  return {
    onAuth(cb) {
      A.onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, email: u.email, name: u.displayName || u.email } : null));
    },
    signInGoogle() { return A.signInWithPopup(auth, provider); },
    signInAnon() { return A.signInAnonymously(auth); },
    signOut() { return A.signOut(auth); },
    subscribe(deck, cb) {
      const q = F.query(col, F.where("siteId", "==", cfg.siteId), F.where("deck", "==", deck));
      return F.onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.warn("[notes] subscribe error", err));
    },
    async upsert(note) {
      const id = note.id ||
        `${cfg.siteId}_${deckKey(note.deck)}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const ref = F.doc(col, id);
      const { id: _drop, ...body } = note;
      await F.setDoc(ref, { ...body, id, siteId: cfg.siteId, updatedAt: F.serverTimestamp() }, { merge: true });
      return id;
    },
    async remove(id) { await F.deleteDoc(F.doc(col, id)); },
  };
}
