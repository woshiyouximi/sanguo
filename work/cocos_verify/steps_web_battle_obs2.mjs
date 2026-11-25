export default async function ({ evaluate, sleep, log, s, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const expr = (tag) => `(() => { const S = window.__sanguo; const w = S.state.world; const gs = w.units.filter((u) => u.isGeneral); const sol = w.units.filter((u) => !u.isGeneral); return JSON.stringify({ tick: w.tick, over: !!w.over, gens: gs.map((u) => [u.side, Math.round(u.x*10)/10, u.y, u.cd, u.slide?1:0, Math.round(u.hp)]), solMoved: sol.filter((u) => u.slide).length, solN: sol.length, A: w.sides.A.alive, B: w.sides.B.alive }); })()`;
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now() });
  await sleep(6000);
  const st = await ev(`(() => { const b = document.getElementById('start'); if (b) { b.click(); return JSON.stringify({ ok: true }); } return JSON.stringify({ ok: false }); })()`);
  log('click ' + JSON.stringify(st));
  for (const [tag, wait] of [['t2', 2000], ['t7', 5000], ['t15', 8000], ['t27', 12000]]) {
    await sleep(wait);
    const r = await ev(expr(tag));
    log(tag + ' ' + JSON.stringify(r));
    await shot('w_' + tag);
  }
}
