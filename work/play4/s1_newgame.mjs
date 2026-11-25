import { boot, BASE, sleep } from './cdp.mjs';

const c = await boot();
const out = { steps: [] };
const log = (k, v) => { out.steps.push({ k, v }); };

// 1) open save sheet
await c.clickSel('#btnSave');
await sleep(600);
const sheet = await c.eval(`(()=>{const e=document.getElementById('saveSheet'); return {hidden:e.hidden, disp:getComputedStyle(e).display, msg:(document.getElementById('saveMsg').innerText||'').replace(/\\s+/g,' ').slice(0,300), rows:[...document.querySelectorAll('#slotRows [data-slot]')].map(b=>({slot:b.dataset.slot,do:b.dataset.do,txt:(b.innerText||'').trim().slice(0,30)}))};})()`);
log('saveSheet', sheet);
out.shotSaveSheet = await c.shot('s1_save_sheet');

// 2) click 新 遊 戲
await c.clickSel('#btnNewGame');
await sleep(700);
const pick1 = await c.eval(`(()=>{const e=document.getElementById('pickSheet'); const cards=[...document.querySelectorAll('#pickCards .scard')].map(x=>({pick:x.dataset.pick,king:x.dataset.king||null,off:x.dataset.off||null,cls:x.className,txt:(x.innerText||'').replace(/\\s+/g,' ').trim().slice(0,80)})); return {hidden:e.hidden,ttl:(document.getElementById('pickTtl').innerText||'').trim(),sub:(document.getElementById('pickSub').innerText||'').trim(),warn:(document.getElementById('pickWarn').innerText||'').trim(),cards,startBtn:(document.getElementById('btnPickStart').innerText||'').trim()};})()`);
log('picker1', pick1);
out.shotPicker1 = await c.shot('s1_pick_scenario');
await c.save('s1_pick1', { sheet, pick1, shot: out.shotSaveSheet });

console.log(JSON.stringify({ sheet, pick1, shots: [out.shotSaveSheet, out.shotPicker1], errs: await c.errs(c.startErr) }, null, 1));
c.close();
