// 探针：列出守将 CONSTANCY/LOYAL + 接壤目标
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = { at: new Date().toISOString() };

  out.targets = await run(`
    const c = __comp('CampaignRoot');
    const d = c.data;
    const owned = c.save.owned || [];
    const generals = d.generals || [];
    const look = (n) => generals.find((x) => x && x.NAME === n);
    const box = (d.garrison || []).find((x) => x && x.scenario === 0) || {};
    const cities = box.cities || {};
    const all = [];
    for (const name of Object.keys(cities)) {
      if (owned.indexOf(name) >= 0) continue;
      const g = cities[name] || {};
      const officers = (g.officers || []).map((o) => (typeof o === 'string' ? o : o && o.name));
      const info = officers.map((n) => { const p = look(n); return { n, con: p ? Number(p.CONSTANCY) : null, loyal: p ? Number(p.LOYAL) : null }; });
      all.push({ city: name, owner: g.owner, def: g.garrison, info });
    }
    const good = all.filter((x) => x.info.some((i) => Number.isFinite(i.con) && i.con <= 2 && (!Number.isFinite(i.loyal) || i.loyal <= 70)));
    const lowLoyal = all.filter((x) => x.info.some((i) => Number.isFinite(i.loyal) && i.loyal < 25));
    const keysOfC = Object.keys(c).filter((k) => /path|link|road|cities/i.test(k));
    return JSON.stringify({ owned, nonOwned: all.length, goodCount: good.length, good: good.slice(0, 10), lowLoyal: lowLoyal.slice(0, 6), keysOfC, sample: all.slice(0, 4) });`);
  log('targets: ' + JSON.stringify(out.targets).slice(0, 3000));

  await save('p4.json', out);
  return out;
}
