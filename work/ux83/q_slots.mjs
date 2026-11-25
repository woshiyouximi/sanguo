// 只读：检查 sanguo_saves_v1 槽位结构，找 last 槽的 snapshot 顶层键
import { CDP, BASE, sleep } from './cdp.mjs';
const c = await CDP.connect();
await c.attach();
await c.viewport(750, 1334);
await c.goto(BASE + 'face_map.js');
await sleep(500);
const info = await c.eval(`(()=>{const raw=localStorage.getItem('sanguo_saves_v1')||'{}'; const j=JSON.parse(raw);
 const out={v:j.v, last:j.last, slots:(j.slots||[]).map(s=>({id:s.id,name:s.name,slotName:s.slotName,time:s.time,ts:s.ts,scenario:s.scenario, keys:s.snapshot?Object.keys(s.snapshot):null, month:s.snapshot&&s.snapshot.month, owned:s.snapshot&&s.snapshot.owned}))};
 return out;})()`);
console.log(JSON.stringify(info, null, 1));
c.close();
