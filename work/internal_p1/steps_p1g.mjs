// P1 補證：袁紹局點南皮 → 大地圖城市卡「武將 13 / 10 · 超編」紅字 + 國庫/本城金
export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(String(v.__throw).slice(0, 400));
    return v;
  };
  await ev(`location.href = 'http://127.0.0.1:5173/web/campaign.html?panel=new&bg=0&dev=1&v1check=1&p8=' + Date.now(); 'go'`);
  await sleep(3000);
  await ev(`document.querySelector('.scard[data-pick="1"]').click(); 'x'`); await sleep(400);
  await ev(`document.getElementById('btnPickStart').click(); 'x'`); await sleep(500);
  await ev(`document.querySelector('.scard[data-king="袁紹"]').click(); 'x'`); await sleep(400);
  await ev(`document.getElementById('btnPickStart').click(); 'x'`); await sleep(2600);

  const res = await ev(`(() => {
    const c = window.__v1.cities().find(x => x.name === '南皮');
    const xy = window.__v1.toScreen(c.xy[0], c.xy[1]);
    const cv = window.__v1.canvas();
    const v = window.__v1.view();
    const cx = cv.rect.x + xy[0] * (cv.rect.w / v.w);
    const cy = cv.rect.y + xy[1] * (cv.rect.h / v.h);
    document.getElementById('map').dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }));
    return { cx: Math.round(cx), cy: Math.round(cy) };
  })()`);
  await sleep(600);
  const card = await ev(`(() => ({
    card: document.getElementById('cityCard')?.innerText?.replace(/\\s+/g, ' ') ?? null,
    red: [...document.querySelectorAll('#cityCard span')].filter(e => (e.getAttribute('style') || '').includes('E2554B')).map(e => e.innerText),
    hint: document.getElementById('hint')?.textContent ?? null,
    top: { ym: document.getElementById('ym')?.textContent, gold: document.getElementById('gold')?.textContent },
  }))()`);
  log('CLICK7 ' + JSON.stringify(res));
  log('CARD7 ' + JSON.stringify(card, null, 1).slice(0, 1800));
  const s = await shot('p1_map_card_overcap'); log('shot ' + JSON.stringify(s));
  return { res, card };
}
