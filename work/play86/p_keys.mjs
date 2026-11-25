import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('keys', JSON.stringify(await c.eval(`Object.keys(localStorage).map(k=>k+':'+(localStorage.getItem(k)||'').length)`)));
console.log(JSON.stringify(await c.eval(`(()=>{const out={}; for(const k of Object.keys(localStorage)){ if(!/items|equip|inventory/i.test(k)) continue; out[k]=(localStorage.getItem(k)||'').slice(0,600);} const cm=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); out.__campaign={keys:Object.keys(cm), equip:cm.equip, weapon:cm.weapon, thing:cm.thing&&Object.keys(cm.thing).slice(0,5), foundItems:(cm.foundItems||[]).length}; return out;})()`),null,1));
await c.close();
