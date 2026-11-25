import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot({ w: 782, h: 1500 });
const R = await c.rect('#stage');
const toPage = (dx, dy) => [R.x + dx * R.w / 750, R.y + dy * R.h / 1334];
const clickD = async (dx, dy) => { const [x, y] = toPage(dx, dy); await c.mouse(x, y); };
const st = () => c.eval(`(()=>{const s=window.__sanguo.state; return {mode:s.mode, msg:s.message, over:s.world&&s.world.over, sel:s.selectedSkill, aim:s.aim, turn:s.world&&s.world.turn, settle:s.settlement, qi:s.world&&s.world.qi, ticks:s.world&&s.world.tick};})()`);
const out = { rect: R };

out.ready = await st();
// 1) click 開戰
await clickD(375, 683);
await sleep(1500);
out.afterStart = await st();
out.shotStart = await c.shot('s4b_started');

// 2) click skill slot 1 (命療術)
await clickD(160, 1166);
await sleep(700);
out.afterSkill1 = await st();
out.shotSkill1 = await c.shot('s4b_skill1');

// 3) click field center
await clickD(375, 700);
await sleep(900);
out.afterField = await st();
out.shotField = await c.shot('s4b_field_click');

out.errs = await c.errs(c.startErr);
await c.save('s4b_battle_actions', out);
console.log(JSON.stringify(out, null, 1));
c.close();
