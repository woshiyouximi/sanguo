// 步骤2 补测（中文 data-cmd）：搜索 / 移動 / 任命 / 自治
import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const hud = () => c.eval(`(()=>({lock:document.getElementById('vLock').innerText, hint:document.getElementById('cmdHint').innerText, gold:document.getElementById('vGold').innerText, troops:document.getElementById('vTroops').innerText, prep:document.getElementById('vPrep').innerText, def:document.getElementById('vDef').innerText, log:document.getElementById('log').innerText.replace(/\\s+/g,' ').slice(0,300), sheet:{on:document.getElementById('sheet').classList.contains('on'), ttl:document.getElementById('sheetTitle').innerText}}))()`);
async function cmd(label) {
  const r = await c.eval(`(()=>{const b=[...document.querySelectorAll('#grid .cmd')].find(e=>e.dataset.cmd==="${label}"); if(!b) return null; const c=b.getBoundingClientRect(); return {x:c.x+c.width/2,y:c.y+c.height/2,dis:b.disabled};})()`);
  log('click cmd', label, JSON.stringify(r));
  if (!r) return false;
  await c.mouse(r.x, r.y); await sleep(1000); return true;
}
const sheetInfo = () => c.eval(`(()=>({on:document.getElementById('sheet').classList.contains('on'), ttl:document.getElementById('sheetTitle').innerText, body:document.getElementById('sheetBody').innerText.replace(/\\s+/g,' ').slice(0,500), ok:(document.getElementById('sheetOk')||{}).innerText, cancel:(document.getElementById('sheetCancel')||{}).innerText}))()`);
log('hud0', JSON.stringify(await hud()));
// 搜索（吃月令）
await cmd('搜索');
log('after search', JSON.stringify(await hud()));
await c.shot('02o_搜索结果');
log('sheet?', JSON.stringify(await sheetInfo()));
if ((await sheetInfo()).on) { const r = await c.rect('#sheetOk'); await c.mouse(r.x + r.w / 2, r.y + r.h / 2); await sleep(900); log('after search ok', JSON.stringify(await hud())); }
await c.save('02b_after_search', await c.eval(`localStorage.getItem('sanguo_campaign_v1')`));
// 移動 / 任命 / 自治：开→dump→取消
for (const [label, shot] of [['移動', '02p_移动面板'], ['任命', '02q_任命面板'], ['自治', '02r_自治面板']]) {
  await cmd(label);
  log(label, JSON.stringify(await sheetInfo()));
  await c.shot(shot);
  if ((await sheetInfo()).on) { const r = await c.rect('#sheetCancel'); if (r && r.w) { await c.mouse(r.x + r.w / 2, r.y + r.h / 2); await sleep(500); } }
  log(label, 'after cancel', JSON.stringify(await hud()));
}
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind), JSON.stringify(errs.filter(e=>e.kind==='error').slice(-2).map(e=>e.msg)));
await c.close();
