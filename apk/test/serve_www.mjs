#!/usr/bin/env node
// [216_apk] 把 apk\assets\www 当成站点根起一个本地 http 服务——就是 APK 壳里 AssetServer 干的那件事
// （同一种源：http://127.0.0.1:<port>/，页面在站点根，data/ 与 dist/ 平铺在旁边）。
// 用来在没有真机的时候，用桌面浏览器验证「同一份 assets 在 http 源下能跑」。
//
//   node apk\test\serve_www.mjs [port] [root]
//
// 支持 Range（<audio> 要它），MIME 与 AssetServer 的 HttpUtil 保持一致。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2] || 5199);
const ROOT = path.resolve(process.argv[3] || 'F:\\sanguo\\apk\\assets\\www');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  if (rel === '/') rel = '/index.html';
  const abs = path.join(ROOT, rel);
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('403');
    return;
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
      return;
    }
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : st.size - Number(m[2]);
      let end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
      if (start < 0) start = 0;
      if (end >= st.size) end = st.size - 1;
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(abs, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}/`);
});
