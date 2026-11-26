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

/** 本帧的点击是否已被别人认领（同帧的其它监听器应当直接返回）。 */
export function tapLatched(): boolean {
  if (!director || latchedFrame < 0) return false;
  return director.getTotalFrames() === latchedFrame;
}
