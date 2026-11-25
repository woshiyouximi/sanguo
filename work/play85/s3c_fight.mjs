import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const shot = async (n) => (await c.shot(n)).path;

const S = `(()=>{const s=window.__sanguo.state; const w=s.world; const A=w.sides.A, B=w.sides.B;
 const g=A.general, gb=B.general;
 const alive=(u)=>u.soldiers?u.soldiers.filter(x=>x.alive!==false).length:null;
 return {mode:s.mode, time:Math.round(s.time*10)/10, msg:s.message,
  sel:s.selectedSkill?(s.selectedSkill.name||s.selectedSkill.seq||String(s.selectedSkill)):null,
  A:{name:g.name,qi:g.qi,mp:g.mp,mpMax:g.mpMax,hp:Math.round(g.hp),maxHp:g.maxHp,alive:g.alive,soldiers:alive(A),start:A.start},
  B:{name:gb.name,qi:gb.qi,mp:gb.mp,hp:Math.round(gb.hp),maxHp:gb.maxHp,alive:gb.alive,soldiers:alive(B),start:B.start},
  over:!!w.over, endReason:w.endReason||null,
  floaters:(s.floaters||[]).map(f=>f.text||f.t||null).slice(-8),
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,score:s.settlement.score,expGain:s.settlement.expGain,meritGain:s.settlement.meritGain,level:s.settlement.level,levelUp:s.settlement.levelUp,post:s.settlement.post,postLines:(s.settlement.post&&s.settlement.post.lines)||null}:null};})()`;
const sample = async () => c.eval(S);
const design = async (x, y, w = 0) => { await c.design(x, y); if (w) await sleep(w); };

const w0 = await c.eval(`(()=>{const s=window.__sanguo.state; return {worldKeys:Object.keys(s.world), sideKeys:Object.keys(s.world.sides.A), genKeys:Object.keys(s.world.sides.A.general), soldier0:s.world.sides.A.soldiers&&s.world.sides.A.soldiers[0]};})()`);
log('shape', w0);
log('ready_t0', await sample());
await sleep(3000);
log('ready_t3', await sample());
const shotReady = await shot('s3b_ready_skills');

// 開戰
await design(375, 683, 500);
log('afterStart', await sample());
const shotFight = await shot('s3c_fight_start');

// 立刻放技1（命療術，直接施放）
await design(160, 1168, 700);
const healTry = await sample();
log('heal_try', healTry);
const shotHeal = await shot('s3d_heal_cast');

// 技2 半月斬 → 瞄準 → 點戰場
const before2 = await sample();
await design(258, 1168, 500);
const sel2 = await sample();
log('strike_selected', sel2);
await design(375, 640, 900);
const after2 = await sample();
log('strike_cast', { before: before2.A, after: after2.A, msg: after2.msg, floaters: after2.floaters, B: after2.B });
const shotStrike = await shot('s3e_strike_cast');

// 技3 落月弓 再放一次（看气力是否够）
const before3 = await sample();
await design(356, 1168, 500);
const sel3 = await sample();
await design(375, 640, 900);
const after3 = await sample();
log('strike3', { before: before3.A, after: after3.A, msg: after3.msg, selMsg: sel3.msg, floaters: after3.floaters, B: after3.B });
const shotStrike3 = await shot('s3f_strike3_cast');

// 等结算
let settled = null;
for (let i = 0; i < 150; i++) { await sleep(400); const t = await sample(); if (t.mode === 'settled') { settled = t; break; } }
log('settled', settled && { mode: settled.mode, msg: settled.msg, settlement: settled.settlement, A: settled.A, B: settled.B, endReason: settled.endReason });
const shotSettle = settled ? await shot('s3g_settle') : null;
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 10)));
await c.save('s3_defend_fight', { healTry, sel2, after2, after3, settled, errs, shots: [shotReady, shotFight, shotHeal, shotStrike, shotStrike3, shotSettle] });
c.close();
