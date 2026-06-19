// lib.mjs — shared pieces for build.mjs (single project) and hub.mjs (hub of hubs).
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { dirname, resolve, join, basename } from 'path';

export const REVEAL = 'https://cdn.jsdelivr.net/npm/reveal.js@4.6.1';
const REVEAL_CORE = `<script src="${REVEAL}/dist/reveal.js"></script>`;

// --- deck discovery --------------------------------------------------------
export const mkSlug = (f) => basename(f, '.html').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

export function readDecks(slidesDir) {
  const titleOf = (f) => ((readFileSync(join(slidesDir, f), 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1] || basename(f, '.html')).trim();
  const manifest = join(slidesDir, 'decks.json');
  if (existsSync(manifest)) {
    return JSON.parse(readFileSync(manifest, 'utf8')).map((d) => ({
      src: d.file, slug: d.slug || mkSlug(d.file), title: d.title || titleOf(d.file),
      date: d.date || '', status: d.status || 'archived',
    }));
  }
  return readdirSync(slidesDir).filter((f) => f.endsWith('.html')).sort().map((f, i) => ({
    src: f, slug: mkSlug(f), title: titleOf(f), date: '', status: i === 0 ? 'current' : 'archived',
  }));
}

// --- injected archive shell -------------------------------------------------
export const SHELL_HEAD = `
<!-- archive shell (injected by deck-notes) -->
<style>
  .archive-nav {
    position: fixed; top: 12px; left: 14px; z-index: 60; display: none;
    font: 600 13px/1 var(--mono-font, monospace); color: #555; text-decoration: none;
    background: rgba(255,255,255,0.85); padding: 5px 10px; border: 1px solid #ddd; border-radius: 6px;
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
    letter-spacing: 0.08em; text-transform: uppercase; color: #9a7b00; margin-bottom: 6px;
  }
  body.show-sticky .sticky { display: block; }

  /* --- cloud notes (notes.mjs): Zotero-style icon + expandable card --- */
  .sticky.note { position: absolute; display: block; background: none; border: none;
    box-shadow: none; transform: none; padding: 0; max-width: none; overflow: visible; }
  .sticky.note::before { display: none; }
  .note-icon {
    position: relative; width: 22px; height: 22px; cursor: pointer;
    background: var(--note-bg, #f2c94c); border: 1.5px solid rgba(0,0,0,0.4);
    border-radius: 3px; box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .note-icon::before {
    content: ""; position: absolute; left: -1px; bottom: -1px; width: 9px; height: 9px;
    background: #fff; border-top: 1.5px solid rgba(0,0,0,0.4); border-right: 1.5px solid rgba(0,0,0,0.4);
    clip-path: polygon(0 0, 100% 100%, 0 100%);
  }
  .note.note-text .note-icon { display: none; }
  .note.expanded .note-icon { outline: 2px dashed #3b82f6; outline-offset: 3px; }
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
  .note-fs, .note-del { border: 0; background: transparent; cursor: pointer; color: #555; line-height: 1; padding: 0 2px; }
  .note-fs { font: 700 11px/1 var(--mono-font, monospace); }
  .note-del { font-size: 15px; opacity: 0.5; }
  .note-fs:hover, .note-del:hover { opacity: 1; color: #000; }
  .note-color { width: 18px; height: 15px; padding: 0; border: 1px solid #bbb; border-radius: 3px; background: none; cursor: pointer; }
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

const HINT_AND_TOGGLE = `
<div class="sticky-hint">N notes &middot; a sticky &middot; t text</div>
<script>
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'n' || e.key === 'N') document.body.classList.toggle('show-sticky');
  });
