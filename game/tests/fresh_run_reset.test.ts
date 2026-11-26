import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'cocos/assets/scripts/GameState.ts'), 'utf8');
const CR = readFileSync(join(ROOT, 'cocos/assets/scripts/CampaignRoot.ts'), 'utf8');

test('[R226b] 新局把 month 歸 1（否則新局會接上一局的月份，實測變成「第 2 年 1 月」）', () => {
  const at = GS.indexOf('export function initCampaign(');
  assert.ok(at > 0, '找不到 initCampaign()');
  const body = GS.slice(at, GS.indexOf('\nexport function isOwned', at));
  assert.ok(body.includes('clearRunScoped(save)'), 'initCampaign() 應走 clearRunScoped（R214）');
  const clearAt = body.indexOf('clearRunScoped(save)');
  const monthAt = body.indexOf('save.month = 1');
  assert.ok(monthAt > clearAt, 'clearRunScoped 之後要 save.month = 1');
});

test('[R226b] CampaignRoot 收到 freshRun 時清戰報 + 時鐘歸零', () => {
  const at = CR.indexOf('const freshRun = consumeFreshStart()');
  assert.ok(at > 0, '找不到 consumeFreshStart()');
  const seg = CR.slice(at, at + 900);
  assert.ok(seg.includes('BATTLE_LOG_KEY'), 'freshRun 要清 sanguo_battlelog_v1');
  assert.ok(seg.includes('this.battleLog = []'), 'freshRun 要清記憶體戰報');
  assert.ok(seg.includes('this.clockT = 3600'), 'freshRun 要把時鐘歸 3600');
  assert.ok(seg.includes('this.clockPaused = true'), 'freshRun 要先暫停時鐘（等內政頁關掉再走）');
});
