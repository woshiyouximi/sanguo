// 诊断：打印场景里每个节点的 components[].constructor.name 与 node.name，找面板组件真名
export default async function ({ evaluate, sleep, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  await sleep(6000);
  const out = await ev(`(() => {
    const sc = cc.director.getScene();
    const rows = [];
    const walk = (n, d) => {
      const cs = (n.components || []).map((c) => (c && c.constructor && (c.constructor.name || '?')) + (c && c.__classname__ ? '(' + c.__classname__ + ')' : ''));
      if (cs.length || d < 3) rows.push('  '.repeat(d) + n.name + ' :: ' + cs.join(','));
      n.children.forEach((c) => walk(c, d + 1));
    };
    if (sc) walk(sc, 0);
    return JSON.stringify({ scene: sc ? sc.name : null, count: rows.length, rows: rows.slice(0, 60) });
  })()`);
  log(JSON.stringify(out, null, 2));
  return out;
}
