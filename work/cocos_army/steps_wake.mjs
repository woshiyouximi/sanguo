// 让页面真的被渲染：用 Browser.setWindowBounds 把窗口恢复成 normal，再 bringToFront。
// project/169：窗口最小化 / 被完全遮挡 / 后台 tab 都会让 rAF 停走，getTotalFrames 不涨。
export default async function ({ send, evaluate, sleep, log }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const win = await send('Browser.getWindowForTarget');
  log('window ' + JSON.stringify(win));
  const id = win && win.windowId;
  try {
    await send('Browser.setWindowBounds', { windowId: id, bounds: { windowState: 'normal' } });
  } catch (e) {
    log('setWindowBounds(normal) failed: ' + e.message);
  }
  try {
    await send('Browser.setWindowBounds', { windowId: id, bounds: { left: 40, top: 20, width: 1000, height: 1500 } });
  } catch (e) {
    log('setWindowBounds(rect) failed: ' + e.message);
  }
  await send('Page.bringToFront');
  await sleep(1500);
  const vis = async () => ev(`JSON.stringify({ hidden: document.hidden, state: document.visibilityState, f: cc.director.getTotalFrames(), paused: cc.game.isPaused ? cc.game.isPaused() : null })`);
  log('vis1 ' + (await vis()));
  await sleep(1200);
  log('vis2 ' + (await vis()));
  return 'ok';
}
