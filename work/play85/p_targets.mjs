import { boot, sleep } from './cdp.mjs';
const c = await boot();
const t = await c.send('Target.getTargets');
console.log(JSON.stringify((t.targetInfos || []).map((x) => ({ type: x.type, url: x.url, id: x.targetId, title: x.title })), null, 1));
c.close();
