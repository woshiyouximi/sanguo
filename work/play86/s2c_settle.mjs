// 等撤退结算（轮询 window.__sanguo.state.mode），截图后点回大地图
import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const st = () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null; return {mode:s.mode, msg:s.message, settle:s.settlement||null, over:s.world?{over:s.world.over, end:s.world.endReason, fled:s.world.fled, tick:s.world.tick}:null};})()`);
for (let i = 0; i < 40; i++) {
  const s = await st();
  if (s && s.mode === 'settled') { log('settled at', i * 500, 'ms', JSON.stringify(s)); break; }
  if (i % 6 === 0) log('tick', i, JSON.stringify(s));
  await sleep(500);
}
log('final', JSON.stringify(await st()));
await c.shot('02m_撤退结算_完成');
const r = await c.rect('#stage');
await c.mouse(r.x + 100, r.y + 100);   // 结算后点任意处回大地图
await sleep(2500);
log('after click href', await c.eval('location.href'));
await c.shot('02n_回大地图');
log('errs', await c.errCount(), JSON.stringify((await c.errs(c.startErr)).slice(0, 8)));
await c.close();
