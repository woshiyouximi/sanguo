// 现场修复：把槽 1 快照对齐 sanguo_campaign_v1（让 boot.battle=false），并 dump 结构
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const before = await c.eval(`(()=>{
  const sv=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'null');
  const sl=(sv&&sv.slots&&sv.slots[0])||null;
  return { keys: sv?Object.keys(sv):null, slotKeys: sl?Object.keys(sl):null,
    meta: sl?{scenario:sl.scenario, month:sl.month, ts:sl.ts, slot:sl.slot}:null,
    snapKeys: sl&&sl.snapshot?Object.keys(sl.snapshot):null,
    snapOwned: sl&&sl.snapshot?sl.snapshot.owned:null,
    snapHead: sl?JSON.stringify(sl).slice(0,300):null };
})()`);
log('slot struct', JSON.stringify(before));
await c.save('02_slot_before_repair', before);
const fix = await c.eval(`(()=>{
  const sv=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'null');
  const cp=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'null');
  if(!sv||!cp) return {err:'missing'};
  const sl=sv.slots[0]||{};
  const ts=Math.max(Number(cp.ts)||0, Date.now());
  sl.snapshot=JSON.parse(JSON.stringify(cp));
  sl.snapshot.ts=ts; sl.ts=ts; sl.scenario=cp.scenario; sl.month=cp.month;
  sv.slots[0]=sl;
  localStorage.setItem('sanguo_saves_v1', JSON.stringify(sv));
  return {ok:true, ts, owned:sl.snapshot.owned};
})()`);
log('fix', JSON.stringify(fix));
await c.goto(BASE + 'campaign.html');
await sleep(1600);
log('after fix', JSON.stringify(await c.eval(`(()=>({gold:document.getElementById('gold')?.innerText, ct:document.getElementById('ct')?.innerText, rec:document.getElementById('rec')?.innerText, king:document.getElementById('kingName')?.innerText, ym:document.getElementById('ym')?.innerText, badge:document.getElementById('slotBadge')?.innerText, notice:document.getElementById('notice')?.innerText, log:(document.getElementById('logrows')||{}).innerText}))()`)));
log('errs', await c.errCount(), JSON.stringify((await c.errs(0)).slice(-3)));
await c.shot('02p_修复后大地图');
await c.close();
