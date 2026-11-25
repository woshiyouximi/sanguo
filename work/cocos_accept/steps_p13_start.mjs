// 手动重跑 CampaignRoot.start() 抓真实异常
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = {};
  out.r = await run(`
    return (async () => {
      const c = __comp('CampaignRoot');
      if (!c) return JSON.stringify({ step: 'no-root' });
      let err = null;
      try { await c.start(); } catch (e) { err = (e && (e.stack || e.message)) || String(e); }
      return JSON.stringify({
        err: err ? String(err).slice(0, 600) : null,
        save: c.save ? { month: c.save.month, owned: c.save.owned, gold: c.save.gold, monarch: c.save.monarch, runKey: c.save.runKey } : null,
        hint: c.hintText, labelHint: c.labelHint ? c.labelHint.string : null,
        dataKeys: c.data ? Object.keys(c.data) : null, cities: c.cities ? c.cities.length : null
      });
    })();`);
  log('r: ' + JSON.stringify(out.r));
  await save('p13.json', out);
  return out;
}
