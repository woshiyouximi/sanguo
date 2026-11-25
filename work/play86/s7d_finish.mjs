// 步骤7d：收尾被迫守城战（宛）→ 回图 → 读槽 2 验证
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const st = () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null; return {mode:s.mode, msg:s.message, settle:s.mode==='settled'?{winner:s.settlement.winner, modeName:s.settlement.modeName, report:s.settlement.report, cap:(s.settlement.post.captures||[]).map(x=>x.name), ex:(s.settlement.post.executed||[]).map(x=>x.name), drop:(s.settlement.post.drops||[]).map(x=>x.name), rec:s.settlement.record, exp:s.settlement.expGain, merit:s.settlement.meritGain}:null};})()`);
log('href', await c.eval('location.href'));
let s = await st(); log('state', JSON.stringify(s));
const r = await c.rect('#stage');
const des = async (x, y, w = 900) => { await c.mouse(r.x + x * (r.w / 750), r.y + y * (r.h / 1334)); await sleep(w); };
if (s && s.mode === 'ready') { await c.shot('07f_三度被迫守城'); await des(375, 684, 1500); }
s = await st(); log('after start', JSON.stringify(s));
if (s && s.mode === 'fighting') await des(630, 1262, 900);
for (let i = 0; i < 50; i++) { const x = await st(); if (x && x.mode === 'settled') { s = x; log('settled', JSON.stringify(x)); break; } await sleep(600); }
await c.shot('07g_结算');
await des(120, 120, 2600);
log('href2', await c.eval('location.href'));
const sur = await c.eval(`(()=>{const e=document.getElementById('surrenderSheet'); if(!e||e.hidden) return null; return [...document.querySelectorAll('#surCards .sgen')].map(x=>x.innerText.replace(/\\s+/g,' ').slice(0,110));})()`);
log('surrender cards', JSON.stringify(sur));
if (sur) { await c.shot('07h_招降面板2'); const b = await c.eval(`(()=>{const e=document.getElementById('surAllRecruit'); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,dis:e.disabled};})()`); if (!b.dis) { await c.mouse(b.x, b.y); await sleep(1300); } log('notice', await c.eval(`(document.getElementById('notice')||{}).innerText`)); await c.shot('07i_批量招降'); }
log('map state', JSON.stringify(await c.eval(`(()=>({ym:(document.getElementById('ym')||{}).innerText, gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, badge:(document.getElementById('slotBadge')||{}).innerText, notice:(document.getElementById('notice')||{}).innerText, log:document.getElementById('logrows').innerText.replace(/\\s+/g,' ').slice(0,260)}))()`)));
// 刷新后读槽 2
await c.goto(BASE + 'campaign.html'); await sleep(1800);
log('after reload', JSON.stringify(await c.eval(`(()=>({ym:(document.getElementById('ym')||{}).innerText, gold:(document.getElementById('gold')||{}).innerText, badge:(document.getElementById('slotBadge')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText}))()`)));
const bs = await c.rect('#btnSave'); await c.mouse(bs.x + bs.w / 2, bs.y + bs.h / 2); await sleep(900);
const l2 = await c.eval(`(()=>{const b=document.querySelector('#slotRows .slot:nth-child(2) button[data-do="load"]'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,dis:b.disabled};})()`);
log('load slot2 btn', JSON.stringify(l2));
await c.shot('07j_读档前');
if (l2 && !l2.dis) { await c.mouse(l2.x, l2.y); await sleep(3000); }
log('after load', JSON.stringify(await c.eval(`(()=>({href:location.href, ym:(document.getElementById('ym')||{}).innerText, gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, badge:(document.getElementById('slotBadge')||{}).innerText, notice:(document.getElementById('notice')||{}).innerText}))()`)));
log('store', JSON.stringify(await c.eval(`(()=>{const sv=JSON.parse(localStorage.getItem('sanguo_saves_v1')); return {last:sv.last, slots:sv.slots.map((s,i)=>s?{i:i+1,ts:s.ts,month:s.month,gold:s.gold,ct:s.ownedCount}:null)};})()`)));
await c.shot('07k_读档后');
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind), JSON.stringify(errs.filter(e=>e.kind==='error').slice(-2).map(e=>e.msg.slice(0,80))));
await c.close();
