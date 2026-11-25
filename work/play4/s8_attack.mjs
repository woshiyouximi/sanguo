import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot({ w: 782, h: 1500 });
const out = { steps: [], errs: [] };
const S = async () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
 return {mode:s.mode, tick:s.time, msg:s.message, sel:s.selectedSkill?String(s.selectedSkill.name||s.selectedSkill):null,
  skills:(s.skills||[]).map(k=>({name:k.name,kind:k.kind,ok:k.ok,cd:k.cd,cost:k.cost})),
  units:(Array.isArray(s.units)?s.units:Object.values(s.units||{})).length,
  alive:(Array.isArray(s.units)?s.units:Object.values(s.units||{})).filter(u=>u&&u.alive).length,
  sideKeys:(()=>{const u=Array.isArray(s.units)?s.units[0]:Object.values(s.units||{})[0]; return u?Object.keys(u).slice(0,12):null;})(),
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,exp:s.settlement.expGain,merit:s.settlement.meritGain,level:s.settlement.level,up:s.settlement.levelUp,post:s.settlement.post}:null};})()`);
const st = async (tag) => { const s = await S(); out.steps.push({ tag, s }); console.log(tag, JSON.stringify(s)); return s; };

out.start = await c.eval('location.href');
await c.clickSel('#go');
await c.waitLoad(); await sleep(2500);
await c.viewport(782, 1500); await sleep(600);
out.url = await c.eval('location.href');
out.rect = await c.rect('#stage');
await st('enter');
out.shotReady = await c.shot('s8_battle_ready');

// design->page mapping from canvas rect
const R = out.rect;
const px = (x) => R.x + x * (R.w / 750);
const py = (y) => R.y + y * (R.h / 1334);
const design = async (x, y) => { await c.mouse(Math.round(px(x)), Math.round(py(y))); };

// start
if ((out.steps.at(-1).s || {}).mode === 'ready') { await design(375, 683); await sleep(1200); }
await st('after_start');
out.shotFight = await c.shot('s8_battle_fight');

// skill slot 1 (design centre 160,1166)
await design(160, 1166); await sleep(900);
await st('skill1');
// if no selection, wait & retry once
let s1 = out.steps.at(-1).s;
if (!s1 || !s1.sel) { await sleep(4000); await design(160, 1166); await sleep(900); await st('skill1_retry'); }
out.shotSkill = await c.shot('s8_skill1');

// field centre
await design(375, 700); await sleep(1200);
await st('field_click');
out.shotCast = await c.shot('s8_cast');

// wait for settle
let settled = null;
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  const s = await S();
  if (s && s.mode === 'settled') { settled = s; break; }
  if (i % 10 === 9) console.log('tick', i + 1, s && s.mode, s && s.tick, s && s.mine, s && s.foe);
}
out.settled = settled;
await st('settled');
out.shotSettle = await c.shot('s8_settle');
out.errs = await c.errs(c.startErr);
await c.save('s8_attack', out);
console.log('ERRS', JSON.stringify(out.errs));
c.close();

