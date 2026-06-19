// notes-config.js — PER PROJECT. Copy this to tools/notes/notes-config.js and fill in.
//
// The Firebase *web* config is NOT a secret (it ships to every browser); the site
// itself is password-gated by middleware.js, and Firestore access is controlled by
// firestore.rules. NEVER paste a service-account / Admin SDK private key here — that
// is a different, genuinely-secret artifact.

// 1) Firebase console -> Project settings -> Your apps -> "SDK setup and config" ->
//    pick "Config", and paste that whole `const firebaseConfig = { ... }` block here,
//    verbatim, over this one. (Extra fields like storageBucket/measurementId are fine.)
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// 2) A short id unique to THIS project. Lets you reuse ONE Firebase project across
//    repos without their notes mixing.
const siteId = "analogen";

// 3) authMode: "google" (sign in with a Google account to edit) or "anonymous"
//    (everyone past the site password edits). editors left EMPTY = any signed-in
//    Google account can edit. Add emails ONLY if you want to restrict (and then
//    tighten firestore.rules to match).
const authMode = "google";
const editors = [];

// --- wiring (leave as-is) ------------------------------------------------------
window.NOTES_CONFIG = { siteId, firebaseConfig, collection: "notes", authMode, editors };
