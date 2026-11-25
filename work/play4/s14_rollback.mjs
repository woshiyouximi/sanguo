import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = { skill: [] };
const fp = async (tag) => c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 const own=[...document.querySelectorAll('.city[data-name]')].map(e=>({n:e.dataset.name,t:(e.innerText||'').replace(/\\s+/g,' ').trim()})).filter(c=>/我方/.test(c.t));
 const L=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 const S=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}');
 return {tag:${JSON.stringify(tag)},url:location.href,ym:g('ym'),gold:g('gold'),ct:g('ct'),rec:g('rec'),notice:g('notice'),log:g('logrows'),
  ownCount:own.length,own:own.map(c=>c.n).sort(),legacy:{month:L.month,gold:L.gold,wins:L.wins,defWins:L.defWins,ts:L.ts},
  slots:(S.slots||[]).map((s,i)=>s?{i:+i,ts:s.ts,month:s.month,gold:s.gold,owned:s.ownedCount,wins:s.wins,losses:s.losses,name:s.slotName}:null)};})()`);
const S = async () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
 return {mode:s.mode,tick:s.time,msg:s.message,sel:s.selectedSkill?String(s.selectedSkill.name||s.selectedSkill):null,
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,post:s.settlement.post}:null};})()`);

out.a = await fp('A_month6');
// save into slot 2 (inactive) as manual rollback anchor
await c.clickSel('#btnSave'); await sleep(700);
await c.eval(`(()=>{const b=document.querySelector('#slotRows [data-slot="1"][data-do="save"]'); if(b) b.click(); return !!b;})()`);
await sleep(900);
out.slot2SaveMsg = await c.eval(`(()=>{const e=document.getElementById('saveMsg'); return e?(e.innerText||'').trim():null;})()`);
await c.shot('s14a_slot2_saved');
await c.eval(`(()=>{const s=document.getElementById('saveSheet'); if(s) s.hidden=true; return 1;})()`);
await sleep(400);
out.b = await fp('B_slot2_saved');

// advance a month (may trigger defence; try skill slot1 at several times)
await c.clickSel('#actions .btn[data-act="advance"]');
await sleep(2500); await c.waitLoad();
for (let round = 0; round < 4; round++) {
  const u = await c.eval('location.href');
  if (!/index\.html/.test(u)) break;
  await c.viewport(782, 1500); await sleep(700);
  const R = await c.rect('#stage');
  const px = (x) => R.x + x * (R.w / 750), py = (y) => R.y + y * (R.h / 1334);
  const design = async (x, y) => { await c.mouse(Math.round(px(x)), Math.round(py(y))); await sleep(150); };
  let s = await S();
  if (s && s.mode === 'ready') { await design(375, 683); await sleep(900); }
  const tries = [];
  for (const [t, label] of [[3000, 't3s'], [7000, 't10s'], [5000, 't15s']]) {
    await sleep(t);
    await design(160, 1166); await sleep(600);
    const r = await S();
    tries.push({ at: label, msg: r && r.msg, sel: r && r.sel, mode: r && r.mode });
    if (r && r.sel) { await design(375, 640); await sleep(800); const f = await S(); tries.push({ cast: f && f.msg }); break; }
    if (!r) break;
  }
  out.skill.push({ round, url: u, tries });
  await c.shot('s14_skill_' + round);
  let settled = null;
  for (let i = 0; i < 80; i++) { await sleep(400); const t = await S(); if (t && t.mode === 'settled') { settled = t; break; } if (!t) break; }
  out['settle' + round] = settled && settled.msg;
  if (settled) await c.shot('s14_settle_' + round);
  if (!settled) break;
  await design(375, 300); await sleep(400); await c.waitLoad(); await sleep(1500);
}
await c.viewport(750, 1334); await sleep(500);
out.c = await fp('C_after_advance');
out.shotC = await c.shot('s14b_after_advance');

// load slot 2 -> expect rollback to saved month
await c.clickSel('#btnSave'); await sleep(700);
await c.eval(`(()=>{const b=document.querySelector('#slotRows [data-slot="1"][data-do="load"]'); if(b) b.click(); return !!b;})()`);
await sleep(1300);
await c.eval(`(()=>{const s=document.getElementById('saveSheet'); if(s) s.hidden=true; return 1;})()`);
await sleep(600);
out.d = await fp('D_after_load_slot2');
out.shotD = await c.shot('s14c_after_load_slot2');
out.errs = await c.errs(c.startErr);
await c.save('s14_rollback', out);
console.log(JSON.stringify({ a: out.a, slot2SaveMsg: out.slot2SaveMsg, b: out.b, c: out.c, d: out.d, skill: out.skill, settles: [out.settle0, out.settle1, out.settle2], errs: out.errs }, null, 1));
c.close();
