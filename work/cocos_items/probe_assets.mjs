// 一次性探针：确认 face / items / hero 资源与数据表的形状，供 panel_layout.md 与报告引用。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const RES = path.join(ROOT, 'game/cocos/assets/bundles/res');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const items = readJson(path.join(RES, 'data/items.json'));
const generals = readJson(path.join(RES, 'data/generals.json'));

const byType = {};
for (const it of items) byType[it.TYPE] = (byType[it.TYPE] ?? 0) + 1;
const amulet = items.filter((it) => it.TYPE === 'JEWEL_MISC' && Number(it.Loyal) > 0).length;
const talisman = items.filter((it) => it.TYPE === 'JEWEL_MISC' && Number(it.Force) > 0).length;
const formation = items.filter((it) => it.TYPE === 'JEWEL_MISC' && Number(it.Battle) > 0).length;

console.log('items', items.length, JSON.stringify(byType), 'amulet', amulet, 'talisman', talisman, 'formation', formation);
console.log('equippable(expected 55) =', byType.JEWEL_WEAPON + byType.JEWEL_HORSE + byType.JEWEL_THING + amulet);

const src = fs.readFileSync(path.join(ROOT, 'game/web/face_map.js'), 'utf8');
const m = src.match(/var FULL = \{([\s\S]*?)\n  \};/);
const entries = [...m[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map((x) => [x[1], x[2]]);
console.log('face_map entries', entries.length, 'unique names', new Set(entries.map((e) => e[0])).size);
console.log('sample', JSON.stringify(entries.slice(0, 3)), JSON.stringify(entries.slice(-3)));

// 与 generals.json 的 FACE 字段比对（原作两处编号是否一致）
const faceMap = new Map(entries);
let same = 0;
let diff = 0;
let noFace = 0;
const diffs = [];
for (const g of generals) {
  if (!g.FACE) { noFace += 1; continue; }
  const n = faceMap.get(g.NAME);
  if (n === g.FACE) same += 1;
  else { diff += 1; if (diffs.length < 5) diffs.push([g.NAME, g.FACE, n]); }
}
console.log('generals', generals.length, 'FACE == face_map:', same, 'diff:', diff, 'no FACE:', noFace, JSON.stringify(diffs));
const missingInFaceMap = generals.filter((g) => !faceMap.has(g.NAME)).map((g) => g.NAME);
console.log('generals not in face_map', missingInFaceMap.length, JSON.stringify(missingInFaceMap.slice(0, 10)));

// 抽查回落链资源是否真实存在
const probe = ['關羽', '張飛', '曹操', '呂布', '貂蟬'];
for (const name of probe) {
  const n = faceMap.get(name);
  const full = path.join(RES, 'face/full', `${n}.webp`);
  const thumb = path.join(RES, 'face/thumb', `${n}.webp`);
  const hero = path.join(RES, 'hero', `${name}.webp`);
  console.log(`portrait ${name} #${n} full=${fs.existsSync(full)} thumb=${fs.existsSync(thumb)} hero=${fs.existsSync(hero)}`);
}

// items 图：Sprite 形如 "JEWEL\\BOOK01" → 取 basename + .png
const stems = new Set(items.map((it) => String(it.Sprite).split(/[\\/]/).pop()));
const missingIcons = [...stems].filter((s) => !fs.existsSync(path.join(RES, 'items', `${s}.png`)));
console.log('item icon stems', stems.size, 'missing png', missingIcons.length, JSON.stringify(missingIcons));
