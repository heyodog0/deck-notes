#!/usr/bin/env node
// deck-notes HUB OF HUBS: build many projects' slides into ONE gated archive.
//
// Run from a hub dir containing hub.config.json:
//   { "title": "...", "notesConfig": "<path>",
//     "projects": [ { "name": "analogen", "title": "analogen",
//                     "slides": "../analogen/outputs/slides",
//                     "figs": "../analogen/outputs/figs" } ] }
// Paths resolve relative to the config file. Writes ./dist/pages/:
//   /                  hub of hubs (list of projects)
//   /<project>/         per-project deck list
//   /<project>/<slug>   each deck   (+ /<project>/figs/)
// One shared Firebase (notesConfig); notes are namespaced "<project>/<slug>".
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { readDecks, injectShell, processDeckAssets, listPage, freshOut, copyNotes, writeVercelAndMiddleware } from './lib.mjs';

const FRAMEWORK = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const CFG = resolve(process.cwd(), flag('--config', 'hub.config.json'));
if (!existsSync(CFG)) { console.error(`No hub config: ${CFG}`); process.exit(1); }
const cfgDir = dirname(CFG);
const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
const TITLE = cfg.title || 'Decks';
const OUT = resolve(process.cwd(), flag('--out', 'dist/pages'));
const NOTES_CONFIG = cfg.notesConfig ? resolve(cfgDir, cfg.notesConfig) : null;

freshOut(OUT, rmSync);
const notesEnabled = !!(NOTES_CONFIG && existsSync(NOTES_CONFIG));
if (notesEnabled) { copyNotes(join(FRAMEWORK, 'src'), OUT, NOTES_CONFIG); console.log('  cloud notes: ENABLED (shared)'); }
else console.log('  cloud notes: disabled');

const projItems = [];
for (const proj of cfg.projects) {
  const slides = resolve(cfgDir, proj.slides);
  const figs = resolve(cfgDir, proj.figs || join(proj.slides, 'figs'));
  if (!existsSync(slides)) { console.error(`project ${proj.name}: no slides dir ${slides}`); process.exit(1); }
  const decks = readDecks(slides);
  const seen = new Set();
  const projOut = join(OUT, proj.name);
  mkdirSync(projOut, { recursive: true });
  for (const d of decks) {
    const p = join(slides, d.src);
    if (!existsSync(p)) { console.error(`MISSING deck: ${p}`); process.exit(1); }
    let html = readFileSync(p, 'utf8');
    ({ html } = processDeckAssets(html, figs, join(projOut, 'figs'), seen, `${proj.name}/${d.src}`, `/${proj.name}`));
    html = injectShell(html, { deckId: `${proj.name}/${d.slug}`, notesEnabled, homeHref: `/${proj.name}/` });
    writeFileSync(join(projOut, `${d.slug}.html`), html);
  }
  writeFileSync(join(projOut, 'index.html'),
    listPage(proj.title || proj.name, decks.map(d => ({ href: `/${proj.name}/${d.slug}`, label: d.title, date: d.date }))));
  projItems.push({ href: `/${proj.name}/`, label: proj.title || proj.name, date: `${decks.length} deck${decks.length === 1 ? '' : 's'}` });
  console.log(`  ${proj.name}: ${decks.length} decks`);
}
writeFileSync(join(OUT, 'index.html'), listPage(TITLE, projItems));
writeVercelAndMiddleware(OUT, TITLE);
console.log(`Built ${OUT}  (${cfg.projects.length} projects)`);
console.log(`Deploy: vercel --prod --yes --cwd ${flag('--out', 'dist/pages')}  (set SITE_PASSWORD)`);
