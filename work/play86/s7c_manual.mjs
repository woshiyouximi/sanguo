// 步骤7c：手存到槽2（按行序）→ 自动存档 → 读回槽2
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const store = () => c.eval(`(()=>{const sv=JSON.parse(localStorage.getItem('sanguo_saves_v1')); return {last:sv.last, slots:sv.slots.map((s,i)=>s?{i:i+1,ts:s.ts,month:s.month,gold:s.gold,ct:s.ownedCount,rec:s.wins+'/'+s.losses}:null)};})()`);
await c.goto(BASE + 'campaign.html'); await sleep(1600);
const bs = await c.rect('#btnSave'); await c.mouse(bs.x + bs.w / 2, bs.y + bs.h / 2); await sleep(900);
log('rows html', await c.eval(`[...document.querySelectorAll('#slotRows .slot')].slice(0,3).map(e=>e.outerHTML.replace(/\\s+/g,' ').slice(0,260))`));
// 用第 2 行的「存」
const s2 = await c.eval(`(()=>{const b=document.querySelector('#slotRows .slot:nth-child(2) button[data-do="save"]'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,html:b.outerHTML.slice(0,120)};})()`);
log('slot2 save btn', JSON.stringify(s2));
if (s2) { await c.mouse(s2.x, s2.y); await sleep(1500); }
log('store after hand save', JSON.stringify(await store()));
log('msg', await c.eval(`(document.getElementById('saveMsg')||{}).innerText.replace(/\\s+/g,' ')`));
await c.shot('07b_手存到槽2');
await c.save('07b_after_handsave', await c.eval(`localStorage.getItem('sanguo_saves_v1')`));
log('slot rows now', await c.eval(`[...document.querySelectorAll('#slotRows .slot')].slice(0,3).map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,90))`));
// 关面板
const cn = await c.rect('#saveSheet [data-close]'); if (cn && cn.w) { await c.mouse(cn.x + cn.w / 2, cn.y + cn.h / 2); await sleep(600); }
// 自动存档：推进一月
const mr = await c.rect('#map'); await c.mouse(mr.x + 442 * (mr.w / 750), mr.y + 223 * (mr.h / 695)); await sleep(500);
const adv = await c.rect('#actions [data-act="advance"]'); if (adv && adv.w) { await c.mouse(adv.x + adv.w / 2, adv.y + adv.h / 2); await sleep(2800); }
log('href after advance', await c.eval('location.href'));
log('store after autosave', JSON.stringify(await store()));
await c.shot('07c_自动存档后');
// 回图看徽章与月份
await c.goto(BASE + 'campaign.html'); await sleep(1800);
log('badge', await c.eval(`(document.getElementById('slotBadge')||{}).innerText`), 'ym', await c.eval(`(document.getElementById('ym')||{}).innerText`), 'gold', await c.eval(`(document.getElementById('gold')||{}).innerText`), 'notice', await c.eval(`(document.getElementById('notice')||{}).innerText`));
await c.shot('07d_刷新后徽章');
// 读槽 2
const bs2 = await c.rect('#btnSave'); await c.mouse(bs2.x + bs2.w / 2, bs2.y + bs2.h / 2); await sleep(900);
log('slot2 load btn', JSON.stringify(await c.eval(`(()=>{const b=document.querySelector('#slotRows .slot:nth-child(2) button[data-do="load"]'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,dis:b.disabled};})()`)));
const l2 = await c.eval(`(()=>{const b=document.querySelector('#slotRows .slot:nth-child(2) button[data-do="load"]'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
if (l2) { await c.mouse(l2.x, l2.y); await sleep(2800); }
log('after load', JSON.stringify(await c.eval(`(()=>({href:location.href, ym:(document.getElementById('ym')||{}).innerText, gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, badge:(document.getElementById('slotBadge')||{}).innerText, notice:(document.getElementById('notice')||{}).innerText}))()`)));
log('store after load', JSON.stringify(await store()));
await c.shot('07e_读档后');
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind), JSON.stringify(errs.filter(e=>e.kind==='error').slice(-2).map(e=>e.msg.slice(0,80))));
await c.close();
