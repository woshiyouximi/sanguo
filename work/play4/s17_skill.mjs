import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 782, h: 1500 });
const out = { tries: [] };
const S = async () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
 return {mode:s.mode,tick:s.time,msg:s.message,sel:s.selectedSkill?String(s.selectedSkill.name||s.selectedSkill):null,
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,post:s.settlement.post}:null};})()`);
await sleep(1200);
out.url = await c.eval('location.href');
const R = await c.rect('#stage');
out.rect = R;
const px = (x) => R.x + x * (R.w / 750), py = (y) => R.y + y * (R.h / 1334);
const design = async (x, y) => { await c.mouse(Math.round(px(x)), Math.round(py(y))); await sleep(150); };
let s = await S();
out.enter = s;
await c.shot('s17_ready');
if (s && s.mode === 'ready') { await design(375, 683); await sleep(900); }
out.started = await S();
for (const [wait, label] of [[2500, 't2.5s'], [6000, 't8.5s'], [6000, 't14.5s']]) {
  await sleep(wait);
  await design(160, 1166); await sleep(700);
  const r = await S();
  out.tries.push({ at: label, msg: r && r.msg, sel: r && r.sel, mode: r && r.mode });
  if (r && r.sel) { out.shotSel = await c.shot('s17_skill_selected'); await design(375, 640); await sleep(1000); const f = await S(); out.tries.push({ cast: f && f.msg }); out.shotCast = await c.shot('s17_cast'); break; }
  if (!r || r.mode !== 'fighting') break;
}
out.shotFight = await c.shot('s17_fight');
let settled = null;
for (let i = 0; i < 120; i++) { await sleep(400); const t = await S(); if (t && t.mode === 'settled') { settled = t; break; } if (!t) break; }
out.settled = settled;
if (settled) out.shotSettle = await c.shot('s17_settle');
out.errs = await c.errs(c.startErr);
await c.save('s17_defence_skill', out);
console.log(JSON.stringify({ url: out.url, enter: out.enter && out.enter.mode, tries: out.tries, settled: settled && settled.msg, errs: out.errs }, null, 1));
c.close();
