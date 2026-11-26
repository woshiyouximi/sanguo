import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step } from '../src/core/battle.ts';
import { loadData } from '../src/data.ts';

const data = loadData();

function worldWithBothSides() {
  return createWorld({
    data,
    seed: 7,
    month: 1,
    terrain: 0,
    a: { troop: 2, formation: 0, soldiers: 60, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
    b: { troop: 10, formation: 3, soldiers: 60, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  });
}

test('[R243] 一側場上再無任何活著單位 → 立刻以 annihilate 收場', () => {
  const w = worldWithBothSides();
  for (let i = 0; i < 30; i += 1) step(w);
  assert.equal(w.over, false, '開場不應結束');
  // 模擬「空城只剩守備隊名號」：主將旗標還算活著，但場上已經沒有它的實體單位
  w.units = w.units.filter((u) => u.side !== 'B');
  step(w);
  assert.equal(w.over, true, '場上沒人就不該繼續拖到 198 秒');
  assert.equal(w.winner, 'A');
  assert.equal(w.endReason, 'annihilate');
});

test('[R243] 雙方都清空 → 判平手（annihilate）', () => {
  const w = worldWithBothSides();
  step(w);
  w.units = [];
  step(w);
  assert.equal(w.over, true);
  assert.equal(w.winner, 'draw');
  assert.equal(w.endReason, 'annihilate');
});

test('[R243] 士兵清零但主将还在 → 战斗继续（不能按覆没收场）', () => {
  const w = worldWithBothSides();
  for (let i = 0; i < 20; i += 1) step(w);
  for (const u of w.units) if (!u.isGeneral) u.alive = false;
  const before = w.over;
  for (let i = 0; i < 30; i += 1) step(w);
  assert.equal(before, false);
  assert.equal(w.over, false, '兵打光不等于覆没：主将活着要继续（原作语义）');
});

test('[R243] 抵達空城要按存檔真實守軍判空城，不按 garrison.json 的 intel', () => {
  const src = readFileSync(new URL('../cocos/assets/scripts/CampaignRoot.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('R243'), 'CampaignRoot 要留 R243 說明');
  assert.ok(src.includes('const liveTroops = Math.max(0, Math.floor(Number(this.save?.cities?.[target]?.troops ?? intel?.troops ?? 0) || 0));'));
  assert.ok(src.includes('const hasRealGeneral = !!intelName && intelName !== \'守備隊\';'));
  assert.ok(src.includes('const emptyCity = liveTroops <= 0 && !hasRealGeneral;'));
});

test('[R243] Deploy 對 0 兵空城直接接收，不進戰場', () => {
  const src = readFileSync(new URL('../cocos/assets/scripts/DeployRoot.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('R243 空城不開戰'));
  assert.ok(src.includes('if (liveTroops <= 0 && (!intelName || intelName === \'守備隊\'))'));
  assert.ok(src.includes("director.loadScene('Campaign');"));
});

test('[R243] 主将单位已阵亡但旗标漏翻 → recompute 兜底同步后按 general 收场', () => {
  const w = worldWithBothSides();
  for (let i = 0; i < 20; i += 1) step(w);
  const bGen = w.units.find((u) => u.side === 'B' && u.isGeneral);
  assert.ok(bGen, '守方要有主将单位');
  bGen.alive = false;
  w.sides.B.general.alive = true; // 模拟漏写
  step(w);
  assert.equal(w.sides.B.general.alive, false, '旗标要按单位同步');
  assert.equal(w.over, true);
  assert.equal(w.winner, 'A');
  assert.equal(w.endReason, 'general');
});
