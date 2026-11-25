import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const S = `(()=>{const s=window.__sanguo.state; const w=s.world; const A=w.sides.A, B=w.sides.B;
 const g=A.general, gb=B.general;
 return {mode:s.mode, time:Math.round(s.time*10)/10, msg:s.message,
  sel:s.selectedSkill?(s.selectedSkill.name||s.selectedSkill.seq||String(s.selectedSkill)):null,
  A:{name:g.name,qi:g.qi,mp:g.mp,mpMax:g.mpMax,hp:Math.round(g.hp),maxHp:g.maxHp,alive:g.alive,soldiers:A.soldiers,aliveCount:A.aliveCount,start:A.start},
  B:{name:gb.name,qi:gb.qi,mp:gb.mp,hp:Math.round(gb.hp),maxHp:gb.maxHp,alive:gb.alive,soldiers:B.soldiers,aliveCount:B.aliveCount,start:B.start},
  over:!!w.over, endReason:w.endReason||null, winner:w.winner||null,
  floaters:(s.floaters||[]).map(f=>f.text||f.t||null).slice(-8),
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,expGain:s.settlement.expGain,meritGain:s.settlement.meritGain,level:s.settlement.level,levelUp:s.settlement.levelUp,post:s.settlement.post}:null};})()`;
log('href', await c.eval('location.href'));
log('state', await c.eval(S));
const shot = await c.shot('s3h_now');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 10)));
await c.save('s3h_now', { href: await c.eval('location.href'), errs, shot });
c.close();
