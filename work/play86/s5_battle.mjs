// 步骤5（被动守城战版）：開戰 → 技能格 → 放技能 → 撤退 → 結算
import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
async function design(x, y, wait = 600) {
  const r = await c.rect('#stage');
  await c.mouse(r.x + x * (r.w / 750), r.y + y * (r.h / 1334));
  await sleep(wait);
}
const st = () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
  return {mode:s.mode, msg:s.message, qi:s.qi, mp:s.mp, qiMax:s.qiMax, mpMax:s.mpMax,
    skills:(s.skills||[]).map(k=>k.name+'/'+k.mp+'mp/'+k.qi+'qi'),
    sel:s.selectedSkill, settle:s.settlement?{winner:s.settlement.winner, modeName:s.settlement.modeName, kills:s.settlement.kills, dur:s.settlement.durationSec, exp:s.settlement.expGain, merit:s.settlement.meritGain, rec:s.settlement.record, post:s.settlement.post?{cap:(s.settlement.post.captures||[]).map(x=>x.name), ex:(s.settlement.post.executed||[]).map(x=>x.name), rel:(s.settlement.post.released||[]).map(x=>x.name), drop:(s.settlement.post.drops||[]).map(x=>x.name)}:null}:null,
    world:s.world?{over:s.world.over, end:s.world.endReason, tick:s.world.tick}:null};})()`);
log('ready', JSON.stringify(await st()));
await c.shot('05a_开战前');
await design(375, 684, 1200);
log('fighting', JSON.stringify(await st()));
await c.shot('05b_开战');
// 点技能格 0
await design(160, 1168, 400);
log('after pick skill', JSON.stringify(await st()));
await c.shot('05c_选技能');
// 点战场上的敌军（右半场）
await design(520, 800, 1200);
log('after cast', JSON.stringify(await st()));
await c.shot('05d_放技能');
// 再放一次同样的技能（看 MP/气力是否够）
await design(160, 1168, 300);
await design(500, 760, 1200);
log('after cast2', JSON.stringify(await st()));
await c.shot('05e_二次技能');
// 撤退
await design(630, 1262, 800);
log('after retreat click', JSON.stringify(await st()));
for (let i = 0; i < 40; i++) {
  const s = await st();
  if (s && s.mode === 'settled') { log('settled at', i * 500, JSON.stringify(s)); break; }
  await sleep(500);
}
await c.shot('05f_结算');
await c.save('05_settlement', await st());
log('errs', await c.errCount(), JSON.stringify((await c.errs(c.startErr)).slice(0, 6)));
await c.close();
