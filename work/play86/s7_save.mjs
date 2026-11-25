// 步骤6尾 + 步骤7：回图招降处理 → 手动存档 → 打一仗 → 读回
import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const href = () => c.eval('location.href');
const r0 = await c.rect('#stage');
await c.mouse(r0.x + 120, r0.y + 120); await sleep(2600);
log('href', await href());
const sur = await c.eval(`(()=>{const s=document.getElementById('surrenderSheet'); if(!s||s.hidden) return null; return {sub:document.getElementById('surSub').innerText, cards:[...document.querySelectorAll('#surCards .sgen')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,120))};})()`);
log('surrender', JSON.stringify(sur));
if (sur) {
  await c.shot('06j_空名招降卡');
  const b = await c.eval(`(()=>{const e=document.getElementById('surAllKill'); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,dis:e.disabled};})()`);
  log('bulk kill', JSON.stringify(b));
  if (!b.dis) { await c.mouse(b.x, b.y); await sleep(1400); }
  log('notice', await c.eval(`(document.getElementById('notice')||{}).innerText`));
  await c.shot('06k_处理空名卡');
}
log('state', JSON.stringify(await c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')); return {month:s.month,gold:s.gold,ct:(s.owned||[]).length,owned:s.owned,cap:s.captured,ex:s.executed,lastPost:s.lastPost&&{city:s.lastPost.city,joined:s.lastPost.joined,dead:s.lastPost.dead}})();})()`)));
// 打开存档面板
const bs = await c.rect('#btnSave'); await c.mouse(bs.x + bs.w / 2, bs.y + bs.h / 2); await sleep(900);
log('save sheet', JSON.stringify(await c.eval(`(()=>{const sh=document.getElementById('saveSheet'); return {open:!sh.hidden, ttl:document.getElementById('saveTtl')&&document.getElementById('saveTtl').innerText, sub:(document.getElementById('saveSub')||{}).innerText, msg:(document.getElementById('saveMsg')||{}).innerText, slots:[...document.querySelectorAll('#slotRows .slot')].map(e=>({slot:e.dataset.slot, cls:e.className, txt:e.innerText.replace(/\\s+/g,' ').slice(0,80), btns:[...e.querySelectorAll('button[data-do]')].map(b=>b.dataset.do+(b.disabled?'✘':'✔'))}))};})()`)));
await c.shot('07_存档面板');
// 存到槽 2
const s2 = await c.eval(`(()=>{const b=document.querySelector('#slotRows .slot[data-slot="1"] button[data-do="save"]'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
log('slot2 save btn', JSON.stringify(s2));
if (s2) { await c.mouse(s2.x, s2.y); await sleep(1200); }
log('after manual save', JSON.stringify(await c.eval(`(()=>{const sv=JSON.parse(localStorage.getItem('sanguo_saves_v1')); return {last:sv.last, slots:sv.slots.map((s,i)=>s?{i:i+1,ts:s.ts,month:s.month,month2:s.month,gold:s.gold,owned:(s.ownedCount||0),name:s.slotName||s.name}:null)};})()`)));
log('saveMsg', await c.eval(`(document.getElementById('saveMsg')||{}).innerText`));
await c.shot('07b_手存到槽2');
await c.save('07a_handsave_slot2', await c.eval(`localStorage.getItem('sanguo_saves_v1')`));
await c.save('07a_campaign', await c.eval(`localStorage.getItem('sanguo_campaign_v1')`));
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind));
await c.close();
