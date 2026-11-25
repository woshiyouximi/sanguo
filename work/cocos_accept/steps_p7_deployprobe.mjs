// 探针：内政页出征行为空的原因
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = { at: new Date().toISOString() };

  out.st = await run(`
    const c = __comp('CampaignRoot');
    const s = c.save || {};
    const cp = __comp('CityPanel');
    return JSON.stringify({
      scene: __scene(), owned: s.owned, gold: s.gold, month: s.month,
      hasCityPanel: !!cp, sheetRows: cp ? cp.sheetRows : 'no-cp', hint: c.hintText,
      selected: c.selected,
      keys: Object.keys(c).filter((k) => /march|army|deploy|transit/i.test(k)),
      armies: (function () { try { const m = c.save && c.save.armies; return m ? JSON.parse(JSON.stringify(m)) : null; } catch (e) { return 'err'; } })()
    });`);
  log('st: ' + JSON.stringify(out.st).slice(0, 1500));

  out.deployTry = await run(`
    const c = __comp('CampaignRoot');
    c.selected = '北平';
    c.openCityPanel('北平');
    const cp = __comp('CityPanel');
    cp.cmdDeploy();
    return JSON.stringify({ rows: cp.sheetRows ? cp.sheetRows.map((r) => r.text || Object.keys(r).join(',')) : null, hint: c.hintText, msg: cp.msg });`);
  log('deployTry: ' + JSON.stringify(out.deployTry).slice(0, 1200));

  await save('p7.json', out);
  return out;
}
