/**
 * 30 行静态服务器：把 game/ 目录当作站点根。
 *
 * 用法：
 *   node web/serve.mjs            # http://127.0.0.1:5173/web/
 *   node web/serve.mjs 8080       # 换端口
 *
 * 之所以要起服务器：index.html 用 ES module + fetch 读 ../data/*.json，
 * 浏览器不允许 file:// 下的 module / fetch，所以不能双击打开。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = normalize(join(ROOT, pathname));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403).end('403');
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + pathname);
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('500 ' + String(err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`sanguo preview: http://${HOST}:${PORT}/web/`);
  console.log(`root: ${ROOT}`);
});
