// 探针：找「可招降（节操低/忠诚低）」且与我方接壤的目标城
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = { at: new Date().toISOString() };

  out.shape = await run(`
    const c = __comp('CampaignRoot');
    const d = c && c.data;
    if (!d) return JSON.stringify({ hasData: false });
    const keys = Object.keys(d);
    let sample = null;
    const g = d.generals || d.GENERALS || null;
    if (g) {
      const k = Array.isArray(g) ? 0 : Object.keys(g)[0];
      sample = { key: k, value: Array.isArray(g) ? g[0] : g[k] };
    }
    return JSON.stringify({
      hasData: true, keys,
      generalsType: Object.prototype.toString.call(g), generalsLen: g ? (Array.isArray(g) ? g.length : Object.keys(g).length) : null,
      sample, gs: typeof GameState, winG: typeof window.GameState
    });`);
  log('shape: ' + JSON.stringify(out.shape).slice(0, 1500));

  out.cands = await run(`
    const c = __comp('CampaignRoot');
    const d = c.data;
    const save0 = c.save;
    const owned = save0.owned || [];
    const names = (x) => Array.isArray(x) ? x.map((o) => (typeof o === 'string' ? o : o && o.name)) : [];
    const generals = d.generals || {};
    const look = (n) => { if (Array.isArray(generals)) return generals.find((x) => x && (x.NAME === n || x.name === n)); return generals[n]; };
    const out = [];
    const cities = d.cities && d.cities.list ? d.cities.list : (Array.isArray(d.cities) ? d.cities : []);
    for (const city of cities) {
      const name = city && (city.NAME || city.name);
      if (!name || owned.indexOf(name) >= 0) continue;
      const g = c.data ? null : null;
      out.push(name);
    }
    return JSON.stringify({ cityCount: out.length, first: out.slice(0, 5), owned, citiesType: Object.prototype.toString.call(d.cities) });`);
  log('cands0: ' + JSON.stringify(out.cands));

  await save('p3.json', out);
  return out;
}
