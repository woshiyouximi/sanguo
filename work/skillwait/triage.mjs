// 分诊：把"用户报的 52 条"与"探针 v2 报的 42 条"的并集逐条归类，并给出前后证据。
// 用法：node work/skillwait/triage.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const G = 'F:/sanguo/game/data/magics.json';
const W = 'F:/sanguo/work/skillwait/';

const USER52 = [3, 5, 8, 9, 12, 14, 15, 17, 18, 19, 22, 24, 25, 26, 27, 28, 31, 32, 37, 39, 40, 42, 44, 47, 48, 53, 54, 55, 57, 58, 61, 64, 66, 67, 69, 70, 74, 75, 77, 80, 81, 84, 89, 90, 91, 92, 98, 102, 103, 105, 108, 110];
const magics = JSON.parse(readFileSync(G, 'utf8'));
const bySeq = new Map(magics.map((m) => [m.SEQUENCE, m]));

/** 净口径（与 probe3 一致）：只认技能自身记账 + 全局状态/士气/疲劳/敌方技力 + 单位数。 */
const net = (r) => r.per.some((p) => (p.hits > 0) || (p.killed > 0) || (p.healed > 0) || (p.castHits > 0)
  || (p.castHealed > 0) || (p.castKilled > 0) || (p.markDmg > 0) || (p.markKills > 0) || (p.markHeal > 0)
  || (p.markSummon > 0) || (p.dCount !== 0) || p.dStatus || p.dMorale || p.dTire || (p.dFoeMp > 0));
const load = (f) => new Map(JSON.parse(readFileSync(W + f, 'utf8')).map((r) => [r.seq, r]));
const A = load('v3a.json'); // 兜底修复前
const E = load('v3e.json'); // 全部修复后

const base2 = JSON.parse(readFileSync(W + 'base2.json', 'utf8'));
const b2no = new Set(base2.filter((r) => !r.effect).map((r) => r.seq));
const union = [...new Set([...USER52, ...b2no])].sort((x, y) => x - y);

const IS_HEAL = /補血|补血/;
const IS_SUM = /補兵|补兵|召喚|召唤/;
const rows = union.map((seq) => {
  const m = bySeq.get(seq);
  const a = A.get(seq);
  const e = E.get(seq);
  const attrib = m?.ATTRIB ?? '';
  const cat = IS_HEAL.test(attrib) || IS_SUM.test(attrib) ? 'C3' : net(a) ? 'C2' : 'C1';
  return {
    seq, name: m?.NAME, script: m?.SCRIPT, attrib, atk: m?.ATTACK,
    inUser52: USER52.includes(seq), inBase2: b2no.has(seq),
    before: net(a), after: net(e),
    hitsBefore: a.per.reduce((s, p) => s + (p.hits || 0) + (p.castHits || 0), 0),
    hitsAfter: e.per.reduce((s, p) => s + (p.hits || 0) + (p.castHits || 0), 0),
    killedAfter: e.per.reduce((s, p) => s + (p.killed || 0), 0),
    healedAfter: e.per.reduce((s, p) => s + (p.healed || 0) + (p.castHealed || 0), 0),
    cat,
  };
});
const count = (c) => rows.filter((r) => r.cat === c).length;
console.log(`并集 ${rows.length} 条（用户52 ${USER52.length} / v2报42 ${b2no.size} / 交集 ${USER52.filter((s) => b2no.has(s)).length}）`);
console.log(`C1 ${count('C1')} / C2 ${count('C2')} / C3 ${count('C3')}`);
console.log(`修前有效 ${rows.filter((r) => r.before).length} / 修后有效 ${rows.filter((r) => r.after).length}`);
for (const c of ['C1', 'C2', 'C3']) {
  console.log(`\n--- ${c} ---`);
  for (const r of rows.filter((x) => x.cat === c)) {
    console.log(`  ${String(r.seq).padStart(3)} ${String(r.name).padEnd(8)} ${String(r.attrib).padEnd(10)} atk=${String(r.atk).padStart(3)} hits ${r.hitsBefore}→${r.hitsAfter} killed=${r.killedAfter} healed=${r.healedAfter} ${r.after ? '有效' : '仍无效'}`);
  }
}
writeFileSync(W + 'triage.json', JSON.stringify(rows, null, 1), 'utf8');
