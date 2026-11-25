// 旋龍（SEQ 51 / SCRIPT 554）逐帧探针：CastResult、会话存活帧数、skillMarks、web MISS 压制。
// 用法：cd F:\sanguo\game && node ..\work\skillwait\probe_xuanlong_frames.mjs
import { cast, createWorld, step, QI_MAX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';
import { buildFrame, pushFloater } from '../../game/src/view/battleView.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); };

function staged(ax, ay) {
  const world = createWorld({
    data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = ax; g.y = ay; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  return world;
}

function run(tx, ty, label, steps = 400) {
  warns.length = 0;
  const w = staged(24, 6.5);
  const hpB = w.sides.B.general.hp;
  const aliveB = w.units.filter((u) => u.side === 'B' && u.alive).length;
  const r = cast(w, 'A', 51, tx, ty);
  const castResult = { ok: r.ok, hit: r.hit, hits: r.hits, damage: r.damage, killed: r.killed, reason: r.reason };
  const aliveFrames = [];
  let maxSessions = w.sessions.length;
  for (let i = 0; i < steps; i++) {
    step(w);
    maxSessions = Math.max(maxSessions, w.sessions.length);
    if (w.sessions.length) aliveFrames.push(i);
  }
  const dmg = hpB - w.sides.B.general.hp;
  const killed = aliveB - w.units.filter((u) => u.side === 'B' && u.alive).length;
  const marks = (w.skillMarks ?? []).map((m) => ({ tick: m.tick, kills: m.kills, damage: m.damage, miss: m.miss }));
  const markDamage = marks.reduce((s, m) => s + (m.damage ?? 0), 0);
  console.log(label);
  console.log('  castResult', JSON.stringify(castResult));
  console.log('  session 存活 tick 区间',
    aliveFrames.length ? `${aliveFrames[0]}..${aliveFrames[aliveFrames.length - 1]}（共 ${aliveFrames.length} 个 tick，峰值 ${maxSessions} 个）` : '（无）');
  console.log('  skillMarks', JSON.stringify(marks.slice(0, 8)), marks.length > 8 ? `… 共 ${marks.length} 条` : '');
  console.log('  markDamage', markDamage, '实际 dmg', dmg, 'killed', killed, 'warns', JSON.stringify(warns.slice(0, 2)));
  return { r, w };
}

// 敌方主将真实位置
const probe = staged(24, 6.5);
const bg = probe.units.find((u) => u.isGeneral && u.side === 'B');
console.log('B general at', bg.x, bg.y, 'A at (24,6.5)');

const near = run(20, 6.5, 'seq51 @(20,6.5) 近 A');
run(bg.x, bg.y, 'seq51 @B-general');
run(0, 0, 'seq51 @(0,0) 远角');
run(24, 6.5, 'seq51 @self');

// web doCast() 立刻飘的那句 MISS 会不会被视图压掉（R84：sessions 非空 → 抢跑）
{
  const floaters = [];
  pushFloater(floaters, 20, 6.5, 'MISS', '#888888');
  const cmds = buildFrame(near.w, { floaters, camX: 24, mode: 'fighting' });
  const texts = cmds.filter((c) => c.kind === 'text').map((c) => c.text);
  console.log('  buildFrame 文本（cast 当帧）', JSON.stringify(texts.slice(0, 10)));
}
