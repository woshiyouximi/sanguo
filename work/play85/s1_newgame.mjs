import { boot, BASE, sleep } from './cdp.mjs';

const c = await boot();
const out = { steps: [] };
const log = (k, v) => { out.steps.push({ k, v }); console.log('##', k, JSON.stringify(v)); };

await c.goto(BASE + 'campaign.html');
await sleep(1200);
log('boot', await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null;};return {ym:t('#ym'),gold:t('#gold'),ct:t('#ct'),rec:t('#rec'),notice:t('#notice'),king:t('#kingName'),pickHidden:document.getElementById('pickSheet').hidden,saveHidden:document.getElementById('saveSheet').hidden};})()`));
out.shotBoot = await c.shot('s1_boot');

// 1) 存档面板（新遊戲按钮在存档浮层页脚里）
await c.clickSel('#btnSave'); await sleep(700);
const sheet = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null;};
 return {hidden:document.getElementById('saveSheet').hidden, msg:t('#saveMsg'), sub:t('#saveSub'),
  rows:[...document.querySelectorAll('#slotRows [data-do="load"]')].map(b=>({slot:b.dataset.slot,txt:(b.closest('[data-slot]')||b).innerText.replace(/\\s+/g,' ').trim().slice(0,110)}))};})()`);
log('saveSheet', sheet);
out.shotSheet = await c.shot('s1_save_sheet');
await c.save('s1_savesheet', sheet);

// 2) 新 遊 戲（在存档浮层页脚）
const nb = await c.rect('#btnNewGame');
log('btnNewGameRect', nb);
await c.clickSel('#btnNewGame'); await sleep(900);
const pick = await c.eval(`(()=>{const e=document.getElementById('pickSheet');
 const cards=[...document.querySelectorAll('#pickCards .scard')].map(x=>({pick:x.dataset.pick,king:x.dataset.king||null,cls:x.className,txt:(x.innerText||'').replace(/\\s+/g,' ').trim().slice(0,90)}));
 return {hidden:e.hidden,saveHidden:document.getElementById('saveSheet').hidden,ttl:(document.getElementById('pickTtl').innerText||'').trim(),sub:(document.getElementById('pickSub').innerText||'').trim(),warn:(document.getElementById('pickWarn').innerText||'').trim(),cards,startBtn:(document.getElementById('btnPickStart').innerText||'').trim()};})()`);
log('picker1', pick);
out.shotPick = await c.shot('s1_pick_scenario');

// 选 黃巾之亂（找 scenario 名含 黃巾）
const s1 = await c.eval(`(()=>{const e=[...document.querySelectorAll('#pickCards .scard')].find(x=>/\\u9ec3\\u5dfe/.test(x.innerText||'')); if(!e) return null; e.click(); return (e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120);})()`);
await sleep(600);
const pick2 = await c.eval(`(()=>{const e=document.getElementById('pickSheet');
 const cards=[...document.querySelectorAll('#pickCards .scard')].map(x=>({king:x.dataset.king||null,cls:x.className,off:x.dataset.off||null,txt:(x.innerText||'').replace(/\\s+/g,' ').trim().slice(0,90)}));
 return {ttl:(document.getElementById('pickTtl').innerText||'').trim(),sub:(document.getElementById('pickSub').innerText||'').trim(),warn:(document.getElementById('pickWarn').innerText||'').trim(),n:cards.length,cards:cards.slice(0,8),startBtn:(document.getElementById('btnPickStart').innerText||'').trim(),startDis:document.getElementById('btnPickStart').disabled,hidden:e.hidden};})()`);
log('picker2', pick2);
out.shotKings = await c.shot('s1_pick_king');

const picked = await c.eval(`(()=>{const e=[...document.querySelectorAll('#pickCards .scard')].find(x=>x.dataset.king==='\\u5f35\\u89d2'); if(!e) return null; e.click(); return (document.getElementById('pickWarn').innerText||'').trim();})()`);
await sleep(600);
out.shotPicked = await c.shot('s1_picked');
log('pickedChangChiao', picked);

await c.clickSel('#btnPickStart'); await sleep(2800);
const after = await c.eval(`(()=>{const q=(s)=>document.querySelector(s); const t=(s)=>{const e=q(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,400):null;};
  const my=[...document.querySelectorAll('.city')].filter(e=>/我方/.test(e.innerText||'')).map(e=>e.dataset.name);
  return {href:location.href, ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), rec:t('#rec'), notice:t('#notice'), king:t('#kingName'),
   pickHidden:q('#pickSheet').hidden, saveHidden:q('#saveSheet').hidden, slotBadge:t('#slotBadge'), btnSave:t('#btnSave'),
   owned:my, cityCount:document.querySelectorAll('.city').length,
   acts:[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40),dis:e.disabled})),
   logrows:t('#logrows')};})()`);
log('afterStart', after);
out.shotMap = await c.shot('s1_map_newgame');

const sl = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}'); const s=(o.slots||[])[0]||{}; const lg=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 return {last:o.last, slot0:{ts:s.ts,month:s.month,scenario:s.scenario,king:s.king,gold:s.gold,owned:s.owned,cities:Object.keys(s.cities||{}).length,name:s.name},
   legacy:{ts:lg.ts,month:lg.month,scenario:lg.scenario,king:lg.king,gold:lg.gold,owned:lg.owned}};})()`);
log('saves', sl);

const errs = await c.errs(c.startErr);
out.errs = errs;
await c.save('s1_newgame', { sheet, pick, pick2, s1, picked, after, sl, errs, shots: [out.shotBoot, out.shotSheet, out.shotPick, out.shotKings, out.shotPicked, out.shotMap] });
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 6)));
c.close();
