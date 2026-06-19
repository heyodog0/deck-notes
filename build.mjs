#!/usr/bin/env node
// deck-notes: build a static reveal.js deck ARCHIVE with inline cloud notes.
//
// Run from your PROJECT root (the repo holding your slides):
//   node <path-to-deck-notes>/build.mjs        (or: npm run build)
//
// Convention (override with flags):
//   ./slides/*.html      - your reveal.js decks (one file = one deck)
//   ./slides/figs/...     - assets decks reference as src="figs/..."
//   ./slides/decks.json   - OPTIONAL [{file,title,date,summary,status}] hub order/meta
//   ./notes-config.js     - OPTIONAL Firebase config -> enables cloud notes
//
// Writes ./dist/pages/: index.html (hub) + <slug>.html per deck + figs/ +
// vercel.json + middleware.js, with the notes shell injected into every deck.
//
// Flags: --slides <dir> --figs <dir> --out <dir> --title "<t>" --notes-config <file>
// Deploy: vercel --prod --yes --cwd dist/pages   (set SITE_PASSWORD in Vercel)

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { dirname, resolve, join, basename } from 'path';
import { fileURLToPath } from 'url';

const FRAMEWORK = dirname(fileURLToPath(import.meta.url));   // this repo (notes source)
const PROJECT = process.cwd();                              // the project being built

const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const SLIDES_REL = flag('--slides', 'slides');
const SLIDES = resolve(PROJECT, SLIDES_REL);
const FIGS = resolve(PROJECT, flag('--figs', join(SLIDES_REL, 'figs')));
const OUT = resolve(PROJECT, flag('--out', 'dist/pages'));
const ARCHIVE_TITLE = flag('--title', 'Deck archive');
const NOTES_DIR = join(FRAMEWORK, 'src');
const NOTES_CONFIG = resolve(PROJECT, flag('--notes-config', 'notes-config.js'));

if (!existsSync(SLIDES)) { console.error(`No slides dir: ${SLIDES}`); process.exit(1); }

