import { boot, BASE } from './cdp.mjs';
const c = await boot();
await c.goto(BASE + 'campaign.html');
const t = await c.eval(`(()=>{const a=JSON.parse(sessionStorage.getItem('__dsh_errs85')||'[]'); const byKind={}; for(const e of a) byKind[e.kind]=(byKind[e.kind]||0)+1; const msgs={}; for(const e of a){const m=(e.msg||'').slice(0,60); msgs[m]=(msgs[m]||0)+1;} return {total:a.length,byKind,msgs};})()`);
console.log(JSON.stringify(t));
c.close();
