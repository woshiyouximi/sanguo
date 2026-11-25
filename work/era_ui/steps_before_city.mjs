// work/era_ui/steps_before_city.mjs —— 只截「改前」的內政頁（city.html）
//
// 為什麼要單獨一支：改前狀態已經落盤，為了拍到真的「改前」畫面，
// 先把 city.html 備份到 work/era_ui/city.after.html，再用 edit 反向還原 7 處，
// 跑完這支就把備份 Copy-Item 還回去（不是靠 7 次反向 edit 猜）。
// 資料不動：profile 裡的 10 個槽仍是 steps_after.mjs 鋪好的同一批，
// 這一頁會落在 209 年 3 月那一局，前後兩張截圖是同資料、只差渲染。
//
// 產出：before_city_fields.png

const BASE = 'http://127.0.0.1:5173/web/';
const CITY = process.env.CITY || '襄平';

async function waitUntil(evaluate, expr, sleep, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await evaluate(expr);
    if (v === true) return true;
    await sleep(250);
  }
  return false;
}

const READ = `(() => {
  const g = (id) => (document.getElementById(id) || {}).textContent;
  const chips = [...document.querySelectorAll('.hud .chip')].map((c) => (c.querySelector('.k')||{}).textContent + '=' + (c.querySelector('.v')||{}).textContent);
  const civic = document.getElementById('civicHud');
  return {
    headSub: g('headSub'),
    chips,
    civicHudPresent: !!civic,
    sections: [...document.querySelectorAll('.body > .sec h2')].map((h) => h.textContent.trim()),
  };
})()`;

export default async ({ send, shot, evaluate, sleep, log }) => {
  const out = {};
  await send('Page.enable');
  await send('Runtime.enable');
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1500, deviceScaleFactor: 1, mobile: false });
  } catch (e) { log('metrics override failed: ' + e.message); }

  const url = BASE + 'city.html?city=' + encodeURIComponent(CITY);
  await send('Page.navigate', { url });
  const ok = await waitUntil(evaluate, `!!window.__city && document.readyState === 'complete'`, sleep);
  await sleep(900);
  out.ready = ok;
  out.url = url;
  out.page = await evaluate(READ);
  out.shot = await shot('before_city_fields.png');
  return out;
};
