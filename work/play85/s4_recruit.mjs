import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();

const DUMP = `(() => {
  const vis = (e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return false;
    const s = getComputedStyle(e);
    return !(s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0);
  };
  const list = Array.from(document.querySelectorAll('button,input,select,[data-cmd],[data-troop],[data-form],[data-do]'));
  return list.filter(vis).map((e) => {
    const b = e.getBoundingClientRect();
    return {
      tag: e.tagName.toLowerCase(), id: e.id || null, type: e.type || null,
      val: e.value !== undefined ? String(e.value) : null, min: e.min, max: e.max,
      dis: e.disabled === true, txt: (e.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      act: e.dataset ? (e.dataset.cmd || e.dataset.troop || e.dataset.form || e.dataset.do || null) : null,
      r: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)],
    };
  });
})()`;

const dump = async (tag) => {
  const out = await c.eval(DUMP);
  console.log('=== ' + tag);
  if (!Array.isArray(out)) { console.log('DUMP_ERR', JSON.stringify(out).slice(0, 400)); return []; }
  for (const it of out) console.log(`${it.tag}#${it.id || ''}[${it.act || ''}]${it.dis ? ' DIS' : ''} val=${it.val} min=${it.min} max=${it.max} "${it.txt}" @${it.r.join(',')}`);
  return out;
};
const clickId = async (id) => { const r = await c.rect('#' + id); if (!r) return { ok: false }; await c.mouse(r.x + r.w / 2, r.y + r.h / 2); await sleep(500); return { ok: true, r }; };

await c.goto(BASE + 'city.html?city=%E5%8D%97%E7%9A%AE');
await sleep(700);
console.log('## before', JSON.stringify(await c.eval(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};return {gold:t('#vGold'),pop:t('#vPop'),def:t('#vDef'),lock:t('#vLock')};})()`)));
await clickId('徵兵');
const sheet = await dump('after click 徵兵');
await c.shot('s4a_recruit_sheet');
const sl = await c.eval(`(()=>{const e=document.querySelector('#numrange')||document.querySelector('input[type=range]'); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,min:e.min,max:e.max,val:e.value,id:e.id};})()`);
console.log('## slider', JSON.stringify(sl));
if (sl) {
  const y = sl.y + sl.h / 2;
  await c.mouse(sl.x + sl.w * 0.15, y, 'move');
  await c.mouse(sl.x + sl.w * 0.15, y, 'down');
  await sleep(60);
  for (const f of [0.3, 0.45, 0.6, 0.75]) { await c.mouse(sl.x + sl.w * f, y, 'move'); await sleep(80); }
  await c.mouse(sl.x + sl.w * 0.75, y, 'up');
  await sleep(300);
  console.log('## slider_after', JSON.stringify(await c.eval(`(()=>{const e=document.querySelector('#numrange')||document.querySelector('input[type=range]'); return e?e.value:null;})()`)));
}
await c.shot('s4b_recruit_dragged');
const after = await dump('after drag');
c.close();
