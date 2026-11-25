export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await sleep(6000);
  const a = await ev(`(() => {
    const sc = cc.director.getScene();
    const names = [];
    const walk = (n) => { (n.components || []).forEach((c) => { const n2 = (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?'; if (names.indexOf(n2) < 0) names.push(n2); }); n.children.forEach(walk); };
    if (sc) walk(sc);
    return JSON.stringify({ scene: sc ? sc.name : null, comps: names.slice(0, 40) });
  })()`);
  log('boot ' + JSON.stringify(a));
  await evaluate(`(() => { cc.director.loadScene('Battle'); return 'go'; })()`);
  await sleep(9000);
  const b = await ev(`(() => {
    const sc = cc.director.getScene();
    const names = [];
    const walk = (n) => { (n.components || []).forEach((c) => { const n2 = (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?'; if (names.indexOf(n2) < 0) names.push(n2); }); n.children.forEach(walk); };
    if (sc) walk(sc);
    return JSON.stringify({ scene: sc ? sc.name : null, comps: names.slice(0, 40) });
  })()`);
  log('battle ' + JSON.stringify(b));
  await shot('v171_scene');
}
