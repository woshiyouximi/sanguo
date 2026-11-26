// 最小自检：页面是否活着、cc 是否就绪、帧数是否在涨
export default async function (ctx) {
  const { send, evaluate, sleep, shot, log } = ctx;
  const evalT = async (expr, ms = 6000) => {
    const r = await Promise.race([
      evaluate(expr, { returnByValue: true }),
      sleep(ms).then(() => ({ __timeout: true })),
    ]);
    return r;
  };
  const out = {};
  try { await send('Page.bringToFront', {}); } catch (e) { out.frontErr = String(e && e.message || e); }
  out.url = await evalT('location.href', 5000);
  out.ready = await evalT('typeof cc', 5000);
  out.scene = await evalT("(cc && cc.director && cc.director.getScene()) ? cc.director.getScene().name : 'none'", 5000);
  out.f0 = await evalT('cc.director.getTotalFrames()', 5000);
  await sleep(500);
  out.f1 = await evalT('cc.director.getTotalFrames()', 5000);
  out.paused = await evalT('cc.game.isPaused()', 5000);
  out.shot = await shot('50_web_selfcheck.png');
  return out;
}
