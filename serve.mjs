// Local preview server for the built archive, mimicking Vercel's cleanUrls:
//   /v7  ->  v7.html        (extensionless fallback)   /  ->  index.html
// Run from your project root:  node <deck-notes>/serve.mjs [port]
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';

const ROOT = resolve(process.cwd(), 'dist', 'pages');
const PORT = Number(process.argv[2]) || 8099;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2',
};

function resolvePath(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/') return join(ROOT, 'index.html');
  const direct = join(ROOT, p);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  if (existsSync(direct) && statSync(direct).isDirectory()) {
    const idx = join(direct, 'index.html');
    if (existsSync(idx)) return idx;
  }
  const html = direct.replace(/\/$/, '') + '.html';     // cleanUrls fallback
  if (existsSync(html)) return html;
  return null;
}

createServer(async (req, res) => {
  const file = resolvePath(req.url);
  if (!file) { res.writeHead(404).end('Not found'); return; }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(500).end('Server error');
  }
}).listen(PORT, () => {
  // Dual-stack listen so BOTH localhost (v4/v6) and 127.0.0.1 connect. Use the
  // localhost URL with Firebase Auth — it pre-authorizes "localhost" but not
  // "127.0.0.1" (auth/unauthorized-domain).
  console.log(`preview (cleanUrls) -> http://localhost:${PORT}/  serving ${ROOT}`);
});
