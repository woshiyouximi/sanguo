import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = {};
const fp = async (tag) => c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 const cities=[...document.querySelectorAll('.city[data-name]')].map(e=>({n:e.dataset.name,t:(e.innerText||'').replace(/\\s+/g,' ').trim()}));
 const own=cities.filter(c=>/我方/.test(c.t));
 const L=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 const S=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}');
 return {tag:${JSON.stringify(tag)},url:location.href,ym:g('ym'),gold:g('gold'),ct:g('ct'),rec:g('rec'),notice:g('notice'),
  log:g('logrows'),ownCount:own.length,own:own.map(c=>c.n).sort(),
  legacy:{month:L.month,gold:L.gold,wins:L.wins,losses:L.losses,defWins:L.defWins,ts:L.ts},
  slot0:S.slots&&S.slots[0]?{ts:S.slots[0].ts,month:S.slots[0].month,gold:S.slots[0].gold,owned:S.slots[0].ownedCount,wins:S.slots[0].wins}:null};})()`);

// return to campaign if on battle settle screen
let u = await c.eval('location.href');
if (/index\.html/.test(u)) {
  await c.viewport(782, 1500); await sleep(500);
  const R = await c.rect('#stage');
  await c.mouse(Math.round(R.x + R.w / 2), Math.round(R.y + R.h * (300 / 1334)));
  await c.waitLoad(); await sleep(1800);
  await c.viewport(750, 1334); await sleep(400);
}
out.a = await fp('A_before_save');
out.shotA = await c.shot('s12a_before_save');

// open save sheet
out.saveBtn = await c.eval(`(()=>{const b=document.getElementById('btnSave'); return b?{txt:b.innerText.trim(),dis:b.disabled}:null;})()`);
await c.clickSel('#btnSave'); await sleep(800);
out.sheetRows = await c.eval(`(()=>{const rows=[...document.querySelectorAll('#slotRows [data-slot]')].filter(e=>e.dataset.do==='save'); return rows.map(e=>({slot:e.dataset.slot,txt:(e.innerText||'').replace(/\\s+/g,' ').trim()}));})()`);
// click 存 for slot 1
await c.eval(`(()=>{const b=document.querySelector('#slotRows [data-slot="0"][data-do="save"]'); if(b) b.click(); return !!b;})()`);
await sleep(900);
out.saveMsg = await c.eval(`(()=>{const e=document.getElementById('saveMsg'); return e?(e.innerText||'').trim():null;})()`);
out.shotSave = await c.shot('s12b_saved');

// close sheet
await c.eval(`(()=>{const b=document.querySelector('#saveSheet [data-close],#saveSheet .close,#btnSaveClose'); if(b){b.click(); return 'closed';} const s=document.getElementById('saveSheet'); if(s){s.hidden=true; return 'hidden';} return 'none';})()`);
await sleep(400);
out.b = await fp('B_after_save');

// refresh page
await c.send('Page.reload', { ignoreCache: false }, c.sid);
await sleep(600); await c.waitLoad(); await sleep(2000);
out.c = await fp('C_after_reload');

// load slot 1
await c.clickSel('#btnSave'); await sleep(800);
await c.eval(`(()=>{const b=document.querySelector('#slotRows [data-slot="0"][data-do="load"]'); if(b) b.click(); return !!b;})()`);
await sleep(1200);
out.loadMsg = await c.eval(`(()=>{const e=document.getElementById('saveMsg'); return e?(e.innerText||'').trim():null;})()`);
out.shotLoad = await c.shot('s12c_loaded');
await c.eval(`(()=>{const b=document.querySelector('#saveSheet [data-close],#saveSheet .close'); if(b){b.click(); return 1;} const s=document.getElementById('saveSheet'); if(s) s.hidden=true; return 1;})()`);
await sleep(500);
out.d = await fp('D_after_load');
out.shotD = await c.shot('s12d_after_load');
out.errs = await c.errs(c.startErr);
await c.save('s12_saveload', out);
console.log(JSON.stringify(out, null, 1));
c.close();
