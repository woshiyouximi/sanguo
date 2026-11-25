// 结算/回图循环：若被强插进新战斗则快速撤退收尾，直到落回大地图；然后 dump 状态与 console
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
async function design(x, y, wait = 500) {
  const r = await c.rect('#stage');
  await c.mouse(r.x + x * (r.w / 750), r.y + y * (r.h / 1334));
  await sleep(wait);
}
const href = () => c.eval('location.href');
const st = () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
  return {mode:s.mode, msg:s.message, winner:s.settlement&&s.settlement.winner, report:s.settlement&&s.settlement.report, settle:s.mode==='settled'?{modeName:s.settlement.modeName, kills:s.settlement.kills, dur:s.settlement.durationSec, exp:s.settlement.expGain, merit:s.settlement.meritGain, rec:s.settlement.record, cap:(s.settlement.post.captures||[]).map(x=>x.name+(x.recruited?'✔':'✘')), ex:(s.settlement.post.executed||[]).map(x=>x.name), rel:(s.settlement.post.released||[]).map(x=>x.name), drop:(s.settlement.post.drops||[]).map(x=>x.name)}:null};})()`);
for (let round = 0; round < 4; round++) {
  const h = await href();
  log('round', round, 'href', h);
  if (h.includes('index.html')) {
    const s0 = await st();
    log('battle state', JSON.stringify(s0));
    if (s0 && s0.mode === 'ready') { await c.shot('06c_换战_ready'); await design(375, 684, 1200); }
    if (s0 && s0.mode === 'fighting') { await design(630, 1262, 800); }
    for (let i = 0; i < 40; i++) { const s = await st(); if (s && s.mode === 'settled') { log('settled', JSON.stringify(s)); break; } await sleep(500); }
    await c.shot('06d_换战结算');
    await design(120, 120, 2500);
  } else break;
}
const ok = await c.eval(`(()=>({gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, king:(document.getElementById('kingName')||{}).innerText, ym:(document.getElementById('ym')||{}).innerText, rec:(document.getElementById('rec')||{}).innerText, acts:[...document.querySelectorAll('#actions [data-act]')].map(e=>e.dataset.act+':'+e.innerText.replace(/\\s+/g,' ')), listRows:document.querySelectorAll('#list .city').length, log:(document.getElementById('logrows')||{}).innerText}))()`);
log('campaign', JSON.stringify(ok));
await c.shot('06e_回图后大地图');
const errs = await c.errs(0);
const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind));
log('errors', JSON.stringify(errs.filter((e) => e.kind === 'error' || /Uncaught/.test(e.msg)).slice(-4)));
await c.close();
