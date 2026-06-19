#!/usr/bin/env node
// deck-notes: build ONE project's slides into a static, gated archive.
//
// Run from your project root (the repo holding slides/):
//   node <deck-notes>/build.mjs   (flags: --slides --figs --out --title --notes-config)
//
//   ./slides/*.html      reveal.js decks (one file = one deck)
//   ./slides/figs/...     assets referenced as src="figs/..."
//   ./slides/decks.json   OPTIONAL [{file,slug,title,date}] hub order/meta
//   ./notes-config.js     OPTIONAL Firebase config -> enables cloud notes
//
// For a HUB across MANY projects, use hub.mjs instead. Deploy: see README.
import { readFileSync, writeFileSync, rmSync, existsSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { readDecks, injectShell, processDeckAssets, listPage, freshOut, copyNotes, writeVercelAndMiddleware } from './lib.mjs';

const FRAMEWORK = dirname(fileURLToPath(import.meta.url));
const PROJECT = process.cwd();
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SLIDES = resolve(PROJECT, flag('--slides', 'slides'));
const FIGS = resolve(PROJECT, flag('--figs', join(flag('--slides', 'slides'), 'figs')));
const OUT = resolve(PROJECT, flag('--out', 'dist/pages'));
const TITLE = flag('--title', 'Deck archive');
const NOTES_CONFIG = resolve(PROJECT, flag('--notes-config', 'notes-config.js'));

if (!existsSync(SLIDES)) { console.error(`No slides dir: ${SLIDES}`); process.exit(1); }
const DECKS = readDecks(SLIDES);

freshOut(OUT, rmSync);
const notesEnabled = existsSync(NOTES_CONFIG);
if (notesEnabled) { copyNotes(join(FRAMEWORK, 'src'), OUT, NOTES_CONFIG); console.log('  cloud notes: ENABLED'); }
else console.log('  cloud notes: disabled (no notes-config.js)');

const seen = new Set();
for (const d of DECKS) {
  const p = join(SLIDES, d.src);
  if (!existsSync(p)) { console.error(`MISSING deck: ${p}`); process.exit(1); }
  let html = readFileSync(p, 'utf8');
  ({ html } = processDeckAssets(html, FIGS, join(OUT, 'figs'), seen, d.src));
  html = injectShell(html, { deckId: d.slug, notesEnabled, homeHref: '/' });
  writeFileSync(join(OUT, `${d.slug}.html`), html);
  console.log(`  ${d.src} -> ${d.slug}.html`);
}
writeFileSync(join(OUT, 'index.html'), listPage(TITLE, DECKS.map(d => ({ href: d.slug, label: d.title, date: d.date }))));
writeVercelAndMiddleware(OUT, TITLE);
console.log(`Built ${OUT}  (${DECKS.length} decks)`);
console.log(`Deploy: vercel --prod --yes --cwd dist/pages  (set SITE_PASSWORD)`);
