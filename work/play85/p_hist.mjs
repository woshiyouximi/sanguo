import { boot, sleep } from './cdp.mjs';
const c = await boot();
const nav = await c.send('Page.getNavigationHistory', {}, c.sid);
console.log('currentIndex', nav.currentIndex);
console.log(JSON.stringify((nav.entries || []).map((e) => e.url), null, 1));
c.close();
