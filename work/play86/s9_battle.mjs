import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const tally = async (tag) => { const e = await c.errs(0); const k = {}; e.forEach(x => (k[x.kind] = (k[x.kind] || 0) + 1)); log(tag, JSON.stringify(k)); e.forEach(x=>log('   ', x.kind, x.msg.replace(/\\s+/g,' ').slice(0,110))); };
await c.eval(`sessionStorage.removeItem('__dsh_errs86')`); await c.eval('location.reload()'); await sleep(2500);
await tally('A 载入');
// 选我方城（canvas 南皮 489,185）→ 推進一月
const mr = await c.rect('#map');
await c.mouse(mr.x + 489 * (mr.w / 750), mr.y + 185 * (mr.h / 695)); await sleep(600);
log('hint', await c.eval(`document.getElementById('hint').innerText`));
const adv = await c.rect('#actions [data-act="advance"]');
log('adv', JSON.stringify(adv));
if (adv && adv.w) { await c.mouse(adv.x + adv.w/2, adv.y + adv.h/2); await sleep(3000); }
await tally('B 推進一月');
log('href', await c.eval('location.href').then(h=>h.replace('http://127.0.0.1:5173/web/','')));
const r = await c.rect('#stage');
const des = async (x,y,w=900)=>{ await c.mouse(r.x + x*(r.w/750), r.y + y*(r.h/1334)); await sleep(w); };
const st = ()=>c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; return s?{mode:s.mode, skills:(s.skills||s.general&&s.general.skills||[])&&undefined}:null;})()`);
if ((await c.eval('location.pathname')).includes('index.html')) {
  await c.shot('09c_战斗准备');
  const before = await c.eval(`(()=>{const s=window.__sanguo.state; return {mode:s.mode, skills:JSON.stringify(s.skills||[]), mp:(s.general&&s.general.mp)||null, qi:(s.general&&s.general.qi)||null};})()`);
  log('skills', JSON.stringify(before));
  await des(375,684,1600);
  // 点技能格 → 点战场
  await des(160,1168,700);
  log('msg1', await c.eval(`window.__sanguo.state.message`));
  await des(520,800,1200);
  log('msg2', await c.eval(`window.__sanguo.state.message`));
  await c.shot('09d_技能释放');
  await tally('C 开战+技能');
  await des(630,1262,900);
  for (let i=0;i<45;i++){ const m = await c.eval(`window.__sanguo.state.mode`); if (m==='settled') break; await sleep(600); }
  log('mode', await c.eval(`window.__sanguo.state.mode`), 'msg', await c.eval(`window.__sanguo.state.message`).then(m=>(m||'').replace(/\\s+/g,' ').slice(0,90)));
  await c.shot('09e_结算');
  await des(120,120,2800);
  await tally('D 撤退+结算');
  log('href2', await c.eval('location.href').then(h=>h.replace('http://127.0.0.1:5173/web/','')));
  await c.shot('09f_回图');
  log('sheets', await c.eval(`[...document.querySelectorAll('#surrenderSheet,#saveSheet')].map(e=>e.id+':'+(e.hidden?'hidden':'shown'))`), 'scrim', await c.eval(`document.getElementById('scrim').hidden`));
  await tally('E 回图');
}
await c.close();
