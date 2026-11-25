import fs from 'node:fs';
const g = JSON.parse(fs.readFileSync('F:/sanguo/game/data/garrison.json', 'utf8'));
const sc = JSON.parse(fs.readFileSync('F:/sanguo/game/data/scenarios.json', 'utf8'));
const s = sc[0];
const cities = Array.isArray(s) ? s[0].cities : s.cities;
const owners = new Set();
for (const [n, c] of Object.entries(g['0'].cities)) owners.add(c.owner);
console.log('owner 種類:', [...owners].length);
console.log([...owners].sort().join(' | '));
const kingSet = new Set(cities.map((c) => c.KING));
console.log('cities KING:', [...kingSet].map((x) => JSON.stringify(x)).join(' '));
// 兩者交集/差集
const o = new Set([...owners].filter(Boolean));
const k = new Set(cities.map((c) => c.KING).filter(Boolean).map(String));
console.log('owner 但非 KING:', [...o].filter((x) => !k.has(x)));
console.log('KING 但非 owner:', [...k].filter((x) => !o.has(x)));
console.log('前 5 城:', cities.slice(0, 5).map((c) => `${c.NAME}(KING=${JSON.stringify(c.KING)},MAJOR=${c.MAJOR})`).join(' , '));
const sample = ['建業', '陸口', '下邳', '許昌', '洛陽'];
for (const n of sample) {
  const gc = g['0'].cities[n];
  const cc = cities.find((c) => c.NAME === n);
  console.log(n, 'owner=', JSON.stringify(gc && gc.owner), 'major=', gc && gc.major, '| KING=', cc && JSON.stringify(cc.KING), 'MAJOR=', cc && cc.MAJOR);
}
