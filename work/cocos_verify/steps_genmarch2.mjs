export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const s = async (m, p) => evaluate(`(window.__cdp ? window.__cdp(${JSON.stringify(m)}, ${JSON.stringify(p || {})}) : 'no')`);
  await evaluate(`location.href='http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now(); 'go'`);
  await sleep(6000);
  await s('Input.dispatchMouseEvent', { type: 'mousePressed', x: 438, y: 640, button: 'left', clickCount: 1 });
  await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 438, y: 640, button: 'left', clickCount: 1 });
  await sleep(4000);
  const probe = async () => ev(`(() => {
    const S = window.__sanguo || {};
    const w = S.world || (S.state && S.state.world) || null;
    if (!w) return JSON.stringify({ err: 'no world', keys: Object.keys(S) });
    const gs = w.units.filter((u) => u.isGeneral).map((u) => ({ side: u.side, x: +u.x.toFixed(2), y: +u.y.toFixed(2), cd: u.cd, atk: u.lastAttackTick === undefined ? null : u.lastAttackTick }));
    return JSON.stringify({ tick: w.tick, over: w.over, gs });
  })()`);
  log('a ' + JSON.stringify(await probe()));
  await sleep(3000);
  log('b ' + JSON.stringify(await probe()));
  await shot('m2_march');
}
