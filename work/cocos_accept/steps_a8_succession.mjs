// 君主阵亡 → 继承人弹窗：单次 async eval 内轮询就绪后再打钩子
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { S, save, run } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = { at: new Date().toISOString() };

  out.res = await run(`
    return (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let c = null;
      for (let i = 0; i < 120; i += 1) {
        c = __comp('CampaignRoot');
        if (c && c.save && Array.isArray(c.save.owned) && c.save.owned.length) break;
        await sleep(500);
      }
      if (!c || !c.save) return JSON.stringify({ ok: false, why: 'campaign not ready', scene: __scene() });
      const s = c.save;
      const ms = c.monarchState || (typeof c.syncMonarchState === 'function' ? c.syncMonarchState() : {}) || {};
      const before = { monarch_save: s.monarch, king_save: s.king, ms_monarch: ms.monarch, ms_king: ms.king, seat: c.monarchSeat, owned: s.owned.slice(), month: s.month };
      ms.monarch = '嚴綱';
      ms.king = '嚴綱';
      c.monarchState = ms;
      c.monarchSeat = '易京';
      c.monarchExtinct = false;
      c.successionState = null;
      c.checkMonarchDeath();
      await sleep(900);
      const mp = __comp('MonarchPanel');
      const v = mp && mp.successionView ? JSON.parse(JSON.stringify(mp.successionView)) : null;
      return JSON.stringify({
        ok: true, before,
        after: { seat: c.monarchSeat, msMonarch: ms.monarch },
        successionStateKeys: c.successionState ? Object.keys(c.successionState) : null,
        hasPanel: !!mp, sheetKind: mp ? mp.sheetKind : null, isOpen: mp ? !!mp.isOpen : null,
        view: v, hint: c.hintText,
        labels: __labels().slice(0, 24)
      });
    })();`);
  log('res: ' + JSON.stringify(out.res).slice(0, 2200));

  await S('a8_01_succession');
  await save('p11.json', out);
  return out;
}
