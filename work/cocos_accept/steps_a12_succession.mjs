// 繼承人面板：乾淨截圖（先確認畫面在刷新）
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save, S, waitCampaignReady } = makeCtx(ctx0);
  const { log, sleep, send } = ctx0;
  const out = { at: new Date().toISOString() };
  try { await send('Page.bringToFront'); } catch (e) { out.front = String(e.message); }

  await run(`const s = __scene(); if (s !== 'Campaign') cc.director.loadScene('Campaign'); return JSON.stringify({ from: s });`);
  out.ready = await waitCampaignReady(120);
  log('ready: ' + JSON.stringify(out.ready));

  out.hook = await run(`
    const c = __comp('CampaignRoot');
    const sp = __comp('SurrenderPanel');
    if (sp) sp.node.active = false;
    const ms = c.monarchState || (typeof c.syncMonarchState === 'function' ? c.syncMonarchState() : {}) || {};
    const before = { msMonarch: ms.monarch, seat: c.monarchSeat, owned: (c.save || {}).owned };
    ms.monarch = '嚴綱'; ms.king = '嚴綱';
    c.monarchState = ms;
    c.monarchSeat = '易京';
    c.monarchExtinct = false;
    c.successionState = null;
    c.checkMonarchDeath();
    const mp = __comp('MonarchPanel');
    return JSON.stringify({ before, hasPanel: !!mp, sheetKind: mp ? mp.sheetKind : null, isOpen: mp ? !!mp.isOpen : null,
      view: mp && mp.successionView ? JSON.parse(JSON.stringify(mp.successionView)) : null,
      stateKeys: c.successionState ? Object.keys(c.successionState) : null, hint: c.hintText });`);
  log('hook: ' + JSON.stringify(out.hook).slice(0, 900));

  const frames = async () => (await run(`return JSON.stringify({ f: cc.director.getTotalFrames(), d: cc.director.getDeltaTime() });`));
  out.f0 = await frames();
  await sleep(1500);
  out.f1 = await frames();
  log('frames: ' + JSON.stringify(out.f0) + ' -> ' + JSON.stringify(out.f1));

  // 再確認 MonarchPanel 真的在頂層（不是被 SurrenderPanel 蓋住）
  out.order = await run(`
    const scene = cc.director.getScene();
    const kids = scene.children.map((n) => n.name);
    return JSON.stringify({ sceneChildren: kids, labels: __labels().slice(0, 8) });`);
  log('order: ' + JSON.stringify(out.order).slice(0, 600));

  await S('a12_01_succession');
  await sleep(800);
  await S('a12_02_succession');
  await save('r12.json', out);
  return out;
}
