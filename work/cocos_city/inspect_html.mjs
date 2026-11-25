import fs from 'node:fs';
const s = fs.readFileSync('F:/sanguo/game/web/city.html', 'utf8');
console.log('len', s.length);
const ids = [...s.matchAll(/id="([^"]+)"/g)].map((x) => x[1]);
console.log('IDS(' + ids.length + '):', ids.join(' '));
// 找出 <script> 里的函数定义
const scripts = [...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
console.log('scripts', scripts.length, scripts.map((x) => x.length).join(','));
for (const sc of scripts) {
  const fns = [...sc.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)].map((x) => x[1]);
  const consts = [...sc.matchAll(/const\s+([A-Z][A-Z0-9_]{2,})\s*=/g)].map((x) => x[1]);
  console.log('fns:', fns.join(' '));
  console.log('consts:', consts.join(' '));
}
