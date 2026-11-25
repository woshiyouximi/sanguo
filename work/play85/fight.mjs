import { boot, sleep } from './cdp.mjs';
const c = await boot();
const P = process.argv[2] || 'f';
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const S = `(()=>{const s=window.__sanguo.state; const w=s.world; if(!w) return {mode:s&&s.mode,noWorld:true}; const A=w.sides.A,B=w.sides.B,g=A.general,gb=B.general;
 return {mode:s.mode,msg:s.message,A:{name:g.name,qi:g.qi,hp:Math.round(g.hp),maxHp:g.maxHp,soldiers:A.aliveCount,start:A.start},
  B:{name:gb.name,hp:Math.round(gb.hp),soldiers:B.aliveCount,start:B.start},over:!!w.over,winner:w.winner||null,
  floaters:(s.floaters||[]).map(f=>f.text).slice(-6),
  skills:(s.skills||[]).map(k=>({n:k.name,qi:k.qi,kind:k.kind})),
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,exp:s.settlement.expGain,merit:s.settlement.meritGain,lv:s.settlement.level,up:s.settlement.levelUp,post:s.settlement.post||null}:null};})()`;
const sample = () => c.eval(S);
await c.shot(P + '_ready');
log('ready', await sample());
await c.mouse(375, 683); await sleep(900);
const q0 = (await sample()).A.qi;
// 技2 半月斬（需瞄準）
let s1 = await sample();
log('afterStart', s1);
const before2 = await sample();
await c.mouse(258, 1168); await sleep(500);
log('sel2', await c.eval(S));
await c.mouse(375, 640); await sleep(900);
const after2 = await sample();
log('cast2', { qiBefore: before2.A.qi, qiAfter: after2.A.qi, msg: after2.msg, floaters: after2.floaters, B: after2.B });
await c.shot(P + '_cast2');
// 技3 落月弓
const b3 = await sample();
if (b3.A.qi >= 24000) {
  await c.mouse(356, 1168); await sleep(500);
  await c.mouse(375, 640); await sleep(900);
  const a3 = await sample();
  log('cast3', { qiBefore: b3.A.qi, qiAfter: a3.A.qi, msg: a3.msg, floaters: a3.floaters, B: a3.B });
  await c.shot(P + '_cast3');
}
let s2 = null;
for (let i = 0; i < 160; i++) { await sleep(400); const t = await sample(); if (t.mode === 'settled') { s2 = t; break; } }
log('settled', s2);
await c.shot(P + '_settle');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-5)));
await c.save(P + '_fight', { s2, errs });
c.close();