// Decks: from slides/decks.json if present, else every *.html (alphabetical).
const mkSlug = (f) => basename(f, '.html').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const titleOf = (f) => ((readFileSync(join(SLIDES, f), 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1] || basename(f, '.html')).trim();
const manifest = join(SLIDES, 'decks.json');
let DECKS;
if (existsSync(manifest)) {
  DECKS = JSON.parse(readFileSync(manifest, 'utf8')).map((d) => ({
    src: d.file, slug: d.slug || mkSlug(d.file), title: d.title || titleOf(d.file),
    date: d.date || '', summary: d.summary || '', status: d.status || 'archived',
  }));
} else {
  DECKS = readdirSync(SLIDES).filter((f) => f.endsWith('.html')).sort().map((f, i) => ({
    src: f, slug: mkSlug(f), title: titleOf(f), date: '', summary: '',
    status: i === 0 ? 'current' : 'archived',
  }));
}

// ---------------------------------------------------------------------------
// Shared archive shell, injected into every deck at build time.
// ---------------------------------------------------------------------------
const REVEAL = 'https://cdn.jsdelivr.net/npm/reveal.js@4.6.1';
const REVEAL_CORE = `<script src="${REVEAL}/dist/reveal.js"></script>`;

const SHELL_HEAD = `
<!-- archive shell (injected by build-pages.mjs) -->
<style>
  /* chrome (archive nav + sign-in) is hidden for a clean preview; press N to
     enter notes/editing mode and it appears alongside the notes. */
  .archive-nav {
    position: fixed; top: 12px; left: 14px; z-index: 60; display: none;
    font: 600 13px/1 var(--mono-font, monospace);
    color: #555; text-decoration: none;
    background: rgba(255,255,255,0.85);
    padding: 5px 10px; border: 1px solid #ddd; border-radius: 6px;
  }
  .archive-nav:hover { color: #111; border-color: #999; }
  body.show-sticky .archive-nav { display: block; }
  .note-auth { display: none; }
  body.show-sticky .note-auth { display: inline-block; }
  .sticky-hint {
    position: fixed; bottom: 10px; left: 14px; z-index: 60;
    font: 600 11px/1 var(--mono-font, monospace); color: #bbb;
    pointer-events: none; transition: color 0.15s;
  }
  body.show-sticky .sticky-hint { color: #9a7b00; }
  /* author-in-source sticky notes: hidden until you press N */
  .sticky {
    position: absolute; max-width: 300px; z-index: 50; display: none;
    background: #fff7b0; color: #222; text-align: left;
    font: 500 16px/1.4 var(--body-font, sans-serif);
    padding: 12px 15px; border: 1px solid #ecdf86; border-radius: 3px;
    box-shadow: 2px 4px 12px rgba(0,0,0,0.22); transform: rotate(-1.4deg);
  }
  .sticky::before {
    content: attr(data-tag); display: block;
    font: 700 10px/1 var(--mono-font, monospace);
    letter-spacing: 0.08em; text-transform: uppercase;
    color: #9a7b00; margin-bottom: 6px;
  }
  body.show-sticky .sticky { display: block; }

  /* --- cloud notes (notes.mjs): Zotero-style icon + expandable card --- */
  .sticky.note { position: absolute; display: block; background: none; border: none;
    box-shadow: none; transform: none; padding: 0; max-width: none; overflow: visible; }
  .sticky.note::before { display: none; }

  /* folded-corner icon (sticky only); fill reflects the note's color */
  .note-icon {
    position: relative; width: 22px; height: 22px; cursor: pointer;
    background: var(--note-bg, #f2c94c); border: 1.5px solid rgba(0,0,0,0.4);
    border-radius: 3px; box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .note-icon::before {            /* turned-up bottom-left corner */
    content: ""; position: absolute; left: -1px; bottom: -1px; width: 9px; height: 9px;
    background: #fff; border-top: 1.5px solid rgba(0,0,0,0.4); border-right: 1.5px solid rgba(0,0,0,0.4);
    clip-path: polygon(0 0, 100% 100%, 0 100%);
  }
  .note.note-text .note-icon { display: none; }
  .note.expanded .note-icon { outline: 2px dashed #3b82f6; outline-offset: 3px; }

  /* card: popover for stickies (hidden until expanded); inline for text notes */
  .note-card {
    display: none; position: absolute; top: calc(100% + 9px); left: -3px;
    width: 260px; flex-direction: column; overflow: hidden; text-align: left;
    background: var(--note-bg, #fff7b0); border: 1px solid rgba(0,0,0,0.18);
    border-radius: 6px; box-shadow: 0 8px 26px rgba(0,0,0,0.25); z-index: 60;
  }
  .note.expanded .note-card { display: flex; }
  .note.note-text .note-card {
    display: flex; position: static; width: 240px; background: transparent;
    border: 1px dashed transparent; box-shadow: none; overflow: visible;
  }
  body.show-sticky .note.note-text.editable .note-card { border-color: #cdd6e0; }

  .note-head {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 5px 8px 4px; cursor: grab; background: rgba(0,0,0,0.08); flex: 0 0 auto;
    font: 700 10px/1.2 var(--mono-font, monospace);
    text-transform: uppercase; letter-spacing: 0.06em; color: #555;
  }
  .note-head:active { cursor: grabbing; }
  .note-tag { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .note-ctl { display: none; align-items: center; gap: 3px; }
  .note.editable .note-ctl { display: inline-flex; }
  .note-fs, .note-del { border: 0; background: transparent; cursor: pointer;
    color: #555; line-height: 1; padding: 0 2px; }
  .note-fs { font: 700 11px/1 var(--mono-font, monospace); }
  .note-del { font-size: 15px; opacity: 0.5; }
  .note-fs:hover, .note-del:hover { opacity: 1; color: #000; }
  .note-color { width: 18px; height: 15px; padding: 0; border: 1px solid #bbb;
    border-radius: 3px; background: none; cursor: pointer; }
  .note-color::-webkit-color-swatch-wrapper { padding: 0; }
  .note-color::-webkit-color-swatch { border: none; border-radius: 2px; }
  .note-body { padding: 10px 13px 12px; min-width: 70px; min-height: 1.4em; outline: none;
    overflow: auto; flex: 1 1 auto; font: 500 15px/1.45 var(--body-font, sans-serif); color: #222; }
  .note.editable .note-body:empty::before { content: "type\\2026"; color: #9a8a3a; }
  .note-resize { position: absolute; right: 2px; bottom: 2px; width: 14px; height: 14px;
    cursor: nwse-resize; display: none;
    background: linear-gradient(135deg, transparent 45%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0.28) 55%, transparent 55%); }
  .note.expanded.editable .note-resize { display: block; }
  body.show-sticky .note.note-text.editable .note-resize { display: block; }
  /* text notes: no head chrome until you hover in notes mode */
  .note.note-text .note-head { background: transparent; opacity: 0; transition: opacity 0.15s; }
  body.show-sticky .note.note-text:hover .note-head { opacity: 0.7; }
  .note-auth {
    position: fixed; bottom: 10px; right: 14px; z-index: 60; cursor: pointer;
    font: 600 12px/1 var(--mono-font, monospace); color: #555;
    background: rgba(255,255,255,0.9); border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px;
  }
  .note-auth.in { color: var(--ok, #1a6b3a); border-color: #bcd9c4; }
  .note-auth.nudge { animation: note-nudge 0.3s 2; }
  @keyframes note-nudge { 50% { transform: translateX(-3px); } }
  body.note-arming, body.note-arming .reveal { cursor: crosshair; }
</style>
`;

const SHELL_BODY = `
<!-- archive shell (injected by build-pages.mjs) -->
<a class="archive-nav" href="/">&larr; archive</a>
<div class="sticky-hint">N notes &middot; a sticky &middot; t text</div>
<script>
  // Toggle notes mode with N (reveal's N is unbound at init). Ignore the keypress
  // while typing inside a note / speaker dock / input so it doesn't toggle off.
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'n' || e.key === 'N') document.body.classList.toggle('show-sticky');
  });
</script>
`;

function injectShell(html, slug, notesEnabled) {
  // 1. Free the 'N' key (reveal binds it to "next") so Shift+N can toggle notes.
  //    Speaker notes use our own editable window (speaker.mjs, opened on S), so
  //    reveal's read-only notes plugin is intentionally NOT loaded.
  if (!html.includes('keyboard: { 78: null }')) {
    html = html.replace('Reveal.initialize({',
      'Reveal.initialize({\n    keyboard: { 78: null },');
  }
  // 3. shared CSS + nav + sticky toggle
  html = html.replace('</head>', `${SHELL_HEAD}</head>`);
  // 4. cloud notes loader (only when notes-config.js is present)
  const notesTag = notesEnabled
    ? `<script>window.NOTES_DECK=${JSON.stringify(slug)};</script>\n` +
      `<script src="notes-config.js"></script>\n` +
      `<script type="module" src="notes.mjs"></script>\n`
    : '';
  html = html.replace('</body>', `${SHELL_BODY}${notesTag}</body>`);
  return html;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
// Preserve the Vercel project link (dist/pages/.vercel) across the wipe.
let savedVercel = null;
const vercelLink = join(OUT, '.vercel', 'project.json');
if (existsSync(vercelLink)) savedVercel = readFileSync(vercelLink, 'utf8');

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

if (savedVercel) {
  mkdirSync(join(OUT, '.vercel'), { recursive: true });
  writeFileSync(vercelLink, savedVercel);
}

// Cloud notes are enabled only when a filled-in notes-config.js exists.
const notesEnabled = existsSync(NOTES_CONFIG);
if (notesEnabled) {
  for (const f of ['notes.mjs', 'notes-store.mjs']) {
    copyFileSync(join(NOTES_DIR, f), join(OUT, f));
  }
  copyFileSync(NOTES_CONFIG, join(OUT, 'notes-config.js'));
  console.log('  cloud notes: ENABLED (notes.mjs + notes-store.mjs bundled)');
} else {
  console.log('  cloud notes: disabled (no ./notes-config.js)');
}

let totalAssets = 0;
const seenAssets = new Set();
for (const deck of DECKS) {
  const deckPath = join(SLIDES, deck.src);
  if (!existsSync(deckPath)) {
    console.error(`MISSING deck: ${deckPath}`);
    process.exit(1);
  }
  let html = readFileSync(deckPath, 'utf8');

  // Copy every figs/... asset this deck references (src= and data-sprite=,
  // with optional ../ prefix) into the shared dist/pages/figs/ tree.
  const refs = [...html.matchAll(/(?:src|data-sprite)="(?:\.\.\/)?figs\/([^"]+)"/g)].map(m => m[1]);
  for (const rel of [...new Set(refs)]) {
    const srcPath = join(FIGS, rel);
    if (!existsSync(srcPath)) {
      console.error(`MISSING asset for ${deck.src}: ${srcPath}`);
      process.exit(1);
    }
    if (!seenAssets.has(rel)) {
      const dstPath = join(OUT, 'figs', rel);
      mkdirSync(dirname(dstPath), { recursive: true });
      copyFileSync(srcPath, dstPath);
      seenAssets.add(rel);
      totalAssets++;
    }
  }
  html = html.replace(/\.\.\/figs\//g, 'figs/');
  html = injectShell(html, deck.slug, notesEnabled);

  const outPath = join(OUT, `${deck.slug}.html`);
  writeFileSync(outPath, html);
  console.log(`  ${deck.src} -> ${deck.slug}.html  (${new Set(refs).size} refs)`);
}

// --- archive hub (index.html) ---
const cards = DECKS.map(d => {
  const badge = d.status === 'current'
    ? '<span class="badge current">current</span>'
    : '<span class="badge">archived</span>';
  return `      <a class="card" href="${d.slug}">
        <div class="card-head"><span class="card-title">${d.title}</span>${badge}</div>
        <div class="card-date">${d.date}</div>
        <div class="card-summary">${d.summary}</div>
      </a>`;
}).join('\n');

const hub = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ARCHIVE_TITLE}</title>
<style>
  :root {
    --fg: #111; --muted: #666; --accent: #0a52a1; --ok: #1a6b3a;
    --body-font: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    --mono-font: "SFMono-Regular", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { background: #fafafa; color: var(--fg); font-family: var(--body-font);
         margin: 0; padding: 8vh 6vw; }
  .wrap { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 2.2em; letter-spacing: -0.02em; margin: 0 0 0.15em; }
  .lede { color: var(--muted); font-size: 1.05em; margin: 0 0 2.2em; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 680px) { .grid { grid-template-columns: 1fr; } }
  .card { display: block; text-decoration: none; color: inherit;
          background: #fff; border: 1px solid #e3e3e3; border-radius: 10px;
          padding: 20px 22px; transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s; }
  .card:hover { border-color: #b9c7d8; transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.07); }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .card-title { font-size: 1.25em; font-weight: 700; letter-spacing: -0.01em; }
  .card-date { font-family: var(--mono-font); font-size: 0.78em; color: var(--muted); margin-top: 2px; }
  .card-summary { margin-top: 10px; line-height: 1.45; color: #333; font-size: 0.96em; }
  .badge { font-family: var(--mono-font); font-size: 0.66em; text-transform: uppercase;
           letter-spacing: 0.07em; color: var(--muted); background: #f0f0f0;
           padding: 3px 7px; border-radius: 20px; }
  .badge.current { color: #fff; background: var(--ok); }
  footer { color: #aaa; font-size: 0.8em; margin-top: 3em; font-family: var(--mono-font); }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${ARCHIVE_TITLE}</h1>
    <p class="lede">Open a deck, then press <b>N</b> for notes mode &mdash; drop
       sticky (<b>a</b>) and text (<b>t</b>) notes right onto the slides.</p>
    <div class="grid">
${cards}
    </div>
    <footer>${DECKS.length} decks &middot; static archive &middot; noindex</footer>
  </div>
</body>
</html>
`;
writeFileSync(join(OUT, 'index.html'), hub);

// --- vercel.json: noindex, static, clean URLs ---
const vercelJson = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  trailingSlash: true,
  cleanUrls: true,
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
      ],
    },
  ],
};
writeFileSync(join(OUT, 'vercel.json'), JSON.stringify(vercelJson, null, 2));

// --- middleware.js: HTTP Basic Auth gate (mirrors node-gym/middleware.js) ---
// Password from SITE_PASSWORD in the Vercel dashboard; literal fallback for
// local/first deploy. This is the human gate; Firestore writes are separately
// guarded by Firestore rules (see firestore.rules).
const middleware = `// Vercel Edge Middleware: HTTP Basic Auth gate for the deck archive.
// Set SITE_PASSWORD in the Vercel dashboard (Project -> Settings -> Environment
// Variables) to rotate without a commit. Generated by deck-notes build.mjs.

export const config = { matcher: '/:path*' };

const REALM = ${JSON.stringify(ARCHIVE_TITLE)};
const USERNAME = 'archive';

export default function middleware(req) {
  const password = process.env.SITE_PASSWORD || 'changeme123';
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(':');
      if (decoded.slice(0, idx) === USERNAME && decoded.slice(idx + 1) === password) return;
    } catch {}
  }
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': \`Basic realm="\${REALM}", charset="UTF-8"\`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
`;
writeFileSync(join(OUT, 'middleware.js'), middleware);

console.log(`Built ${OUT}`);
console.log(`  index.html (hub) + ${DECKS.length} decks + ${totalAssets} assets + vercel.json + middleware.js`);
console.log(`  password gate: set SITE_PASSWORD in Vercel (user "archive", fallback "changeme123")`);
console.log(`Deploy:  vercel --prod --yes --cwd dist/pages`);
