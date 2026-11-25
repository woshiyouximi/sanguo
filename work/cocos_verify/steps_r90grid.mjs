export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); return typeof v === 'string' ? JSON.parse(v) : v; };
  const H = `const cn=(c)=>(c&&(c.__classname__||(c.constructor&&c.constructor.name||''))||'').replace(/^cc\./,'');const all=()=>{const sc=cc.director.getScene();const a=[];const w=(n)=>{a.push(n);n.children.forEach(w);};if(sc)w(sc);return a;};const comp=(nm)=>{for(const n of all()){const c=(n.components||[]).find((x)=>cn(x)===nm);if(c)return c;}return null;};`;
  await evaluate(`cc.director.loadScene('Battle'); 'go'`);
  for (let i = 0; i < 24; i++) { await sleep(1200); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n === 'Battle') break; }
  await sleep(8000);
  const snap = `(() => { ${H} const r = comp('BattleRoot'); const w = r.world; const us=(w.units||[]).filter(u=>u.side==='A'&&u.alive);
    const cells = us.map(u=>({x:Math.round(u.x),y:Math.round(u.y),fx:u.slide?u.slide.fx:null,tx:u.slide?u.slide.tx:null}));
    return JSON.stringify({ tick:w.tick, n:us.length, avgX: us.reduce((s,u)=>s+u.x,0)/Math.max(1,us.length), sample: cells.slice(0,6) }); })()`;
  const a = await ev(snap); log('t0 ' + JSON.stringify(a));
  await sleep(6000);
  const b = await ev(snap); log('t1 ' + JSON.stringify(b));
  await shot('i01_grid_move');
  const rush = await ev(`(() => { ${H} const r = comp('BattleRoot'); if (r.input&&r.input.tapAssault) r.input.tapAssault(); return JSON.stringify({ rush: !!(r.world.rush&&r.world.rush.A), msg: r.lastMessage||null }); })()`);
  log('rush ' + JSON.stringify(rush));
  await sleep(4000); await shot('i02_rush');
}
