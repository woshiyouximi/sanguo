import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot({ w: 782, h: 1500 });
const R = await c.rect('#stage');
const clickD = async (dx, dy) => { await c.mouse(R.x + dx * R.w / 750, R.y + dy * R.h / 1334); };
const st = () => c.eval(`(()=>{const s=window.__sanguo.state; const w=s.world; return {mode:s.mode, msg:s.message, over:w&&w.over, sel:s.selectedSkill, aim:s.aim, turn:w&&w.turn, tick:w&&w.tick, qi:w&&w.qi, settle:s.settlement,
 my:w&&w.units?w.units.filter(u=>u.side===0&&u.alive).length:null, en:w&&w.units?w.units.filter(u=>u.side===1&&u.alive).length:null};})()`);
const out = {};

await sleep(4000);
out.beforeHeal = await st();
await clickD(160, 1166);
await sleep(600);
out.afterHeal = await st();

// strike skill slot2 then field
await clickD(228, 1166);
await sleep(500);
out.afterSkill2 = await st();
await clickD(375, 700);
await sleep(800);
out.afterStrike = await st();

let last = null;
for (let i = 0; i < 90; i++) {
  await sleep(2000);
  last = await st();
  if (last.mode === 'settled' || last.over) break;
  if (i === 5) out.mid = last;
}
out.final = last;
out.shotSettle = await c.shot('s4c_settle');
out.errs = await c.errs(c.startErr);
await c.save('s4c_battle_end', out);
console.log(JSON.stringify(out, null, 1));
c.close();
