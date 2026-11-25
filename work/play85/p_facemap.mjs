import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
log('info', await c.eval(`(()=>({href:location.href, ref:document.referrer, ct:document.contentType, ready:document.readyState, title:document.title, bodyHead:(document.body?document.body.innerText:'').slice(0,200)}))()`));
log('nav', await c.eval(`(()=>{const e=performance.getEntriesByType('navigation')[0]||{}; return {type:e.type, name:e.name};})()`));
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 12)));
c.close();
