// 1) 从 lead 档案的槽位库里取出 last 槽的完整快照 → state/save_full.json
// 2) 顺手把 sanguo_campaign_v1（工作副本）按该快照写回（修复：之前的探针把缩进格式的部分存档写进去了）
import fs from 'node:fs';
import { CDP, BASE, sleep } from './cdp.mjs';

const c = await CDP.connect();
await c.attach();
await c.viewport(750, 1334);
await c.goto(BASE + 'face_map.js');
await sleep(500);
const snap = await c.eval(`(()=>{const j=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}'); const s=(j.slots||[]).find(x=>x.id===j.last)||(j.slots||[])[0];
 return {last:j.last, id:s.id, time:s.time, ts:s.ts, scenario:s.scenario, snapshot:s.snapshot};})()`);
if (!snap || !snap.snapshot) { console.log('NO SNAPSHOT', JSON.stringify(snap).slice(0, 300)); process.exit(1); }
const summary = { last: snap.last, id: snap.id, time: snap.time, month: snap.snapshot.month, scenario: snap.snapshot.scenario,
  owned: snap.snapshot.owned, armies: (snap.snapshot.armies || []).length, keys: Object.keys(snap.snapshot) };
console.log(JSON.stringify(summary, null, 1));
fs.writeFileSync('F:\\sanguo\\work\\ux83\\state\\save_full.json', JSON.stringify(snap.snapshot), 'utf8');
const wrote = await c.eval(`(()=>{const raw=${JSON.stringify(JSON.stringify(snap.snapshot))}; localStorage.setItem('sanguo_campaign_v1', raw); return (localStorage.getItem('sanguo_campaign_v1')||'').length;})()`);
console.log('repaired sanguo_campaign_v1 len =', wrote);
c.close();
