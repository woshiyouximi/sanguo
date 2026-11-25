// 极简静态服务器：node serve.mjs <port> <root>
// 不打印日志（后台 job 的 stderr 管道会断，python http.server 会因此挂掉）。
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2] || 8899);
const root = normalize(process.argv[3] || process.cwd());

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream',
  '.mem': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(root, url === '/' ? '/index.html' : url);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const st = statSync(file);
    if (st.isDirectory()) file = join(file, 'index.html');
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + url);
    return;
  }
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  // 允许跨域：验证「远程 bundle 从另一个域名(CDN)加载」
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}/`);
});
