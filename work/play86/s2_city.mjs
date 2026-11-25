// 步骤 2：内政 9 键（真点击；前进靠「推進一月」而不是 URL）
import { boot, BASE } from './cdp.mjs';

const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CV = { '南皮': [489, 185], '平原': [442, 223], '陳留': [480, 280], '許昌': [435, 311], '汝南': [454, 378], '宛': [377, 333] };
const log = (...a) => console.log('##', ...a);

async function url() { return c.eval('location.href'); }
async function txt(sel) { return c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return e? (e.innerText||'').replace(/\\s+/g,' ').trim() : null;})()`); }
async function nErr() { return c.errCount(); }
async function shot(n) { const r = await c.shot(n); log('shot', n, r.w + 'x' + r.h); }
async function clickSel(sel, dy = 0) {
  const r = await c.rect(sel);
  if (!r) { log('MISS', sel); return false; }
  await c.mouse(r.x + r.w / 2, r.y + r.h / 2 + dy);
  await sleep(450);
  return true;
}
async function dumpLS(name) {
  const o = await c.eval(`(()=>{const o={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(/sanguo|save/i.test(k)) o[k]=localStorage.getItem(k);} return o;})()`);
  return c.save(name, o);
}
async function cityMapClick(name) {
  const r = await c.rect('#map');
  if (!r) { log('MISS #map'); return false; }
  const [cx, cy] = CV[name];
  const x = r.x + cx * (r.w / 750);
  const y = r.y + cy * (r.h / 695);
  await c.mouse(x, y);
  await sleep(500);
  return true;
}
async function dumpCity(tag) {
  const o = await c.eval(`(()=>{
    const g = [...document.querySelectorAll('#grid .cmd')].map((b)=>({cmd:b.dataset.cmd, dis:b.disabled, sub:(b.querySelector('small')||{}).innerText||'', note:!!b.querySelector('.note')}));
    const t = (id)=>{const e=document.getElementById(id); return e? (e.innerText||'').trim() : null;};
    return { href: location.search, hud:{pop:t('vPop'),gold:t('vGold'),troops:t('vTroops'),prep:t('vPrep'),def:t('vDef'),major:t('vMajor'),wise:t('vWise'),eff:t('vEff'),gens:t('vGens'),tire:t('vTire'),morale:t('vMorale'),lock:t('vLock')},
      hint: t('cmdHint'), grid: g, log: (document.getElementById('log')||{}).innerText||'', sheetOn: !!document.querySelector('#sheet.on'), sheetTitle: t('sheetTitle'), sheetBody: (document.getElementById('sheetBody')||{}).innerText||'' };
  })()`);
  log(tag, JSON.stringify(o));
  return o;
}

await c.goto(BASE + 'campaign.html');
await sleep(900);
log('start url', await url(), 'errs', await nErr());
await dumpLS('02_before');

// --- 点自己的城（地图 canvas 真点） ---
log('clickCity 平原', await cityMapClick('平原'));
log('hint', await txt('#hint'));
log('actions', await c.eval(`[...document.querySelectorAll('#actions [data-act]')].map(e=>e.dataset.act+':'+e.innerText.replace(/\\s+/g,' '))`));
await shot('02_选中平原');

// --- 进内政 ---
await clickSel('#actions [data-act="city"]', 0);
await c.waitLoad();
await sleep(700);
log('city url', await url());
const m1 = await dumpCity('M1-initial');
await shot('02b_内政页');

// --- 開發 ---
await clickSel('#grid .cmd[data-cmd="開發"]');
await sleep(500);
const m2 = await dumpCity('M1-after-开发');
await shot('02c_开发后月令锁');
// 已锁：再点别的键（应无反应）
const beforeLog = m2.log;
await clickSel('#grid .cmd[data-cmd="徵兵"]');
await sleep(400);
const m3 = await dumpCity('M1-点锁住的徵兵');
log('lock-click log unchanged?', m3.log === beforeLog);

// --- 推进一月（真点按钮） ---
await clickSel('#btnBack');
await c.waitLoad(); await sleep(700);
log('back url', await url());
await clickSel('#actions [data-act="advance"]');
await sleep(1500);
log('after advance url', await url(), 'errs', await nErr());
await shot('02d_推进一月后大地图');
log('notice', await txt('#notice'));

// --- 再进城：徵兵 ---
await cityMapClick('平原');
await clickSel('#actions [data-act="city"]');
await c.waitLoad(); await sleep(700);
await clickSel('#grid .cmd[data-cmd="徵兵"]');
await sleep(400);
const rc = await c.eval(`(()=>{const o={}; for(const id of ['rcInf','rcCav','rcPrep','rcTroops','rcInfR','rcInfN','rcCavR','rcCavN']){const e=document.getElementById(id); o[id]= e? {v:e.value, max:e.max, dis:e.disabled} : null;} return o;})()`);
log('recruit panel', JSON.stringify(rc));
await shot('02e_徵兵面板');
// 滑杆：真拖到 50%（如果 max>0）
const infMax = Number(rc.rcInfR?.max || 0);
if (infMax > 0) {
  const r = await c.rect('#rcInfR');
  const y = r.y + r.h / 2;
  await c.mouse(r.x + 4, y, 'down');
  await c.mouse(r.x + r.w * 0.5, y, 'move');
  await c.mouse(r.x + r.w * 0.5, y, 'up');
  await sleep(300);
  log('after drag', await c.eval(`document.getElementById('rcInfN').value`));
} else { log('徵兵滑杆 max=0（预备兵可能为 0）'); }
await clickSel('#sheetOk');
await sleep(600);
const rc2 = await dumpCity('after-recruit-ok');
await shot('02f_徵兵结果');

// --- 移動 / 任命 / 自治 / 情報（每项打开看内容，然后取消或确定） ---
for (const [cmd, doOk] of [['移動', false], ['任命', false], ['自治', false]]) {
  const ok = await clickSel(`#grid .cmd[data-cmd="${cmd}"]`);
  await sleep(450);
  const d = await c.eval(`(()=>({on:!!document.querySelector('#sheet.on'), t:(document.getElementById('sheetTitle')||{}).innerText, b:(document.getElementById('sheetBody')||{}).innerText.replace(/\\s+/g,' ').slice(0,700)}))()`);
  log(cmd, ok, JSON.stringify(d));
  await shot(`02g_${cmd}`);
  await clickSel('#sheetCancel');
  await sleep(250);
}

