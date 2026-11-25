// 修復截圖：把頁面拉到前台 + 校驗 rAF 是否在跑，再截當前（繼承人）面板
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save, S } = makeCtx(ctx0);
  const { log, send, sleep } = ctx0;
  const out = { at: new Date().toISOString() };

  try {
    await send('Page.bringToFront');
    out.bringToFront = 'ok';
  } catch (e) {
    out.bringToFront = 'ERR ' + e.message;
  }
  try {
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    out.focusEmu = 'ok';
  } catch (e) {
    out.focusEmu = 'ERR ' + e.message;
  }

  const frames = async () => {
    const r = await run(`const d = cc.director; return JSON.stringify({ total: d.totalFrames, scene: __scene() });`);
    return r;
  };
  out.f0 = await frames();
  await sleep(1200);
  out.f1 = await frames();
  log('frames: ' + JSON.stringify(out.f0) + ' -> ' + JSON.stringify(out.f1));

  out.live = await run(`
    const mp = __comp('MonarchPanel');
    return JSON.stringify({ scene: __scene(), hasPanel: !!mp, sheetKind: mp ? mp.sheetKind : null, isOpen: mp ? !!mp.isOpen : null });`);
  log('live: ' + JSON.stringify(out.live));

  await S('a9_01_succession');
  await sleep(600);
  await S('a9_02_succession');
  await save('p14.json', out);
  return out;
}
