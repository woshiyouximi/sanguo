// 诊断：不刷新，等 Battle 场景加载后看 BattleRoot / world / input 状态并截图
export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};
  for (const t of [4000, 4000, 4000]) {
    await sleep(t);
    out['at' + ((out.__n = (out.__n || 0) + 1) * 4000 + 4000)] = await ev(`(() => {
      const sc = window.cc && cc.director && cc.director.getScene();
      const names = [];
      const walk = (n) => { names.push(n.name + '[' + (n.components || []).map((c) => (c.__classname__ || (c.constructor && c.constructor.name) || '?')).join(',') + ']'); n.children.forEach(walk); };
      if (sc) walk(sc);
      const cv = document.querySelector('canvas');
      return JSON.stringify({ scene: sc ? sc.name : null, n: names.length, head: names.slice(0, 8), canvas: cv ? [cv.width, cv.height] : null });
    })()`);
  }
  await shot('probe_boot.png');
  log(JSON.stringify(out, null, 2));
  return out;
}
