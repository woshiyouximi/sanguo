import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await c.goto(BASE + 'campaign.html'); await sleep(2500);
const r = await c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1'));return {month:s.month,gold:s.gold,owned:s.owned,armies:(s.armies||[]).map(a=>({id:a.id,side:a.side,from:a.from,to:a.to,progress:a.progress,troops:a.troops})),last:s.last};})()`);
console.log(JSON.stringify(r, null, 1));
await c.close();
