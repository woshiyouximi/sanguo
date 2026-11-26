// probe_scenidx.mjs — Cocos CityPanel ctx.scenIdx 硬编码 0 的后果（P0）
// 跑法：cd F:\sanguo && node work\affairs_audit\probe_scenidx.mjs
import { readFileSync } from 'node:fs';
import { W, C, cityDef, makeSave, makeCtx } from './lib.mjs';

const SC = JSON.parse(readFileSync('game/data/scenarios.json', 'utf8'));
const G = JSON.parse(readFileSync('game/data/generals.json', 'utf8'));

console.log('=== Cocos 内政面板 scenIdx 来源 ===');
console.log('CityPanel.ts:672  ctx = { ..., scenIdx: 0, ... }  ← 硬编码');
console.log('CampaignRoot.ts:1364-1367  const sci = runScenarioIndex(); scenario = data.scenarios[sci]');
console.log('CampaignRoot.ts:2059-2062  cityPanel.open({ cityName, data, scenario, ... })  ← 没把 sci 传进来');
console.log('web city.html:494  scenIdx = scenarioIndexOf(save?.scenario)  ← 按存档剧本');
console.log('');

for (const idx of [0, 1]) {
  const c = SC[idx].cities.find((x) => x.NAME === '平原');
  console.log(`剧本${idx}「${SC[idx].system.TIME}」平原：KING=${c.KING} MAJOR=${c.MAJOR} MONEY=${c.MONEY} POP=${c.POPULATION}`);
}

console.log('\n=== 用同一份「平原」城態，分别按 scenIdx=0 / 1 算内政武将 ===');
const def1 = cityDef('平原', 1);
for (const idx of [0, 1]) {
  const save = makeSave({ scenIdx: 1, owned: ['平原'], month: 1 });
  save.roster = {}; save.appointed = {};
  const ctx = makeCtx(save, idx);
  ctx.generals = G;
  console.log(
    `scenIdx=${idx}  rosterOf(平原) = ${C.rosterOf(save, '平原', ctx).map((g) => g.NAME).join('、')}`,
  );
  console.log(
    `             wildPool(平原) = ${C.wildPool(save, '平原', ctx).map((g) => g.NAME).join('、')}`,
  );
  console.log(`             majorOf(平原)  = ${C.majorOf(save, def1)}`);
}

console.log('\n=== 结论 ===');
console.log('Cocos 原生包选《討伐董卓》时，内政面板仍用剧本0的 city_by_times/status_by_times：');
console.log('  平原 显示 張角、廖化、裴元紹（剧本0的3人）—— 与现场「平原 3 將」完全吻合；');
console.log('  正确剧本1应为 關羽、劉備、張角、張飛、簡雍（5人），太守劉備不在清单里；');
console.log('  搜索在野池也错位：剧本0 杜遠/管輅/蔣義渠 vs 剧本1 淳于瓊/管輅/蔣義渠。');
console.log('web 端 city.html:494 按 save.scenario 取 scenIdx，不受影响。');

