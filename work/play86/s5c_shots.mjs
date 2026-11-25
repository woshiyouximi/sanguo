import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
log('href', await c.eval('location.href').then(h=>h.replace('http://127.0.0.1:5173/web/','')));
const r = await c.rect('#stage'); const des = async (x,y,w=900)=>{ await c.mouse(r.x + x*(r.w/750), r.y + y*(r.h/1334)); await sleep(w); };
const mode = ()=>c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; return s?s.mode:null;})()`);
log('mode', await mode());
if ((await mode())==='ready') { log(await c.eval(`(()=>{const s=window.__sanguo.state; return JSON.stringify({skills:s.skills, mp:s.general&&s.general.mp, qi:s.general&&s.general.qi, name:s.general&&s.general.NAME});})()`)); await c.shotFull('05_战斗_准备'); await des(375,684,1500); }
log('msg', await c.eval(`window.__sanguo.state.message`));
await c.shotFull('05a_战斗中');
await des(160,1168,800);
log('msg2', await c.eval(`window.__sanguo.state.message`));
await c.shotFull('05b_技能格');
await des(520,800,1200);
log('msg3', await c.eval(`window.__sanguo.state.message`));
await c.shotFull('05c_技能释放');
await des(630,1262,900);
for (let i=0;i<40;i++){ if ((await mode())==='settled') break; await sleep(600); }
log('settled', await c.eval(`(()=>{const s=window.__sanguo.state; const t=s.settlement||{}; return JSON.stringify({msg:(s.message||'').replace(/\\s+/g,' ').slice(0,90), winner:t.winner, mode:t.modeName, exp:t.expGain, merit:t.meritGain, rec:t.record});})()`));
await c.shotFull('05_战斗_结算');
await c.close();
