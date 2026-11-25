// 步骤2 补测2：用「列表」页真点城池 → 内政 → 移動/任命/自治 + 出征
import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const hud = () => c.eval(`(()=>({lock:document.getElementById('vLock').innerText, hint:document.getElementById('cmdHint').innerText, gold:document.getElementById('vGold').innerText, troops:document.getElementById('vTroops').innerText, log:document.getElementById('log').innerText.replace(/\\s+/g,' ').slice(0,220)}))()`);
const sheetInfo = () => c.eval(`(()=>({on:document.getElementById('sheet').classList.contains('on'), ttl:document.getElementById('sheetTitle').innerText, body:document.getElementById('sheetBody').innerText.replace(/\\s+/g,' ').slice(0,600)}))()`);
async function cmd(label) {
  const r = await c.eval(`(()=>{const b=[...document.querySelectorAll('#grid .cmd')].find(e=>e.dataset.cmd==="${label}"); if(!b) return null; const c=b.getBoundingClientRect(); return {x:c.x+c.width/2,y:c.y+c.height/2,dis:b.disabled};})()`);
  log('cmd', label, JSON.stringify(r));
  if (!r || r.dis) return false;
  await c.mouse(r.x, r.y); await sleep(900); return true;
}
if (!(await c.eval('location.href')).includes('city.html')) {
  if ((await c.eval('location.href')).includes('campaign.html')) {
    // 列表页
    const t = await c.rect('#tabList'); await c.mouse(t.x + t.w / 2, t.y + t.h / 2); await sleep(700);
    const row = await c.eval(`(()=>{const e=[...document.querySelectorAll('#list .city')].find(x=>x.dataset.name==='平原'); if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,vis:b.height>0};})()`);
    log('list row 平原', JSON.stringify(row));
    if (row) { await c.mouse(row.x, row.y); await sleep(700); }
    log('hint', await c.eval(`(document.getElementById('hint')||{}).innerText`));
    const b = await c.rect('#actions [data-act="city"]');
    await c.mouse(b.x + b.w / 2, b.y + b.h / 2); await sleep(2200);
  } else { await c.goto('http://127.0.0.1:5173/web/campaign.html'); await sleep(1500); }
}
log('href', await c.eval('location.href'), JSON.stringify(await hud()));
for (const [label, shot] of [['移動', '02p_移动面板'], ['任命', '02q_任命面板'], ['自治', '02r_自治面板']]) {
  await cmd(label);
  log(label, JSON.stringify(await sheetInfo()));
  await c.shot(shot);
  const r = await c.rect('#sheetCancel');
  if (r && r.w) { await c.mouse(r.x + r.w / 2, r.y + r.h / 2); await sleep(500); }
  log(label, 'after cancel', JSON.stringify(await sheetInfo()), 'hud', JSON.stringify(await hud()));
}
await cmd('出征');
log('出征 sheet', JSON.stringify(await sheetInfo()));
log('targets', JSON.stringify(await c.eval(`[...document.querySelectorAll('#sheetBody .pick')].map(e=>({n:e.dataset.name,txt:e.innerText.replace(/\\s+/g,' '),on:e.classList.contains('on')}))`)));
await c.shot('02t_出征选目标');
await c.save('02c_before_deploy', await c.eval(`localStorage.getItem('sanguo_campaign_v1')`));
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind));
await c.close();
