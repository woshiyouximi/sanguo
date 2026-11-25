// 只读取证探针 3：**攻击帧到底由什么驱动**
//   Case 1：不下任何指令（原作缺省=待機，全员站着）→ 统计 buildFrame 里画出的「攻击序列帧」数量
//           以及这些单位是否真的出过手（lastAttackTick == null）。若 >0 ⇒ 攻击帧与「出手」解耦。
//   Case 2：接战互殴 → 找挨打的一方（B 侧），看它挨打后画的是哪一帧（有没有受击帧）。
//   Case 3：A 侧士兵阵亡窗口内画的是哪一帧（death_back 是否来自 actions 图集而非兵种图集）。
// 跑法： node F:\sanguo\work\anim_fix\probe_swing.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const proj = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { projectUnit } = proj;

const unitsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const actionsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/actions.json'), 'utf8'));
const frames = {};
for (const sp of unitsJson.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
const groups = {};
for (const [k, g] of Object.entries(unitsJson.groups)) {
  if (Array.isArray(g)) { groups[k] = g.slice(); continue; }
  const o = {};
  for (const kk of ['back', 'front', 'attack', 'attackEnemy']) if (Array.isArray(g[kk])) o[kk] = g[kk].slice();
  if (typeof g.hold === 'number') o.hold = g.hold;
  groups[k] = o;
}
const SENT = { toString: () => '<units_00.png>' };
const unitsAtlas = { img: SENT, imgEnemy: SENT, frames, groups };
const animSel = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const { actionAtlas } = animSel;
const aframes = {};
for (const page of actionsJson.pages) for (const sp of page.sprites) aframes[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
actionAtlas.img = { toString: () => '<actions_00.png>' };
actionAtlas.frames = aframes;

const rect2name = new Map();
for (const [n, r] of Object.entries(frames)) rect2name.set(`${r.x},${r.y},${r.w},${r.h}`, n);
for (const [n, r] of Object.entries(aframes)) { const k = `${r.x},${r.y},${r.w},${r.h}`; if (!rect2name.has(k)) rect2name.set(k, n); }
const nameOf = (c) => rect2name.get(`${c.sx},${c.sy},${c.sw},${c.sh}`) ?? `?${c.sw}x${c.sh}`;
const isAtk = (n) => /_atk_|attack|eatk/.test(n ?? '');
const isHit = (n) => /hit_|death_/.test(n ?? '');

function mkWorld(withOrders) {
  const data = loadData({ dir: path.join(GAME, 'data') });
  return createWorld({
    data, seed: 7,
    a: { soldiers: 60, general: { name: '張角', str: 56, int: 95, level: 45 } },
    b: { soldiers: 60, general: { name: '關羽', str: 97, int: 75, level: 40 } },
    aiSides: { A: false, B: false },
  });
}
const opts = { mode: 'fighting', units: unitsAtlas, skills: [] };

// ---------- Case 1：全员待機（不出手） ----------
{
  const world = mkWorld(false);
  const hits = [];
  for (let t = 0; t < 240; t += 1) {
    step(world);
    if (t % 20 !== 0) continue;
    const camX = camera(world).x ?? camera(world);
    const cmds = buildFrame(world, { ...opts, camX });
    for (const c of cmds) {
      if (c.kind !== 'sprite') continue;
      const n = nameOf(c);
      if (!isAtk(n)) continue;
      // 反查是哪个单位画的
      const u = world.units.find((x) => x.alive && Math.abs(projectUnit(x.x, x.y, camX).sx - c.x) < 0.6 &&
        Math.abs(projectUnit(x.x, x.y, camX).sy + 26 * projectUnit(x.x, x.y, camX).scale - c.y) < 0.6);
      hits.push({ tick: world.tick, name: n, side: u?.side, cd: u?.cd, lat: u ? (u.lastAttackTick ?? null) : 'no-unit' });
    }
  }
  const total = hits.length;
  const never = hits.filter((h) => h.lat === null).length;
  console.log('=== Case 1：不下指令（待機），240 tick ===');
  console.log('  world.stats.attacksA/B =', world.stats.attacksA, world.stats.attacksB);
  console.log('  画出的攻击序列帧总数 =', total, ' 其中「本单位从没出过手」=', never,
    `(${total ? Math.round((never / total) * 100) : 0}%)`);
  console.log('  样例：', JSON.stringify(hits.slice(0, 6)));
  fs.writeFileSync(path.join(HERE, 'case1_idle_attack_frames.json'), JSON.stringify({ total, never, samples: hits.slice(0, 40) }, null, 1), 'utf8');
}

// ---------- Case 2：接战，看 B 侧挨打 / A 侧阵亡画什么 ----------
{
  const world = mkWorld(true);
  const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
  installArmyOrders(world);
  for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }
  const bHitDraw = [];
  const aDeathDraw = [];
  let hitB = 0, deadA = 0;
  for (let t = 0; t < 900; t += 1) {
    const before = new Map(world.units.map((u) => [u, { alive: u.alive }]));
    step(world);
    for (const u of world.units) {
      const b = before.get(u);
      if (!b) continue;
      if (b.alive && !u.alive && u.side === 'B') hitB += 1;
      if (b.alive && !u.alive && u.side === 'A') deadA += 1;
    }
    if (t % 5 !== 0) continue;
    const camX = camera(world).x ?? camera(world);
    const cmds = buildFrame(world, { ...opts, camX });
    for (const c of cmds) {
      if (c.kind !== 'sprite') continue;
      const n = nameOf(c);
      const u = world.units.find((x) => {
        const p = projectUnit(x.x, x.y, camX);
        return Math.abs(p.sx - c.x) < 0.6 && Math.abs(p.sy + 26 * p.scale - c.y) < 0.6;
      });
      if (!u) continue;
      if (!u.alive && u.side === 'B') bHitDraw.push({ tick: world.tick, name: n });
      if (!u.alive && u.side === 'A') aDeathDraw.push({ tick: world.tick, name: n, since: world.tick - (u.lastHitTick ?? 0) });
      // B 侧活着但刚挨打（<16 tick）
      if (u.alive && u.side === 'B' && u.lastHitTick != null && world.tick - u.lastHitTick < 16) bHitDraw.push({ tick: world.tick, name: n, live: true });
    }
  }
  const cnt = (arr) => arr.reduce((m, x) => { const k = x.live ? 'B活-hit:' + x.name : (x.name || '?'); m[k] = (m[k] || 0) + 1; return m; }, {});
  console.log('\n=== Case 2：接战 900 tick ===');
  console.log('  stats:', JSON.stringify({ atkA: world.stats.attacksA, atkB: world.stats.attacksB, hitsA: world.stats.hitsA, hitsB: world.stats.hitsB, blocks: world.stats.blocks }));
  console.log('  B 侧阵亡次数 =', hitB, ' A 侧阵亡次数 =', deadA);
  console.log('  B 侧「阵亡/刚挨打」时画出的帧统计：', JSON.stringify(cnt(bHitDraw).slice ? cnt(bHitDraw) : cnt(bHitDraw)));
  console.log('  A 侧阵亡窗口画出的帧统计：', JSON.stringify(cnt(aDeathDraw)));
  fs.writeFileSync(path.join(HERE, 'case2_hit_frames.json'), JSON.stringify({ bHitDraw: bHitDraw.slice(0, 120), aDeathDraw: aDeathDraw.slice(0, 120), hitB, deadA, stats: world.stats }, null, 1), 'utf8');
}
