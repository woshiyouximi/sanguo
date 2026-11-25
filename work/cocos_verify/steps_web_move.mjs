export default async function ({ evaluate, sleep, log, s, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now() });
  await sleep(5000);
  await s('Page.bringToFront', {});
  await ev(`(() => { const b = document.getElementById('start'); if (b) b.click(); return JSON.stringify({ ok: !!b }); })()`);
  for (let i = 0; i < 5; i++) {
    await sleep(4000);
    const r = await ev(`(() => { const w = window.__sanguo.state.world; const g = w.units.filter((u) => u.isGeneral); return JSON.stringify({ tick: w.tick, x: g.map((u) => Math.round(u.x*10)/10), cd: g.map((u) => u.cd), hp: g.map((u) => Math.round(u.hp)), over: !!w.over }); })()`);
    log('s' + i + ' ' + JSON.stringify(r));
    if (i === 4) await shot('w_move_20s');
  }
}
