// @ts-nocheck
/**
 * [R228] 輸入韌性契約：切後台再回前台「界面還在但所有按鈕點不動」的防回歸測試。
 *
 * 為什麼讀源碼而不是 import：`game/cocos/assets/scripts/**` 不在 `game/src/core/**` 的
 * 同步範圍，測試 import 它會 TS1287；而且這裡要守的是「接線」——每個全局觸摸監聽器有沒有
 * 真的套上 try/catch、回前台有沒有真的复位 InputLatch。
 *
 * 背景（引擎 3.8.8 證據見 InputGuard.ts 頂註解）：
 *   `input/input.ts:345-359` `Input._emitEvent()` 對監聽器異常只 `_clearEvents()` 後
 *   `throw e` 重拋；`game/director.ts:771` 在幀首呼叫 `_frameDispatchEvents()`，
 *   `_totalFrames++` 在 `:806` 幀末 ⇒ 任何 `TOUCH_END` 處理器 throw 都會
 *   ① 斷掉同一次派發裡後面的監聽器 ② 該幀不推進幀號（InputLatch 可能永遠 true）。
 *
 * 四條契約：
 *   1. `InputGuard.ts` 的 `safeTouch()`/`guardTouch()` 用 try/catch 包住處理器並印 `[R228]`；
 *      `guardTouch()` 用 WeakMap 快取（同實例+同方法 → 同一函式），on/off 才對得上。
 *   2. `InputLatch.ts` 導出 `resetTapLatch()`，把 `latchedFrame` 清回 -1。
 *   3. `InputGuard.installInputResilience()` 掛 `Game.EVENT_SHOW/HIDE`；SHOW 分支清闩鎖
 *      並丟棄引擎緩存中的觸摸事件，且重複調用只裝一次。
 *   4. `scripts/**.ts` 裡**所有** `input.on/off(Input.EventType.TOUCH_*)` 都必須是
 *      `guardTouch(this, '<onTouch…>', '<Class>')` 形式（不允許裸 `this.onTouch`），
 *      四個場景 Root 的 `onLoad` 必須叫 `installInputResilience()`。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const SCRIPTS = new URL('../cocos/assets/scripts/', import.meta.url);
const read = (name) => readFileSync(new URL(name, SCRIPTS), 'utf8');

const INPUT_GUARD = read('InputGuard.ts');
const INPUT_LATCH = read('InputLatch.ts');

/** 取某個函式的函式體（含簽名到對應的 `}`）；找不到回空字串。 */
function fnBody(src, name) {
  const hit = new RegExp(
    `^\\s*(?:export\\s+)?(?:function\\s+)?(?:private|public|protected)?\\s*${name}\\s*(?:<[^>]*>)?\\s*\\(`,
    'm',
  ).exec(src);
  if (!hit) return '';
  const open = src.indexOf('{', hit.index);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// 1. safeTouch / guardTouch：異常隔離 + on/off 對稱
// ---------------------------------------------------------------------------

test('[R228] InputGuard.safeTouch：處理器包在 try/catch 裡，異常只印 log 不外拋', () => {
  const body = fnBody(INPUT_GUARD, 'safeTouch');
  assert.ok(body.length > 0, 'safeTouch 函式體找不到');
  assert.match(body, /try\s*\{/, 'safeTouch 必須有 try');
  assert.match(body, /handler\.call\(this, event\)/, 'safeTouch 必須呼叫原處理器');
  assert.match(body, /catch\s*\(err\)\s*\{/, 'safeTouch 必須有 catch');
  assert.match(body, /logTouchError\(label, err\)/, 'catch 裡必須走 logTouchError');
});

test('[R228] InputGuard.logTouchError：log 前綴是 [R228]，且不會無上限刷 logcat', () => {
  const body = fnBody(INPUT_GUARD, 'logTouchError');
  assert.ok(body.length > 0);
  assert.match(body, /console\.warn\('\[R228\] touch error'/);
  assert.match(body, /touchErrors <= 20/, '必須限流，避免每幀都拋時刷爆 logcat');
});

test('[R228] InputGuard.guardTouch：WeakMap 快取同一實例+方法的回呼（on/off 才對得上）', () => {
  assert.match(INPUT_GUARD, /new WeakMap</, '必須用 WeakMap 按實例快取');
  const body = fnBody(INPUT_GUARD, 'guardTouch');
  assert.ok(body.length > 0, 'guardTouch 函式體找不到');
  assert.match(body, /guardedByTarget\.get\(target\)/, '必須先查快取');
  assert.match(body, /guardedByTarget\.set\(target, byKey\)/, '沒有快取時要建表');
  assert.match(body, /byKey\.get\(key\)/, '必須按 method+label 查已包裝的回呼');
  assert.match(body, /return cached;/, '命中快取要回同一個函式');
  assert.match(body, /byKey\.set\(key, listener\)/, '新包裝要寫回快取');
  assert.match(body, /safeTouch\(key,/, '包裝必須走 safeTouch');
  assert.match(body, /typeof fn !== 'function'/, '方法被刪/改名時要能降級而不是拋');
});

// ---------------------------------------------------------------------------
// 2. InputLatch.resetTapLatch：回前台清闩鎖
// ---------------------------------------------------------------------------

test('[R228] InputLatch 導出 resetTapLatch()，把 latchedFrame 清回 -1', () => {
  assert.match(INPUT_LATCH, /export function resetTapLatch\(\): void\s*\{/);
  const body = fnBody(INPUT_LATCH, 'resetTapLatch');
  assert.ok(body.length > 0);
  assert.match(body, /latchedFrame = -1;/, 'resetTapLatch 必須把闩鎖清成 -1');
});

test('[R228] InputLatch.tapLatched：闩鎖未設/已清時必須回 false', () => {
  const body = fnBody(INPUT_LATCH, 'tapLatched');
  assert.ok(body.length > 0);
  assert.match(body, /latchedFrame < 0\)\s*return false;/, 'reset 之後必須放行');
  assert.match(body, /frame < latchedFrame/, '幀號往回跳（場景重載）時要自愈');
});

// ---------------------------------------------------------------------------
// 3. installInputResilience：EVENT_SHOW/HIDE 复位
// ---------------------------------------------------------------------------

test('[R228] installInputResilience：掛 Game.EVENT_SHOW/HIDE，且 SHOW 清闩鎖+丟緩存觸摸', () => {
  const body = fnBody(INPUT_GUARD, 'installInputResilience');
  assert.ok(body.length > 0, 'installInputResilience 函式體找不到');
  assert.match(body, /if \(installed\) return;/, '必須冪等（四個 Root 各調一次）');
  assert.match(body, /game\.on\(Game\.EVENT_HIDE/, '必須掛 EVENT_HIDE');
  assert.match(body, /game\.on\(Game\.EVENT_SHOW/, '必須掛 EVENT_SHOW');
  assert.match(body, /resetInputAfterShow\(\)/, 'EVENT_SHOW 分支必須复位輸入');
});

test('[R228] resetInputAfterShow：先 resetTapLatch()，再（盡力）清引擎緩存觸摸', () => {
  const body = fnBody(INPUT_GUARD, 'resetInputAfterShow');
  assert.ok(body.length > 0);
  assert.match(body, /resetTapLatch\(\);/, '必須清同幀闩鎖');
  assert.match(body, /_clearEvents/, '必須嘗試丟掉上一個前台狀態緩存的觸摸事件');
  assert.match(body, /typeof engineInput\._clearEvents === 'function'/, '私有 API 取不到時要跳過而不是崩');
  assert.match(INPUT_GUARD, /import \{ resetTapLatch \} from '\.\/InputLatch';/);
});

test('[R228] EVENT_HIDE：後台期間幀號不動，也必須清闩鎖', () => {
  const body = fnBody(INPUT_GUARD, 'installInputResilience');
  const hide = body.split('Game.EVENT_HIDE')[1] ?? '';
  assert.match(hide, /resetTapLatch\(\);/, 'HIDE 分支也要 resetTapLatch');
});

// ---------------------------------------------------------------------------
// 4. 全工程接線：每個全局觸摸監聽器都套 guardTouch；四個 Root 都 install
// ---------------------------------------------------------------------------

const REGISTRATION = /^input\.(on|off)\(Input\.EventType\.TOUCH_(?:START|MOVE|END), guardTouch\(this, '(onTouch(?:Start|Move)?)', '([A-Za-z0-9_]+)'\), this\);$/;

function sourceFiles() {
  return readdirSync(SCRIPTS).filter((name) => name.endsWith('.ts'));
}

test('[R228] 所有 input.on/off(TOUCH_*) 都改成 guardTouch 形式，不允許裸 this.onTouch', () => {
  const bare = [];
  const guarded = [];
  const files = new Set();
  for (const name of sourceFiles()) {
    const src = read(name);
    for (const raw of src.split('\n')) {
      const line = raw.trim();
      if (!/^input\.(on|off)\(Input\.EventType\./.test(line)) continue;
      const m = REGISTRATION.exec(line);
      if (!m) {
        bare.push(`${name}: ${line}`);
        continue;
      }
      guarded.push({ name, kind: m[1], method: m[2], label: m[3] });
      files.add(name);
    }
  }
  assert.deepEqual(bare, [], `仍有未套 guardTouch 的註冊：\n${bare.join('\n')}`);
  // 現況 49 條（16 個檔案的 on/off；少於 40 條代表有人整批刪掉了守衛或掃描壞了）。
  assert.ok(guarded.length >= 40, `guardTouch 註冊數異常少：${guarded.length}`);
  assert.equal(files.size, 16, `用全局觸摸監聽器的檔案數變了：${[...files].sort().join(',')}`);
});

test('[R228] 每個檔案的 off 參數都必須能在同一檔案的 on 裡找到（on/off 對稱）', () => {
  for (const name of sourceFiles()) {
    const src = read(name);
    const onKeys = new Set();
    const offKeys = new Set();
    for (const raw of src.split('\n')) {
      const line = raw.trim();
      if (!/^input\.(on|off)\(Input\.EventType\./.test(line)) continue;
      const m = REGISTRATION.exec(line);
      if (!m) continue;
      const key = `${m[2]}|${m[3]}`;
      (m[1] === 'on' ? onKeys : offKeys).add(key);
    }
    assert.ok(onKeys.size > 0 || offKeys.size === 0, `${name} 有 off 沒有 on？`);
    for (const key of offKeys) {
      assert.ok(onKeys.has(key), `${name} 的 off(${key}) 找不到對應的 on（會殘留監聽器）`);
    }
  }
});

test('[R228] 四個場景 Root 的 onLoad 都叫了 installInputResilience()', () => {
  for (const root of ['BootRoot.ts', 'CampaignRoot.ts', 'DeployRoot.ts', 'BattleRoot.ts']) {
    const src = read(root);
    assert.match(
      src,
      /import \{[^}]*installInputResilience[^}]*\} from '\.\/InputGuard';/,
      `${root} 沒有 import installInputResilience`,
    );
    const onLoad = fnBody(src, 'onLoad');
    assert.match(onLoad, /installInputResilience\(\);/, `${root}.onLoad 沒叫 installInputResilience()`);
  }
});

test('[R228] CampaignRoot.onTouch 仍是 tapLatched() 開頭（同幀闩鎖的第一道闸）', () => {
  const src = read('CampaignRoot.ts');
  const body = fnBody(src, 'onTouch');
  assert.ok(body.length > 0);
  assert.match(body, /if \(tapLatched\(\)\) return;/, 'CampaignRoot.onTouch 必須先查同幀闩鎖');
});
