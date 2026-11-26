import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'cocos/assets/scripts/CampaignRoot.ts'), 'utf8');

/** 抽出 stepArmiesFrame() 的本文（大括號配對） */
function bodyOf(src: string, name: string): string {
  const at = src.indexOf(name);
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

const FRAME = bodyOf(SRC, 'private stepArmiesFrame(n: number): void');

test('[R226] 兵團抵達敵城 → 自動進編成/戰鬥（原作行為），不再等玩家點城', () => {
  assert.ok(FRAME.length > 200, '找不到 stepArmiesFrame()');
  // 到敵城：復用 doAction('march')（撤隊 → 落 deploy 快照 → 切 Deploy 編成屏）
  assert.ok(FRAME.includes("this.doAction('march')"), "抵達敵城要自動 doAction('march')");
  assert.ok(FRAME.includes('this.selected = target'), '要先選中目標城，doAction 才認得');
  // 只對「不是自家城」觸發戰鬥
  assert.ok(FRAME.includes("this.save?.owned.includes(target)"), '沒判是否自家城');
});

test('[R226] 兵團抵達自家城 → 自動進城併入守軍', () => {
  assert.ok(FRAME.includes('GameState.enterCityWithArmy('), '抵達自家城要自動進城');
  assert.ok(FRAME.includes('兵 團 進 城'), '進城要寫一條戰報/提示');
});

test('[R226] 抵達提示仍去重（不逐幀刷）', () => {
  assert.ok(FRAME.includes('arrivedNoticed'), '缺 arrivedNoticed 去重');
});
