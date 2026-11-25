/**
 * R86 / P0 死档复现：造一份「刚打完一仗回来」的 localStorage 种子。
 *
 * 死档条件（campaign.html:1135-1147）：
 *   store 槽 1 有 snapshot，且旧键 sanguo_campaign_v1 比它**新**、且是一次战斗差异
 *   （wins/losses/defWins/owned 有变）→ boot.battle = true。
 * 那一局里 save.captured 非空 → settleBattleReturn() 会去 openSurrenderSheet()，
 * 而 `let surState` 在模块后段 → 修好之前这里必崩 "Cannot access 'surState' before initialization"。
 *
 * 输出：work/rows85/seed_bootbattle.json = { store, legacy }（都是字符串，直接 setItem）
 *
 * 用法：node work/rows85/p0_seed.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', '..', 'game');
const S = await import(new URL('file:///' + join(GAME, 'web', 'saves.js').replace(/\\/g, '/')).href);

const scen = JSON.parse(await readFile(join(GAME, 'data', 'scenarios.json'), 'utf8'));
const sc = scen[0];

const now = Date.now();
const snap = S.newCampaign(sc);
snap.ts = now - 5000;                       // 槽里的快照 = 打仗前的旧进度
const legacy = JSON.parse(JSON.stringify(snap));   // main.js 写回的旧键 = 打仗后
legacy.ts = now;
legacy.wins = S.num(snap.wins) + 1;         // isBattleDelta: wins 差 → boot.battle = true

// 战俘名单必须"真的能出卡"，否则 needSurrenderPanel(cards) 為 false、面板不弹，
// 就走不到 openSurrenderSheet（那才是这次崩的点）。所以从 garrison.json 里取本城
// （或任意有主城）守将的**真名**当作俘虏候选，逐个试，挑第一个能出卡的。
const garrison = JSON.parse(await readFile(join(GAME, 'data', 'garrison.json'), 'utf8'));
const gset = garrison.find((g) => Number(g.scenario) === Number(sc.id)) || garrison[0];
const home = snap.owned[0];
const R = await import(new URL('file:///' + join(GAME, 'dist', 'core', 'roster.js').replace(/\\/g, '/')).href);
const GENS = JSON.parse(await readFile(join(GAME, 'data', 'generals.json'), 'utf8'));
const GDATA = { generals: Array.isArray(GENS) ? GENS : Object.values(GENS) };
const names = new Set();
for (const c of (snap.owned || [])) {
  for (const o of (gset.cities[c]?.officers || [])) names.add(o.name);
}
for (const c of Object.keys(gset.cities)) {
  for (const o of (gset.cities[c]?.officers || [])) names.add(o.name);
}
const mine = new Set();
for (const c of (snap.owned || [])) for (const o of (gset.cities[c]?.officers || [])) mine.add(o.name);
let picked = null;
for (const n of names) {
  if (mine.has(n)) continue;
  const cards = R.surrenderCandidates({ ...snap, captured: [n], executed: [] }, GDATA, {
    atCity: (gset.cities[home]?.officers || []).map((o) => o.name).concat([n]),
    mine: [...mine],
    king: snap.monarch || snap.king || '',
  });
  if (R.needSurrenderPanel(cards)) { picked = n; break; }
}
if (!picked) throw new Error('找不到能出卡的俘虏名（种子造不出可复现的崩溃态）');
legacy.captured = [picked];

const store = S.emptyStore();
store.slots[0] = { snapshot: snap };        // normalizeStore 会按 snapshot 重算摘要
store.last = 1;

await writeFile(join(HERE, 'seed_bootbattle.json'), JSON.stringify({
  store: JSON.stringify(S.normalizeStore(store)),
  legacy: JSON.stringify(legacy),
}, null, 2), 'utf8');

console.log('seed ok', {
  snapshot: { scenario: snap.scenario, owned: snap.owned.length, wins: snap.wins, ts: snap.ts },
  legacy: { wins: legacy.wins, captured: legacy.captured, ts: legacy.ts },
});

