import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = { rounds: [] };
const fp = async (tag) => c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 const own=[...document.querySelectorAll('.city[data-name]')].map(e=>({n:e.dataset.name,t:(e.innerText||'').replace(/\\s+/g,' ').trim()})).filter(c=>/我方/.test(c.t));
 const L=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 return {tag:${JSON.stringify(tag)},url:location.href,ym:g('ym'),gold:g('gold'),ct:g('ct'),rec:g('rec'),notice:g('notice'),log:g('logrows'),
  ownCount:own.length,own:own.map(c=>c.n).sort(),legacy:{month:L.month,gold:L.gold,wins:L.wins,defWins:L.defWins,ts:L.ts}};})()`);
const S = async () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
 return {mode:s.mode,tick:s.time,msg:s.message,sel:s.selectedSkill?String(s.selectedSkill.name||s.selectedSkill):null,
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,post:s.settlement.post}:null};})()`);

out.before = await fp('before_advance');
out.shotBefore = await c.shot('s13a_before_advance');
await c.clickSel('#actions .btn[data-act="advance"]');
await sleep(2500); await c.waitLoad();
out.urlAfter = await c.eval('location.href');

for (let round = 0; round < 5; round++) {
  const u = await c.eval('location.href');
  if (!/index\.html/.test(u)) break;
  await c.viewport(782, 1500); await sleep(700);
  const R = await c.rect('#stage');
  const px = (x) => R.x + x * (R.w / 750), py = (y) => R.y + y * (R.h / 1334);
  const design = async (x, y) => { await c.mouse(Math.round(px(x)), Math.round(py(y))); await sleep(150); };
  let s = await S();
  const rec = { round, url: u, startMode: s && s.mode };
  await c.shot('s13_battle_ready_' + round);
  if (s && s.mode === 'ready') { await design(375, 683); await sleep(1000); }
  rec.afterStart = await S();
  await sleep(8000);  // let 氣力 regen
  await design(160, 1166); await sleep(800);          // skill slot 1
  rec.skill1 = await S();
  rec.shotSkill1 = await c.shot('s13_skill1_' + round);
  await design(375, 640); await sleep(1000);          // field centre
  rec.field = await S();
  rec.shotField = await c.shot('s13_field_' + round);
  let settled = null;
  for (let i = 0; i < 100; i++) { await sleep(400); const t = await S(); if (t && t.mode === 'settled') { settled = t; break; } if (!t) break; }
  rec.settled = settled;
  if (settled) rec.shotSettle = await c.shot('s13_settle_' + round);
  out.rounds.push(rec);
  console.log('round', round, 'skill1=', JSON.stringify(rec.skill1 && rec.skill1.msg), 'field=', JSON.stringify(rec.field && rec.field.msg), 'settled=', JSON.stringify(settled && settled.msg));
  if (!settled) break;
  await design(375, 300); await sleep(400); await c.waitLoad(); await sleep(1600);
}
await c.viewport(750, 1334); await sleep(500);
out.after = await fp('after_advance');
out.shotAfter = await c.shot('s13b_after_advance');

// verify load rollback: load slot 1 (saved at month 5)
await c.clickSel('#btnSave'); await sleep(700);
await c.eval(`(()=>{const b=document.querySelector('#slotRows [data-slot="0"][data-do="load"]'); if(b) b.click(); return !!b;})()`);
await sleep(1200);
await c.eval(`(()=>{const s=document.getElementById('saveSheet'); if(s) s.hidden=true; return 1;})()`);
await sleep(500);
out.afterLoad = await fp('after_load_rollback');
out.shotAfterLoad = await c.shot('s13c_after_load');
out.errs = await c.errs(c.startErr);
await c.save('s13_advance2', out);
console.log(JSON.stringify({ before: out.before, urlAfter: out.urlAfter, after: out.after, afterLoad: out.afterLoad, rounds: out.rounds.map(r => ({ r: r.round, mode: r.startMode, s1: r.skill1 && r.skill1.msg, field: r.field && r.field.msg, settle: r.settled && r.settled.msg })), errs: out.errs }, null, 1));
c.close();
