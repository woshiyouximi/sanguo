export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const snap = `(() => { const s = window.__sanguo.state; const w = s.world; if (!w) return JSON.stringify({ err: 'no world' });
    const side = (sd) => { const a = w.units.filter((u) => u.side === sd && u.alive); return a.length ? +(a.reduce((t, u) => t + u.x, 0) / a.length).toFixed(3) : null; };
    return JSON.stringify({ tick: w.tick, ax: side('A'), bx: side('B'), n: w.units.filter(u=>u.alive).length, order: w.armyOrder ? w.armyOrder.A : null }); })()`;
  await evaluate(`location.href='http://127.0.0.1:5173/web/index.html?sim=30&terrain=7&cb=' + Date.now(); 'go'`);
  await sleep(6000);
  const t0 = await ev(snap); log('base ' + JSON.stringify(t0));
  const r = await ev(`(() => { window.__sanguo.armyCommand(0); return JSON.stringify({ msg: window.__sanguo.state.message }); })()`);
  log('cmd0 ' + JSON.stringify(r));
  await sleep(4000);
  const t1 = await ev(snap); log('hold ' + JSON.stringify(t1));
  const r5 = await ev(`(() => { window.__sanguo.armyCommand(4); return JSON.stringify({ msg: window.__sanguo.state.message }); })()`);
  log('cmd4 ' + JSON.stringify(r5));
  await sleep(4000);
  const t2 = await ev(snap); log('rush ' + JSON.stringify(t2));
  await shot('a02_rush');
}
