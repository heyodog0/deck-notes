// notes.mjs — drop-in cloud sticky-notes + text boxes for reveal.js decks.
//
// REUSE: copy this file (+ notes-store.mjs) verbatim. Per-project you only edit
// notes-config.js.
//
// AUTH MODES (authMode in notes-config.js):
//   "google"     — sign in with a Google account to edit (optionally restrict via
//                  editors[] + firestore.rules). "anonymous" — everyone past the
//                  site password edits; author is a self-set display name.
//
// TWO NOTE TYPES: a text note (t) is transparent + always visible (slide content);
// a sticky note (a) collapses to a translucent icon when notes mode is off.
//
// Interaction:  N toggles notes mode · a = sticky · t = text box · click to place ·
//               type to edit · drag header to move · drag corner to resize · A−/A+
//               size · two swatches (fill + text color) · × delete (no confirm).

import { makeFirebaseStore } from "./notes-store.mjs";

const cfg = window.NOTES_CONFIG;
const DECK = window.NOTES_DECK || (location.pathname.replace(/[^a-z0-9]+/gi, "") || "deck");
const MODE = (cfg && cfg.authMode) || "google";
const EDITORS = (cfg && cfg.editors) || [];

if (!cfg || !cfg.firebaseConfig || cfg.firebaseConfig.apiKey === "REPLACE_ME") {
  console.warn("[notes] notes-config.js missing or unfilled — cloud notes disabled.");
}

const clamp = (v) => Math.max(1, Math.min(99, v));
const clampFs = (v) => Math.max(10, Math.min(60, v));
const slideAt = (i) => (window.Reveal ? Reveal.getSlides()[i] : null);

