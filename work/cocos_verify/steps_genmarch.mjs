export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now(); 'go'`);
  await sleep(6000);
  await evaluate(`(() => { try { window.__sanguo && window.__sanguo.start && window.__sanguo.start(); } catch (e) {} return 'ok'; })()`);
  await sleep(5000);
  const probe = async () => ev(`(() => {
    const w = (window.__sanguo && window.__sanguo.world) || null;
    if (!w) return JSON.stringify({ err: 'no world' });
    const gs = w.units.filter((u) => u.isGeneral).map((u) => ({ side: u.side, x: +u.x.toFixed(2), y: +u.y.toFixed(2), cd: u.cd, atk: u.lastAttackTick === undefined ? null : u.lastAttackTick }));
    return JSON.stringify({ tick: w.tick, over: w.over, gs });
  })()`);
  const a = await probe();
  log('t0 ' + JSON.stringify(a));
  await sleep(4000);
  const b = await probe();
  log('t1 ' + JSON.stringify(b));
  await shot('m_generals_march');
}
