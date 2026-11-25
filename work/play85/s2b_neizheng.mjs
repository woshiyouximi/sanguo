import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const cityState = `(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 return {name:t('#cityName'), pop:t('#vPop'), gold:t('#vGold'), troops:t('#vTroops'), prep:t('#vPrep'), def:t('#vDef'),
  major:t('#vMajor'), gens:t('#vGens'), lock:t('#vLock'),
  cmds:[...document.querySelectorAll('#grid .cmd')].map(e=>({cmd:e.dataset.cmd,dis:e.disabled})),
  log:[...document.querySelectorAll('#log .row')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,180)),
  sheetHidden:(document.getElementById('sheet')||{}).hidden, sheetCls:(document.getElementById('sheet')||{}).className, sheetTitle:t('#sheetTitle')};})()`;
const openCity = async (name) => {
  await c.clickSel('#tabList'); await sleep(500);
  await c.eval(`(()=>{const e=document.querySelector('.city[data-name="${name}"]'); if(e) e.scrollIntoView({block:'center'}); return !!e;})()`);
  await sleep(250);
  const r = await c.clickSel(`.city[data-name="${name}"]`); await sleep(400);
  const a = await c.clickSel('#actions .btn[data-act="city"]'); await c.waitLoad(); await sleep(1200);
  return { clickCity: r.ok, clickCityAct: a.ok, href: await c.eval('location.href') };
};

log('openCity', await openCity('\u5357\u76ae'));
log('cityM3', await c.eval(cityState));
const shot0 = await c.shot('s2h_city_m3');

await c.clickSel('#grid .cmd[data-cmd="\u5fb5\u5175"]'); await sleep(900);
const sheet1 = await c.eval(`(()=>{const b=document.getElementById('sheetBody');
 return {hidden:document.getElementById('sheet').hidden, cls:document.getElementById('sheet').className, title:(document.getElementById('sheetTitle')||{}).innerText,
  txt:(b.innerText||'').replace(/\\s+/g,' ').trim().slice(0,600),
  fields:[...b.querySelectorAll('input')].map(i=>({type:i.type,val:i.value,min:i.min,max:i.max,name:i.name,cls:i.className})),
  okTxt:(document.getElementById('sheetOk')||{}).innerText};})()`);
log('recruitSheet', sheet1);
const shotSheet = await c.shot('s2i_recruit_sheet');
await c.clickSel('#sheetOk'); await sleep(1300);
const afterRec = await c.eval(cityState);
log('afterRecruit', { troops: afterRec.troops, prep: afterRec.prep, lock: afterRec.lock, log: afterRec.log.slice(0, 3), sheetHidden: afterRec.sheetHidden });
const shotRec = await c.shot('s2j_recruit_done');

// 回图 → 推进一月 → 搜索
await c.clickSel('#btnBack'); await c.waitLoad(); await sleep(1200);
await c.clickSel('#actions .btn[data-act="advance"]'); await sleep(1300);
log('mapM4', await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120):null;}; return {ym:t('#ym'),gold:t('#gold'),noticeHidden:document.getElementById('notice').hidden,notice:t('#notice')};})()`));
const shotMap = await c.shot('s2k_map_m4');
log('openCity2', await openCity('\u5357\u76ae'));
log('cityM4', await c.eval(cityState));
await c.clickSel('#grid .cmd[data-cmd="\u641c\u7d22"]'); await sleep(1400);
const search = await c.eval(cityState);
log('afterSearch', { gold: search.gold, lock: search.lock, log: search.log.slice(0, 3) });
const shotSearch = await c.shot('s2l_search_done');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s2b_neizheng', { sheet1, afterRec, search, errs, shots: [shot0, shotSheet, shotRec, shotMap, shotSearch] });
c.close();
