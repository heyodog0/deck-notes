# deck-notes

Turn a folder of [reveal.js](https://revealjs.com) decks into a static, deployable
**archive** where you (and collaborators) can drop **sticky + text notes directly
onto the slides** — synced live via Firebase, no backend to run.

```
slides/*.html  ──build──▶  dist/pages/  ──▶  Vercel (password-gated, noindex)
                            hub + one page per deck + injected notes layer
```

---

## For Claude: authoring a compatible deck

A deck is a **plain reveal.js HTML file** in `slides/`. Follow this contract and the
build handles the rest (it injects the notes layer, hub, and key bindings — you do
**not** add any notes/Firebase code):

1. One `.html` file per deck in `slides/`. Copy `template/deck.html` as a starting point.
2. Each slide is a top-level `<section>` inside `.reveal > .slides`.
3. Reference images as `src="figs/NAME.png"` and put the file in `slides/figs/NAME.png`.
4. Keep a normal `Reveal.initialize({ ... })` block — the build edits it in place.
5. Do **not** hand-write sticky notes, Firebase, or an `<aside class="notes">`; the
   notes system is injected and stored in the cloud.

Optional `slides/decks.json` controls hub order + metadata:
```json
[{ "file": "intro.html", "title": "Intro", "date": "2026", "status": "current",
   "summary": "one-liner" }]
```
Without it, decks are every `*.html` (alphabetical); the first is badged "current".

---

## Build · preview · deploy

Run from your **project root** (the repo holding `slides/`):

```bash
node <path>/deck-notes/build.mjs            # -> dist/pages/   (flags: --slides --figs --out --title)
node <path>/deck-notes/serve.mjs            # preview at http://localhost:8099  (clean URLs)
vercel --prod --yes --cwd dist/pages        # deploy; then set SITE_PASSWORD in Vercel
```

The whole site is gated by HTTP Basic Auth (`middleware.js`, user `archive`,
password from `SITE_PASSWORD`). Pages are `noindex`.

---

## Hub of hubs — one gated site for many projects

Instead of a Vercel project per repo, aggregate every project's decks into ONE
gated site with `hub.mjs`. Make a `hub.config.json`:

```json
{
  "title": "ryan · decks",
  "notesConfig": "../analogen/notes-config.js",
  "projects": [
    { "name": "analogen", "title": "analogen",
      "slides": "../analogen/outputs/slides", "figs": "../analogen/outputs/figs" }
  ]
}
```
```bash
node <deck-notes>/hub.mjs        # -> dist/pages/  (paths resolve from the config file)
node <deck-notes>/serve.mjs      # preview
```
Output: `/` lists projects, `/<project>/` lists that project's decks, `/<project>/<slug>`
is each deck. One shared Firebase; notes are namespaced `<project>/<slug>`. Add a
project = one line in `hub.config.json`. Deploy the single `dist/pages` to one
Vercel project; point a subdomain (e.g. `decks.you.com`) at it.

## Cloud notes (Firebase) — optional

If `notes-config.js` exists at the project root, notes are enabled. Web config is
**not** a secret (it ships to browsers); security is in `firestore.rules`.

1. Firebase console → new project → **Web app** → copy the `firebaseConfig`.
2. Enable **Firestore** and an auth provider: **Google** (sign-in to edit) or
   **Anonymous** (everyone past the site password edits).
3. `cp notes-config.example.js notes-config.js`, paste the config, set `siteId`
   and `authMode` (`"google"` | `"anonymous"`).
4. Publish `firestore.rules` (Firebase → Firestore → Rules).

Reuse across projects: same `firebaseConfig`, a different `siteId` per repo.

## Notes controls
`N` notes mode · `a` sticky (folded-corner icon → click to open the card) ·
`t` text note (always-visible slide content) · click a slide to place · drag the
icon/header to move · corner grip to resize · `A−`/`A+` size · two swatches
(fill + text color) · `×` delete · sign-in button bottom-right.

## Files
`build.mjs` · `serve.mjs` · `src/notes.mjs` (deck UI) · `src/notes-store.mjs`
(**the only backend code** — swap this one file to self-host, e.g. PocketBase) ·
`notes-config.example.js` · `firestore.rules` · `template/`.
