export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const waitScene = async (name, tries) => { for (let i = 0; i < tries; i++) { await sleep(1500); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n === name) return true; } return false; };
  const H = `
    const cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name || '')) || '').replace(/^cc\./, '');
    const all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
    const comp = (name) => { for (const n of all()) { const c = (n.components || []).find((x) => cn(x) === name); if (c) return c; } return null; };
  `;
  await evaluate(`cc.director.loadScene('Battle'); 'go'`);
  log('battle ' + await waitScene('Battle', 30));
  await sleep(12000);
  const s1 = await ev(`(() => { ${H} const r = comp('BattleRoot'); if (!r) return JSON.stringify({err:'no root'});
    const w = r.world; const slots = (r.input && r.input.slots) ? r.input.slots.length : null;
    return JSON.stringify({ slots, qi: w.sides.A.qi, tick: w.tick, units: (w.units||[]).length, msg: r.lastMessage || null }); })()`);
  log('state ' + JSON.stringify(s1));
  await shot('h01_battle');
  const s2 = await ev(`(() => { ${H} const r = comp('BattleRoot');
    const before = { qi: r.world.sides.A.qi, marks: (r.world.skillMarks||[]).length };
    r.input.tapSkill(0);
    return JSON.stringify({ before, after: { qi: r.world.sides.A.qi, marks: (r.world.skillMarks||[]).length }, msg: r.lastMessage || null }); })()`);
  log('cast ' + JSON.stringify(s2));
  await sleep(2500);
  await shot('h02_cast');
  const s3 = await ev(`(() => { ${H} const r = comp('BattleRoot');
    r.input.tapAssault();
    return JSON.stringify({ rush: !!(r.world.rush && r.world.rush.A), msg: r.lastMessage || null }); })()`);
  log('rush ' + JSON.stringify(s3));
  const x0 = await ev(`(() => { ${H} const r = comp('BattleRoot'); const us = (r.world.units||[]).filter((u) => u.side === 'A' && u.alive); return JSON.stringify({ n: us.length, avgX: us.reduce((s,u)=>s+u.x,0)/Math.max(1,us.length) }); })()`);
  await sleep(4000);
  const x1 = await ev(`(() => { ${H} const r = comp('BattleRoot'); const us = (r.world.units||[]).filter((u) => u.side === 'A' && u.alive); return JSON.stringify({ n: us.length, avgX: us.reduce((s,u)=>s+u.x,0)/Math.max(1,us.length) }); })()`);
  log('rushMove ' + JSON.stringify({ x0, x1 }));
  await shot('h03_rush');
}
