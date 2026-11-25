export default async function ({ evaluate, log, s, sleep }) {
  const ev = async (x) => { const v = await evaluate(x); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&cb=' + Date.now() });
  await sleep(5000); await s('Page.bringToFront', {});
  await ev(`(() => { const b = document.getElementById('start'); if (b) b.click(); return JSON.stringify({ ok: !!b }); })()`);
  await sleep(1500);
  const r = await ev(`(() => { const w = window.__sanguo.state.world; const A = w.sides.A.general; const u = w.units.find((x) => x.isGeneral && x.side === 'A'); return JSON.stringify({ gen: { name: A.name, str: A.str, int: A.int, level: A.level, baseHp: A.baseHp, hp: A.hp, maxHp: A.maxHp }, unit: { str: u.str, level: u.level, hp: u.hp, maxHp: u.maxHp, cd: u.cd } }); })()`);
  log(JSON.stringify(r));
}
