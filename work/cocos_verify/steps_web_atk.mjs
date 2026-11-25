export default async function ({ evaluate, sleep, log, s, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now() });
  await sleep(5000);
  await s('Page.bringToFront', {});
  await ev(`(() => { const b = document.getElementById('start'); if (b) b.click(); return JSON.stringify({ ok: !!b }); })()`);
  await sleep(1200);
  const setup = await ev(`(() => { const w = window.__sanguo.state.world; const g = w.units.filter((u) => u.isGeneral); const A = g.find((u) => u.side === 'A'); const B = g.find((u) => u.side === 'B'); if (!A || !B) return JSON.stringify({ err: 'no gens' }); A.slide = null; B.slide = null; A.x = 37; A.y = 6; A.prevX = 37; A.prevY = 6; A.cd = 0; B.x = 35; B.y = 6; B.prevX = 35; B.prevY = 6; B.cd = 0; w.units.filter((u) => !u.isGeneral).forEach((u) => { if (u.side === 'A') { u.x = 60; } else { u.x = 12; } }); return JSON.stringify({ ok: true, n: w.units.length }); })()`);
  log('setup ' + JSON.stringify(setup));
  for (let i = 0; i < 10; i++) {
    await sleep(150);
    const r = await ev(`(() => { const w = window.__sanguo.state.world; const g = w.units.filter((u) => u.isGeneral); return JSON.stringify({ t: w.tick, cd: g.map((u) => u.cd), x: g.map((u) => Math.round(u.x * 10) / 10) }); })()`);
    log('f' + i + ' ' + JSON.stringify(r));
    if (i === 3 || i === 6) await shot('g_atk_' + i);
  }
  await shot('g_atk_last');
}

