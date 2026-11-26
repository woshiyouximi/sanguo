// [R231b] 城內頁返回鍵的語義：內政階段顯示「內 政 終 了」，年中顯示「← 返 回」。
//
// 制作人回報：新局一進來就是內政（時鐘停在 3600、clockPaused=true），
// 但城內頁左上角還是「← 返回」。舊判斷 `clockPaused && clockT <= 0` 在新局永遠不成立
// （T 是 3600，不是 0），所以按鈕文案錯了。
//
// 現在用 `interiorPhase` 這個獨立狀態：進入內政（T=0 自動進、或新局自動開內政）時設 true，
// 「內政終了」時設 false；按鈕與關頁行為都看它。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'cocos/assets/scripts/CampaignRoot.ts');
const src = (): string => readFileSync(SRC, 'utf8');

function bodyOf(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `找不到 ${signature}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`${signature} 本體沒有結尾`);
}

test('R231b 有獨立的內政階段旗標', () => {
  assert.match(src(), /private interiorPhase = false;/, '要有 interiorPhase 欄位（預設 false）');
});

test('R231b 進入內政（T=0）要設旗標', () => {
  const body = bodyOf(src(), 'private enterInterior(');
  assert.match(body, /this\.interiorPhase = true;/, 'enterInterior 要把 interiorPhase 設 true');
});

test('R231b 新局自動開內政也要算內政階段', () => {
  const s = src();
  const i = s.indexOf('if (freshRun && this.save.month <= 1');
  assert.ok(i >= 0);
  const block = s.slice(i, i + 420);
  assert.match(block, /this\.interiorPhase = true;/, '新局自動開城內頁前要把 interiorPhase 設 true');
});

test('R231b 按鈕文案看旗標，不是只看 T<=0', () => {
  assert.match(
    src(),
    /const inInterior = this\.interiorPhase \|\| this\.clockT <= 0;/,
    'openCityPanel 的 inInterior 要把 interiorPhase 算進去',
  );
  assert.match(src(), /backLabel: inInterior \? '內 政 終 了' : '← 返 回'/, '按鈕文案仍是這兩種');
});

test('R231b 內政階段關頁 = 內政終了（清旗標 + 走 endInterior）', () => {
  const s = src();
  const i = s.indexOf('if (this.interiorPhase) {');
  assert.ok(i >= 0, 'onClose 裡要有 interiorPhase 分支');
  const block = s.slice(i, i + 260);
  assert.match(block, /this\.endInterior\(\);/, '內政階段關頁要呼叫 endInterior()');
  assert.match(bodyOf(s, 'private endInterior('), /this\.interiorPhase = false;/, 'endInterior 要清旗標');
});

test('[R233] 内政阶段要落盘：出征/切换场景回来不能自己走时钟', () => {
  const source = src();
  // enterInterior 里落标记
  const enter = bodyOf(source, 'private enterInterior(');
  assert.ok(/GameState\.setInteriorPending\(true\)/.test(enter), 'enterInterior 要 setInteriorPending(true)');
  // endInterior 里清标记
  const end = bodyOf(source, 'private endInterior(');
  assert.ok(/GameState\.setInteriorPending\(false\)/.test(end), 'endInterior 要 setInteriorPending(false)');
  // start() 里据标记恢复内政阶段（时钟先停住再开面板）
  assert.ok(/GameState\.isInteriorPending\(\)/.test(source), 'start() 要读 isInteriorPending()');
  const restore = source.slice(source.indexOf('isInteriorPending()'));
  assert.ok(/this\.clockPaused = true;/.test(restore.slice(0, 400)), '恢复前必须先把时钟停住');
  // 新局自动开内政也要落标记（否则第一次出征回来就掉出内政）
  const fresh = source.slice(source.indexOf('if (freshRun && this.save.month <= 1'));
  assert.ok(/setInteriorPending\(true\)/.test(fresh.slice(0, 300)), '新局自动进内政也要落标记');
});

test('[R233] GameState 有 setInteriorPending/isInteriorPending 且写进 save', () => {
  const gs = readFileSync(join(process.cwd(), 'cocos/assets/scripts/GameState.ts'), 'utf8');
  assert.ok(/export function setInteriorPending\(on: boolean\): void/.test(gs));
  assert.ok(/export function isInteriorPending\(\): boolean/.test(gs));
  assert.ok(/interiorPending\?: boolean;/.test(gs), 'CampaignSave 要声明 interiorPending');
  const body = gs.slice(gs.indexOf('export function setInteriorPending'));
  assert.ok(/delete save\.interiorPending/.test(body.slice(0, 500)), 'false 时要删键（不留 false 污染存档）');
  assert.ok(/persistSave\(\)/.test(body.slice(0, 500)), 'setInteriorPending 要落盘');
});
