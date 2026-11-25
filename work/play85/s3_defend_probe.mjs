import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
log('href', await c.eval('location.href'));
const st = await c.eval(`(()=>{const S=window.__sanguo; if(!S||!S.state) return {noState:true};
 const s=S.state; return {mode:s.mode, time:s.time, msg:s.message, sel:s.selectedSkill,
  skills:(s.skills||[]).map(k=>({name:k.name,kind:k.kind,qi:k.qi,mp:k.mp,cd:k.cd,ok:k.ok})),
  A:s.units&&s.units.A?s.units.A.general:null, B:s.units&&s.units.B?s.units.B.general:null,
  settlement:s.settlement};})()`);
console.log(JSON.stringify(st, null, 1).slice(0, 4000));
const shot = await c.shot('s3a_defend_ready');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s3_defend_ready', { href: await c.eval('location.href'), st, errs, shot });
c.close();
