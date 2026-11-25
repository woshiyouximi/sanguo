// 极简静态服务（零依赖）：把 web-mobile 构建产物挂到 http://127.0.0.1:<port>/
//   node work\audio_local\serve.mjs [root] [port]
// 默认 root=F:\sanguo\game\cocos-build\web-mobile, port=5199
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'F:\\sanguo\\game\\cocos-build\\web-mobile');
const PORT = Number(process.argv[3] || 5199);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream',
  '.cconb': 'application/octet-stream',
  '.plist': 'text/xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(ROOT, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404).end('not found: ' + url);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(file).pipe(res);
  });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('serving ' + ROOT + ' → http://127.0.0.1:' + PORT + '/');
});
