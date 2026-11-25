// 战斗页状态结构侦察（只读）
import { boot } from './cdp.mjs';
const c = await boot();
const o = await c.eval(`(()=>{
  const s=window.__sanguo&&window.__sanguo.state; if(!s) return {no:'state'};
  const w=s.world;
  const keys=Object.keys(s);
  const wk=w?Object.keys(w):null;
  return {mode:s.mode, msg:s.message, keys, worldKeys:wk,
    skills:s.skills||null, mp:s.mp, qi:s.qi, gen:s.general||null,
    A:w?{gen:w.generals&&w.generals.A, units:w.units&&w.units.A&&w.units.A.length, qi:w.qi, mp:w.mp}:null,
    B:w?{gen:w.generals&&w.generals.B, units:w.units&&w.units.B&&w.units.B.length}:null,
    sample: JSON.stringify(w||{}).slice(0,600)};
})()`);
console.log(JSON.stringify(o, null, 1));
await c.close();
