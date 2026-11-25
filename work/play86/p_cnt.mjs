import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await c.eval(`(()=>{const raw=sessionStorage.getItem('__dsh_errs86')||'[]';let a=[];try{a=JSON.parse(raw);}catch(e){}const by={};a.forEach(x=>{by[x.kind]=(by[x.kind]||0)+1});const errs=a.filter(x=>x.kind==='error'||x.kind==='unhandledrejection');return {n:a.length,by,errs:errs.map(x=>x.msg.slice(0,120))};})()`);
console.log('collector', JSON.stringify(t, null, 1));
await c.goto(BASE + 'campaign.html'); await sleep(2500);
const rows = await c.eval(`(()=>{const b=document.getElementById('logbox');return {logboxText:(b?b.innerText:'').replace(/\\n+/g,' | ').slice(0,300), kids: b?b.querySelectorAll('*').length:0, logRowsKids: (document.getElementById('logrows')||{children:[]}).children.length, cls: Array.from((document.getElementById('logrows')||{children:[]}).children).map(e=>e.className).slice(0,10)};})()`);
console.log('log', JSON.stringify(rows, null, 1));
await c.close();
