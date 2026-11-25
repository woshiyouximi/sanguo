// 探测当前页面（不导航）
import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const o = await c.eval(`(()=>{
  const vis = (e)=>{const r=e.getBoundingClientRect(); const s=getComputedStyle(e); return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
  const btns=[...document.querySelectorAll('button,[data-act],[data-do],[role=button]')].filter(vis).map(e=>({tag:e.tagName, id:e.id||'', txt:(e.innerText||'').replace(/\\s+/g,' ').slice(0,40), cls:e.className, act:e.dataset.act||e.dataset.do||''}));
  return { href: location.href, title: document.title, stage: (()=>{const s=document.getElementById('stage'); if(!s) return null; const r=s.getBoundingClientRect(); return [r.x,r.y,r.width,r.height];})(),
    body: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,1200), btns };
})()`);
console.log(JSON.stringify(o, null, 1));
await c.shot('02j_敌军来袭_强插');
await c.close();
