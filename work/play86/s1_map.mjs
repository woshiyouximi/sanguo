import { boot, sleep, BASE } from './cdp.mjs';
import { list, clickNth, clickText, clickId, text, visible } from './ui.mjs';

const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const out = { steps: [] };
const rec = async (k, v) => { out.steps.push({ k, v }); log(k, v); };

await c.goto(BASE + 'campaign.html');
await sleep(1500);

// ---------- 1. 剧本选择屏 ----------
const cards0 = await list(c, '#pickCards .scard', ",pick:e.dataset.pick,king:e.dataset.king||null");
await rec('pickCards', cards0.map((x) => ({ pick: x.pick, txt: x.txt.slice(0, 110), cls: x.cls })));
out.shot1 = await c.shot('01_选剧本');

// 全部 5 张卡的「開局三城」文本（检查是否仍然全一样）
const trio = await c.eval(`[...document.querySelectorAll('#pickCards .scard')].map(e=>{const m=(e.innerText||'').match(/開局三城：([^\\n]*)/); return {pick:e.dataset.pick, trio:m?m[1].replace(/\\s+/g,' ').trim():null};})`);
await rec('trio_per_scenario', trio);

// 真点击第 1 张（黃巾之亂）
const pickClick = await clickText(c, '#pickCards .scard', /黃巾之亂/);
await sleep(700);
await rec('clickScenario', pickClick.ok ? pickClick.e.txt.slice(0, 80) : pickClick);
await rec('afterScenario', {
  ttl: await text(c, '#pickTtl'), sub: await text(c, '#pickSub'), warn: await text(c, '#pickWarn'),
  start: await text(c, '#btnPickStart'),
  picked: await c.eval(`[...document.querySelectorAll('#pickCards .scard')].filter(e=>/picked|on/.test(e.className)).map(e=>(e.innerText||'').replace(/\\s+/g,' ').slice(0,60))`),
});
out.shot2 = await c.shot('01b_选剧本_已选');

// 「選 君 主 →」
const b1 = await clickId(c, 'btnPickStart');
await sleep(900);
const kings = await list(c, '#pickCards .scard', ",king:e.dataset.king||null");
await rec('kingList', { n: kings.length, first: kings.slice(0, 6).map((k) => ({ king: k.king, txt: k.txt.slice(0, 70) })) });
out.shot3 = await c.shot('01c_选君主');

// 真点击 張角
const kp = await c.eval(`(()=>{const e=[...document.querySelectorAll('#pickCards .scard')].find(x=>x.dataset.king==='張角'); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,txt:(e.innerText||'').replace(/\\s+/g,' ').slice(0,80)};})()`);
await rec('zhangjiaoCard', kp);
if (kp) { await c.mouse(kp.x + kp.w / 2, kp.y + kp.h / 2); }
await sleep(700);
await rec('afterKing', { warn: await text(c, '#pickWarn'), start: await text(c, '#btnPickStart'), ttl: await text(c, '#pickTtl') });
out.shot4 = await c.shot('01d_选君主_已选');

// 「開 始 新 遊 戲」
const b2 = await clickId(c, 'btnPickStart');
await sleep(3000);
await c.waitLoad();
await sleep(800);

const mapState = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 const my=[...document.querySelectorAll('.city')].filter(e=>/我方/.test(e.innerText||'')).map(e=>e.dataset.name);
 const s=window.__sanguo; const sv=s&&s.save;
 return {href:location.href, scName:t('#scName'), ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), rec:t('#rec'), king:t('#kingName'), kingdom:t('#kingdomName'), slot:t('#slotBadge'), btnSave:t('#btnSave'),
  pickHidden:document.getElementById('pickSheet').hidden, gameStarted:!!(window.__sanguo&&window.__sanguo.save),
  owned:sv?sv.owned:null, cities:sv?Object.keys(sv.cities||{}).length:null, scenario:sv?sv.scenario:null, king:sv?sv.king:null, monarch:sv?sv.monarch:null,
  troops:sv&&sv.cities? Object.fromEntries(Object.entries(sv.cities).map(([k,v])=>[k,v.troops])):null,
  listCount:document.querySelectorAll('#list .city').length, myList:my};})()`);
await rec('map', mapState);
out.shot5 = await c.shot('01e_大地图');

// 战报
await rec('logrows', await c.eval(`[...document.querySelectorAll('#logrows > *')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120))`));

// ---------- 势力抽屉 ----------
const f1 = await clickId(c, 'btnForces');
await sleep(700);
const force = await c.eval(`(()=>({hidden:document.getElementById('forceSheet').hidden, ttl:(document.getElementById('forceTtl').innerText||'').trim(),
  sub:(document.getElementById('forceSub').innerText||'').replace(/\\s+/g,' ').slice(0,140), foot:(document.getElementById('forceFoot').innerText||'').replace(/\\s+/g,' ').slice(0,200),
  rows:[...document.querySelectorAll('#forceRows > *')].slice(0,14).map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,110))}))()`);
await rec('forceSheet', force);
out.shot6 = await c.shot('01f_势力抽屉');
// 关闭
await clickText(c, '#forceSheet [data-close]', /./);
await sleep(400);

// ---------- 君主卡 ----------
const m1 = await clickId(c, 'kingName');
await sleep(700);
const mon = await c.eval(`(()=>({hidden:document.getElementById('monarchSheet').hidden, ttl:(document.getElementById('monTtl').innerText||'').trim(),
  sub:(document.getElementById('monSub').innerText||'').replace(/\\s+/g,' ').slice(0,140), body:(document.getElementById('monBody').innerText||'').replace(/\\s+/g,' ').trim().slice(0,600),
  foot:(document.getElementById('monFoot').innerText||'').replace(/\\s+/g,' ').slice(0,300), abdicateHidden:document.getElementById('btnAbdicate').hidden}))()`);
await rec('monarchSheet', mon);
out.shot7 = await c.shot('01g_君主卡');

// ---------- 让位候选 ----------
const a1 = await clickId(c, 'btnAbdicate');
await sleep(800);
const throne = await c.eval(`(()=>({hidden:document.getElementById('throneSheet').hidden, monHidden:document.getElementById('monarchSheet').hidden,
  sub:(document.getElementById('throneSub').innerText||'').replace(/\\s+/g,' ').slice(0,140), foot:(document.getElementById('throneFoot').innerText||'').replace(/\\s+/g,' ').slice(0,200),
  rows:[...document.querySelectorAll('#throneRows > *')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,90))}))()`);
await rec('throneSheet', throne);
out.shot8 = await c.shot('01h_让位候选');
// 关掉（点 取消）
await clickText(c, '#throneSheet .sheet-ft button', /取 消/);
await sleep(400);
await rec('afterClose', { throne: await visible(c, 'throneSheet'), mon: await visible(c, 'monarchSheet') });

// 存档快照
await c.save('01_map', out);
const errs = await c.errs(0);
await rec('errs1', errs);
console.log('ERRS_TOTAL', errs.length);
c.close();
