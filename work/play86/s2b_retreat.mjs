// 处理「推进一月被动跳进的守城战」：开战 → 撤退 → 结算 → 回大地图（同时取证据）
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
async function design(x, y) {
  const r = await c.rect('#stage');
  await c.mouse(r.x + x * (r.w / 750), r.y + y * (r.h / 1334));
  await sleep(500);
}
const st = () => c.eval(`(()=>{const s=window.__battleState||null; return {href:location.href, mode:s?s.mode:null, msg:s?s.message:null, t:(document.body.innerText||'').slice(0,80)};})()`);
log('0', JSON.stringify(await st()));
await c.shot('02j_开战前');
await design(375, 683);           // 開戰
await sleep(1800);
log('1 after start', JSON.stringify(await st()));
await c.shot('02k_战斗中');
await design(630, 1262);          // 撤退
await sleep(1500);
log('2 after retreat', JSON.stringify(await st()));
await c.shot('02l_撤退结算');
log('errs', await c.errCount(), JSON.stringify((await c.errs(c.startErr)).slice(0, 8)));
await c.close();
