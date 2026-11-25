export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const msg = `(() => JSON.stringify({ msg: window.__sanguo.state.message }))()`;
  const kd = (k) => `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true })); return '1'; })()`;
  await evaluate(`location.href='http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now(); 'go'`);
  await sleep(6500);
  await evaluate(`window.__sanguo.startBattle(); 'ok'`);
  await sleep(1200);
  for (const k of ['g', 'g', 'f', 'a']) {
    await evaluate(kd(k));
    await sleep(350);
    log(k + ' -> ' + JSON.stringify(await ev(msg)));
  }
  await shot('h01_lord');
}
