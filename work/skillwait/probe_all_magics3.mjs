// 全技能探针 v3（2026-11-25）
//
// 与 v1/v2 的区别（v1/v2 的"效果"判定被战斗噪声污染：控制组不放技能也会死 11 个兵）：
//   1. **只认技能自己记账的信号**：`SkillSession.hits/killed/healed`（runtime 的命中结算）、
//      `world.skillMarks`（`cast()`/`advanceSessions()` 的前后对账）、单位数变化（補兵/召喚）、
//      以及全局状态位/士气/疲劳/技力快照差 —— 这些字段普通战斗不会改（控制组实测全 0）。
//   2. **三个场景**：平地 20v20 / 敌方带骑兵+弓兵 / 雨天+山林地形，任一场景有效即算有效。
//   3. 记录会话是否被"等待条件不满足"截断（C1 的关键证据）。
//
// 用法：cd F:\sanguo\game && node ..\work\skillwait\probe_all_magics3.mjs [out.json]
import { cast, createWorld, step, QI_MAX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';
import { writeFileSync } from 'node:fs';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 场景表。terrain 见 data/terrains.json（0=城/平地），weather 0 晴/1 雨/2 雪/3 雾。 */
const SCENARIOS = [
  { id: 'flat', terrain: 0, weather: 0, b: { troop: 0, cavalry: 0 } },
  { id: 'cavbow', terrain: 0, weather: 0, b: { troop: 3, cavalry: 10 } }, // troop3 = 弓箭，10 骑兵
  { id: 'rainforest', terrain: 6, weather: 1, b: { troop: 0, cavalry: 0 } }, // 山林 + 雨
  // 第 4 场景（C3）：己方残缺 —— 補血技要有伤、補兵/召喚技要有己方阵亡才能观察到效果。
  { id: 'wounded', terrain: 0, weather: 0, b: { troop: 0, cavalry: 0 }, wounded: true },
];

const seen = new Set();
const magics = [];
for (const m of data.magics) {
  if (!m.SCRIPT || seen.has(m.SCRIPT)) continue;
  seen.add(m.SCRIPT);
  magics.push(m);
}

/** 一个场景下的单技测量。 */
function measure(m, sc) {
  const warns = [];
  const oldWarn = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  try {
    const world = createWorld({
      data, seed: 7, terrain: sc.terrain, weather: sc.weather,
      a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
      b: { formation: 0, troop: sc.b.troop, morale: 50, soldiers: 20, cavalry: sc.b.cavalry, general: { name: 'B', str: 60, int: 70 } },
    });
    const g = world.units.find((u) => u.isGeneral && u.side === 'A');
    g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
    world.sides.A.general.qi = QI_MAX;
    if (sc.wounded) {
      // 己方残缺：主将只剩 30% 血、十个兵已经阵亡（補血/補兵才有的可观察量）
      world.sides.A.general.hp = Math.max(1, Math.floor(world.sides.A.general.maxHp * 0.3));
      const mine = world.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive);
      for (const u of mine.slice(0, Math.min(10, mine.length - 1))) u.alive = false;
      world.sides.A.startInf = Math.max(0, world.sides.A.startInf - 10);
    }
    const snapOf = () => ({
      n: world.units.length,
      aliveB: world.units.filter((u) => u.side === 'B' && u.alive).length,
      st: world.units.filter((u) => u.alive).reduce((a, u) => a | (u.status ?? 0), 0),
      mb: world.sides.B.morale,
      ma: world.sides.A.morale,
      tireB: world.sides.B.general.tire ?? 0,
      tireA: world.sides.A.general.tire ?? 0,
      mpB: world.sides.B.general.mp ?? 0,
      mpA: world.sides.A.general.mp ?? 0,
      hpB: world.sides.B.general.hp,
      hpA: world.sides.A.general.hp,
    });
    const s0 = snapOf();
    const r = cast(world, 'A', m.SEQUENCE, 20, 6.5);
    // 让会话跑完（最多 600 tick；死等保护本身在 240+ 会截断）
    let ticks = 0;
    while (world.sessions.length > 0 && ticks < 600) { step(world); ticks++; }
    const s1 = snapOf();
    const sum = world.sessions[0]?.summary?.() ?? null;
    const marks = world.skillMarks ?? [];
    const markDmg = marks.reduce((s, k) => s + (k.damage ?? 0), 0);
    const markKills = marks.reduce((s, k) => s + (k.kills ?? 0), 0);
    const markHeal = marks.reduce((s, k) => s + (k.healed ?? 0), 0);
    const markSummon = marks.reduce((s, k) => s + (k.summoned ?? 0), 0);
    const out = {
      sc: sc.id,
      ok: r.ok === true,
      ticks,
      // 技能自身记账（v1/v2 缺的那一层）
      hits: 0, killed: 0, healed: 0, frames: 0, truncated: false, reason: '', objects: 0,
      markDmg, markKills, markHeal, markSummon, misses: marks.filter((k) => k.miss).length,
      // 世界侧字段（v2 的宽口径，保留以对比）
      dHpB: s0.hpB - s1.hpB, dHpA: s0.hpA - s1.hpA,
      dBAlive: s0.aliveB - s1.aliveB,
      dCount: s1.n - s0.n,
      dStatus: s1.st !== s0.st,
      dMorale: s1.mb !== s0.mb || s1.ma !== s0.ma,
      dTire: s1.tireB !== s0.tireB || s1.tireA !== s0.tireA,
      dMp: s1.mpB !== s0.mpB || s1.mpA !== s0.mpA,
      dFoeMp: s0.mpB - s1.mpB,
      warn: warns.filter((w) => /中断|死循环|截断|失败/.test(w)).join(' | '),
    };
    void sum;
    return out;
  } catch (e) {
    return { sc: sc.id, ok: false, error: String(e && e.message), hits: 0, killed: 0, healed: 0, effect: false };
  } finally {
    console.warn = oldWarn;
  }
}

