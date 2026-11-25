import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const SLOTS = `(()=>{const o=JSON.parse(localStorage.getItem('sanguo_saves_v1'));
 return o.slots.map((s,i)=>s?{i:i+1,time:s.time,gold:s.gold,owned:s.ownedCount,wins:s.wins,losses:s.losses,ts:s.ts}:null);})()`;
const ST = `(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
 const sh=document.querySelector('#saveSheet'); return {ym:t('#ym'),gold:t('#gold'),btnSave:t('#btnSave'),badge:t('#slotBadge'),
  sheetHidden:sh?sh.hidden:null, sheetCls:sh?sh.className:null, notice:t('#notice'),
  slot1rows:sh?[...sh.querySelectorAll('.slotrow')].slice(0,2).map(e=>e.innerText.replace(/\\s+/g,' ').trim().slice(0,120)):null,
  lightbox:[...document.querySelectorAll('.lightbox,.toast,.pop')].map(e=>e.innerText.replace(/\\s+/g,' ').trim())};})()`;
// 2 号槽的"存"按钮
const b = await c.eval(`(()=>{const bs=[...document.querySelectorAll('#saveSheet button[data-do=save]')]; const b=bs[1]; if(!b) return null; const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2];})()`);
log('slot2saveBtn', b);
await c.mouse(b[0], b[1]); await sleep(900);
log('after_save_slot2', await c.eval(ST));
log('slots_after', await c.eval(SLOTS));
await c.shot('s7b_slot2_saved');
c.close();
