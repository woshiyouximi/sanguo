// 步骤5b：从编成点「出 征」→ 打一场野战（赢）→ 结算面板
import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const href = () => c.eval('location.href');
log('href', await href());
const g = await c.rect('#go');
await c.mouse(g.x + g.w / 2, g.y + g.h / 2);
await sleep(3000);
log('href2', await href());
const st = () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
  return {mode:s.mode, msg:s.message, troops:(s.sides&&s.sides.A&&s.sides.A.troops)||null, b:(s.sides&&s.sides.B&&s.sides.B.troops)||null,
    skills:(s.skills||[]).map(k=>k.name), qi:s.qi, mp:s.mp,
    settle:s.mode==='settled'?{winner:s.settlement.winner, modeName:s.settlement.modeName, report:s.settlement.report, kills:s.settlement.kills, dur:s.settlement.durationSec, score:s.settlement.score, exp:s.settlement.expGain, merit:s.settlement.meritGain, rec:s.settlement.record, cap:(s.settlement.post.captures||[]).map(x=>x.name), ex:(s.settlement.post.executed||[]).map(x=>x.name), drop:(s.settlement.post.drops||[]).map(x=>x.name)}:null};})()`);
log('ready', JSON.stringify(await st()));
await c.shot('05g_野战编成后开战前');
const r = await c.rect('#stage');
const des = async (x, y, w = 800) => { await c.mouse(r.x + x * (r.w / 750), r.y + y * (r.h / 1334)); await sleep(w); };
await des(375, 684, 1200);
log('fighting', JSON.stringify(await st()));
await c.shot('05h_野战中');
let s = null;
for (let i = 0; i < 120; i++) { s = await st(); if (s && s.mode === 'settled') { log('settled at', i, JSON.stringify(s)); break; } await sleep(1000); }
await c.shot('05i_野战结算');
// 结算面板文字（canvas 外的 DOM？）
log('settle dom', await c.eval(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,600)`));
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind));
await c.close();
