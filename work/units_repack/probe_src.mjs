// 一次性探针：看 units.json 的格式/结构，重排脚本按这个口径生成。
import { readFileSync } from 'node:fs';

const p = 'F:/sanguo/game/web/anim/units.json';
const raw = readFileSync(p, 'utf8');
console.log('head', JSON.stringify(raw.slice(0, 240)));
console.log('tail', JSON.stringify(raw.slice(-140)));
console.log('bytes', Buffer.byteLength(raw), 'crlf', /\r/.test(raw),
  'indent1', /^\{\n "/.test(raw), 'indent2', /^\{\n {2}"/.test(raw), 'trailingNL', raw.endsWith('\n'));
const j = JSON.parse(raw);
console.log('top', Object.keys(j));
console.log('meta', JSON.stringify(j.meta));
console.log('groups', Object.keys(j.groups).length, JSON.stringify(j.groups.archer).slice(0, 260));
const sp = j.pages[0].sprites;
console.log('sprites', sp.length, 'first', JSON.stringify(sp[0]), 'last', JSON.stringify(sp.at(-1)));
console.log('page keys', Object.keys(j.pages[0]));
// 组 -> 帧名归属
const groups = j.groups;
const owner = new Map();
for (const [g, v] of Object.entries(groups)) {
  if (Array.isArray(v)) continue;
  for (const k of ['back', 'front', 'attack', 'attackEnemy']) {
    for (const n of v[k] ?? []) {
      if (owner.has(n)) throw new Error('帧名重复归属 ' + n);
      owner.set(n, g);
    }
  }
}
const orphans = sp.filter((s) => !owner.has(s.name)).map((s) => s.name);
console.log('owner count', owner.size, 'orphans', orphans.length, orphans.slice(0, 5));
