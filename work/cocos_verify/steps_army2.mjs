export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const snap = `(() => { const s = window.__sanguo.state; const w = s.world; if (!w) return JSON.stringify({ err: 'no world', mode: s.mode });
    const side = (sd) => { const a = w.units.filter((u) => u.side === sd && u.alive); return a.length ? +(a.reduce((t, u) => t + u.x, 0) / a.length).toFixed(3) : null; };
    return JSON.stringify({ mode: s.mode, tick: w.tick, ax: side('A'), bx: side('B'), msg: s.message, order: w.armyOrder ? w.armyOrder.A : null }); })()`;
  await evaluate(`location.href='http://127.0.0.1:5173/web/index.html?terrain=7&cb=' + Date.now(); 'go'`);
  await sleep(6000);
  log('pre ' + JSON.stringify(await ev(snap)));
  await evaluate(`window.__sanguo.startBattle(); 'ok'`);
  await sleep(3000);
  log('started ' + JSON.stringify(await ev(snap)));
  log('hold ' + JSON.stringify(await ev(`(() => { window.__sanguo.armyCommand(0); return JSON.stringify({ msg: window.__sanguo.state.message }); })()`)));
  await sleep(4000);
  log('after-hold ' + JSON.stringify(await ev(snap)));
  log('slot4 ' + JSON.stringify(await ev(`(() => { window.__sanguo.armyCommand(4); return JSON.stringify({ msg: window.__sanguo.state.message }); })()`)));
  await sleep(4000);
  log('after-slot4 ' + JSON.stringify(await ev(snap)));
  await shot('b01_army');
}
