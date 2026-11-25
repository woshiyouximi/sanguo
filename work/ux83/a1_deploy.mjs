// 改后取证（1/3）：deploy.html —— 空城守将、上陣兵文案、?a= 主将、提示条自动消失/点击关闭
import { bootSeeded, sleep } from './drive.mjs';
const c = await bootSeeded(750, 1334);
const out = { steps: {}, errs: [] };
const q = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null)
  .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const D = 'http://127.0.0.1:5173/web/deploy.html?';
const dump = () => c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s);return e?e.textContent.replace(/\\s+/g,' ').trim():null;};
  const toast=document.querySelector('#toast');
  return {url:location.href, target:t('#target'), gar:t('#gar'), bs:t('#bs'), def:t('#def'),
    intel:t('#intel'), gname:t('#gname'), gennote:t('#gennote'), gosub:t('#gosub'),
    toastText:t('#toast'), toastHidden: toast?toast.hidden:null, toastOn: toast?toast.classList.contains('on'):null};})()`);

// ---- 步骤 0：大地图（夹具就绪性 + 通知条行为：campaign 侧未改，留证据给 lead）
await c.goto('http://127.0.0.1:5173/web/campaign.html'); await sleep(2200);
out.steps.map0 = await c.eval(`(()=>{const n=document.querySelector('#notice');
  return {href:location.href.slice(-24), month:(document.querySelector('.hdr,.top,#hdr')||{}).textContent?null:null,
   noticeHidden:n?n.hidden:null, noticeText:n?n.textContent:null,
   cities:document.querySelectorAll('.city[data-name]').length};})()`);
out.shotMap = await c.shot('after0_map.png');

// ---- 步骤 1：空城（易京，89 演练的同一条 URL）+ ?a= 指定主将
await c.goto(D + q({ city: '易京', from: '南皮', amorale: 60, lv: 2, bsoldiers: 6, blevel: 1, a: '程遠志' }));
await sleep(1800);
out.steps.deployEmpty = await dump();
out.shotDeployEmpty = await c.shot('after1_deploy_empty.png');

// ---- 步骤 2：同一个城，把出征令的主将换成 campaign 那边算出来的「夏侯惇」
await c.goto(D + q({ city: '易京', from: '南皮', amorale: 60, lv: 2, bsoldiers: 6, blevel: 1, a: '夏侯惇' }));
await sleep(1600);
out.steps.deployAssigned = await dump();
out.shotDeployAssigned = await c.shot('after2_deploy_assigned.png');

// ---- 步骤 3：有守将的敌城（正常情况不许被改坏）——从存档里挑一座 major 非空的敌城
const enemyCity = await c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
  const own=new Set(s.owned||[]); const cs=s.cities||{};
  for (const [n,v] of Object.entries(cs)) { if (!own.has(n) && v && v.major && (v.troops||0)>0) return n; }
  return '';})()`);
out.enemyCity = enemyCity;
if (enemyCity) {
  await c.goto(D + q({ city: enemyCity, from: '南皮', amorale: 60, lv: 2, blevel: 1 }));
  await sleep(1600);
  out.steps.deployDefended = await dump();
  out.shotDefended = await c.shot('after2b_deploy_defended.png');
}

// ---- 步骤 4：没带 ?bsoldiers=（不能自己猜）→ 12s 提示条；7s 后应已消失
await c.goto(D + q({ city: '易京', from: '南皮', amorale: 60, lv: 2, blevel: 1, a: '程遠志' }));
await sleep(900);
out.steps.toast0 = await dump();
out.shotToast0 = await c.shot('after4_deploy_toast_0s.png');
await sleep(13000);
out.steps.toast13 = await dump();
out.shotToast13 = await c.shot('after4_deploy_toast_13s.png');

// ---- 步骤 5：点击可关（重新载入让提示条再出来，然后点它）
await c.goto(D + q({ city: '易京', from: '南皮', amorale: 60, lv: 2, blevel: 1, a: '程遠志' }));
await sleep(900);
out.steps.toastClick0 = await dump();
await c.clickSel('#toast');
await sleep(400);
out.steps.toastClick1 = await dump();
out.shotToastClick = await c.shot('after4_deploy_toast_clicked.png');

out.errs = await c.errs(c.startErr);
await c.save('a1_deploy', out);
console.log(JSON.stringify(out, null, 1));
c.close();
