/**
 * 只为取证用的静态服务器：把 `game/cocos-build/web-mobile` 原样端出来，但**在内存里**
 * 把 Creator Babel 降级坏掉的两处 spread 改回 Array.from：
 *   [].concat(m.values())   → Array.from(m.values())     （ItemsModel.allItems）
 *   [].concat(this.bag)     → Array.from(this.bag)       （ItemsPanel.persist）
 * 构建产物一个字都不改（那是 lead 的活），本脚本也不写盘。
 *
 *   node serve_fixed.mjs [port]
 * 默认 5187。用法见 steps_items_fixed.mjs。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'F:/sanguo/game/cocos-build/web-mobile';
const PORT = Number(process.argv[2] || 5187);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.plist': 'text/xml; charset=utf-8',
  '.xml': 'text/xml; charset=utf-8',
  '.atlas': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const patches = [
  // 注意：构建产物里是 `return[].concat(m.values())`（return 与 [ 之间没有空格），
  // 只替换 `[].concat(...)` 会拼出 `returnArray.from(...)` —— 这里把 `return` 一起换掉。
  ['return[].concat(m.values())', 'return Array.from(m.values())'],
  ['[].concat(this.bag)', 'Array.from(this.bag)'],
];
const stats = new Map(patches.map(([bad]) => [bad, 0]));

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(path.resolve(ROOT))) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    if (ext === '.js') {
      let text = body.toString('utf8');
      for (const [bad, good] of patches) {
        const n = text.split(bad).length - 1;
        if (n > 0) {
          text = text.split(bad).join(good);
          stats.set(bad, stats.get(bad) + n);
          console.log(`patched ${bad} → ${good} x${n} in ${rel}`);
        }
      }
      body = Buffer.from(text, 'utf8');
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err && err.stack ? err.stack : err));
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`serve_fixed: http://127.0.0.1:${PORT}/index.html  root=${ROOT}`));
process.on('SIGINT', () => {
  console.log('patch counts:', JSON.stringify(Array.from(stats)));
  server.close(() => process.exit(0));
});
