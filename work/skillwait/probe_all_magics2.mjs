// 全技能探针：逐个 MAGIC.SO 技能 cast，记录是否中断 / 是否产生效果（伤害、击杀、治疗、召唤）。
// 用法：cd F:\sanguo\game && node ..\work\skillwait\probe_all_magics.mjs [outfile.json]
import { cast, createWorld, step, QI_MAX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';
import { writeFileSync } from 'node:fs';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const seen = new Set();
const magics = [];
for (const m of data.magics) {
  if (!m.SCRIPT || seen.has(m.SCRIPT)) continue;
  seen.add(m.SCRIPT);
  magics.push(m);
}

const rows = [];
for (const m of magics) {
  const warns = [];
  const oldWarn = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  let row;
  try {
    const world = createWorld({
      data, seed: 7,
      a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
      b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
    });
    const g = world.units.find((u) => u.isGeneral && u.side === 'A');
    g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
    world.sides.A.general.qi = QI_MAX;
    const hpB0 = world.sides.B.general.hp;
    const hpA0 = world.sides.A.general.hp;
    const aliveB0 = world.units.filter((u) => u.side === 'B' && u.alive).length;
    const snap = () => {
      const st = world.units.filter((u) => u.alive).map((u) => (u.status ?? 0)).reduce((a, b) => (a | b), 0);
      return { st, mb: world.sides.B.morale, ma: world.sides.A.morale, tb: world.sides.B.general.tire ?? 0, mbp: world.sides.B.general.mp ?? 0, n: world.units.length };
    };
    const s0 = snap();
    const r = cast(world, 'A', m.SEQUENCE, 20, 6.5);
    for (let i = 0; i < 400; i++) step(world);
    const marks = world.skillMarks ?? [];
    row = {
      seq: m.SEQUENCE, script: m.SCRIPT, name: m.NAME ?? '',
      ok: r.ok === true,
      interrupted: warns.some((w) => w.includes('中断') || w.includes('死循环') || w.includes('截断')),
      warn0: warns.find((w) => w.includes('中断') || w.includes('死循环') || w.includes('截断')) ?? '',
      dmgB: hpB0 - world.sides.B.general.hp,
      dmgA: hpA0 - world.sides.A.general.hp,
      killed: aliveB0 - world.units.filter((u) => u.side === 'B' && u.alive).length,
      markDmg: marks.reduce((s, k) => s + (k.damage ?? 0), 0),
      markKills: marks.reduce((s, k) => s + (k.kills ?? 0), 0),
      markHeal: marks.reduce((s, k) => s + (k.healed ?? 0), 0),
      markSummon: marks.reduce((s, k) => s + (k.summoned ?? 0), 0),
      misses: marks.filter((k) => k.miss).length,
    };
    const s1 = snap();
    row.dStatus = s1.st !== s0.st;
    row.dMorale = s1.mb !== s0.mb || s1.ma !== s0.ma;
    row.dTire = s1.tb !== s0.tb;
    row.dMp = s1.mbp !== s0.mbp;
    row.dCount = s1.n !== s0.n;
    row.effect = row.markDmg > 0 || row.markKills > 0 || row.markHeal > 0 || row.markSummon > 0
      || row.dmgB > 0 || row.dStatus || row.dMorale || row.dTire || row.dMp || row.dCount;
  } catch (e) {
    row = { seq: m.SEQUENCE, script: m.SCRIPT, ok: false, interrupted: true, warn0: String(e && e.message), effect: false };
  } finally {
    console.warn = oldWarn;
  }
  rows.push(row);
}

const bad = rows.filter((x) => x.interrupted);
const noEffect = rows.filter((x) => !x.interrupted && !x.effect);
console.log(`技能数 ${rows.length}；中断/异常 ${bad.length}；无任何效果 ${noEffect.length}`);
if (bad.length) for (const b of bad.slice(0, 10)) console.log('  中断:', b.seq, b.warn0);
if (noEffect.length) console.log('  无效果 seq:', noEffect.map((x) => x.seq).join(','));
const out = process.argv[2];
if (out) {
  writeFileSync(out, JSON.stringify(rows, null, 1), 'utf8');
  console.log('已写', out);
}
