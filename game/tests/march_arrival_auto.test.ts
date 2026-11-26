import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'cocos/assets/scripts/CampaignRoot.ts'), 'utf8');

/** 抽出某个方法的本文（大括號配對） */
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
const SIEGE = bodyOf(SRC, 'private startArrivalSiege(army: Army, target: string): void');

test('[R226/R227] 兵團抵達敵城 → 直接進編成（不等玩家點城、也不受「必須接鄰」守衛阻擋）', () => {
  assert.ok(FRAME.length > 200, '找不到 stepArmiesFrame()');
  assert.ok(
    FRAME.includes('this.startArrivalSiege(arrivedNew, target)'),
    '抵達敵城要走 startArrivalSiege（R227：doAction(\'march\') 會被「不接壤」守衛擋掉）',
  );
  assert.ok(FRAME.includes('this.selected = target'), '要先選中目標城，刷新與 HUD 才對得上');
  assert.ok(FRAME.includes('this.save?.owned.includes(target)'), '沒判是否自家城');
});

test('[R231] startArrivalSiege：撤隊 → 寫攻城快照（參戰=剛抵達的兵團）→ 切 Deploy，且不檢查接鄰', () => {
  assert.ok(SIEGE.length > 200, '找不到 startArrivalSiege()');
  assert.ok(SIEGE.includes('GameState.removeArmy(army.id)'), '要先把兵團從地圖撤掉（避免同一支部隊打兩次）');
  // 舊 bug（R227 引入）：抵達戰寫的是「派兵快照」setDeployMarch，Deploy 屏按「出征」
  // 會從出發城再派一支新兵團 → 新兵團又走到目標 → 再彈編成（到達一次彈一次）。
  assert.ok(SIEGE.includes('GameState.clearDeployMarch()'), '要清掉派兵快照，否則 Deploy 會走 dispatchMarch 重派新兵團');
  assert.ok(!SIEGE.includes('GameState.setDeployMarch({'), '抵達戰不能寫派兵快照');
  assert.ok(SIEGE.includes('GameState.setDeploySiege('), '要寫攻城戰前準備快照（參戰=剛抵達的兵團）');
  assert.ok(SIEGE.includes('this.siegeSnapshotOf(army'), '快照要從這支部隊鏡像（主將/隨軍/兵數/armyId）');
  assert.ok(
    SIEGE.indexOf('GameState.removeArmy(army.id)') < SIEGE.indexOf('GameState.setDeploySiege('),
    '先撤隊再寫快照（快照裡的 armyId 是撤掉的這支）',
  );
  assert.ok(SIEGE.includes('GameState.setDeployTarget('), '要寫目標城');
  assert.ok(SIEGE.includes('this.enemyIntelOf(target)'), '要帶敵情，編成屏才顯示守軍');
  assert.ok(SIEGE.includes("director.loadScene('Deploy')"), '要切到編成屏');
  assert.ok(!SIEGE.includes('distanceFromOwned'), '不能檢查接鄰：多段行軍的部隊走到遠城也要能打');
});

test('[R226] 兵團抵達自家城 → 自動進城併入守軍', () => {
  assert.ok(FRAME.includes('GameState.enterCityWithArmy('), '抵達自家城要自動進城');
  assert.ok(FRAME.includes('兵 團 進 城'), '進城要寫一條戰報/提示');
});

test('[R226] 抵達提示仍去重（不逐幀刷）', () => {
  assert.ok(FRAME.includes('arrivedNoticed'), '缺 arrivedNoticed 去重');
});

test('[R227] 兵團圖標不擋城：停在敵城上的部隊，點擊優先給城', () => {
  assert.ok(
    SRC.includes("picked.a.progress >= 1 && !(this.save?.owned.includes(best) ?? false)"),
    '地圖點擊要讓「已抵達敵城的兵團」把點擊讓給城（否則兵圖標蓋住城，永遠開不了戰）',
  );
});
