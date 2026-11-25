export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  await sleep(9000);
  const r = await ev(`(() => {
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const sc = cc.director.getScene();
    const all = []; const w = (n) => { all.push(n); n.children.forEach(w); }; if (sc) w(sc);
    const comps = all.flatMap((n) => (n.components || []).map((c) => __cn(c)));
    const labels = all.filter((n) => (n.components || []).some((c) => __cn(c) === 'Label'))
      .map((n) => { const l = (n.components || []).find((c) => __cn(c) === 'Label'); return (l && l.string) || ''; })
      .filter((s) => s);
    return JSON.stringify({ scene: sc && sc.name, nodes: all.length, hasBootRoot: comps.includes('BootRoot'), comps: Array.from(new Set(comps)).slice(0,20), labels: labels.slice(0,10) });
  })()`);
  log('state ' + JSON.stringify(r));
  await shot('r86_boot_state');
}
