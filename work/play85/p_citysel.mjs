import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.goto(BASE + 'campaign.html'); await sleep(900);
// 切列表 tab
await c.mouse(146, 278); await sleep(600);
log('tabState', await c.eval(`(()=>[...document.querySelectorAll('#tabMap,#tabList')].map(e=>({id:e.id,cls:e.className})))()`));
const rectOfCity = async (name) => c.eval(`(()=>{const list=[...document.querySelectorAll('.city')].filter(x=>x.dataset.name===${JSON.stringify(name)}); return list.map(e=>{const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height,txt:e.innerText.replace(/\\s+/g,' ').trim().slice(0,40)};});})()`);
log('平原Rect', await rectOfCity('平原'));
const rr = await rectOfCity('平原');
if (rr && rr[0]) {
  await c.mouse(rr[0].x + rr[0].w / 2, rr[0].y + rr[0].h / 2); await sleep(700);
  log('acts', await c.eval(`(()=>[...document.querySelectorAll('#actions .btn')].map(b=>({act:b.dataset.act, txt:b.innerText.replace(/\\s+/g,' ').trim()})))()`));
  await c.shot('s4g_plain_selected');
}
c.close();
