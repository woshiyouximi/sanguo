import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CR = readFileSync(join(ROOT, 'cocos/assets/scripts/CampaignRoot.ts'), 'utf8');
const GS = readFileSync(join(ROOT, 'cocos/assets/scripts/GameState.ts'), 'utf8');

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

const FRAME = bodyOf(CR, 'private stepArmiesFrame(n: number): void');

test('[R228] 真空城（無守將且守軍 0）→ 直接佔領，不進攻城戰', () => {
  assert.ok(FRAME.includes('GameState.occupyCity('), '抵達空城要呼叫 occupyCity()');
  assert.ok(FRAME.includes('emptyCity'), '要有「真空城」判定');
  assert.ok(/兵 團 進 城/.test(FRAME), '佔城要寫一條戰報');
});

test('[R228] occupyCity() 會把城收進 owned 並把兵團併進守軍', () => {
  const at = GS.indexOf('export function occupyCity');
  assert.ok(at > 0, '找不到 occupyCity()');
  const body = GS.slice(at, GS.indexOf('/** 调试/测试用', at));
  assert.ok(body.length > 100, '找不到 occupyCity()');
  assert.ok(body.includes('save.owned.push(city)'), '要把城加進 owned');
  assert.ok(body.includes('save.armies.filter'), '要把兵團從地圖上撤掉');
  assert.ok(body.includes('persistSave()'), '要寫回存檔');
});

test('[R228] 抵達處理失敗後可重試（arrivedNoticed 只在成功後才寫）', () => {
  const at = FRAME.indexOf('for (const army of res.arrived)');
  assert.ok(at > 0, '找不到抵達掃描迴圈');
  const scan = FRAME.slice(at, at + 400);
  assert.ok(!/this\.arrivedNoticed\.add\(army\.id\);\s*\n\s*arrivedNew/.test(scan), '不能在掃描時就標記（失敗後永遠不再重試）');
  assert.ok(FRAME.includes('this.arrivedNoticed.add(arrivedNew.id)'), '成功後才標記');
});
