// 推进一月 → 回内政页测 移動/任命/自治 面板
import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
async function clickSel(sel, wait = 700) {
  const r = await c.rect(sel);
  if (!r || !r.w) { log('no rect', sel); return false; }
  await c.mouse(r.x + r.w / 2, r.y + r.h / 2); await sleep(wait); return true;
}
// 从内政页返回大地图
if ((await c.eval('location.href')).includes('city.html')) {
  await clickSel('#btnBack', 1500);
} else {
  await c.goto(BASE + 'campaign.html'); await sleep(1800);
}
log('href', await c.eval('location.href'));
// 选平原（canvas）
const mr = await c.rect('#map');
await c.mouse(mr.x + 442 * (mr.w / 750), mr.y + 223 * (mr.h / 695)); await sleep(600);
log('hint', await c.eval(`(document.getElementById('hint')||{}).innerText`));
log('acts', JSON.stringify(await c.eval(`[...document.querySelectorAll('#actions [data-act]')].map(e=>e.dataset.act+'|'+(e.disabled?'✘':'✔')+'|'+e.innerText.replace(/\\s+/g,' '))`)));
await clickSel('#actions [data-act="advance"]', 2500);
log('after advance href', await c.eval('location.href'));
const st = () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; return s?{mode:s.mode, msg:s.message}:null;})()`);
if ((await c.eval('location.href')).includes('index.html')) {
  let s = await st(); log('battle', JSON.stringify(s));
  const r = await c.rect('#stage');
  const des = async (x, y, w = 900) => { await c.mouse(r.x + x * (r.w / 750), r.y + y * (r.h / 1334)); await sleep(w); };
  if (s && s.mode === 'ready') await des(375, 684, 1500);
  s = await st(); log('after start', JSON.stringify(s));
  if (s && s.mode === 'fighting') await des(630, 1262, 900);
  for (let i = 0; i < 40; i++) { const x = await st(); if (x && x.mode === 'settled') { log('settled', JSON.stringify(x)); break; } await sleep(500); }
  await c.shot('02s_推进一月被迫一战');
  await c.mouse(r.x + 120, r.y + 120); await sleep(2800);
  const sur = await c.eval(`!document.getElementById('surrenderSheet').hidden`);
  log('surrendersheet open?', sur);
  if (sur) {
    const b = await c.eval(`(()=>{const e=document.getElementById('surAllRelease'); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,dis:e.disabled};})()`);
    log('bulk release', JSON.stringify(b));
    if (!b.dis) { await c.mouse(b.x, b.y); await sleep(1200); }
    log('after bulk', await c.eval(`(document.getElementById('notice')||{}).innerText`));
    await c.shot('06i_批量释放');
  }
  log('href now', await c.eval('location.href'));
} else if ((await c.eval('location.href')).includes('campaign.html')) {
  log('no battle; notice', await c.eval(`(document.getElementById('notice')||{}).innerText`));
  log('ym', await c.eval(`document.getElementById('ym').innerText`));
  log('log', await c.eval(`document.getElementById('logrows').innerText.replace(/\\s+/g,' | ').slice(0,300)`));
  await c.shot('02s_推进一月_无战事');
}
await c.close();
