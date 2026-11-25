import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const S = `(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return {noState:true}; const w=s.world; if(!w) return {mode:s.mode,noWorld:true};
 const A=w.sides.A,B=w.sides.B; return {mode:s.mode,tick:w.tick,time:Math.round(s.time||0),msg:(s.message||'').slice(0,80),
  qi:A.general.qi,mp:A.general.mp,mpMax:A.general.mpMax,hp:Math.round(A.general.hp),sol:A.aliveCount,Bsol:B.aliveCount,Bhp:B.general?Math.round(B.general.hp):null,
  skills:(s.skills||[]).map(k=>({n:k.name,qi:k.qi})),settled:!!s.settlement};})()`;
const url = BASE + 'index.html?city=%E6%A8%82%E9%99%B5&from=campaign&a=%E5%BC%B5%E8%A7%92&gen=%E5%BC%B5%E8%A7%92&troop=10&form=4&soldiers=10&atire=0&amorale=60&blevel=1&bsoldiers=6&sim=200';
await c.goto(url); await sleep(1500);
log('sim200_ready', await c.eval(S));
await c.shot('s25a_sim_ready');
await c.mouse(375, 683); await sleep(1200);
log('sim200_afterStart', await c.eval(S));
// 點技能格 2 看拦截/选中
await c.mouse(258, 1168); await sleep(400);
log('simClick2', await c.eval('(window.__sanguo.state||{}).message'));
await c.mouse(375, 640); await sleep(600);
log('simAfterAim', await c.eval(S));
await c.shot('s25b_sim_fight');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-3)));
// 通知自動消失檢查
await c.goto(BASE + 'campaign.html'); await sleep(1200);
const n0 = await c.eval(`(()=>{const e=document.querySelector('#notice'); return {t:(e.innerText||'').slice(0,60),hidden:e.hidden,disp:getComputedStyle(e).display};})()`);
log('notice_t0', n0);
await sleep(5500);
log('notice_t5', await c.eval(`(()=>{const e=document.querySelector('#notice'); return {t:(e.innerText||'').slice(0,60),hidden:e.hidden,disp:getComputedStyle(e).display};})()`));
await c.save('s25_sim_notice', { errs });
c.close();
