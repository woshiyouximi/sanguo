import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(JSON.stringify(await c.eval(`(async()=>{const m=await import('./saves.js'); const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); const sn=st.slots[0].snapshot; const up=m.upgradeSnapshot(sn); return {from:up.from,to:up.to,changed:up.changed,steps:up.steps,filled:up.filled.slice(0,12),vAfter:up.snapshot&&up.snapshot.v, req:'x'};})()`),null,1));
console.log('loadStore', JSON.stringify(await c.eval(`(async()=>{const m=await import('./saves.js'); const st=m.loadStore(localStorage); const sn=st.slots[0]&&st.slots[0].snapshot; return {last:st.last, v:sn&&sn.v, month:sn&&sn.month, keys:sn?Object.keys(sn).length:0, hasYear:sn?('year' in sn):null};})()`)));
await c.close();
