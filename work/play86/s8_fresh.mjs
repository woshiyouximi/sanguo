import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
await c.goto(BASE + 'campaign.html'); await sleep(1500);
// 备份 + 造 v2（删掉 v3 新增 7 键，v=2），只改槽 1 快照
log('backup', await c.eval(`(()=>{const d={saves:localStorage.getItem('sanguo_saves_v1'),campaign:localStorage.getItem('sanguo_campaign_v1'),items:localStorage.getItem('sanguo_items_v1')}; window.__bk=d; return Object.keys(d).map(k=>k+':'+(d[k]||'').length).join(' ');})()`));
await c.save('08_before_migrate', await c.eval(`JSON.stringify(window.__bk)`));
log('craft', await c.eval(`(()=>{const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); let sn=st.slots[0].snapshot; sn.v=2; ['year','yearFlag','ledger','generalStatus','weapon','horse','thing'].forEach(k=>delete sn[k]); localStorage.setItem('sanguo_saves_v1', JSON.stringify(st)); localStorage.removeItem('sanguo_campaign_v1'); return {lv:sn.v, month:sn.month, keys:Object.keys(sn).length};})()`));
await c.goto(BASE + 'campaign.html'); await sleep(2500);
const noticeOf = async () => c.eval(`[...document.querySelectorAll('#notice, .notice, #logbox .lr')].map(e=>e.innerText.replace(/\\s+/g,' ')).filter(Boolean).slice(0,4)`);
log('notice', JSON.stringify(await noticeOf()));
log('head', JSON.stringify(await c.eval(`(()=>({ym:(document.getElementById('ym')||{}).innerText, gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, rec:(document.getElementById('rec')||{}).innerText, badge:(document.getElementById('slotBadge')||{}).innerText, sc:(document.getElementById('scName')||{}).innerText, king:(document.getElementById('kingName')||{}).innerText, listN:document.querySelectorAll('#list .city').length, cities:document.querySelectorAll('.city').length, logRows:document.querySelectorAll('#logrows .lr').length, log0:(document.querySelector('#logrows .lr')||{}).innerText}))()`)));
await c.shot('08_迁移提示');
log('after migrate store', await c.eval(`(()=>{const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); const sn=st.slots[0].snapshot||{}; return {v:sn.v, month:sn.month, gold:sn.gold, owned:(sn.owned||[]).length, log:(sn.log||[]).length, genLevel:(sn.generalLevel?Object.keys(sn.generalLevel).length:0), ledger:!!sn.ledger, year:sn.year, generalStatus:!!sn.generalStatus};})()`));
// 刷新两次看稳定性与数据完整
await c.goto(BASE + 'campaign.html'); await sleep(2000);
log('reload1', JSON.stringify(await c.eval(`(()=>({ym:(document.getElementById('ym')||{}).innerText, gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, notice:(document.getElementById('notice')||{}).innerText, listN:document.querySelectorAll('#list .city').length}))()`)));
await c.shot('08b_刷新生效');
const errs = await c.errs(0); const byKind = {}; errs.forEach((e) => (byKind[e.kind] = (byKind[e.kind] || 0) + 1));
log('errs', errs.length, JSON.stringify(byKind), JSON.stringify(errs.filter(e=>e.kind==='error').map(e=>e.msg.slice(0,100)).slice(0,3)));
await c.close();
