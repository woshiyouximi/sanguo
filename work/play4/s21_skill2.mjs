import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = { battles: [] };
const S = async () => c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s) return null;
 return {mode:s.mode,tick:s.time,msg:s.message,sel:s.selectedSkill?String(s.selectedSkill.name||s.selectedSkill):null,
  settlement:s.settlement?{winner:s.settlement.winner,mode:s.settlement.modeName,kills:s.settlement.kills,post:s.settlement.post}:null};})()`);
const fp = async (tag) => c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;}; return {tag:${JSON.stringify(tag)},ym:g('ym'),gold:g('gold'),ct:g('ct'),rec:g('rec'),notice:g('notice'),log:g('logrows')};})()`);

await c.goto(BASE + 'campaign.html'); await c.waitLoad(); await sleep(1600);
out.start = await fp('start');
// load slot 2 (month 7, richer state)
await c.clickSel('#btnSave'); await sleep(700);
await c.eval(`(()=>{const b=document.querySelector('#slotRows [data-slot="1"][data-do="load"]'); if(b) b.click(); return !!b;})()`);
await sleep(1400);
await c.eval(`(()=>{const s=document.getElementById('saveSheet'); if(s) s.hidden=true; return 1;})()`);
await sleep(500);
out.loaded = await fp('loaded_slot2');

for (let m = 0; m < 2; m++) {
  out['pre' + m] = await fp('pre' + m);
  await c.clickSel('#actions .btn[data-act="advance"]');
  await sleep(2600); await c.waitLoad();
  for (let round = 0; round < 3; round++) {
    const u = await c.eval('location.href');
    if (!/index\.html/.test(u)) break;
    await c.viewport(782, 1500); await sleep(700);
    const R = await c.rect('#stage');
    const px = (x) => R.x + x * (R.w / 750), py = (y) => R.y + y * (R.h / 1334);
    const design = async (x, y) => { await c.mouse(Math.round(px(x)), Math.round(py(y))); await sleep(150); };
    let s = await S();
    const b = { url: u, mode0: s && s.mode, tries: [] };
    if (s && s.mode === 'ready') { await design(375, 683); await sleep(900); }
    await sleep(2500);
    // slot 1
    await design(160, 1166); await sleep(600);
    b.tries.push({ slot: 1, at: 't2.5s', s: await S() });
    // slot 2
    await design(260, 1166); await sleep(600);
    let t2 = await S(); b.tries.push({ slot: 2, s: t2 });
    if (t2 && t2.sel) {
      await design(375, 640); await sleep(900);
      b.cast = await S();
      b.shotCast = await c.shot('s21_cast');
    }
    b.shotFight = await c.shot('s21_fight');
    let settled = null;
    for (let i = 0; i < 110; i++) { await sleep(400); const t = await S(); if (t && t.mode === 'settled') { settled = t; break; } if (!t) break; }
    b.settled = settled;
    if (settled) b.shotSettle = await c.shot('s21_settle');
    out.battles.push(b);
    console.log('battle', JSON.stringify({ mode0: b.mode0, t1: b.tries[0].s && b.tries[0].s.msg, t2: b.tries[1].s && b.tries[1].s.msg, sel: b.tries[1].s && b.tries[1].s.sel, cast: b.cast && b.cast.msg, settle: settled && settled.msg }));
    if (!settled) break;
    await design(375, 300); await sleep(400); await c.waitLoad(); await sleep(1500);
  }
  await c.viewport(750, 1334); await sleep(400);
  out['post' + m] = await fp('post' + m);
  out['shot' + m] = await c.shot('s21_after_' + m);
}
out.errs = await c.errs(c.startErr);
await c.save('s21_skill2', out);
console.log(JSON.stringify({ start: out.start, loaded: out.loaded, pre0: out.pre0, post0: out.post0, pre1: out.pre1, post1: out.post1, errs: out.errs }, null, 1));
c.close();
