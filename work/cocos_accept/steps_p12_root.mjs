// 深探 CampaignRoot 状态
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = {};
  out.st = await run(`
    const c = __comp('CampaignRoot');
    const keys = Object.keys(c || {});
    let ls = [];
    try { const L = cc.sys.localStorage; for (let i = 0; i < L.length; i += 1) { const k = L.key(i); if (String(k).indexOf('sanguo') >= 0) ls.push(k); } } catch (e) { ls = ['ERR:' + e.message]; }
    return JSON.stringify({
      hasRoot: !!c, keys,
      save: c && c.save ? { month: c.save.month, owned: c.save.owned, gold: c.save.gold, monarch: c.save.monarch, runKey: c.save.runKey } : null,
      loading: c ? c.loading : 'n/a', hint: c ? c.hintText : null,
      scene: __scene(), ls
    });`);
  log('st: ' + JSON.stringify(out.st));
  await save('p12.json', out);
  return out;
}
