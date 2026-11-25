// 用真實劇本資料跑 24 個月的 AI（R73–R76 + R78），統計 ACT 分佈與勢力滅亡。
// 這不是測試，是把 campaign.html 的 buildWorld/applyWorld/runAiMonth 接線在 Node 裡復刻一遍，
// 用來證明「9 項 ACT 在真實資料上都會被 ArgMax 選中」，並確認每勢力每月只動一次。
import fs from 'node:fs';
import * as AI from '../../game/web/ai_model.js';
import * as Saves from '../../game/web/saves.js';

const SCEN = JSON.parse(fs.readFileSync('F:/sanguo/game/data/scenarios.json', 'utf8'));
const GAR = JSON.parse(fs.readFileSync('F:/sanguo/game/data/garrison.json', 'utf8'));

const sc = Array.isArray(SCEN) ? SCEN[0] : SCEN;
const cities = sc.cities;
const gar = GAR['0'].cities;
const NAME = new Map(cities.map((c) => [c.NAME, c]));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20251125);

// ---- 建存檔（等同 campaign.html 的 ensureCityState / refreshForces）
const save = { king: '何進', owned: [], cities: {}, forces: {} };
const adj = {};
for (const p of sc.paths) {
  if (Saves.num(p.Length) >= 30000) continue;
  (adj[p.Start] ||= []).push(p.End);
  (adj[p.End] ||= []).push(p.Start);
}
const kingOf = (n) => {
  const g = gar[n];
  if (g && typeof g.owner === 'string' && g.owner) return g.owner;
  const c = NAME.get(n);
  return c && typeof c.KING === 'string' ? c.KING : '';
};
for (const c of cities) {
  save.cities[c.NAME] = {
    owner: kingOf(c.NAME),
    troops: Saves.cityTroops(c),
    money: Saves.num(c.MONEY),
    pop: Saves.num(c.POPULATION),
  };
  if (save.cities[c.NAME].owner === '何進') save.owned.push(c.NAME);
}
AI.syncOwned(save);
AI.buildForces(save, Object.fromEntries(cities.map((c) => [c.NAME, kingOf(c.NAME)])));
AI.syncOwned(save);

function buildWorld() {
  const w = { playerId: save.king, cities: {}, adj, paths: sc.paths, forces: save.forces, rng, rules: { cheat: false } };
  w.capOf = (n) => Saves.cityTroops(NAME.get(n) || {});
  for (const c of cities) {
    const st = save.cities[c.NAME];
    const g = gar[c.NAME];
    w.cities[c.NAME] = {
      owner: st.owner,
      troops: Saves.num(st.troops),
      money: Saves.num(st.money),
      pop: Saves.num(st.pop),
      flags: Saves.num(c.FLAGS),
      rate: Saves.num(c.RATE),
      major: (g && typeof g.major === 'string' ? g.major : '') || (typeof c.MAJOR === 'string' ? c.MAJOR : ''),
      officers: (Array.isArray(g?.officers) ? g.officers : [])
        .filter((o) => o && o.name)
        .map((o) => ({ name: o.name, str: Saves.num(o.str), int: Saves.num(o.int), status: '登' })),
    };
  }
  return w;
}
function applyWorld(w) {
  for (const n of Object.keys(w.cities)) {
    const st = save.cities[n]; const src = w.cities[n];
    if (!st || !src) continue;
    st.troops = Math.max(0, Math.trunc(Saves.num(src.troops)));
    st.money = Math.max(0, Math.trunc(Saves.num(src.money)));
    if (typeof src.owner === 'string') st.owner = src.owner;
  }
  save.forces = w.forces;
  AI.syncOwned(save);
}

const hist = {};
const dead = [];
const perForce = new Map();
const crimes = [];
let battles = 0, captured = 0, incoming = 0, kingKills = 0;
const MONTHS = 24;
for (let m = 1; m <= MONTHS; m++) {
  const w = buildWorld();
  const res = AI.runMonth(w, { playerId: save.king });
  for (const it of res.executed) {
    const act = it.cand.act;
    hist[AI.ACT_NAMES[act]] = (hist[AI.ACT_NAMES[act]] || 0) + 1;
    perForce.set(it.force, (perForce.get(it.force) || 0) + 1);
    if (!it.result || !it.result.ok) { crimes.push(`月${m} ${it.force} 執行失敗 ${it.result?.reason}`); continue; }
    if (it.result.kind !== 'battle') continue;
    const defOwner = AI.forceOf(w, it.cand.to);
    if (act === AI.ACT.ATTACK_PLAYER || (defOwner && defOwner === save.king)) { incoming += 1; continue; }
    battles += 1;
    const r = AI.resolveBattle(w, it.result, rng);
    if (r.captured) {
      captured += 1;
      const k = AI.captureKingIn(w, it.cand.to, { major: r.oldMajor, owner: r.defender });
      if (k.killed) { kingKills += 1; dead.push(`月${m} ${k.force} 君主陣亡 → ${k.extinguished ? '滅亡' : k.heir + ' 繼位'}`); }
    }
  }
  for (const id of AI.checkForceDeaths(w)) dead.push(`月${m} ${id} 勢力滅亡（名城列表空）`);
  applyWorld(w);
  // 每勢力每月只動一次（R73）
  const seen = new Map();
  for (const it of res.executed) seen.set(it.force, (seen.get(it.force) || 0) + 1);
  for (const [f, n] of seen) if (n > 1) crimes.push(`月${m} ${f} 一個月動了 ${n} 次`);
}

console.log('=== 24 個月 AI 統計（劇本 1 黃巾之亂，玩家＝何進）===');
console.log('ACT 分佈:', JSON.stringify(hist, null, 0));
console.log('戰鬥結算:', battles, ' 佔城成功:', captured, ' 打玩家(未結算):', incoming);
console.log('君主陣亡/滅亡事件:', kingKills);
for (const d of dead.slice(0, 40)) console.log('  ', d);
console.log('勢力行動次數:', [...perForce].map(([f, n]) => `${f}:${n}`).join(' '));
console.log('異常（應為空）:', crimes.length ? crimes.join(' | ') : '無');
const owners = new Set(Object.values(save.cities).map((c) => c.owner).filter(Boolean));
console.log('結算後勢力數:', owners.size, '｜空城:', Object.values(save.cities).filter((c) => !c.owner).length);
