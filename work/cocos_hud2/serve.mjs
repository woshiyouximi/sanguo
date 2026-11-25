// 极简静态服务（零依赖）：把某个目录挂到 http://127.0.0.1:<port>/，给 cdpweb 打开
// 自己那份 Cocos 构建产物用（不碰别人正在写的 game/cocos-build）。
//
//   node work\cocos_hud2\serve.mjs [root] [port]
//   → 默认 root=F:\sanguo\work\cocos_hud2\cocos-build, port=5191
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'F:\\sanguo\\work\\cocos_hud2\\cocos-build');
const PORT = Number(process.argv[3] || 5191);
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
