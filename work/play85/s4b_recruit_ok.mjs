import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const T = `(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
 return {gold:t('#vGold'), pop:t('#vPop'), def:t('#vDef'), lock:t('#vLock'), troop:t('#vTroop'), prep:t('#vPrep'),
  sheetOn:document.querySelector('#sheet')?document.querySelector('#sheet').className:null,
  log:[...document.querySelectorAll('#log .row')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()).slice(0,4)};})()`;
log('before', await c.eval(T));
const sl = await c.eval(`(()=>{const e=document.querySelector('#rcInfR'); const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,val:e.value,max:e.max};})()`);
log('slider', sl);
const y = sl.y + sl.h / 2;
await c.mouse(sl.x + sl.w * 0.05, y, 'move');
await c.mouse(sl.x + sl.w * 0.05, y, 'down');
await sleep(60);
for (const f of [0.2, 0.4, 0.5, 0.6, 0.65]) { await c.mouse(sl.x + sl.w * f, y, 'move'); await sleep(70); }
await c.mouse(sl.x + sl.w * 0.65, y, 'up');
await sleep(300);
log('after_drag', await c.eval(`(()=>{const e=document.querySelector('#rcInfR'); const n=document.querySelector('#rcInfN'); return {range:e.value, num:n?n.value:null, trop:document.querySelector('#rcTroops')?document.querySelector('#rcTroops').innerText:null};})()`));
await c.shot('s4e_recruit_dragged');
// 点确定（真点）
const ok = await c.rect('#sheetOk'); log('okRect', ok);
await c.mouse(ok.x + ok.w / 2, ok.y + ok.h / 2);
await sleep(900);
log('after_ok', await c.eval(T));
await c.shot('s4f_recruit_done');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 6)));
await c.save('s4_recruit_done', { after: await c.eval(T), errs });
c.close();
