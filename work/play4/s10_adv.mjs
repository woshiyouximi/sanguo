import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = { rounds: [], errs: [] };
const S = async () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
 return {mode:s.mode,tick:s.time,msg:s.message,sel:s.selectedSkill?String(s.selectedSkill.name||s.selectedSkill):null,
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,exp:s.settlement.expGain,merit:s.settlement.meritGain,level:s.settlement.level,up:s.settlement.levelUp,post:s.settlement.post}:null};})()`);
const url = async () => c.eval('location.href');
const campInfo = async () => c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 return {url:location.href,ym:g('ym'),gold:g('gold'),ct:g('ct'),rec:g('rec'),notice:g('notice'),log:g('logrows'),hint:g('hint')};})()`);

out.before = await campInfo();
const adv = await c.eval(`(()=>{const b=document.querySelector('#actions .btn[data-act="advance"]'); if(!b) return 'no-advance-btn'; if(b.disabled) return 'disabled'; return {txt:(b.innerText||'').replace(/\\s+/g,' ').trim()};})()`);
out.advBtn = adv;
await c.clickSel('#actions .btn[data-act="advance"]');
await sleep(2500);
await c.waitLoad();
out.urlAfterAdvance = await url();
await c.save('s10a_advance', { before: out.before, adv, urlAfterAdvance: out.urlAfterAdvance });

for (let round = 0; round < 6; round++) {
  const u = await url();
  if (!/index\.html/.test(u)) break;
  await c.viewport(782, 1500); await sleep(700);
  const R = await c.rect('#stage');
  const px = (x) => R.x + x * (R.w / 750), py = (y) => R.y + y * (R.h / 1334);
  const design = async (x, y) => c.mouse(Math.round(px(x)), Math.round(py(y)));
  let s = await S();
  const rec = { round, url: u, startMode: s && s.mode, startMsg: s && s.msg };
  await c.shot('s10_battle_ready_' + round);
  if (s && s.mode === 'ready') { await design(375, 683); await sleep(1200); s = await S(); }
  let settled = null;
  for (let i = 0; i < 70; i++) { await sleep(1000); const t = await S(); if (t && t.mode === 'settled') { settled = t; break; } if (!t) break; }
  rec.settled = settled;
  rec.shotSettle = settled ? await c.shot('s10_settle_' + round) : null;
  out.rounds.push(rec);
  console.log('round', round, JSON.stringify(rec.settled && rec.settled.msg || rec.startMode));
  if (!settled) break;
  await design(375, 300); await sleep(500);
  await c.waitLoad(); await sleep(1800);
  out.rounds[round].nextUrl = await url();
}
await c.viewport(750, 1334); await sleep(500);
out.after = await campInfo();
out.errs = await c.errs(c.startErr);
await c.save('s10b_after_advance', out);
out.shot = await c.shot('s10_after_advance');
console.log(JSON.stringify({ after: out.after, rounds: out.rounds.map(r => ({ round: r.round, url: r.url, mode: r.startMode, settledMsg: r.settled && r.settled.msg, next: r.nextUrl })), errs: out.errs }, null, 1));
c.close();
