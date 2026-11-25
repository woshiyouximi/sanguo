// 校验 seqDirs 分段 + 逐技 ttl 的真实取值：直接调 dist 里的 buildFrame，
// 看每个 tick 到底画了哪个 atlas 文件、哪一帧（不依赖浏览器）。
import { readFileSync } from 'node:fs';
import { loadData } from '../game/src/data.ts';
import { cast, createWorld, fxTtlOf, step, TICK_HZ } from '../game/dist/core/battle.js';
import { buildFrame } from '../game/dist/view/battleView.js';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const index = JSON.parse(readFileSync('F:/sanguo/game/web/assets/fx/index.json', 'utf8'));

// 假的 FxAtlas：img 用文件名当标记，frames 用 index.json 的 list
const dirs = {};
for (const [id, meta] of Object.entries(index.dirs)) {
  dirs[id] = { img: meta.sheet, rot: meta.rot ?? 0, frames: meta.list.map(([x, y, w, h, ax, ay]) => ({ x, y, w, h, ax, ay })) };
}
const atlas = { map: index.map, dirs, seqDirs: index.seqDirs, life: index.tickLife, scale: 0.8 };

function frameIndexOf(dirId, cmd) {
  const list = dirs[dirId].frames;
  return list.findIndex((f) => f.x === cmd.sx && f.y === cmd.sy && f.w === cmd.sw && f.h === cmd.sh);
}

function probe(seq, age) {
  const world = createWorld({ data, seed: 7, a: { troop: 2 }, b: { troop: 10 } });
  for (let i = 0; i < 210 && !world.over; i++) step(world);
  const ttl = fxTtlOf(data, seq);
  const r = cast(world, 'A', seq, 34, 7, ttl);
  if (!r.ok) throw new Error(`cast ${seq} failed: ${r.reason}`);
  const fx = world.fx[world.fx.length - 1];
  fx.ttl = Math.max(1, ttl - age);
  const cmds = buildFrame(world, { fx: atlas, camX: 34 }).filter((c) => c.kind === 'sprite' && String(c.img).startsWith('atlas_'));
  const hits = [];
  for (const c of cmds) {
    const id = String(c.img).replace('atlas_', '').replace('.png', '');
    hits.push(`${id}#${frameIndexOf(id, c)}`);
  }
  return { ttl, t: (ttl - fx.ttl) / ttl, hits };
}

console.log('ttl: 104=' + fxTtlOf(data, 104) + ' 95=' + fxTtlOf(data, 95) + ' 44=' + fxTtlOf(data, 44) + ' 110=' + fxTtlOf(data, 110) + ' 24=' + fxTtlOf(data, 24));
console.log('\nseq 104 神鬼亂舞（57 tick；两段：004 到 0.154，然后 014）');
for (const age of [0, 2, 4, 6, 8, 9, 10, 12, 20, 30, 40, 50, 56]) {
  const p = probe(104, age);
  console.log(`  age=${String(age).padStart(2)} t=${p.t.toFixed(3)} -> ${p.hits.join(' + ') || '(空)'}`);
}
console.log('\nseq 95 劍輪舞（132 tick；038 占满 + 028 叠加）');
for (const age of [0, 33, 66, 99, 131]) {
  const p = probe(95, age);
  console.log(`  age=${String(age).padStart(3)} t=${p.t.toFixed(3)} -> ${p.hits.join(' + ') || '(空)'}`);
}
console.log('\nseq 44 天地無用（101 tick；三段接续 032→027→018）');
for (const age of [0, 17, 18, 50, 51, 100]) {
  const p = probe(44, age);
  console.log(`  age=${String(age).padStart(3)} t=${p.t.toFixed(3)} -> ${p.hits.join(' + ') || '(空)'}`);
}
console.log('\nseq 24 火雷爆（单目录回退，无 seqDirs）');
for (const age of [0, 6, 37, 74]) {
  const p = probe(24, age);
  console.log(`  age=${String(age).padStart(2)} t=${p.t.toFixed(3)} -> ${p.hits.join(' + ') || '(空)'}`);
}

// 无空窗：整条 life 每一 tick 都必须有画面（段间切换不闪白）
for (const seq of [104, 95, 44, 110]) {
  const ttl = fxTtlOf(data, seq);
  let holes = 0;
  for (let age = 0; age < ttl; age++) {
    const p = probe(seq, age);
    if (p.hits.length === 0) { holes++; if (holes <= 3) console.log(`  !! seq ${seq} age ${age} 无画面`); }
  }
  console.log(`空窗检查 seq=${seq}: ${holes} 个空 tick / ${ttl}`);
}


