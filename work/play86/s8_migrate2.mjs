import fs from 'node:fs';
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);

await c.goto(BASE + 'campaign.html'); await sleep(2500);
const before = await c.eval(`(()=>({saves:localStorage.getItem('sanguo_saves_v1'),camp:localStorage.getItem('sanguo_campaign_v1')}))()`);
fs.writeFileSync('state/08b_before.json', JSON.stringify(before));
log('saved backup bytes', before.saves.length, before.camp.length);
log('err0', c.errCount());

// 造 v2
const mk = await c.eval(`(()=>{const st=JSON.parse(localStorage.getItem('sanguo_saves_v1'));const i=st.slots.findIndex(s=>s&&s.snapshot);const sl=st.slots[i];const snap=sl.snapshot;snap.v=2;['year','yearFlag','ledger','generalStatus','weapon','horse','thing'].forEach(k=>delete snap[k]);st.last=i+1;localStorage.setItem('sanguo_saves_v1',JSON.stringify(st));localStorage.removeItem('sanguo_campaign_v1');return {slot:i+1,keys:Object.keys(snap).length,v:snap.v,month:sl.month};})()`);
log('crafted', JSON.stringify(mk));
const e0 = c.errCount();
await c.eval(`location.reload()`); await sleep(3200);
const after = await c.eval(`(()=>{const q=(id)=>{const e=document.getElementById(id);return e?{hid:!!e.hidden,txt:(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,90)}:null;};const st=JSON.parse(localStorage.getItem('sanguo_saves_v1'));const i=(st.last||1)-1;const sl=st.slots[i]||{};return {notice:q('notice'),head:{sc:q('scName'),ym:q('ym'),gold:q('gold'),ct:q('ct'),rec:q('rec'),king:q('kingName')},logRows:document.querySelectorAll('#logrows .row').length,cities:document.querySelectorAll('#list .city').length,storeSlot:{v:(sl.snapshot||{}).v,keys:Object.keys(sl.snapshot||{}).length,month:sl.month},scrim:q('scrim')};})()`);
log('after v2 reload', JSON.stringify(after, null, 0));
log('errors during v2', JSON.stringify(await c.errs(e0)));
await c.shot('08_迁移提示');
await sleep(300);

// 恢复
await c.eval(`(()=>{const b=${JSON.stringify(JSON.stringify(before))};const o=JSON.parse(b);localStorage.setItem('sanguo_saves_v1',o.saves);localStorage.setItem('sanguo_campaign_v1',o.camp);return 1;})()`);
const e1 = c.errCount();
await c.eval(`location.reload()`); await sleep(3000);
const back = await c.eval(`(()=>{const q=(id)=>{const e=document.getElementById(id);return e?(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40):null;};return {sc:q('scName'),ym:q('ym'),gold:q('gold'),ct:q('ct'),rec:q('rec'),king:q('kingName'),badge:q('slotBadge'),logRows:document.querySelectorAll('#logrows .row').length,cities:document.querySelectorAll('#list .city').length,notice:q('notice')};})()`);
log('restored', JSON.stringify(back));
log('errors after restore', JSON.stringify(await c.errs(e1)));
await c.shot('08b_刷新重进');
log('total errors', c.errCount());
await c.close();
