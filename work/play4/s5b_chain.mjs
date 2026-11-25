import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot({ w: 782, h: 1500 });
const R = await c.rect('#stage');
const clickD = async (dx, dy) => { await c.mouse(R.x + dx * R.w / 750, R.y + dy * R.h / 1334); };
const st = () => c.eval(`(()=>{const s=window.__sanguo.state; return {mode:s.mode,msg:s.message,tick:s.world&&s.world.tick,over:s.world&&s.world.over,settle:s.settlement&&{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills}};})()`);
const out = { cycles: [] };

for (let cyc = 0; cyc < 5; cyc++) {
  const href = await c.eval('location.href');
  if (!href.includes('index.html')) break;
  const rec = { href, at: Date.now() };
  let s = await st();
  rec.mode0 = s.mode;
  if (s.mode === 'ready') { await clickD(375, 683); await sleep(1200); s = await st(); rec.started = s.mode; }
  let fin = s;
  for (let i = 0; i < 60; i++) { await sleep(1500); fin = await st(); if (fin.mode === 'settled' || fin.over) break; }
  rec.final = fin;
  rec.shot = await c.shot('s5b_defend_' + cyc);
  // click top of canvas -> back to campaign
  await c.mouse(R.x + 375, R.y + 60);
  await sleep(200);
  await c.waitLoad(); await sleep(2200);
  rec.afterHref = await c.eval('location.href');
  out.cycles.push(rec);
  if (!rec.afterHref.includes('index.html')) break;
}

await c.viewport(750, 1334);
await sleep(800);
out.href = await c.eval('location.href');
out.ui = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,700):null;}; return {ym:t('#ym'),gold:t('#gold'),ct:t('#ct'),rec:t('#rec'),notice:t('#notice'),logrows:t('#logrows')};})()`);
out.data = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); return {month:o.month,gold:o.gold,wins:o.wins,losses:o.losses,defWins:o.defWins,ts:o.ts,owned:o.owned,armies:(o.armies||[]).length,log:(o.log||[]).slice(-8)};})()`);
out.shotMap = await c.shot('s5b_map_after_defends');
out.errs = await c.errs(c.startErr);
await c.save('s5b_chain', out);
console.log(JSON.stringify(out, null, 1));
c.close();
