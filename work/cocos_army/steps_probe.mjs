export default async function ({ evaluate, sleep, log }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  log('scene ' + (await ev(`(() => { const s = cc.director.getScene(); return JSON.stringify({ name: s && s.name, children: s ? s.children.map((n) => n.name) : [] }); })()`)));
  log('comp ' + (await ev(`(() => { const s = cc.director.getScene(); const names = []; const walk = (n, d) => { if (d > 4) return; names.push(new Array(d + 1).join('.') + n.name + '[' + (n.components || []).map((c) => c.constructor.name).join(',') + ']'); for (const ch of n.children) walk(ch, d + 1); }; walk(s, 0); return JSON.stringify(names.slice(0, 40)); })()`)));
  log('ls ' + (await ev(`JSON.stringify(Object.keys(localStorage).filter((k) => k.indexOf('sanguo') === 0))`)));
  log('lsv ' + (await ev(`(() => { const k = Object.keys(localStorage).filter((x) => x.indexOf('sanguo') === 0); const o = {}; for (const key of k) o[key] = String(localStorage.getItem(key)).slice(0, 160); return JSON.stringify(o); })()`)));
  log('hint ' + (await ev(`(() => { const s = cc.director.getScene(); let lab = []; const walk = (n) => { const c = n.getComponent && n.getComponent(cc.Label); if (c && c.string) lab.push(c.string); for (const ch of n.children) walk(ch); }; walk(s); return JSON.stringify(lab.slice(0, 20)); })()`)));
  await sleep(200);
  return 'ok';
}
