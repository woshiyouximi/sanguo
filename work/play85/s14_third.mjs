import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const S = `(()=>{const s=window.__sanguo.state; const w=s.world; if(!w) return {noWorld:true,mode:s&&s.mode}; const A=w.sides.A,B=w.sides.B;
 return {mode:s.mode,msg:s.message,A:{qi:A.general.qi,hp:Math.round(A.general.hp),soldiers:A.aliveCount},B:{hp:Math.round(B.general.hp),soldiers:B.aliveCount},
  over:!!w.over, settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,exp:s.settlement.expGain,merit:s.settlement.meritGain,lv:s.settlement.level,up:s.settlement.levelUp,post:s.settlement.post||null}:null};})()`;
await c.shot('s14_ready');
log('ready', await c.eval(S));
await c.mouse(375, 683); await sleep(900);
await c.mouse(258, 1168); await sleep(500);
await c.mouse(375, 640); await sleep(800);
log('afterCast', await c.eval(S));
let s2 = null;
for (let i = 0; i < 160; i++) { await sleep(400); const t = await c.eval(S); if (t.mode === 'settled') { s2 = t; break; } }
log('settled', s2 && { msg: s2.msg, settlement: s2.settlement, A: s2.A, B: s2.B });
await c.shot('s14_settle');
// 再戰 按鈕位置
const rb = await c.eval(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>/再\\s*戰/.test(b.innerText)); if(!bs.length) return null; const q=bs[0].getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2,bs[0].innerText];})()`);
log('rezhanBtn', rb);
if (rb) {
  await c.mouse(rb[0], rb[1]); await sleep(1500);
  log('afterRezhan', await c.eval(S));
  await c.shot('s14_rezhan');
}
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-4)));
await c.save('s14_third', { s2, rb, errs });
c.close();
