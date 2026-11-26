import type { EventTouch } from 'cc';
import { Game, game, input } from 'cc';

import { resetTapLatch } from './InputLatch';

/**
 * [R228] 輸入韌性：全局 TOUCH_* 監聽器拋異常時，Cocos 的派發鏈會斷，之後所有點擊都沒反應。
 *
 * 證據（引擎 3.8.8 源碼，路徑 `tools/cocos/cc388/resources/resources/3d/engine/cocos/`）：
 *   ① `input/input.ts:345-359` `_emitEvent()`：
 *        ```
 *        for (let i = 0; i < length; ++i) {
 *          const dispatcher = this._eventDispatcherList[i];
 *          try {
 *            if (!dispatcher.dispatchEvent(event)) { break; }
 *          } catch (e) {
 *            this._clearEvents();
 *            dispatcher.onThrowException();
 *            throw e;      // ← 不吞：繼續往外拋
 *          }
 *        }
 *        ```
 *      一個監聽器 throw ⇒ 同一次派發裡排在它後面的 dispatcher（其它的全局 `input.on` 監聽器）
 *      全部收不到這個事件，異常還一路往外拋。
 *   ② `input/input.ts:506-554` `_frameDispatchEvents()`：NATIVE 下觸摸事件先入
 *      `TouchInputSource` 缓存，每幀由 `dispatchEventsInCache()`（`:523`）派發，派完才
 *      `_clearEvents()`（`:553`）⇒ 一個監聽器 throw，本幀剩余緩存的觸摸事件也一起作廢。
 *   ③ `game/director.ts:757-806` `tick()`：`input._frameDispatchEvents()` 在 `:771`（幀首），
 *      `this._totalFrames++` 在 `:806`（幀末最后一行）⇒ 拋異常的那一幀不會推進幀號，
 *      `InputLatch` 的同幀闩鎖因此可能一直等於「當前幀」，等於所有點擊都被吃掉。
 *
 * 所以本檔做兩件事：
 *   1. `guardTouch()`：把每個 `input.on/off(..., this.onTouch, this)` 換成**同一個**帶
 *      try/catch 的穩定回呼（`on`/`off` 必須拿到同一函式才對得上），任何一幀的異常都只留在
 *      原地、印一行 log，不影響引擎派發鏈與其它監聽器。
 *   2. `installInputResilience()`：掛 `Game.EVENT_HIDE/EVENT_SHOW`，回前台時清掉同幀闩鎖
 *      與引擎排隊中的觸摸事件，避免「後台期間残留的 down/claim + 舊幀號」把回前台後的第一下
 *      點擊吞掉。
 *
 * 為什麼不需要「重掛監聽」：3.8.8 的 `input` 模組在 hide/show 時不會動
 * `_eventDispatcherList`（`_onHide` 只 `emit(Game.EVENT_HIDE)` + `pauseByEngine()`），
 * 各面板 `onEnable` 掛上的全局監聽器跨場景/跨前後台都還在；會壞的是「派發被異常打斷」與
 * 「同幀闩鎖/緩存事件」，所以這裡复位這兩項。
 */

/** 同一個實例 + 同一個方法名 → 同一個包裝回呼（`input.on` / `input.off` 要用同一個函式）。 */
const guardedByTarget = new WeakMap<object, Map<string, (event: EventTouch) => void>>();

/** 拋錯次數；只印前 20 次，避免每幀都拋時刷爆 logcat（次數仍可從 `touchErrorCount()` 取）。 */
let touchErrors = 0;

/** 給 `onTouch` 之類的處理函式套一層「永不外拋」的殼。 */
export function safeTouch<C extends object>(
  label: string,
  handler: (this: C, event: EventTouch) => void,
): (this: C, event: EventTouch) => void {
  return function safeTouchListener(this: C, event: EventTouch): void {
    try {
      handler.call(this, event);
    } catch (err) {
      logTouchError(label, err);
    }
  };
}

function logTouchError(label: string, err: unknown): void {
  touchErrors += 1;
  if (touchErrors <= 20) {
    console.warn('[R228] touch error', label, err);
  } else if (touchErrors === 21) {
    console.warn('[R228] touch error: 超過 20 次，後續不再印');
  }
}

/** 目前為止接住過幾次觸摸處理異常（測試/診斷用）。 */
export function touchErrorCount(): number {
  return touchErrors;
}

/**
 * 取得（並快取）`target[method]` 的帶 try/catch 回呼。
 *
 * 用法：`input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'CampaignRoot'), this)`
 * 對應的 `input.off` 傳同樣三個參數就會拿到同一個函式。
 */
export function guardTouch<T extends object>(
  target: T,
  method: string,
  label: string,
): (event: EventTouch) => void {
  let byKey = guardedByTarget.get(target);
  if (!byKey) {
    byKey = new Map<string, (event: EventTouch) => void>();
    guardedByTarget.set(target, byKey);
  }
  const key = `${label}.${method}`;
  const cached = byKey.get(key);
  if (cached) return cached;

  const listener = safeTouch(key, function guardedMethod(this: T, event: EventTouch): void {
    const fn = (target as unknown as Record<string, unknown>)[method];
    if (typeof fn !== 'function') {
      console.warn('[R228] touch method missing', key);
      return;
    }
    (fn as (this: T, event: EventTouch) => void).call(target, event);
  }) as (event: EventTouch) => void;

  byKey.set(key, listener);
  return listener;
}

/** 回前台時复位輸入狀態：清同幀闩鎖 + 丟掉引擎緩存裡上一個前台狀態的觸摸事件。 */
export function resetInputAfterShow(): void {
  resetTapLatch();

  // `_clearEvents` 是引擎私有 API（`input/input.ts` 的 `private _clearEvents`）。
  // 換引擎版本沒有它時就跳過——不能為了清緩存把回前台流程搞掛。
  const engineInput = input as unknown as { _clearEvents?: () => void };
  try {
    if (typeof engineInput._clearEvents === 'function') engineInput._clearEvents();
  } catch (err) {
    console.warn('[R228] clear queued touch events failed', err);
  }
}

let installed = false;

/**
 * 只裝一次：`Game.EVENT_HIDE/EVENT_SHOW` 是 `game` 上的全局事件，跨場景有效。
 * 各場景 Root 的 `onLoad` 各調一次即可（重複調用直接 return）。
 */
export function installInputResilience(): void {
  if (installed) return;
  installed = true;

  game.on(Game.EVENT_HIDE, () => {
    // 進後台：清闩鎖。後台期間 `director` 不 tick、幀號不動，殘留闩鎖會讓 tapLatched() 一直是 true。
    resetTapLatch();
    console.log('[R228] EVENT_HIDE: tap latch reset');
  });

  game.on(Game.EVENT_SHOW, () => {
    resetInputAfterShow();
    console.log('[R228] EVENT_SHOW: tap latch + queued touches reset');
  });
}