// 情報（点了就吃月令）——如果当前月份还被徵兵占着就跳过，稍后换月
let lockNow = await c.eval(`(()=>{const e=document.getElementById('vLock'); return e?e.innerText.trim():null;})()`);
log('lock before intel', lockNow);
if (lockNow === '已用') {
  await clickSel('#btnBack'); await c.waitLoad(); await sleep(600);
  await clickSel('#actions [data-act="advance"]'); await sleep(1400);
  await cityMapClick('平原'); await clickSel('#actions [data-act="city"]'); await c.waitLoad(); await sleep(600);
}
await clickSel('#grid .cmd[data-cmd="情報"]');
await sleep(500);
const intel = await c.eval(`(()=>({on:!!document.querySelector('#sheet.on'), t:(document.getElementById('sheetTitle')||{}).innerText, b:(document.getElementById('sheetBody')||{}).innerText.replace(/\\s+/g,' ').slice(0,900)}))()`);
log('情報', JSON.stringify(intel));
await shot('02h_情報');
await clickSel('#sheetCancel');
await sleep(300);
log('after intel', JSON.stringify(await c.eval(`(()=>({lock:(document.getElementById('vLock')||{}).innerText, log:(document.getElementById('log')||{}).innerText}))()`)));

// --- 搜索（换月后真点） ---
await clickSel('#btnBack'); await c.waitLoad(); await sleep(600);
await clickSel('#actions [data-act="advance"]'); await sleep(1400);
log('advance2 url', await url());
await cityMapClick('平原'); await clickSel('#actions [data-act="city"]'); await c.waitLoad(); await sleep(600);
const preSearch = await c.eval(`(()=>({gold:(document.getElementById('vGold')||{}).innerText, lock:(document.getElementById('vLock')||{}).innerText}))()`);
await clickSel('#grid .cmd[data-cmd="搜索"]');
await sleep(700);
const sr = await c.eval(`(()=>({gold:(document.getElementById('vGold')||{}).innerText, lock:(document.getElementById('vLock')||{}).innerText, log:(document.getElementById('log')||{}).innerText, sheet:!!document.querySelector('#sheet.on')}))()`);
log('搜索 before', JSON.stringify(preSearch), 'after', JSON.stringify(sr));
await shot('02i_搜索');
await dumpLS('02_after');
log('errs total', await nErr(), 'new', (await nErr()) - c.startErr);
log('errors', JSON.stringify((await c.errs(c.startErr)).slice(0, 20)));
await c.close();