// 会话统计要单独取：cast() 之后 world.sessions[0] 就是本次会话（补血技是 drain 完即移除，
// 这类只能靠 marks/healed 判）。所以把 cast 前后的会话对象抓在手上。
function measureWithSession(m, sc) {
  const warns = [];
  const oldWarn = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  try {
    const world = createWorld({
      data, seed: 7, terrain: sc.terrain, weather: sc.weather,
      a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
      b: { formation: 0, troop: sc.b.troop, morale: 50, soldiers: 20, cavalry: sc.b.cavalry, general: { name: 'B', str: 60, int: 70 } },
    });
    const g = world.units.find((u) => u.isGeneral && u.side === 'A');
    g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
    world.sides.A.general.qi = QI_MAX;
    if (sc.wounded) {
      // 己方残缺：主将只剩 30% 血、十个兵已经阵亡（補血/補兵才有的可观察量）
      world.sides.A.general.hp = Math.max(1, Math.floor(world.sides.A.general.maxHp * 0.3));
      const mine = world.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive);
      for (const u of mine.slice(0, Math.min(10, mine.length - 1))) u.alive = false;
      world.sides.A.startInf = Math.max(0, world.sides.A.startInf - 10);
    }
    const snapOf = () => ({
      n: world.units.length,
      aliveB: world.units.filter((u) => u.side === 'B' && u.alive).length,
      st: world.units.filter((u) => u.alive).reduce((a, u) => a | (u.status ?? 0), 0),
      mb: world.sides.B.morale, ma: world.sides.A.morale,
      tireB: world.sides.B.general.tire ?? 0, tireA: world.sides.A.general.tire ?? 0,
      mpB: world.sides.B.general.mp ?? 0, mpA: world.sides.A.general.mp ?? 0,
      hpB: world.sides.B.general.hp, hpA: world.sides.A.general.hp,
    });
    const s0 = snapOf();
    const r = cast(world, 'A', m.SEQUENCE, 20, 6.5);
    const sess = world.sessions[0] ?? null;
    let ticks = 0;
    while (world.sessions.length > 0 && ticks < 600) { step(world); ticks++; }
    // 補血技：cast 内部 drain 完就移出 world.sessions，sess 拿不到，用 marks/healed 判。
    const s1 = snapOf();
    const marks = world.skillMarks ?? [];
    const row = {
      sc: sc.id,
      ok: r.ok === true,
      castHits: r.hits ?? 0,
      castHealed: r.healed ?? 0,
      castKilled: r.killed ?? 0,
      frames: sess?.frames?.length ?? 0,
      hits: sess?.hits ?? 0,
      killed: sess?.killed ?? 0,
      healed: sess?.healed ?? 0,
      truncated: Boolean(sess && !sess.ok === false && sess.reason),
      reason: sess?.reason ? String(sess.reason).slice(0, 60) : '',
      objects: 0,
      markDmg: marks.reduce((s, k) => s + (k.damage ?? 0), 0),
      markKills: marks.reduce((s, k) => s + (k.kills ?? 0), 0),
      markHeal: marks.reduce((s, k) => s + (k.healed ?? 0), 0),
      markSummon: marks.reduce((s, k) => s + (k.summoned ?? 0), 0),
      misses: marks.filter((k) => k.miss).length,
      dHpB: s0.hpB - s1.hpB, dHpA: s0.hpA - s1.hpA,
      dAliveB: s0.aliveB - s1.aliveB,
      dCount: s1.n - s0.n,
      dStatus: s1.st !== s0.st,
      dMorale: s1.mb !== s0.mb || s1.ma !== s0.ma,
      dTire: s1.tireB !== s0.tireB || s1.tireA !== s0.tireA,
      dFoeMp: s0.mpB - s1.mpB,
      dMp: s1.mpB !== s0.mpB || s1.mpA !== s0.mpA,
      ticks,
      warn: warns.filter((w) => /中断|死循环|截断|失败/.test(w)).join(' | '),
    };
    // 净口径：只认"技能自己记账"的信号 + 全局状态/士气/疲劳/敌方技力 + 单位数。
    // **不能**把施法者自己的 mp/qi/hp 算进效果（施法本来就扣 mp）。
    row.effect = row.hits > 0 || row.killed > 0 || row.healed > 0 || row.castHits > 0 || row.castHealed > 0
      || row.castKilled > 0 || row.markDmg > 0 || row.markKills > 0 || row.markHeal > 0 || row.markSummon > 0
      || row.dCount !== 0 || row.dStatus || row.dMorale || row.dTire || row.dFoeMp > 0;
    return row;
  } catch (e) {
    return { sc: sc.id, ok: false, error: String(e && e.message), hits: 0, killed: 0, healed: 0, effect: false };
  } finally {
    console.warn = oldWarn;
  }
}
void measure;

const rows = [];
for (const m of magics) {
  const per = SCENARIOS.map((sc) => measureWithSession(m, sc));
  const any = per.some((x) => x.effect);
  rows.push({
    seq: m.SEQUENCE, script: m.SCRIPT, name: m.NAME ?? '', atk: m.ATTACK, attrib: m.ATTRIB ?? '',
    effect: any,
    anyHits: per.reduce((s, x) => s + (x.hits || 0), 0),
    anyKilled: per.reduce((s, x) => s + (x.killed || 0), 0),
    per,
  });
  if (!any) console.log(`  无效果 ${String(m.SEQUENCE).padStart(3)} ${m.NAME}`);
}

const noEff = rows.filter((r) => !r.effect);
console.log(`\n技能数 ${rows.length}；真·无任何效果 ${noEff.length}`);
console.log('无效果 seq:', noEff.map((x) => x.seq).join(','));
const out = process.argv[2];
if (out) { writeFileSync(out, JSON.stringify(rows, null, 1), 'utf8'); console.log('已写', out); }
