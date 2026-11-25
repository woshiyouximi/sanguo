// 探针 3：bringToFront + 观察 frames
export default async function ({ s, evaluate, sleep, log }) {
  await s('Page.enable');
  await s('Page.bringToFront');
  await sleep(2000);
  for (let i = 0; i < 5; i++) {
    const st = await evaluate(`(() => {
      const sc = (window.cc && cc.director && cc.director.getScene && cc.director.getScene()) || null;
      return JSON.stringify({ t: Math.round(performance.now()), vis: document.visibilityState, hidden: document.hidden,
        inited: !!(window.cc && cc.game && cc.game.inited), frames: window.cc && cc.director ? cc.director.getTotalFrames() : null,
        scene: sc ? sc.name : null, raf: typeof requestAnimationFrame });
    })()`);
    log(i, st);
    await sleep(2000);
  }
  return 'ok';
}
