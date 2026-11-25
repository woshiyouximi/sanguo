export default async function ({ evaluate, sleep, log, s, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now() });
  await sleep(5000);
  await s('Page.bringToFront', {});
  await ev(`(() => { const b = document.getElementById('start'); if (b) b.click(); return JSON.stringify({ ok: !!b }); })()`);
  await sleep(1200);
  await ev(`(() => { const w = window.__sanguo.state.world; const g = w.units.filter((u) => u.isGeneral); const A = g.find((u) => u.side === 'A'); const B = g.find((u) => u.side === 'B'); A.slide = null; B.slide = null; A.x = 37; A.y = 6; A.prevX = 37; A.prevY = 6; A.cd = 0; B.x = 35; B.y = 6; B.prevX = 35; B.prevY = 6; B.cd = 0; return JSON.stringify({ ok: true }); })()`);
  let got = 0;
  for (let i = 0; i < 40 && got < 3; i++) {
    await sleep(100);
    const r = await ev(`(() => { const w = window.__sanguo.state.world; const g = w.units.filter((u) => u.isGeneral); return JSON.stringify({ t: w.tick, cd: g.map((u) => u.cd), hp: g.map((u) => Math.round(u.hp)) }); })()`);
    if (r.cd[0] <= 8 && r.cd[0] > 0) { await shot('atk_' + got); log('shot at ' + JSON.stringify(r)); got++; }
  }
  log('done shots=' + got);
}
