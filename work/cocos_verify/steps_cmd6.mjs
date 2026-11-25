export default async function ({ evaluate, sleep, log, shot, click }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const snap = `(() => { const s = window.__sanguo.state; const w = s.world; if (!w) return JSON.stringify({ err: 'no world' });
    const side = (sd) => { const a = w.units.filter((u) => u.side === sd && u.alive); return a.length ? +(a.reduce((t, u) => t + u.x, 0) / a.length).toFixed(2) : null; };
    return JSON.stringify({ mode: s.mode, tick: w.tick, ax: side('A'), msg: s.message }); })()`;
  const kd = (k, shift) => `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', shiftKey: ${shift ? 'true' : 'false'}, bubbles: true })); return '1'; })()`;
  await evaluate(`location.href='http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now(); 'go'`);
  await sleep(6500);
  await evaluate(`window.__sanguo.startBattle(); 'ok'`);
  await sleep(1500);
  log('t0 ' + JSON.stringify(await ev(snap)));
  await shot('e00_console');
  // 点第 2 颗「部隊指令」开面板（中心 682,1072）
  await click(682, 1072);
  await sleep(400);
  log('menu ' + JSON.stringify(await ev(snap)));
  await shot('e01_menu');
  // 面板第 5 行（全軍待機）：516..736, y=1119+4*36=1263 → 中心 626,1279
  await click(626, 1279);
  await sleep(400);
  log('hold ' + JSON.stringify(await ev(snap)));
  await sleep(3000);
  log('held ' + JSON.stringify(await ev(snap)));
  await shot('e02_hold');
  // 键位 H = 全軍撤退
  await evaluate(kd('h', false));
  await sleep(500);
  log('retreat ' + JSON.stringify(await ev(snap)));
}
