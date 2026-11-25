export default async function ({ evaluate, sleep, log }) {
  const ev = async (x) => { const v = await evaluate(x); return typeof v === 'string' ? JSON.parse(v) : v; };
  await sleep(3000);
  const r = await ev(`(() => {
    const cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name || '')) || '').replace(/^cc\./, '');
    const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; w(sc);
    const root = a.map((n) => (n.components || []).find((c) => cn(c) === 'BattleRoot')).find(Boolean);
    if (!root) return JSON.stringify({ err: 'no root' });
    const keys = Object.keys(root).filter((k) => !k.startsWith('_'));
    const wd = root.world || (root['world$']) || null;
    const sideKeys = wd && wd.sides && wd.sides.A ? Object.keys(wd.sides.A) : null;
    const inp = root.input ? Object.getOwnPropertyNames(Object.getPrototypeOf(root.input)).filter((k) => typeof root.input[k] === 'function') : null;
    return JSON.stringify({ rootKeys: keys, sideKeys, inputFns: inp, worldKeys: wd ? Object.keys(wd).slice(0, 24) : null });
  })()`);
  log(JSON.stringify(r));
}
