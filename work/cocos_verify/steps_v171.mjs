export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now() });
  await sleep(12000);
  const boot = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ scene: sc ? sc.name : null }); })()`);
  log('boot ' + JSON.stringify(boot));
  await evaluate(`(() => { cc.director.loadScene('Battle'); return 'go'; })()`);
  await sleep(10000);
  const st = await ev(`(() => {
    const sc = cc.director.getScene();
    const cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    let root = null; const walk = (n) => { (n.components || []).forEach((c) => { if (cn(c) === 'BattleRoot') root = c; }); n.children.forEach(walk); };
    if (sc) walk(sc);
    if (!root) return JSON.stringify({ scene: sc ? sc.name : null, err: 'no root' });
    const w = root.world;
    return JSON.stringify({ scene: sc.name, A: w.sides.A.troops, B: w.sides.B.troops, gA: w.sides.A.general && w.sides.A.general.name, gB: w.sides.B.general && w.sides.B.general.name, rush: !!w.rush, tick: w.tick });
  })()`);
  log('battle ' + JSON.stringify(st));
  await shot('v171_battle');
}
