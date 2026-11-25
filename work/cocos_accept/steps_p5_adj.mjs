// 探针：从 c.paths 算接壤目标 + 复算 canRecruit 预判
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = { at: new Date().toISOString() };

  out.adj = await run(`
    const c = __comp('CampaignRoot');
    const d = c.data;
    const owned = c.save.owned || [];
    const generals = d.generals || [];
    const look = (n) => generals.find((x) => x && x.NAME === n) || {};
    const box = (d.garrison || []).find((x) => x && x.scenario === 0) || {};
    const cities = box.cities || {};
    const paths = c.paths || [];
    const nb = {};
    const add = (a, b) => { if (!a || !b) return; (nb[a] = nb[a] || []).push(b); };
    for (const p of paths) {
      if (Array.isArray(p)) { add(p[0], p[1]); add(p[1], p[0]); }
      else if (p) { const a = p.Start || p.start || p.from; const b = p.End || p.end || p.to; add(a, b); add(b, a); }
    }
    const targets = [];
    const seen = new Set();
    for (const o of owned) for (const n of (nb[o] || [])) { if (owned.indexOf(n) >= 0 || seen.has(n)) continue; seen.add(n); }
    for (const name of seen) {
      const g = cities[name] || {};
      const offs = (g.officers || []).map((x) => (typeof x === 'string' ? { name: x } : x));
      const info = offs.map((o) => {
        const p = look(o.name);
        const con = Number(p.CONSTANCY);
        const loyal = Number(o.loyal != null ? o.loyal : p.LOYAL);
        const after = loyal - (10 - con) * 2;
        let t = con >= 5 ? 1 : con >= 3 ? 0 : -1;
        const king = String(g.major || '') === String(o.name) || String(g.owner || '') === String(o.name);
        const ok = !king && con <= 2 && after <= 50 && Number.isFinite(after) && !(after > 70);
        return { n: o.name, con, loyal, after, t, king, ok };
      });
      targets.push({ city: name, owner: g.owner, major: g.major, def: g.garrison, best: info.filter((i) => i.ok).length, info });
    }
    const good = targets.filter((t) => t.best > 0).sort((a, b) => b.best - a.best);
    return JSON.stringify({ owned, neighbors: targets.map((t) => t.city), pathsType: Object.prototype.toString.call(paths), pathLen: paths.length, pathSample: paths.slice(0, 3), goodCount: good.length, good: good.slice(0, 5) });`);
  log('adj: ' + JSON.stringify(out.adj).slice(0, 3000));

  await save('p5.json', out);
  return out;
}
