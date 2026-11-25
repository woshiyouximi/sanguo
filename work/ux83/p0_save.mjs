// 只读探针：dump 当前存档（lead 档案）与大地图截图
import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
await c.goto(BASE + 'campaign.html');
await sleep(1600);
const save = await c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); return {month:s.month, scenario:s.scenario, owned:s.owned, monarch:s.monarch, force:s.force, king:s.king, cities:s.cities, forces:s.forces, log:(s.log||[]).slice(-12)};})()`);
console.log(JSON.stringify(save, null, 1));
await c.save('save0', save);
await c.shot('p0_map');
c.close();
