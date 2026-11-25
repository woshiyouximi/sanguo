export default async function ({ evaluate, sleep, log, s, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now() });
  await sleep(5000);
  await s('Page.bringToFront', {});
  await ev(`(() => { const b = document.getElementById('start'); if (b) b.click(); return JSON.stringify({ ok: !!b }); })()`);
  const a = await ev(`(() => { const w = window.__sanguo.state.world; return JSON.stringify({ tick: w.tick, now: performance.now() }); })()`);
  await sleep(3000);
  const b = await ev(`(() => { const w = window.__sanguo.state.world; return JSON.stringify({ tick: w.tick, now: performance.now() }); })()`);
  log('rate ' + JSON.stringify({ a, b, dtick: b.tick - a.tick, dms: Math.round(b.now - a.now) }));
  await sleep(6000);
  const c = await ev(`(() => { const w = window.__sanguo.state.world; const g = w.units.filter((u) => u.isGeneral); return JSON.stringify({ tick: w.tick, gens: g.map((u) => [u.side, Math.round(u.x*10)/10, u.y, u.cd]) }); })()`);
  log('later ' + JSON.stringify(c));
  await shot('w_rate');
}

