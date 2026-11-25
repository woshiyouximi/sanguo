import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
// notice 是否自动消失：现在距新遊戲 notice 已有数秒
const n1 = await c.eval(`(()=>{const e=document.getElementById('notice'); return {hidden:e.hidden, disp:getComputedStyle(e).display, op:getComputedStyle(e).opacity, txt:(e.innerText||'').trim().slice(0,120)};})()`);
log('notice_now', n1);
await sleep(4000);
const n2 = await c.eval(`(()=>{const e=document.getElementById('notice'); return {hidden:e.hidden, disp:getComputedStyle(e).display, op:getComputedStyle(e).opacity, txt:(e.innerText||'').trim().slice(0,120)};})()`);
log('notice_after4s', n2);
// 再触发一次通知（推进一月会产生通知），记录出现→消失时间线
await c.clickSel('#actions .btn[data-act="advance"]'); await sleep(800);
const n3 = await c.eval(`(()=>{const e=document.getElementById('notice'); return {hidden:e.hidden, txt:(e.innerText||'').trim().slice(0,160), ym:(document.getElementById('ym')||{}).innerText, gold:(document.getElementById('gold')||{}).innerText};})()`);
log('notice_afterAdvance', n3);
const shot1 = await c.shot('s1e_notice_after_advance');
const t = [];
for (let i = 0; i < 6; i++) { await sleep(2000); t.push(await c.eval(`(()=>{const e=document.getElementById('notice'); return {i:${i}, hidden:e.hidden, disp:getComputedStyle(e).display, op:getComputedStyle(e).opacity};})()`)); }
log('noticeTimeline', t);
const shot2 = await c.shot('s1f_notice_12s_later');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s1d_notice', { n1, n2, n3, t, errs });
c.close();
