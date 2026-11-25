export default async function ({ evaluate, sleep, log, shot, keyDown, keyUp }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const snap = `(() => { const s = window.__sanguo.state; const w = s.world; if (!w) return JSON.stringify({ err: 'no world' });
    const side = (sd) => { const a = w.units.filter((u) => u.side === sd && u.alive); return a.length ? +(a.reduce((t, u) => t + u.x, 0) / a.length).toFixed(2) : null; };
    return JSON.stringify({ tick: w.tick, ax: side('A'), msg: s.message }); })()`;
  await evaluate(`location.href='http://127.0.0.1:5173/web/index.html?terrain=7&cb=' + Date.now(); 'go'`);
  await sleep(6000);
  await evaluate(`window.__sanguo.startBattle(); 'ok'`);
  await sleep(2500);
  log('t0 ' + JSON.stringify(await ev(snap)));
  await keyDown('Shift'); await keyDown('Digit5'); await keyUp('Digit5'); await keyUp('Shift');
  await sleep(400);
  log('afterShift5 ' + JSON.stringify(await ev(snap)));
  await sleep(5000);
  log('later ' + JSON.stringify(await ev(snap)));
  await shot('c01_hold');
  await keyDown('Digit1'); await keyUp('Digit1');
  await sleep(600);
  log('afterDigit1 ' + JSON.stringify(await ev(snap)));
  await shot('c02_skill1');
}
