import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const S = `(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return {noState:true}; const w=s.world; if(!w) return {mode:s.mode,noWorld:true};
 const A=w.sides.A,B=w.sides.B; return {mode:s.mode,time:Math.round(s.time),msg:(s.message||'').slice(0,120),
  A:{hp:Math.round(A.general.hp),sol:A.aliveCount},B:{hp:Math.round(B.general.hp),sol:B.aliveCount},over:!!w.over,
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,post:s.settlement.post||null}:null};})()`;
for (let i = 0; i < 12; i++) {
  await sleep(5000);
  const t = await c.eval(S);
  log('t' + (i + 1) * 5, t);
  if (t.mode === 'settled' || t.noState) break;
}
const st = await c.eval(S);
if (st && st.mode === 'fighting') {
  // 撤退按鈕位置
  const rb = await c.eval(`(()=>{const bs=[...document.querySelectorAll('button')]; const b=bs.find(b=>/撤\\s*退/.test(b.innerText)); if(!b) return null; const q=b.getBoundingClientRect(); return {t:b.innerText.replace(/\\s+/g,''),x:q.x+q.width/2|0,y:q.y+q.height/2|0,r:[q.x|0,q.y|0,q.width|0,q.height|0]};})()`);
  log('retreatBtn', rb);
  if (rb) { await c.mouse(rb.x, rb.y); await sleep(1200); }
  await c.shot('s19_retreat');
  log('afterRetreat', await c.eval(S));
  // 若有確認框
  log('confirm', await c.eval(`(()=>{const s=document.querySelector('#confirmSheet'); return s&&!s.hidden?s.innerText.replace(/\\s+/g,' ').slice(0,300):null;})()`));
  await c.shot('s19b_after_retreat');
}
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-3)));
await c.save('s19_stall', { st, errs });
c.close();
