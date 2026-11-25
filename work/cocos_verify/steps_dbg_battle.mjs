// 诊断：BattleRoot 的字段名（找 input / skills / message），以及 BattleInput 是否普通类
export default async function ({ evaluate, sleep, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  await sleep(6000);
  const out = await ev(`(() => {
    const cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const sc = cc.director.getScene();
    const all = []; const walk = (n) => { all.push(n); n.children.forEach(walk); }; if (sc) walk(sc);
    const node = all.find((n) => (n.components || []).some((c) => cn(c) === 'BattleRoot'));
    if (!node) return JSON.stringify({ scene: sc ? sc.name : null, why: 'no BattleRoot', comps: [...new Set(all.flatMap((n) => (n.components || []).map(cn)))].slice(0, 30) });
    const r = (node.components || []).find((c) => cn(c) === 'BattleRoot');
    const keys = Object.keys(r);
    const picked = {};
    for (const k of keys) {
      const v = r[k];
      const t = typeof v;
      if (t === 'object' && v) picked[k] = 'obj:' + cn(v);
      else if (t !== 'function') picked[k] = t + ':' + String(v).slice(0, 24);
    }
    return JSON.stringify({ keys, picked });
  })()`);
  log(JSON.stringify(out, null, 2));
  return out;
}
