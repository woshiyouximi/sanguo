import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
// 先記錄抵達確認框文字
const c0 = await c.eval(`(()=>{const s=document.querySelector('#confirmSheet'); const bs=[...s.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(); return {t:b.innerText.replace(/\\s+/g,''),x:r.x+r.width/2|0,y:r.y+r.height/2|0};}); return {text:s.innerText.replace(/\\s+/g,' ').slice(0,300),bs};})()`);
log('confirm', c0);
await c.shot('s16a_arrive_confirm');
const ok = c0.bs.find(b => b.t.includes('確'));
log('clickConfirm', ok);
await c.mouse(ok.x, ok.y); await sleep(2500);
log('href', await c.eval('location.href'));
const D = `(()=>{const q=s=>document.querySelector(s); const g=id=>{const e=q('#'+id); if(!e) return null; const r=e.getBoundingClientRect(); return {t:(e.innerText||'').replace(/\\s+/g,' ').slice(0,200),v:e.value??null,hidden:!!e.hidden,disp:getComputedStyle(e).display,r:[r.x|0,r.y|0,r.width|0,r.height|0]};};
 return {href:location.href, target:g('target'), gar:g('gar'), def:g('def'), intel:g('intel'), numrange:g('numrange'), num:g('num'), gosub:g('gosub'), go:g('go'),
  troops:[...document.querySelectorAll('#troopgrid .it')].map(e=>({t:e.innerText.replace(/\\s+/g,' ').slice(0,30),sel:e.className,off:e.classList.contains('off')})),
  forms:[...document.querySelectorAll('#formgrid .it')].map(e=>({t:e.innerText.replace(/\\s+/g,' ').slice(0,30),sel:e.className,off:e.classList.contains('off')})),
  body:document.body.innerText.replace(/\\s+/g,' ').slice(0,1400)};})()`;
const d = await c.eval(D);
log('deploy', d);
await c.shot('s16b_deploy');
await c.fullShot('s16b_deploy_full');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-4)));
await c.save('s16_deploy', { c0, d, errs });
c.close();
