// 诊断当前 campaign 页为何空
import { boot } from './cdp.mjs';
const c = await boot();
const o = await c.eval(`(()=>({href:location.href, title:document.title, ready:document.readyState,
  htmlLen:document.documentElement.outerHTML.length,
  bodyTxt:(document.body?document.body.innerText:'').slice(0,300),
  ids:['stage','gold','ct','rec','kingName','ym','slotBadge','notice','logrows','map','actions'].map(i=>[i,!!document.getElementById(i)]),
  scripts:[...document.scripts].map(s=>s.src||('inline:'+s.textContent.length))}))()`);
console.log(JSON.stringify(o, null, 1));
await c.shot('02q_现状');
await c.close();
