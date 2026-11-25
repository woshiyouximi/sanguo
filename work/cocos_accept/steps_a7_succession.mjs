// 君主阵亡 → 继承人弹窗（dev 钩子：改 monarchState + 座位）
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { S, save, run, waitCampaignReady } = makeCtx(ctx0);
  const { log, sleep } = ctx0;
  const out = { at: new Date().toISOString() };

  await run(`cc.director.loadScene('Campaign'); return JSON.stringify({ ok: 1 });`);
  await waitCampaignReady(45);
  await sleep(1500);

  out.before = await run(`
    const c = __comp('CampaignRoot');
    const s = c.save;
    const ms = c.monarchState || {};
    return JSON.stringify({ monarch_save: s.monarch, king_save: s.king, ms_monarch: ms.monarch, ms_king: ms.king, seat: c.monarchSeat, owned: s.owned, month: s.month, force: c.playerForce ? c.playerForce() : null });`);
  log('before: ' + JSON.stringify(out.before));

  out.hook = await run(`
    const c = __comp('CampaignRoot');
    const ms = c.monarchState || {};
    ms.monarch = '嚴綱';
    ms.king = '嚴綱';
    c.monarchSeat = '易京';
    c.monarchExtinct = false;
    c.successionState = null;
    c.checkMonarchDeath();
    const mp = __comp('MonarchPanel');
    return JSON.stringify({
      seatAfter: c.monarchSeat,
      successionState: c.successionState ? { keys: Object.keys(c.successionState) } : null,
      hasPanel: !!mp, sheetKind: mp ? mp.sheetKind : null, hint: c.hintText
    });`);
  log('hook: ' + JSON.stringify(out.hook));

  await sleep(1500);
  out.view = await run(`
    const mp = __comp('MonarchPanel');
    if (!mp) return JSON.stringify({ hasPanel: false, nodes: __all().filter((n) => /Monarch/i.test(n.name)).map((n) => n.name) });
    const v = mp.successionView || null;
    const safe = v ? JSON.parse(JSON.stringify(v)) : null;
    return JSON.stringify({ hasPanel: true, isOpen: !!mp.isOpen, sheetKind: mp.sheetKind, view: safe, labels: __labels().slice(0, 26), hits: mp.hits ? mp.hits.map((h) => h.act) : null });`);
  log('view: ' + JSON.stringify(out.view).slice(0, 1500));

  await S('a7_01_succession');

  out.slotRows = await run(`
    const cc0 = window.cc;
    return JSON.stringify({ hasCc: !!cc0, keys: cc0 && cc0.sys ? cc0.sys.localStorage.getItem('sanguo_slots_v1') : 'no-cc' });`);

  await save('p9.json', out);
  return out;
}
