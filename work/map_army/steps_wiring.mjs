// 顺带接线验收（project/182 §顺带接线）：顶栏纪元 / 存档行 / 月推进提示
//   node cdpweb.mjs run F:\sanguo\work\map_army\steps_wiring.mjs
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:5173/web/campaign.html?demo=1&armyui=1';

export default async function ({ evaluate, sleep, log, shot, click, s }) {
  const ev = async (expr) => { const v = await evaluate(expr); if (v && v.__throw) throw new Error(v.__throw); return v; };
  const J = async (expr) => { const v = await ev(expr); return typeof v === 'string' ? JSON.parse(v) : v; };
  const state = () => J('JSON.stringify(window.__armyUi ? window.__armyUi.state() : { started: false })');
  const bring = async () => { await s('Page.bringToFront'); await sleep(250); };
  const rectOf = (sel) => J(`JSON.stringify((() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), disabled: !!el.disabled, text: el.textContent.replace(/\\s+/g, ' ').trim() }; })())`);

  await bring();
  await ev(`location.href=${JSON.stringify(PAGE)}; 'nav'`);
  await sleep(3200);
  await bring();
  let st = await state();
  if (!st.started) {
    const c = await J('JSON.stringify({ sc: document.querySelectorAll("#pickCards [data-pick]").length, king: document.querySelectorAll("#pickCards [data-king]").length })');
    if (c.sc) {
      await ev('document.querySelector("#pickCards [data-pick]").click(); "sc"');
      await sleep(350);
      await ev('document.getElementById("btnPickStart").click(); "k"');
      await sleep(700);
    }
    await ev('(() => { const k = [...document.querySelectorAll("#pickCards [data-king]")].find((e) => e.dataset.off !== "1"); if (k) k.click(); return 1; })(); "k2"');
    await sleep(350);
    await ev('document.getElementById("btnPickStart").click(); "go"');
    await sleep(2000);
  }

  // 前幾輪驗收可能留下一支已抵達的部隊 → boot 時會自己彈「抵達城下」。先關掉它再清部隊，
  // 否則接著那一下「推進一月」會點在浮層的按鈕上（第一次跑就是這樣誤按了取消）。
  const dismissed = await J('JSON.stringify((() => { const c = document.getElementById("confirmSheet"); if (c.hidden) return null; const b = c.querySelector("[data-close]") || c.querySelector(".btn2"); if (b) b.click(); return b ? b.textContent.trim() : "no-button"; })())');
  log('dismissed ' + JSON.stringify(dismissed));
  await sleep(300);
  // 清空在途部隊（seed('none') 只清不放），避免推進時彈決策浮層擋住畫面
  await ev('window.__armyUi.seed("none"); "clear"');
  await sleep(200);

  // 1) 頂欄紀元 + 4) 月推進提示
  const before = await J('JSON.stringify({ ym: document.getElementById("ym").textContent, month: window.__armyUi.state().month })');
  log('ym before ' + JSON.stringify(before));
  const adv = await rectOf('[data-act="advance"]');
  log('advance btn ' + JSON.stringify(adv));
  if (adv && !adv.disabled) { await click(adv.x, adv.y); }
  await sleep(600);
  const after = await J(`JSON.stringify({
    ym: document.getElementById('ym').textContent,
    month: window.__armyUi.state().month,
    notice: document.getElementById('notice').hidden ? '' : document.getElementById('notice').textContent,
    confirmOpen: !document.getElementById('confirmSheet').hidden,
    eraApi: typeof (window.SG && window.SG.era && window.SG.era.eraTextOfMonth),
  })`);
  log('after advance ' + JSON.stringify(after));
  await bring();
  const shot4 = await shot('04_era');
  log('shot4 ' + JSON.stringify(shot4));

  // 2)/3) 存檔行：記錄NN + 4 段 + 沒有「刪」（renderSlotRows 在 openSaveSheet 裡跑，先開再查）
  await ev('document.getElementById("btnSave").click(); "save"');
  await sleep(600);
  const slots = await J(`JSON.stringify({
    open: !document.getElementById('saveSheet').hidden,
    titles: [...document.querySelectorAll('#slotRows .l1 b')].map((b) => b.textContent),
    lines: [...document.querySelectorAll('#slotRows .l2')].map((d) => d.textContent.trim()),
    buttons: [...new Set([...document.querySelectorAll('#slotRows .sbtns button')].map((b) => b.textContent.trim()))],
    delCount: [...document.querySelectorAll('#slotRows .sbtns button')].filter((b) => b.textContent.trim() === '刪').length,
    rowCount: document.querySelectorAll('#slotRows .slot').length,
    msg: document.getElementById('saveMsg').textContent.replace(/\\s+/g, ' ').trim(),
  })`);
  log('slots ' + JSON.stringify(slots));
  await bring();
  const shot5 = await shot('05_slots');
  log('shot5 ' + JSON.stringify(shot5));

  // 5) 招降面板標題：原作 B_surrender_0905.png 是「武将招降」。
  // 走頁面自己的 ?sur= 探針（dev=1 才會保留這些鍵），不造假 DOM。
  const SURR = 'http://127.0.0.1:5173/web/campaign.html?dev=1&surstart=何進&surscen=0&sur=曹操,張角&armyui=1';
  await ev(`location.href=${JSON.stringify(SURR)}; 'nav2'`);
  await sleep(3200);
  await bring();
  const sur = await J('JSON.stringify({ open: !document.getElementById("surrenderSheet").hidden, title: (document.querySelector("#surrenderSheet .ttl") || {}).textContent, sub: (document.querySelector("#surrenderSheet .sub") || {}).textContent })');
  log('surrender ' + JSON.stringify(sur));
  const shot6 = await shot('06_surrender');
  log('shot6 ' + JSON.stringify(shot6));

  return { before, after, shot4, slots, shot5, sur, shot6 };
}
