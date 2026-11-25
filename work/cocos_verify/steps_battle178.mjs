export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.bringToFront', {});
  await sleep(3000);
  await shot('b01_overlay');
  const st = await ev(`(() => { __sanguo.startBattle(); return JSON.stringify({ ok: true }); })()`);
  log('start ' + JSON.stringify(st));
  const G = `(() => { const w = __sanguo.state.world; const g = w.units.filter(u=>u.isGeneral); return JSON.stringify({ tick: w.tick, gens: g.map(u=>({side:u.side,x:Math.round(u.x*10)/10,y:u.y,cd:u.cd,atk:u.lastAttackTick??null})), alive: g.map(u=>u.alive) }); })()`;
  await sleep(2000);
  log('t1 ' + JSON.stringify(await ev(G)));
  await shot('b02_idle');
  await ev(`(() => { __sanguo.armyCommand(0); return JSON.stringify({ok:true}); })()`);
  await sleep(8000);
  log('t2 ' + JSON.stringify(await ev(G)));
  await shot('b03_march');
  await sleep(8000);
  log('t3 ' + JSON.stringify(await ev(G)));
  await shot('b04_later');
}
