import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const keys = await c.eval(`(()=>{const s=window.__sanguo.state; return {stateKeys:Object.keys(s), unitsKeys:s.units?Object.keys(s.units):null, sideKeys:s.units&&s.units.A?Object.keys(s.units.A):null, generalKeys:s.units&&s.units.A&&s.units.A.general?Object.keys(s.units.A.general):null};})()`);
log('keys', keys);
const g = await c.eval(`(()=>{const s=window.__sanguo.state; const A=s.units.A, B=s.units.B;
 const pick=(u)=>({general:u.general&&{name:u.general.name,hp:u.general.hp,maxHp:u.general.maxHp,mp:u.general.mp,maxMp:u.general.maxMp,qi:u.general.qi,alive:u.general.alive,atk:u.general.atk,def:u.general.def},
   soldiers:u.soldiers===undefined?null:u.soldiers, troops:u.troops, n:Array.isArray(u.soldiers)?u.soldiers.length:undefined});
 return {A:pick(A),B:pick(B)};})()`);
console.log(JSON.stringify(g, null, 1).slice(0, 3000));
log('time', await c.eval(`window.__sanguo.state.time`));
c.close();
