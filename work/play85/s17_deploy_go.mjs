import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const S = `(()=>{const s=window.__sanguo.state; const w=s.world; if(!w) return {noWorld:true,mode:s&&s.mode}; const A=w.sides.A,B=w.sides.B;
 return {mode:s.mode,msg:s.message,A:{name:A.general.name,qi:A.general.qi,mp:A.general.mp,mpMax:A.general.mpMax,hp:Math.round(A.general.hp),soldiers:A.aliveCount,start:A.start,
   troops:A.troops||null,form:A.form||null},B:{name:B.general&&B.general.name,hp:B.general?Math.round(B.general.hp):null,soldiers:B.aliveCount,start:B.start,troops:B.troops||null,form:B.form||null},
  skills:(s.skills||[]).map(k=>({n:k.name,qi:k.qi,kind:k.kind})),over:!!w.over,floaters:(s.floaters||[]).map(f=>f.text).slice(-5),
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,exp:s.settlement.expGain,merit:s.settlement.meritGain,lv:s.settlement.level,post:s.settlement.post||null}:null};})()`;
// 1) 改兵力滑杆
const r = await c.eval(`(()=>{const e=document.querySelector('#numrange');const q=e.getBoundingClientRect();return [q.x|0,q.y|0,q.width|0,q.height|0,e.value,e.max];})()`);
log('sliderBefore', r);
await c.mouse(r[0] + r[2] * 0.55, r[1] + r[3] / 2); await sleep(400);
log('sliderAfter', await c.eval(`(()=>{const e=document.querySelector('#numrange');return {v:e.value, sub:document.querySelector('#gosub').innerText.replace(/\\s+/g,' '), go:document.querySelector('#go').innerText.replace(/\\s+/g,' ')};})()`));
// 2) 換陣形（玄襄）
const f = await c.eval(`(()=>{const t=[...document.querySelectorAll('#formgrid .it')].find(e=>e.innerText.includes('玄襄')); if(!t) return null; const q=t.getBoundingClientRect(); return [q.x+q.width/2|0,q.y+q.height/2|0,t.innerText.replace(/\\s+/g,' ')];})()`);
log('formTile', f);
if (f) { await c.mouse(f[0], f[1]); await sleep(400); }
log('afterForm', await c.eval(`(()=>({sub:document.querySelector('#gosub').innerText.replace(/\\s+/g,' '),go:document.querySelector('#go').innerText.replace(/\\s+/g,' ')}))()`));
await c.shot('s17a_deploy_changed');
await c.fullShot('s17a_deploy_changed_full');
// 3) 出征 → 戰鬥
const go = await c.eval(`(()=>{const q=document.querySelector('#go').getBoundingClientRect();return [q.x+q.width/2|0,q.y+q.height/2|0];})()`);
await c.mouse(go[0], go[1]); await sleep(2600);
log('href', await c.eval('location.href'));
const ready = await c.eval(S);
log('battleReady', ready);
await c.shot('s17b_battle_ready');
await c.mouse(375, 683); await sleep(1000);
log('afterStart', await c.eval(S));
// 半月斬（第2格）
const b2 = await c.eval(S);
await c.mouse(258, 1168); await sleep(500);
log('sel2msg', await c.eval('window.__sanguo.state.message'));
await c.mouse(375, 640); await sleep(1000);
const a2 = await c.eval(S);
log('cast2', { msg: a2.msg, qiBefore: b2.A.qi, qiAfter: a2.A.qi, mpBefore: b2.A.mp, mpAfter: a2.A.mp, B: a2.B, floaters: a2.floaters });
await c.shot('s17c_cast2');
// 落月弓（第3格）
const b3 = await c.eval(S);
await c.mouse(356, 1168); await sleep(500);
const m3 = await c.eval('window.__sanguo.state.message');
await c.mouse(375, 640); await sleep(1000);
const a3 = await c.eval(S);
log('cast3', { selMsg: m3, msg: a3.msg, qiBefore: b3.A.qi, qiAfter: a3.A.qi, mpBefore: b3.A.mp, mpAfter: a3.A.mp, B: a3.B, floaters: a3.floaters });
await c.shot('s17d_cast3');
let st = null;
for (let i = 0; i < 160; i++) { await sleep(400); const t = await c.eval(S); if (t.mode === 'settled') { st = t; break; } }
log('settled', st && { msg: st.msg, settlement: st.settlement });
await c.shot('s17e_settle');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-4)));
await c.save('s17_fight', { ready, st, errs });
c.close();
