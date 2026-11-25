// 步骤4：出征编成（deploy.html）——兵种/阵形/军师技/滑杆/快捷档/敌军上阵 vs 城内守军
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const href = () => c.eval('location.href');
if (!(await href()).includes('campaign.html')) { await c.goto(BASE + 'campaign.html'); await sleep(1800); }
// 列表页选敌方邻城 界橋
const t = await c.rect('#tabList'); if (t && t.w) { await c.mouse(t.x + t.w / 2, t.y + t.h / 2); await sleep(700); }
const row = await c.eval(`(()=>{const e=[...document.querySelectorAll('#list .city')].find(x=>x.dataset.name==='界橋'); if(!e) return null; e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,vis:b.height>0};})()`);
await sleep(500);
log('row 界橋', JSON.stringify(row));
await c.mouse(row.x, row.y); await sleep(600);
log('hint', await c.eval(`(document.getElementById('hint')||{}).innerText`));
log('acts', JSON.stringify(await c.eval(`[...document.querySelectorAll('#actions [data-act]')].map(e=>e.dataset.act+'|'+e.innerText.replace(/\\s+/g,' '))`)));
await c.shot('04a_大地图选敌城');
const m = await c.rect('#actions [data-act="march"]');
await c.mouse(m.x + m.w / 2, m.y + m.h / 2); await sleep(2500);
log('href', await href());
const dump = () => c.eval(`(()=>({
  sub:document.querySelector('#stage .sub').innerText.replace(/\\s+/g,' '),
  gen:{name:document.getElementById('gname').innerText, str:document.getElementById('gstr').innerText, int:document.getElementById('gint').innerText, cap:document.getElementById('gcap').innerText, skill:document.getElementById('gskill').innerText, tire:document.getElementById('gtire').innerText, morale:document.getElementById('gmorale').innerText},
  troops:[...document.querySelectorAll('#troopgrid .it')].map(e=>({n:e.innerText.trim(),on:e.classList.contains('on'),dim:e.classList.contains('dim')})).slice(0,14),
  forms:[...document.querySelectorAll('#formgrid .it')].map(e=>({n:e.innerText.trim(),on:e.classList.contains('on'),dim:e.classList.contains('dim')})).slice(0,10),
  wise:[...document.querySelectorAll('#wisepick .it')].map(e=>({n:e.innerText.replace(/\\s+/g,' ').slice(0,26),on:e.classList.contains('on'),dim:e.classList.contains('dim')})),
  wiselv:document.getElementById('wiselv').innerText, wisehint:document.getElementById('wisehint').innerText,
  num:{min:document.getElementById('numrange').min, max:document.getElementById('numrange').max, val:document.getElementById('numrange').value, now:document.getElementById('numnow').innerText, cap:document.getElementById('numcap').innerText},
  quick:[...document.querySelectorAll('#numgrid .it')].map(e=>({n:e.dataset.num,on:e.classList.contains('on'),txt:e.innerText.replace(/\\s+/g,' ')})),
  intel:document.getElementById('intel').innerText.replace(/\\s+/g,' '), vs:document.getElementById('vs').innerText.replace(/\\s+/g,' '), go:document.getElementById('go').innerText.replace(/\\s+/g,' ')
}))()`);
log('deploy', JSON.stringify(await dump(), null, 0));
await c.shot('04_出征编成');
// 快捷档：点第一档（半编）
const q = await c.eval(`(()=>{const e=[...document.querySelectorAll('#numgrid .it')][0]; if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,n:e.dataset.num};})()`);
log('quick0', JSON.stringify(q));
if (q) { await c.mouse(q.x, q.y); await sleep(500); }
log('after quick0', JSON.stringify(await c.eval(`({now:document.getElementById('numnow').innerText, val:document.getElementById('numrange').value, go:document.getElementById('gosub').innerText})`)));
await c.shot('04b_快捷档半编');
// 兵种/阵形换一个
const other = await c.eval(`(()=>{const e=[...document.querySelectorAll('#troopgrid .it')].find(x=>!x.classList.contains('on')); if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,n:e.innerText.trim()};})()`);
log('troop other', JSON.stringify(other));
if (other) { await c.mouse(other.x, other.y); await sleep(600); }
log('after troop', JSON.stringify(await c.eval(`({go:document.getElementById('gosub').innerText, vs:document.getElementById('vs').innerText.replace(/\\s+/g,' '), toast:(document.getElementById('toast')||{}).innerText})`)));
await c.shot('04c_换兵种');
// 滑杆拖到 100%
const rr = await c.rect('#numrange');
await c.mouse(rr.x + rr.w * 0.02, rr.y + rr.h / 2);
await c.mouse(rr.x + rr.w * 0.99, rr.y + rr.h / 2);
await sleep(500);
log('after drag', JSON.stringify(await c.eval(`({now:document.getElementById('numnow').innerText, val:document.getElementById('numrange').value})`)));
await c.shot('04d_滑杆满编');
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind));
await c.close();
