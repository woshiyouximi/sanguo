// 只读：在 lead 档案里列出 localStorage 所有键（不注入任何存档写入）
import { CDP, BASE, sleep } from './cdp.mjs';
const c = await CDP.connect();
await c.attach();
await c.viewport(750, 1334);
await c.goto(BASE + 'face_map.js');
await sleep(500);
const keys = await c.eval(`(()=>{const o=[]; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); const v=localStorage.getItem(k)||''; o.push({k, len:v.length, head:v.slice(0,110)});} return o;})()`);
console.log(JSON.stringify(keys, null, 1));
c.close();
