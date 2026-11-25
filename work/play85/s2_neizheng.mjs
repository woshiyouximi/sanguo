import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const cityState = `(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 return {name:t('#cityName'), pop:t('#vPop'), gold:t('#vGold'), troops:t('#vTroops'), prep:t('#vPrep'), def:t('#vDef'),
  major:t('#vMajor'), wise:t('#vWise'), eff:t('#vEff'), gens:t('#vGens'), lock:t('#vLock'), lockCls:(document.getElementById('vLock')||{}).className,
  hint:t('#cmdHint'),
  cmds:[...document.querySelectorAll('#grid .cmd')].map(e=>({cmd:e.dataset.cmd,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60),dis:e.disabled,cls:e.className})),
  log:[...document.querySelectorAll('#log .row')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,160)),
  sheet:document.getElementById('sheet').className, sheetTitle:t('#sheetTitle')};})()`;

// 1) 大地图选 南皮 → 内政
await c.clickSel('#tabList'); await sleep(500);
const cityList = await c.eval(`[...document.querySelectorAll('.city')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60))`);
console.log('cities', JSON.stringify(cityList.slice(0, 8)), 'n=', cityList.length);
await c.eval(`(()=>{const e=document.querySelector('.city[data-name="\\u5357\\u76ae"]'); if(e) e.scrollIntoView({block:'center'}); return !!e;})()`);
await sleep(300);
await c.clickSel('.city[data-name="\u5357\u76ae"]'); await sleep(500);
const mapActs = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,200):null;};
 return {acts:[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim(),dis:e.disabled})), sel:t('#hint'), notice:t('#notice')};})()`);
log('mapActs', mapActs);
const shotSel = await c.shot('s2a_city_selected');

// 进内政页
await c.clickSel('#actions .btn[data-act="city"]'); await c.waitLoad(); await sleep(1200);
log('cityBefore', await c.eval(cityState));
const shotCity = await c.shot('s2b_city_page');

// 2) 開發
await c.clickSel('#grid .cmd[data-cmd="\u958b\u767c"]'); await sleep(1200);
const dev = await c.eval(cityState);
log('afterDevelop', { gold: dev.gold, pop: dev.pop, def: dev.def, lock: dev.lock, log: dev.log.slice(0, 3), dis: dev.cmds.filter((x) => x.dis).length });
const shotDev = await c.shot('s2c_develop_done');

// 3) 徵兵（本月已用 → 应被拒/置灰）
const recBtn = dev.cmds.find((x) => x.cmd.includes('徵兵'));
log('recruitBtnState', recBtn);
await c.clickSel('#grid .cmd[data-cmd="\u5fb5\u5175"]'); await sleep(900);
const afterRecTry = await c.eval(cityState);
log('afterRecruitLockedTry', { lock: afterRecTry.lock, logTop: afterRecTry.log.slice(0, 2), sheet: afterRecTry.sheet });
const shotLocked = await c.shot('s2d_month_locked');

// 4) 回大地图 → 推进一月 → 再进内政 → 徵兵
await c.clickSel('#btnBack'); await c.waitLoad(); await sleep(1200);
log('backOnMap', await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,200):null;}; return {ym:t('#ym'),gold:t('#gold'),notice:t('#notice'),noticeHidden:document.getElementById('notice').hidden};})()`));
await c.clickSel('#actions .btn[data-act="advance"]'); await sleep(1200);
log('afterAdvance', await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null;}; return {ym:t('#ym'),gold:t('#gold'),notice:t('#notice'),noticeHidden:document.getElementById('notice').hidden,log:t('#logrows')};})()`));
const shotAdv = await c.shot('s2e_after_advance');

await c.eval(`(()=>{const e=document.querySelector('.city[data-name="\\u5357\\u76ae"]'); if(e) e.scrollIntoView({block:'center'}); return !!e;})()`);
await sleep(300);
await c.clickSel('.city[data-name="\u5357\u76ae"]'); await sleep(400);
await c.clickSel('#actions .btn[data-act="city"]'); await c.waitLoad(); await sleep(1200);
log('cityM3', await c.eval(cityState));
await c.clickSel('#grid .cmd[data-cmd="\u5fb5\u5175"]'); await sleep(1000);
const recSheet = await c.eval(cityState);
log('recruitSheet', { sheet: recSheet.sheet, title: recSheet.sheetTitle, log: recSheet.log.slice(0, 2) });
const shotRecSheet = await c.shot('s2f_recruit_sheet');
const sheetBody = await c.eval(`(()=>{const b=document.getElementById('sheetBody'); return {txt:(b.innerText||'').replace(/\\s+/g,' ').trim().slice(0,500), nums:[...b.querySelectorAll('input[type=range],input[type=number]')].map(i=>({type:i.type,val:i.value,min:i.min,max:i.max,cls:i.className}))};})()`);
log('recruitSheetBody', sheetBody);
await c.clickSel('#sheetOk'); await sleep(1200);
const rec = await c.eval(cityState);
log('afterRecruit', { troops: rec.troops, prep: rec.prep, gold: rec.gold, lock: rec.lock, log: rec.log.slice(0, 3) });
const shotRec = await c.shot('s2g_recruit_done');

const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s2_neizheng', { mapActs, dev, afterRecTry, recSheetBody, rec, errs, shots: [shotSel, shotCity, shotDev, shotLocked, shotAdv, shotRecSheet, shotRec] });
c.close();
