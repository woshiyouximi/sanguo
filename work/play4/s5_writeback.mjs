import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = {};
out.at = await c.eval('location.href');
// any click on the canvas at settled returns to campaign (from=campaign)
await c.mouse(375, 200);
await sleep(300);
await c.viewport(750, 1334);
await c.waitLoad();
await sleep(2500);
out.href = await c.eval('location.href');
out.ui = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,600):null;};
 return {ym:t('#ym'),gold:t('#gold'),ct:t('#ct'),rec:t('#rec'),notice:t('#notice'),logrows:t('#logrows'),king:t('#kingName')};})()`);
out.data = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); const s=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}'); const sl=(s.slots||[])[0]||{};
 const pick=(x)=>x?{month:x.month,gold:x.gold,wins:x.wins,losses:x.losses,defWins:x.defWins,owned:x.owned,ts:x.ts,log:(x.log||[]).slice(-6)}:null;
 return {legacy:pick(o), slot0:{month:sl.month,gold:sl.gold,wins:sl.wins,defWins:sl.defWins,ts:sl.ts,month2:(sl.snap||{}).month}, slotKeys:Object.keys(sl), last:s.last,
   wan:o.cities&&o.cities['宛']?{troops:o.cities['宛'].troops,inf:o.cities['宛'].inf}:null,
   runan:o.cities&&o.cities['汝南']?{troops:o.cities['汝南'].troops}:null};})()`);
out.shot = await c.shot('s5_back_to_map');
out.errs = await c.errs(c.startErr);
await c.save('s5_writeback', out);
console.log(JSON.stringify(out, null, 1));
c.close();
