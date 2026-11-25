// 战后回大地图：抓崩溃证据 → 现场修复槽快照 → 重载
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const r = await c.rect('#stage');
await c.mouse(r.x + 120, r.y + 120);      // 结算页点任意处回大地图
await sleep(2500);
log('href', await c.eval('location.href'));
const dead = await c.eval(`(()=>({gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, king:(document.getElementById('kingName')||{}).innerText, badge:(document.getElementById('slotBadge')||{}).innerText, acts:(document.querySelectorAll('#actions [data-act]')||[]).length, listRows:document.querySelectorAll('#list .city').length, logRows:document.querySelectorAll('#logrows .row').length}))()`);
log('dead page', JSON.stringify(dead));
await c.shot('06a_战后回图_死页');
log('errs', await c.errCount(), JSON.stringify((await c.errs(0)).slice(-2).map((e) => e.msg)));
const fix = await c.eval(`(()=>{
  const sv=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'null');
  const cp=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'null');
  if(!sv||!cp) return {err:'missing'};
  const before=(sv.slots[0]&&sv.slots[0].ts)||0;
  const ts=Math.max(Number(cp.ts)||0, Date.now());
  sv.slots[0].snapshot=JSON.parse(JSON.stringify(cp)); sv.slots[0].snapshot.ts=ts;
  sv.slots[0].ts=ts; sv.slots[0].scenario=cp.scenario; sv.slots[0].month=cp.month;
  localStorage.setItem('sanguo_saves_v1', JSON.stringify(sv));
  return {ok:true, before, ts, owned:cp.owned, gold:cp.gold, month:cp.month, losses:cp.losses, lastPost:cp.lastPost?1:0};
})()`);
log('repair', JSON.stringify(fix));
await c.goto(BASE + 'campaign.html');
await sleep(1800);
const ok = await c.eval(`(()=>({gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, king:(document.getElementById('kingName')||{}).innerText, ym:(document.getElementById('ym')||{}).innerText, badge:(document.getElementById('slotBadge')||{}).innerText, rec:(document.getElementById('rec')||{}).innerText, notice:(document.getElementById('notice')||{}).innerText, log:(document.getElementById('logrows')||{}).innerText, acts:[...document.querySelectorAll('#actions [data-act]')].map(e=>e.dataset.act+':'+e.innerText.replace(/\\s+/g,' '))}))()`);
log('after repair', JSON.stringify(ok));
await c.shot('06b_修复后战报');
await c.close();
