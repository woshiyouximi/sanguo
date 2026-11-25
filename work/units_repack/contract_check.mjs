// 消费者契约自检：模拟 game/web/main.js:539-575 的 loadUnits() 与 Cocos BattleRoot 的取用方式，
// 只读不写。跑法：node work/units_repack/contract_check.mjs
//   · pages[0].sprites 必须是 572 条、每条 x/y/w/h 都是整数且落页内（main.js 只读这 4 个字段）
//   · pages[0].file 必须是 units_00.png，PNG IHDR 尺寸必须等于 pages[0].w/h（soldiers.test.ts:256）
//   · meta.page_size 必须等于 [pages[0].w, pages[0].h]，meta.count 等于帧数
//   · groups 13 组，每组 back/front 12 条、attack/attackEnemy 10 条、hold 4 —— 帧名都必须能在页里找到
//   · 所有 (x,y,w,h) 矩形互不相同（units.test.ts 的 nameOfRect 反查据此成立）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const WEB = path.join(ROOT, 'game', 'web', 'anim');
const COCOS = path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'anim');

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); return ok; };

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') throw new Error('not png: ' + file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const webJson = path.join(WEB, 'units.json');
const j = JSON.parse(fs.readFileSync(webJson, 'utf8'));
const pg = j.pages && j.pages[0];
check(!!pg, 'pages[0] 缺失');
check(Array.isArray(pg.sprites), 'pages[0].sprites 不是数组');
check(pg.sprites.length === j.meta.count, `sprites ${pg.sprites.length} != meta.count ${j.meta.count}`);
check(pg.file === 'units_00.png', `pages[0].file = ${pg.file}`);

const png = pngSize(path.join(WEB, pg.file));
check(png.w === pg.w && png.h === pg.h, `PNG ${png.w}x${png.h} != json ${pg.w}x${pg.h}`);
check(String([pg.w, pg.h]) === String(j.meta.page_size), `meta.page_size ${j.meta.page_size} != [${pg.w},${pg.h}]`);
check(Math.max(pg.w, pg.h) <= 2048, `页尺寸 ${pg.w}x${pg.h} 超 2048`);

const frames = new Map();
const rects = new Set();
for (const sp of pg.sprites) {
  check(typeof sp.name === 'string' && sp.name.length > 0, '帧缺 name');
  check([sp.x, sp.y, sp.w, sp.h].every((v) => Number.isInteger(v)), `${sp.name} 坐标不是整数`);
  check(sp.x >= 0 && sp.y >= 0 && sp.x + sp.w <= pg.w && sp.y + sp.h <= pg.h, `${sp.name} 越页`);
  check(!frames.has(sp.name), `帧名重复 ${sp.name}`);
  const key = `${sp.x},${sp.y},${sp.w},${sp.h}`;
  check(!rects.has(key), `矩形重复 ${key}（${sp.name}）`);
  rects.add(key);
  frames.set(sp.name, sp);
}

const GROUPS = ['podao', 'changqiang', 'dadao', 'archer', 'lianchui', 'feidao', 'wudou',
  'manzu', 'tiechui', 'tengjia', 'huangjin', 'nu', 'nvbing'];
check(Object.keys(j.groups).length === 13, `groups 数量 ${Object.keys(j.groups).length}`);
GROUPS.forEach((g, i) => {
  const grp = j.groups[g];
  check(!!grp, `缺组 ${g}`);
  check(grp.troop === i, `${g}.troop=${grp.troop} 期望 ${i}`);
  check(grp.back.length === 12 && grp.front.length === 12, `${g} back/front 不是 12`);
  check(grp.attack.length === 10 && grp.attackEnemy.length === 10, `${g} attack/attackEnemy 不是 10`);
  check(grp.hold === 4, `${g}.hold=${grp.hold}`);
  for (const nm of [...grp.back, ...grp.front, ...grp.attack, ...grp.attackEnemy]) {
    check(frames.has(nm), `${g} 的帧 ${nm} 不在页里`);
  }
});

// Cocos 侧必须与 web 逐字节相同（同一份资产喂两边）
for (const f of ['units.json', 'units_00.png']) {
  const a = sha(path.join(WEB, f));
  const b = sha(path.join(COCOS, f));
  check(a === b, `cocos ${f} 与 web 不一致`);
}

console.log(`[contract] web 页 ${pg.w}x${pg.h}, ${pg.sprites.length} 帧, png ${png.bytes} B, sha ${sha(path.join(WEB, pg.file)).slice(0, 12)}`);
console.log(`[contract] groups ${Object.keys(j.groups).length}, 矩形唯一 ${rects.size}/${pg.sprites.length}, cocos 镜像一致`);
if (fails.length) {
  console.error(`[contract] FAIL ${fails.length} 条`);
  for (const m of fails.slice(0, 10)) console.error('  - ' + m);
  process.exit(1);
}
console.log('[contract] OK');
