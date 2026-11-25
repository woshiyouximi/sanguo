import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = { log: [] };

// 1) select 界橋 (enemy) from list tab, then 出征
await c.clickSel('#tabList'); await sleep(400);
await c.eval(`(()=>{const e=document.querySelector('.city[data-name="\\u754c\\u6a4b"]'); if(e) e.scrollIntoView({block:'center'});})()`);
await sleep(300);
await c.clickSel('.city[data-name="\u754c\u6a4b"]'); await sleep(400);
out.acts = await c.eval(`[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim(),dis:e.disabled}))`);
await c.clickSel('#actions .btn[data-act="march"]');
await c.waitLoad(); await sleep(1600);
out.deployUrl = await c.eval('location.href');
out.intel = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;}; return {target:t('#target'),intel:t('#intel'),gname:t('#gname'),gosub:t('#gosub'),range:{min:document.getElementById('numrange').min,max:document.getElementById('numrange').max,val:document.getElementById('numrange').value}};})()`);

// 2) slider to min (1) via real input events
out.slider = await c.eval(`(()=>{const r=document.getElementById('numrange'); r.value='1'; r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true}));
 const n=document.getElementById('numnow'); return {val:r.value, numnow:n&&n.innerText, gosub:(document.getElementById('gosub')||{}).innerText};})()`);
await sleep(300);
out.shotDeploy = await c.shot('s11_deploy_min');

// 3) 出征 -> battle
await c.clickSel('#go');
await c.waitLoad(); await sleep(2000);
await c.viewport(782, 1500); await sleep(700);
const R = await c.rect('#stage');
const px = (x) => R.x + x * (R.w / 750), py = (y) => R.y + y * (R.h / 1334);
const design = async (x, y) => { await c.mouse(Math.round(px(x)), Math.round(py(y))); await sleep(120); };
const S = async () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
 return {mode:s.mode,tick:s.time,msg:s.message,sel:s.selectedSkill?String(s.selectedSkill.name||s.selectedSkill):null,
  slots:(s.skills||[]).map(k=>({name:k.name,kind:k.kind,ok:k.ok,cd:k.cd,cost:k.cost,qi:k.qi})),
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,exp:s.settlement.expGain,merit:s.settlement.meritGain,level:s.settlement.level,up:s.settlement.levelUp,post:s.settlement.post}:null};})()`);
out.battleUrl = await c.eval('location.href');
out.enter = await S();
out.shotReady = await c.shot('s11_battle_ready');
// UI slot rects (page coords)
out.slotRects = await c.eval(`[...document.querySelectorAll('#battleui .slot, #battleui i')].slice(0,8).map(e=>{const r=e.getBoundingClientRect(); return {cls:e.className,x:r.x,y:r.y,w:r.width,h:r.height};})`);

if (out.enter && out.enter.mode === 'ready') { await design(375, 683); await sleep(1000); }
out.afterStart = await S();

// skill slot1
const s1 = out.slotRects[0];
if (s1) { await c.mouse(Math.round(s1.x + s1.w / 2), Math.round(s1.y + s1.h / 2)); await sleep(700); }
out.skill1 = await S();
out.shotSkill1 = await c.shot('s11_skill1');
// field centre
await design(375, 700); await sleep(700);
out.field = await S();

// try slot2 (a damage skill) to get a real cast
const s2 = out.slotRects[1];
if (s2) { await c.mouse(Math.round(s2.x + s2.w / 2), Math.round(s2.y + s2.h / 2)); await sleep(700); }
out.skill2 = await S();
out.shotSkill2 = await c.shot('s11_skill2');
await design(375, 640); await sleep(900);
out.cast = await S();
out.shotCast = await c.shot('s11_cast');

// wait settle with tight poll
let settled = null;
for (let i = 0; i < 120; i++) { await sleep(400); const t = await S(); if (t && t.mode === 'settled') { settled = t; break; } if (!t) break; }
out.settled = settled;
if (settled) { out.shotSettle = await c.shot('s11_settle'); }
out.errs = await c.errs(c.startErr);
await c.save('s11_attack2', out);
console.log(JSON.stringify({ acts: out.acts, intel: out.intel, slider: out.slider, enter: out.enter, afterStart: out.afterStart, skill1: out.skill1, field: out.field, skill2: out.skill2, cast: out.cast, settled: out.settled, errs: out.errs }, null, 1));
c.close();
