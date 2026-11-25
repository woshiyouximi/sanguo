// 步骤6：招降面板（逐将 + 批量）
import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const dump = () => c.eval(`(()=>{const sh=document.getElementById('surrenderSheet');
  const cards=[...document.querySelectorAll('#surCards .sgen')].map(e=>({name:e.dataset.name, txt:e.innerText.replace(/\\s+/g,' ').slice(0,150), btns:[...e.querySelectorAll('[data-sur]')].map(b=>b.dataset.sur+(b.disabled?'✘':'✔')), picked:(e.querySelector('.picked')||{}).innerText||null}));
  return {open:!sh.hidden, sub:document.getElementById('surSub').innerText, msg:document.getElementById('surMsg').innerText, cards,
    all:[...document.querySelectorAll('#surAllRecruit,#surAllKill,#surAllRelease')].map(b=>b.id+(b.disabled?'✘':'✔')),
    notice:(document.getElementById('notice')||{}).innerText, logTop:[...document.querySelectorAll('#logrows .row')].slice(0,4).map(r=>r.innerText.replace(/\\s+/g,' ')),
    save:(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'null'); return s?{month:s.month,owned:s.owned,gold:s.gold,lastPost:s.lastPost,cap:s.captured,ex:s.executed}:null;})()};})()`);
log('panel', JSON.stringify(await dump()));
await c.shot('06f_招降面板');
async function clickIn(card, act) {
  const r = await c.eval(`(()=>{const e=document.querySelector('#surCards .sgen[data-name="${card}"] [data-sur="${act}"]'); if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2, y:b.y+b.height/2, dis:e.disabled};})()`);
  log('click', card, act, JSON.stringify(r));
  if (!r || r.dis) return false;
  await c.mouse(r.x, r.y); await sleep(700); return true;
}
await clickIn('管亥', 'recruit');
log('after recruit 管亥', JSON.stringify(await dump()));
await c.shot('06g_招降一人');
await clickIn('張勳', 'release');
await sleep(900);
log('after release 張勳', JSON.stringify(await dump()));
await c.shot('06h_招降完成');
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind));
await c.close();
