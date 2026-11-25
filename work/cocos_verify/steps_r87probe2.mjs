export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); return typeof v === 'string' ? JSON.parse(v) : v; };
  const H = `const cn=(c)=>(c&&(c.__classname__||(c.constructor&&c.constructor.name||''))||'').replace(/^cc\./,'');const all=()=>{const sc=cc.director.getScene();const a=[];const w=(n)=>{a.push(n);n.children.forEach(w);};if(sc)w(sc);return a;};const comp=(nm)=>{for(const n of all()){const c=(n.components||[]).find((x)=>cn(x)===nm);if(c)return c;}return null;};`;
  await evaluate(`cc.director.loadScene('Battle'); 'go'`);
  for (let i = 0; i < 20; i++) { await sleep(1500); const s = await ev(`(() => { const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n === 'Battle') break; }
  await sleep(9000);
  const info = await ev(`(() => { ${H} const r = comp('BattleRoot'); if (!r) return JSON.stringify({err:'no root'});
    const w = r.world; const proto = r.input ? Object.getOwnPropertyNames(Object.getPrototypeOf(r.input)) : [];
    return JSON.stringify({ rootKeys: Object.keys(r).filter((k)=>!k.startsWith('_')).slice(0,40),
      worldKeys: w ? Object.keys(w).slice(0,30) : null, sideKeys: w && w.sides && w.sides.A ? Object.keys(w.sides.A) : null,
      inputProto: proto.slice(0,40), mgr: !!(r.input && r.input.node) }); })()`);
  log('probe ' + JSON.stringify(info));
}
