// 守军口径实跑：5 剧本 × 全部城，看 battleSetup 的等级/兵力分布（R84 改后）
import { loadData } from '../../game/src/data.ts';
import { battleSetup, defenderBattleParams, garrisonOf } from '../../game/src/core/garrison.ts';
import { startLevelOf, troopCapOf } from '../../game/src/core/levels.ts';

const dir = new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const data = loadData({ dir });
const scen = data.scenarios ?? [];

const levels = new Map();
const troops = new Map();
const basisCount = new Map();
const rows = [];
for (let s = 0; s < scen.length; s++) {
  const cities = Array.isArray(scen[s]?.cities) ? scen[s].cities : [];
  for (const c of cities) {
    const name = String(c?.NAME ?? '');
    if (!name) continue;
    const setup = battleSetup(data, s, name, 100);
    const p = setup.enemyParams;
    levels.set(p?.level, (levels.get(p?.level) ?? 0) + 1);
    troops.set(setup.enemyTroops, (troops.get(setup.enemyTroops) ?? 0) + 1);
    basisCount.set(setup.enemyTroopsBasis, (basisCount.get(setup.enemyTroopsBasis) ?? 0) + 1);
    const g = garrisonOf(data, s, name);
    rows.push({ s, name, level: p?.level ?? 0, basis: p?.levelBasis ?? '-', soldiers: p?.soldiers ?? 0, enemyTroops: setup.enemyTroops, reserve: g?.garrison ?? 0, why: setup.enemyTroopsBasis });
  }
}

const dist = (m) => [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [k, v]);
console.log('剧本数', scen.length, '城数合计', rows.length);
console.log('等级分布', JSON.stringify(dist(levels)));
console.log('enemyTroops 分布', JSON.stringify(dist(troops)));
console.log('basis 分布', JSON.stringify([...basisCount.entries()]));
console.log('守军池 min/max', Math.min(...rows.map((r) => r.reserve)), Math.max(...rows.map((r) => r.reserve)));
console.log('前 8 城', JSON.stringify(rows.slice(0, 8)));

// reserve 模式对照（旧口径）
const res = rows.map((r) => battleSetup(data, r.s, r.name, 100, { troopMode: 'reserve' }).enemyTroops);
const rd = new Map();
for (const v of res) rd.set(v, (rd.get(v) ?? 0) + 1);
console.log('reserve 模式分布', JSON.stringify(dist(rd)));

// 名将实测
const NAMES = ['關羽', '張飛', '呂布', '諸葛亮', '曹仁', '嚴白虎', '張角', '華佗', '兀突骨', '張英'];
for (const n of NAMES) {
  const g = data.generals.find((x) => x.NAME === n);
  if (!g) { console.log(n, '缺'); continue; }
  const lv = startLevelOf(g);
  const p = defenderBattleParams({ name: n, str: g.STR, int: g.INT }, g);
  console.log(`${n}\tSTR ${g.STR}\tINT ${g.INT}\tSUM ${g.STR + g.INT}\tstartLv ${lv}\tcap ${troopCapOf(lv)}\tparams Lv${p.level} ${p.soldiers} 兵 (${p.levelBasis})`);
}
