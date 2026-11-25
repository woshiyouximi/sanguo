import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const S = (s) => `(()=>{const q=(x)=>document.querySelector(x); const t=(x)=>{const e=q(x); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null;}; return ${s};})()`;

// 重新开一局：存档浮层 → 新遊戲 → 黃巾之亂 → 選君主 → 張角 → 開始
await c.clickSel('#btnSave'); await sleep(600);
await c.clickSel('#btnNewGame'); await sleep(800);
log('pickerScenario', await c.eval(S(`{hidden:document.getElementById('pickSheet').hidden, ttl:t('#pickTtl'), n:document.querySelectorAll('#pickCards .scard').length}`)));
await c.eval(`(()=>{const e=[...document.querySelectorAll('#pickCards .scard')].find(x=>/\\u9ec3\\u5dfe/.test(x.innerText||'')); if(e) e.click(); return !!e;})()`);
await sleep(300);
await c.clickSel('#btnPickStart'); await sleep(800);   // 選 君 主 →
log('pickerKing', await c.eval(S(`{ttl:t('#pickTtl'), sub:t('#pickSub'), warn:t('#pickWarn'), btn:t('#btnPickStart'), n:document.querySelectorAll('#pickCards .scard').length}`)));
const shotK = await c.shot('s1c_king_list');
await c.eval(`(()=>{const e=[...document.querySelectorAll('#pickCards .scard')].find(x=>x.dataset.king==='\\u5f35\\u89d2'); if(e) e.click(); return !!e;})()`);
await sleep(400);
log('picked', await c.eval(S(`{warn:t('#pickWarn'), btn:t('#btnPickStart'), on:[...document.querySelectorAll('#pickCards .scard.on')].map(x=>x.dataset.king)}`)));
const shotP = await c.shot('s1c_picked_zhangjiao');
await c.clickSel('#btnPickStart'); await sleep(3000);
const after = await c.eval(S(`{ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), rec:t('#rec'), notice:t('#notice'), king:t('#kingName'), slotBadge:t('#slotBadge'),
  pickHidden:document.getElementById('pickSheet').hidden,
  owned:[...document.querySelectorAll('.city')].filter(e=>/我方/.test(e.innerText||'')).map(e=>e.dataset.name),
  acts:[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim()})),
  logrows:t('#logrows')}`));
log('afterStart', after);
const shotM = await c.shot('s1d_map_zhangjiao');
const save0 = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}'); const s=(o.slots||[])[0]||{}; const lg=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 return {last:o.last, slot0:{ts:s.ts,month:s.month,scenario:s.scenario,king:s.king,gold:s.gold,owned:s.owned,force:s.force,cities:Object.keys(s.cities||{}).length},
  legacy:{ts:lg.ts,month:lg.month,king:lg.king,gold:lg.gold,owned:lg.owned}};})()`);
log('saves', save0);
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s1c_getstarted', { after, save0, errs, shots: [shotK, shotP, shotM] });
c.close();
