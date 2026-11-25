// Tiny static server for tests: serves dist/audio-cdn over HTTP with HEAD support.
// Usage: node work/audio_cdn/serve.mjs <root> <port>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist/audio-cdn');
const port = Number(process.argv[3] || 18087);

const types = { '.mp3': 'audio/mpeg', '.json': 'application/json' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'audio-manifest.json' : urlPath.replace(/^\/+/, '');
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  const st = fs.statSync(file);
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
