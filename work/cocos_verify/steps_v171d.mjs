export default async function ({ evaluate, sleep, log, s, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now() });
  let ok = null;
  for (let i = 0; i < 12; i += 1) {
    await sleep(5000);
    const st = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ scene: sc ? sc.name : null }); })()`);
    log('t' + (i + 1) + ' ' + JSON.stringify(st));
    if (st.scene === 'Boot' || st.scene === 'Campaign') { ok = st.scene; if (i >= 2) break; }
  }
  log('ready ' + ok);
  const load = await ev(`(() => { const r = { before: cc.director.getScene() ? cc.director.getScene().name : null }; cc.director.loadScene('Battle'); return JSON.stringify(r); })()`);
  log('load ' + JSON.stringify(load));
  await sleep(12000);
  const after = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ scene: sc ? sc.name : null }); })()`);
  log('after ' + JSON.stringify(after));
  await shot('v171_battle3');
}
