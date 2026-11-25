// 诊断：页面当前状态（刷新后是否回到 Boot/Battle，BattleRoot 是否存在）
export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};
  out.before = await ev(`JSON.stringify({ href: location.href, ready: document.readyState, canvas: !!document.querySelector('canvas'),
    scene: (window.cc && cc.director && cc.director.getScene()) ? cc.director.getScene().name : null })`).catch((e) => ({ err: String(e) }));
  await s('Page.reload', { ignoreCache: true });
  await sleep(2000);
  out.after2s = await ev(`JSON.stringify({ href: location.href, ready: document.readyState, scene: (window.cc && cc.director && cc.director.getScene()) ? cc.director.getScene().name : null })`).catch((e) => ({ err: String(e) }));
  await sleep(12000);
  out.after14s = await ev(`(() => {
    const sc = window.cc && cc.director && cc.director.getScene();
    const names = [];
    const walk = (n) => { names.push(n.name + '[' + (n.components || []).map((c) => (c.__classname__ || (c.constructor && c.constructor.name) || '?')).join(',') + ']'); n.children.forEach(walk); };
    if (sc) walk(sc);
    return JSON.stringify({ scene: sc ? sc.name : null, nodes: names.slice(0, 12), total: names.length });
  })()`).catch((e) => ({ err: String(e) }));
  await shot('probe_state.png');
  log(JSON.stringify(out, null, 2));
  return out;
}
