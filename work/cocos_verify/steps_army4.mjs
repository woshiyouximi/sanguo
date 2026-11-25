export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const snap = `(() => { const s = window.__sanguo.state; const w = s.world; if (!w) return JSON.stringify({ err: 'no world' });
    const side = (sd) => { const a = w.units.filter((u) => u.side === sd && u.alive); return a.length ? +(a.reduce((t, u) => t + u.x, 0) / a.length).toFixed(2) : null; };
    return JSON.stringify({ tick: w.tick, ax: side('A'), msg: s.message, rush: w.rush ? w.rush.A : null }); })()`;
  const kd = (k, shift) => `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', shiftKey: ${shift ? 'true' : 'false'}, bubbles: true })); return '1'; })()`;
  await evaluate(`location.href='http://127.0.0.1:5173/web/index.html?terrain=7&cb=' + Date.now(); 'go'`);
  await sleep(6000);
  await evaluate(`window.__sanguo.startBattle(); 'ok'`);
  await sleep(2000);
  log('t0 ' + JSON.stringify(await ev(snap)));
  await evaluate(kd('5', true));
  await sleep(300);
  log('shift5 ' + JSON.stringify(await ev(snap)));
  await sleep(4000);
  log('after4s ' + JSON.stringify(await ev(snap)));
  await shot('d01_hold');
  await evaluate(kd('6', true));
  await sleep(300);
  log('shift6 ' + JSON.stringify(await ev(snap)));
  await sleep(3000);
  log('after3s ' + JSON.stringify(await ev(snap)));
  await shot('d02_rush');
  await evaluate(kd('1', false));
  await sleep(500);
  log('digit1 ' + JSON.stringify(await ev(snap)));
}
