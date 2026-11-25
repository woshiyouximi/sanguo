import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const tally = async (tag) => { const e = await c.errs(0); const k = {}; e.forEach(x => (k[x.kind] = (k[x.kind] || 0) + 1)); log(tag, JSON.stringify(k), JSON.stringify(e.map(x=>x.msg.slice(0,70)))); };
await c.eval(`sessionStorage.removeItem('__dsh_errs86')`); await c.eval('location.reload()'); await sleep(2600);
await tally('A 大地图重载');
// 选城（列表第 1 行）→ 页脚按钮出现
const row = await c.eval(`(()=>{const e=document.querySelector('#list .city'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,txt:e.innerText.replace(/\\s+/g,' ').slice(0,40)};})()`);
await c.mouse(row.x, row.y); await sleep(600);
log('hint', await c.eval(`document.getElementById('hint').innerText`), 'acts', await c.eval(`[...document.querySelectorAll('#actions button')].map(b=>b.innerText.replace(/\\s+/g,' ').slice(0,18))`));
await tally('B 选城');
// 势力抽屉 + 君主卡
const bf = await c.rect('#btnForces'); await c.mouse(bf.x+bf.w/2, bf.y+bf.h/2); await sleep(700);
log('forceSub', await c.eval(`document.getElementById('forceSub').innerText`));
await c.shot('09_势力抽屉');
const back = await c.rect('#btnForceBack'); if (back && back.w) { await c.mouse(back.x+back.w/2, back.y+back.h/2); await sleep(500); }
const kn = await c.rect('#kingName'); await c.mouse(kn.x+kn.w/2, kn.y+kn.h/2); await sleep(700);
log('monBody', await c.eval(`document.getElementById('monBody').innerText.replace(/\\s+/g,' ').slice(0,120)`));
await c.shot('09b_君主卡');
const ab = await c.rect('#btnAbdicate'); if (ab && ab.w) { await c.mouse(ab.x+ab.w/2, ab.y+ab.h/2); await sleep(700); log('throneSub', await c.eval(`document.getElementById('throneSub').innerText`)); }
const cx = await c.eval(`(()=>{const b=[...document.querySelectorAll('#throneSheet button,[data-close]')].find(x=>/取\\s*消/.test(x.innerText)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
if (cx) { await c.mouse(cx.x, cx.y); await sleep(500); }
log('scrim', await c.eval(`document.getElementById('scrim').hidden`));
await tally('C 抽屉/君主卡/让位');
await c.close();
