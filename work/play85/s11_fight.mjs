import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const S = `(()=>{const s=window.__sanguo.state; const w=s.world; const A=w&&w.sides.A, B=w&&w.sides.B;
 if(!w) return {mode:s&&s.mode, noWorld:true};
 const g=A.general, gb=B.general;
 return {mode:s.mode, time:Math.round(s.time*10)/10, msg:s.message, sel:s.selectedSkill?String(s.selectedSkill.name||s.selectedSkill.seq):null,
  A:{name:g.name,qi:g.qi,mp:g.mp,hp:Math.round(g.hp),maxHp:g.maxHp,alive:g.alive,soldiers:A.aliveCount,start:A.start},
  B:{name:gb.name,qi:gb.qi,hp:Math.round(gb.hp),alive:gb.alive,soldiers:B.aliveCount,start:B.start},
  over:!!w.over, winner:w.winner||null,
  floaters:(s.floaters||[]).map(f=>f.text).slice(-6),
  skills:(s.skills||[]).map(k=>({n:k.name,kind:k.kind,qi:k.qi,mp:k.mp,ok:k.ok})),
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,exp:s.settlement.expGain,merit:s.settlement.meritGain,lv:s.settlement.level,up:s.settlement.levelUp,post:(s.settlement.post||null)}:null};})()`;
const sample = () => c.eval(S);
log('t0', await sample());
await c.shot('s11a_ready');
await c.mouse(375, 683); await sleep(900);
log('started', await sample());
const q0 = (await sample()).A;
await c.shot('s11b_fight');
// 技1 治疗（直接施放）
const before1 = await sample();
await c.mouse(160, 1168); await sleep(700);
const after1 = await sample();
log('heal', { beforeQi: before1.A.qi, afterQi: after1.A.qi, beforeHp: before1.A.hp, afterHp: after1.A.hp, msg: after1.msg, cast: after1.skills[0] });
await c.shot('s11c_heal');
// 技2 攻擊 → 瞄準 → 點戰場
const before2 = await sample();
await c.mouse(258, 1168); await sleep(400);
const aim = await sample();
await c.mouse(375, 640); await sleep(900);
const after2 = await sample();
log('strike', { beforeQi: before2.A.qi, afterQi: after2.A.qi, aimSel: aim.sel, msg: after2.msg, floaters: after2.floaters, B: after2.B });
await c.shot('s11d_strike');
// 技3
const before3 = await sample();
if (before3.A.qi >= (before3.skills[2] ? before3.skills[2].qi : 1e9)) {
  await c.mouse(356, 1168); await sleep(400);
  await c.mouse(375, 640); await sleep(900);
  const after3 = await sample();
  log('strike3', { beforeQi: before3.A.qi, afterQi: after3.A.qi, msg: after3.msg, floaters: after3.floaters, B: after3.B });
  await c.shot('s11e_strike3');
}
// 等結算
let s2 = null;
for (let i = 0; i < 150; i++) { await sleep(400); const t = await sample(); if (t.mode === 'settled') { s2 = t; break; } }
log('settled', s2 && { msg: s2.msg, settlement: s2.settlement, A: s2.A, B: s2.B, winner: s2.winner });
await c.shot('s11f_settle');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s11_fight', { s2, errs });
c.close();
