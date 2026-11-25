// 复盘：读 localStorage 里的存档键，并重载看是否复现崩溃
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const info = () => c.eval(`(()=>{
  const out={keys:{}};
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); out.keys[k]=(localStorage.getItem(k)||'').length;}
  let cp=null; try{cp=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'null');}catch(e){out.parseErr=String(e);}
  if(cp) out.campaign={scenario:cp.scenario, king:cp.king, month:cp.month, gold:cp.gold, owned:cp.owned, wins:cp.wins, losses:cp.losses, battle:cp.battle, ts:cp.ts, lastPost:cp.lastPost?Object.keys(cp.lastPost):null, captured:cp.captured};
  let sv=null; try{sv=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'null');}catch(e){}
  if(sv) out.saves={last:sv.last, slots:(sv.slots||[]).map(s=>s?{scenario:s.scenario,month:s.month,ts:s.ts,owned:(s.owned||[]).length}:null)};
  out.href=location.href;
  return out;
})()`);
log('before reload', JSON.stringify(await info()));
await c.goto(BASE + 'campaign.html');
await sleep(1500);
log('after reload', JSON.stringify(await info()));
log('errs', await c.errCount(), JSON.stringify((await c.errs(0)).slice(0, 6)));
await c.shot('02o_重载后');
await c.close();
