import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await sleep(800);
log('href', await c.eval('location.href'));
const S = `(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return {noState:true}; const w=s.world; if(!w) return {mode:s.mode,noWorld:true};
 const A=w.sides.A,B=w.sides.B; return {mode:s.mode,time:s.time,msg:s.message,tick:w.tick,over:!!w.over,winner:w.winner||null,endReason:w.endReason||null,
  A:{name:A.general.name,hp:Math.round(A.general.hp),soldiers:A.aliveCount,start:A.start,status:A.status},B:{name:B.general.name,hp:Math.round(B.general.hp),soldiers:B.aliveCount,start:B.start,status:B.status},
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills}:null};})()`;
log('now', await c.eval(S));
await c.shot('s18_now');
log('body', (await c.eval('document.body.innerText.replace(/\\s+/g," ").slice(0,600)')));
c.close();
