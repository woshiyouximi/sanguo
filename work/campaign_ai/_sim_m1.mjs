// 只跑第 1 个月，把「谁打谁、结果、谁死了」全打出来 —— 用来核对月1 大量灭亡是不是真打出来的
import fs from 'node:fs';
import path from 'node:path';
import * as AI from 'file:///F:/sanguo/game/web/ai_model.js';
import * as Saves from 'file:///F:/sanguo/game/web/saves.js';

const ROOT = 'F:/sanguo/game/data';
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const scen = read('scenarios.json');
const gar = read('garrison.json');
const sc = scen[0];
const g = gar[String(sc.id)] || gar['0'];
const save = Saves.newCampaign(sc, {});
save.king = '何進';
save.owned = Object.keys(g.cities).filter((n) => g.cities[n].owner === '何進');
save.cities = {};
for (const c of sc.cities) {
  const st = Saves.cityState(c);
  save.cities[c.NAME] = { troops: st.troops, pop: st.pop, money: st.money, owner: g.cities[c.NAME]?.owner || '' };
}
AI.syncOwned(save);
AI.buildForces(save, Object.fromEntries(sc.cities.map((c) => [c.NAME, g.cities[c.NAME]?.owner || ''])));
AI.syncOwned(save);

const adj = {};
for (const p of sc.paths) {
  if (!(p.Length < 30000)) continue;
  (adj[p.Start] ||= []).push(p.End);
  (adj[p.End] ||= []).push(p.Start);
}
let s = 20251125 >>> 0;
const rng = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function buildWorld() {
  const cities = {};
  for (const c of sc.cities) {
    const st = save.cities[c.NAME]; const gg = g.cities[c.NAME] || {};
    cities[c.NAME] = {
      owner: st.owner || '', troops: Saves.num(st.troops), money: Saves.num(st.money),
      pop: Saves.num(st.pop), flags: Saves.num(c.FLAGS), rate: Saves.num(c.RATE),
      major: (typeof gg.major === 'string' ? gg.major : '') || (typeof c.MAJOR === 'string' ? c.MAJOR : ''),
      officers: (gg.officers || []).filter((o) => o && o.name).map((o) => ({ name: o.name, str: Saves.num(o.str), int: Saves.num(o.int), status: '登' })),
    };
  }
  return { playerId: save.king, cities, adj, paths: sc.paths, forces: save.forces, rng,
    capOf: (n) => Saves.cityTroops(sc.cities.find((c) => c.NAME === n) || {}) };
}

const w = buildWorld();
const troopBefore = Object.fromEntries(sc.cities.map((c) => [c.NAME, w.cities[c.NAME].troops]));
const res = AI.runMonth(w, { playerId: save.king });
console.log(`=== 月 1：${res.executed.length} 個勢力出手 ===`);
for (const it of res.executed) {
  const c = it.cand, r = it.result;
  if (!r || !r.ok) { console.log(`  ${it.force} ${AI.ACT_NAMES[c.act]} 失敗 ${r?.reason}`); continue; }
  if (r.kind === 'domestic') { console.log(`  ${it.force} ${AI.ACT_NAMES[c.act]} ${c.from}->${c.to}（內政）`); continue; }
  const defOwner = r.defender;
  if (c.act === AI.ACT.ATTACK_PLAYER || (defOwner && defOwner === save.king)) {
    console.log(`  打玩家: ${it.force} ${c.from}->${c.to} 出兵 ${r.troops}（未結算）`);
    continue;
  }
  const b = AI.resolveBattle(w, r, rng);
  let cut = '';
  if (b.captured) {
    const k = AI.captureKingIn(w, c.to, { major: b.oldMajor, owner: b.defender });
    if (k.killed) cut = `  ★${k.force} 君主陣亡→滅亡`;
  }
  console.log(`  ${it.force} ${c.from}(${troopBefore[c.from]}) -> ${c.to}(${troopBefore[c.to]},主=${b.defender || '空'}) 出兵 ${r.troops} ⇒ ${b.captured ? '得手' : b.skipped ? '跳過' : '敗退'}${cut}`);
}
for (const id of AI.checkForceDeaths(w)) console.log(`  城打光: ${id}`);
const owners = new Set(Object.values(w.cities).map((c) => c.owner).filter(Boolean));
console.log('月結勢力數:', owners.size, '｜空城:', Object.values(w.cities).filter((c) => !c.owner).length);
