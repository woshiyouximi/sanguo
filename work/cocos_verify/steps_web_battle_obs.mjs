export default async function ({ evaluate, sleep, log, s, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now() });
  await sleep(6000);
  const start = await ev(`(() => { const b = document.querySelector('#startBtn') || document.querySelector('#go'); if (b) { b.click(); return JSON.stringify({ clicked: b.id || b.tagName }); } return JSON.stringify({ clicked: null, ids: Array.from(document.querySelectorAll('button')).map((x) => x.id || x.textContent.slice(0,6)) }); })()`);
  log('start ' + JSON.stringify(start));
  await sleep(6000);
  const t1 = await ev(`(() => { const S = window.__sanguo; if (!S) return JSON.stringify({ err: 'no __sanguo' }); const w = S.state.world; const gs = w.units.filter((u) => u.isGeneral); return JSON.stringify({ tick: w.tick, over: !!w.over, gens: gs.map((u) => ({ s: u.side, x: Math.round(u.x * 100) / 100, y: Math.round(u.y * 100) / 100, cd: u.cd, slide: !!u.slide, alive: u.alive })), alive: { A: w.sides.A.alive, B: w.sides.B.alive }, hp: { A: w.sides.A.hp, B: w.sides.B.hp } }); })()`);
  log('t1 ' + JSON.stringify(t1));
  await shot('w01_mid');
  await sleep(9000);
  const t2 = await ev(`(() => { const S = window.__sanguo; const w = S.state.world; const gs = w.units.filter((u) => u.isGeneral); return JSON.stringify({ tick: w.tick, over: !!w.over, gens: gs.map((u) => ({ s: u.side, x: Math.round(u.x * 100) / 100, y: Math.round(u.y * 100) / 100, cd: u.cd, slide: !!u.slide, alive: u.alive })), alive: { A: w.sides.A.alive, B: w.sides.B.alive }, hp: { A: w.sides.A.hp, B: w.sides.B.hp }, moved: w.units.filter((u) => u.slide).length }); })()`);
  log('t2 ' + JSON.stringify(t2));
  await shot('w02_late');
}