async function boot() {
  if (!cfg || !cfg.firebaseConfig || cfg.firebaseConfig.apiKey === "REPLACE_ME") return;

  let store;
  try { store = await makeFirebaseStore(cfg); }
  catch (e) { console.warn("[notes] Firebase init failed", e); return; }

  let user = null;
  let anonName = localStorage.getItem("notes.author") || "";
  let canEdit = false;
  let armMode = null;
  let pendingFocus = null;
  const els = new Map();

  const authBtn = document.createElement("button");
  authBtn.className = "note-auth";
  document.body.appendChild(authBtn);

  const myName = () => (MODE === "anonymous" ? (anonName || "anon") : (user ? user.name : "anon"));

  function paintAuth() {
    if (MODE === "anonymous") {
      authBtn.classList.add("in");
      authBtn.textContent = anonName ? `✎ ${anonName}` : "set your name";
    } else {
      authBtn.classList.toggle("in", !!user);
      authBtn.textContent = user ? `${user.name} · sign out` : "sign in with Google";
    }
  }
  authBtn.onclick = () => {
    if (MODE === "anonymous") {
      const n = prompt("Your name (shown on the notes you create):", anonName);
      if (n != null) { anonName = n.trim(); localStorage.setItem("notes.author", anonName); paintAuth(); }
    } else {
      user ? store.signOut() : store.signInGoogle().catch((e) => alert(e.message));
    }
  };

  store.onAuth((u) => {
    user = u;
    canEdit = MODE === "anonymous"
      ? !!u
      : !!u && (EDITORS.length === 0 || EDITORS.includes(u.email));
    paintAuth();
    rerenderEditable();
  });
  if (MODE === "anonymous") store.signInAnon().catch((e) =>
    console.warn("[notes] anon sign-in failed (enable Anonymous in Firebase?)", e));
  paintAuth();

  // --- realtime render (speaker docs are handled by the speaker window) -------
  store.subscribe(DECK, (notes) => {
    const seen = new Set();
    for (const n of notes) {
      if (n.type === "speaker") continue;
      seen.add(n.id);
      let el = els.get(n.id);
      if (!el) { el = makeNoteEl(n); els.set(n.id, el); }
      paintNote(el, n);
      const section = slideAt(n.slideIndex);
      if (section && el.parentElement !== section) section.appendChild(el);
    }
    for (const [id, el] of els) if (!seen.has(id)) { el.remove(); els.delete(id); }
    if (pendingFocus && els.has(pendingFocus)) {
      const el = els.get(pendingFocus);
      if (el.classList.contains("note-text")) {
        const b = el.querySelector(".note-body"); b && setTimeout(() => b.focus(), 0);
      } else if (!el.classList.contains("expanded")) {
        toggleExpand(el);                 // open the freshly-placed sticky to type
      }
      pendingFocus = null;
    }
  });

  function rerenderEditable() {
    for (const el of els.values()) {
      el.querySelector(".note-body").contentEditable = canEdit ? "true" : "false";
      el.classList.toggle("editable", canEdit);
    }
  }

  // remembered styling so a NEW note inherits your last colors/size (not yellow).
  const STYLE_KEY = "notes.lastStyle";
  let lastStyle = (() => { try { return JSON.parse(localStorage.getItem(STYLE_KEY)) || {}; } catch { return {}; } })();
  const rememberStyle = (p) => { lastStyle = { ...lastStyle, ...p }; localStorage.setItem(STYLE_KEY, JSON.stringify(lastStyle)); };

  function makeNoteEl(n) {
    const el = document.createElement("div");
    el.dataset.id = n.id;
    el.innerHTML =
      `<div class="note-icon" title="note"></div>` +
      `<div class="note-card">` +
        `<div class="note-head"><span class="note-tag"></span>` +
          `<span class="note-ctl">` +
            `<button class="note-fs" data-d="-1" title="smaller">A−</button>` +
            `<button class="note-fs" data-d="1" title="larger">A+</button>` +
            `<input class="note-color note-bg" type="color" title="fill color">` +
            `<input class="note-color note-fg" type="color" title="text color">` +
            `<button class="note-del" title="delete">×</button>` +
          `</span></div>` +
        `<div class="note-body"></div>` +
        `<div class="note-resize" title="resize"></div>` +
      `</div>`;
    const body = el.querySelector(".note-body");
    body.addEventListener("input", debounce(() => save(n.id, { text: body.innerHTML }), 600));
    body.addEventListener("blur", () => save(n.id, { text: body.innerHTML }));
    el.querySelectorAll(".note-fs").forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const v = clampFs((Number(el.dataset.fs) || 15) + 2 * Number(b.dataset.d));
      rememberStyle({ fontSize: v }); save(n.id, { fontSize: v });
    });
    el.querySelector(".note-bg").oninput = (e) => { rememberStyle({ bgColor: e.target.value }); save(n.id, { bgColor: e.target.value }); };
    el.querySelector(".note-fg").oninput = (e) => { rememberStyle({ textColor: e.target.value }); save(n.id, { textColor: e.target.value }); };
    el.querySelector(".note-del").onclick = (e) => { e.stopPropagation(); if (canEdit) store.remove(n.id); };
    enableIconInteract(el, n.id);                          // click = expand, drag = move
    enableDrag(el, el.querySelector(".note-head"), n.id);  // card header also drags
    enableResize(el, n.id);
    return el;
  }

  function paintNote(el, n) {
    const isText = n.type === "text";
    // classList toggles (NOT className=) so the .expanded state survives repaint
    el.classList.add("sticky", "note");
    el.classList.toggle("note-text", isText);
    el.classList.toggle("editable", canEdit);
    el.style.left = clamp(n.xPct) + "%";
    el.style.top = clamp(n.yPct) + "%";
    el.querySelector(".note-tag").textContent = n.tag || n.author || "";
    const body = el.querySelector(".note-body");
    if (document.activeElement !== body) body.innerHTML = n.text || "";
    body.contentEditable = canEdit ? "true" : "false";
    const fs = n.fontSize || (isText ? 28 : 15);
    el.dataset.fs = fs;
    body.style.fontSize = fs + "px";
    const bg = n.bgColor || (isText ? "" : "#f2c94c");   // sticky default = amber
    const fg = n.textColor || "#111111";
    el.style.setProperty("--note-bg", bg || "transparent");
    body.style.color = fg;
    const bgi = el.querySelector(".note-bg");
    if (bgi && document.activeElement !== bgi) bgi.value = n.bgColor || "#f2c94c";
    const fgi = el.querySelector(".note-fg");
    if (fgi && document.activeElement !== fgi) fgi.value = fg;
    const card = el.querySelector(".note-card");
    card.style.width = n.width ? n.width + "px" : "";
    card.style.height = n.height ? n.height + "px" : "";
  }

  const save = (id, patch) => canEdit && store.upsert({ id, deck: DECK, ...patch });

  function collapseAll(except) {
    document.querySelectorAll(".note.expanded").forEach((o) => { if (o !== except) o.classList.remove("expanded"); });
  }
  function toggleExpand(el) {
    const open = el.classList.contains("expanded");
    collapseAll(el);
    el.classList.toggle("expanded", !open);
    if (!open && canEdit) { const b = el.querySelector(".note-body"); b && setTimeout(() => b.focus(), 0); }
  }
  // clicking outside any note collapses open sticky cards
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".note")) collapseAll(null); });

  // --- placement -------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.activeElement && document.activeElement.isContentEditable) return;
    if (e.key === "a" || e.key === "t") {
      if (!canEdit) { authBtn.classList.add("nudge"); setTimeout(() => authBtn.classList.remove("nudge"), 600); return; }
      armMode = e.key === "a" ? "sticky" : "text";
      document.body.classList.add("note-arming", "show-sticky");
    } else if (e.key === "Escape") {
      armMode = null; document.body.classList.remove("note-arming");
    }
  });

  document.addEventListener("click", async (e) => {
    if (!armMode) return;
    const section = e.target.closest(".slides section");
    if (!section) return;
    e.preventDefault(); e.stopPropagation();
    if (MODE === "anonymous" && !anonName) {
      const n = prompt("Your name (shown on the notes you create):", "");
      if (n != null) { anonName = n.trim(); localStorage.setItem("notes.author", anonName); paintAuth(); }
    }
    const rect = section.getBoundingClientRect();
    const note = {
      deck: DECK, slideIndex: Reveal.getSlides().indexOf(section),
      xPct: clamp((e.clientX - rect.left) / rect.width * 100),
      yPct: clamp((e.clientY - rect.top) / rect.height * 100),
      type: armMode, tag: armMode === "sticky" ? "NOTE" : "",
      text: "", author: myName(),
      bgColor: lastStyle.bgColor || "#f2c94c",
      textColor: lastStyle.textColor || "#111111",
      fontSize: lastStyle.fontSize || (armMode === "text" ? 28 : 15),
    };
    armMode = null; document.body.classList.remove("note-arming");
    pendingFocus = await store.upsert(note);
  }, true);

  // grab-offset reposition of the whole note via a handle element
  function dragFrom(el, handle, id, isDrag) {
    handle.addEventListener("pointerdown", (e) => {
      if (handle.classList.contains("note-ctl") || (e.target.closest && e.target.closest(".note-ctl"))) return;
      e.preventDefault();
      const parent = el.parentElement.getBoundingClientRect();
      const nr = el.getBoundingClientRect();
      const gX = e.clientX - nr.left, gY = e.clientY - nr.top;
      const sX = e.clientX, sY = e.clientY;
      let moved = false;
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - sX, ev.clientY - sY) > 4) moved = true;
        if (moved && canEdit) {
          el.style.left = clamp((ev.clientX - gX - parent.left) / parent.width * 100) + "%";
          el.style.top = clamp((ev.clientY - gY - parent.top) / parent.height * 100) + "%";
        }
      };
      const up = (ev) => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        if (moved && canEdit) {
          save(id, {
            xPct: clamp((ev.clientX - gX - parent.left) / parent.width * 100),
            yPct: clamp((ev.clientY - gY - parent.top) / parent.height * 100),
          });
        } else if (isDrag === false) {     // icon: a click (not a drag) toggles the card
          toggleExpand(el);
        }
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }
  function enableIconInteract(el, id) { dragFrom(el, el.querySelector(".note-icon"), id, false); }
  function enableDrag(el, handle, id) { dragFrom(el, handle, id, true); }

  function enableResize(el, id) {
    el.querySelector(".note-resize").addEventListener("pointerdown", (e) => {
      if (!canEdit) return;
      e.preventDefault(); e.stopPropagation();
      const card = el.querySelector(".note-card");
      const r = card.getBoundingClientRect();
      const scale = r.width / card.offsetWidth || 1;   // reveal scales the slide
      const sX = e.clientX, sY = e.clientY, sW = card.offsetWidth, sH = card.offsetHeight;
      const move = (ev) => {
        card.style.width = Math.max(120, sW + (ev.clientX - sX) / scale) + "px";
        card.style.height = Math.max(60, sH + (ev.clientY - sY) / scale) + "px";
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        save(id, { width: Math.round(card.offsetWidth), height: Math.round(card.offsetHeight) });
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
