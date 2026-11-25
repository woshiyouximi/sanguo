import { boot } from './cdp.mjs';
const c = await boot();
console.log(JSON.stringify(await c.eval(`[...document.querySelectorAll('[data-cmd],[data-do]')].map(e=>({tag:e.tagName,id:e.id,cls:e.className,cmd:e.dataset.cmd||e.dataset.do,dis:e.disabled,txt:e.innerText.replace(/\\s+/g,' ').slice(0,40)}))`), null, 1));
await c.close();
