import { director } from 'cc';

/**
 * 同一帧只允许一个场景/面板消费一次点击。
 *
 * Cocos 的全局 `input` 派发是「所有监听器按注册顺序全收到」，而 `director.loadScene()`
 * 是异步的：出征编成页点「出征」切场景的那一帧，大地图（`CampaignRoot.onTouch`）仍然活着，
 * 同一个 `TOUCH_END` 会被它再处理一次——实测正好落到「內政終了」按钮上，于是刚开的局被
 * 推进一年，并顺着 `advanceMonth → civic → CityPanel.mergeSave` 抛
 * `Cannot read properties of null (reading 'slice')`，异常从 `Input._emitEvent` 冒出去之后
 * **整条输入链就永久断了**（之后所有点击无反应，只能强杀）。
 *
 * 用法：谁真正消费了一次点击，就在动作前 `latchTap()`；其余全局监听器开头
 * `if (tapLatched()) return;`。闩锁只挡同一帧，不影响下一帧的点击。
 */
let latchedFrame = -1;

/** 记下「本帧的这次点击已经有人认领了」。 */
export function latchTap(): void {
  latchedFrame = director ? director.getTotalFrames() : -1;
}

/**
 * [R228] 清掉同帧闩锁 —— 切后台/回前台时必须调。
 *
 * 闩锁记的是 `director.getTotalFrames()`：進后台后引擎不 tick，帧号停在原处；
 * 如果闩锁正好记的是「隐藏前那一帧」，回前台后 `tapLatched()` 会一直是 true，
 * 大地图/面板的所有点击都被当成「本帧已消费」直接 return（= 界面还在但点不动）。
 */
export function resetTapLatch(): void {
  latchedFrame = -1;
}

/** 本帧的点击是否已被别人认领（同帧的其它监听器应当直接返回）。 */
export function tapLatched(): boolean {
  if (!director || latchedFrame < 0) return false;
  const frame = director.getTotalFrames();
  // 帧号往回跳（场景重载/引擎重置计数器）时清闩锁，否则会永久 true。
  if (frame < latchedFrame) {
    latchedFrame = -1;
    return false;
  }
  return frame === latchedFrame;
}