</script>
`;

// Inject the shell. deckId = window.NOTES_DECK (namespaced "project/slug" in hub
// mode). homeHref = where "<- archive" points. notes.mjs/config are loaded with
// ABSOLUTE paths so they work at any nesting depth.
export function injectShell(html, { deckId, notesEnabled, homeHref = '/' }) {
  if (!html.includes('keyboard: { 78: null }')) {
    html = html.replace('Reveal.initialize({', 'Reveal.initialize({\n    keyboard: { 78: null },');
  }
  html = html.replace('</head>', `${SHELL_HEAD}</head>`);
  const notesTag = notesEnabled
    ? `<script>window.NOTES_DECK=${JSON.stringify(deckId)};</script>\n` +
      `<script src="/notes-config.js"></script>\n` +
      `<script type="module" src="/notes.mjs"></script>\n`
    : '';
  const nav = `\n<a class="archive-nav" href="${homeHref}">&larr; archive</a>`;
  html = html.replace('</body>', `${nav}${HINT_AND_TOGGLE}${notesTag}</body>`);
  return html;
}

// Copy figs/... assets a deck references into outFigsDir; rewrite ../figs/ -> figs/.
export function processDeckAssets(html, figsSrcDir, outFigsDir, seen, label) {
  const refs = [...html.matchAll(/(?:src|data-sprite)="(?:\.\.\/)?figs\/([^"]+)"/g)].map(m => m[1]);
  for (const rel of [...new Set(refs)]) {
    const srcPath = join(figsSrcDir, rel);
    if (!existsSync(srcPath)) { console.error(`MISSING asset for ${label}: ${srcPath}`); process.exit(1); }
    if (!seen.has(srcPath)) {
      const dstPath = join(outFigsDir, rel);
      mkdirSync(dirname(dstPath), { recursive: true });
      copyFileSync(srcPath, dstPath);
      seen.add(srcPath);
    }
  }
  return { html: html.replace(/\.\.\/figs\//g, 'figs/'), nRefs: new Set(refs).size };
}

// Minimal list page (used for the deck hub and per-project sub-hubs).
// items: [{ href, label, date }]
export function listPage(title, items) {
  const lis = items.map(it =>
    `      <li><a href="${it.href}">${it.label}</a><span class="date">${it.date || ''}</span></li>`
  ).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  :root { --fg: #111; --muted: #999; --accent: #0a52a1;
    --body-font: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    --mono-font: "SFMono-Regular", Menlo, Consolas, monospace; }
  * { box-sizing: border-box; }
  body { background: #fff; color: var(--fg); font-family: var(--body-font); margin: 0; padding: 12vh 7vw; }
  .wrap { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 1.6em; letter-spacing: -0.01em; margin: 0 0 1.4em; font-weight: 700; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
       padding: 13px 0; border-top: 1px solid #eee; }
  li:last-child { border-bottom: 1px solid #eee; }
  li a { color: var(--fg); text-decoration: none; font-size: 1.05em; }
  li a:hover { color: var(--accent); }
  .date { font-family: var(--mono-font); font-size: 0.8em; color: var(--muted); white-space: nowrap; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <ul>
${lis}
    </ul>
  </div>
</body>
</html>
`;
}

// Wipe OUT but preserve the Vercel project link (.vercel/project.json).
export function freshOut(OUT, rmSync) {
  let saved = null;
  const link = join(OUT, '.vercel', 'project.json');
  if (existsSync(link)) saved = readFileSync(link, 'utf8');
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  if (saved) { mkdirSync(join(OUT, '.vercel'), { recursive: true }); writeFileSync(link, saved); }
}

export function copyNotes(frameworkSrc, OUT, notesConfigPath) {
  for (const f of ['notes.mjs', 'notes-store.mjs']) copyFileSync(join(frameworkSrc, f), join(OUT, f));
  copyFileSync(notesConfigPath, join(OUT, 'notes-config.js'));
}

export function writeVercelAndMiddleware(OUT, title) {
  const vercelJson = {
    $schema: 'https://openapi.vercel.sh/vercel.json', framework: null,
    trailingSlash: true, cleanUrls: true,
    headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' }] }],
  };
  writeFileSync(join(OUT, 'vercel.json'), JSON.stringify(vercelJson, null, 2));
  const middleware = `// Vercel Edge Middleware: HTTP Basic Auth gate. Set SITE_PASSWORD in the Vercel
// dashboard to rotate without a commit. Generated by deck-notes.
export const config = { matcher: '/:path*' };
const REALM = ${JSON.stringify(title)};
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
    headers: { 'WWW-Authenticate': \`Basic realm="\${REALM}", charset="UTF-8"\`, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
`;
  writeFileSync(join(OUT, 'middleware.js'), middleware);
}
