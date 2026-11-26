// P1 補證：大地圖城市卡「武將 N / 10 · 超編」紅字（曹操 陳留 12 名）
export default async function ({ evaluate, sleep, log, shot, click }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(String(v.__throw).slice(0, 400));
    return v;
  };
  await ev(`location.href = 'http://127.0.0.1:5173/web/campaign.html?panel=new&bg=0&dev=1&v1check=1&p6=' + Date.now(); 'go'`);
  await sleep(3000);
  await ev(`document.querySelector('.scard[data-pick="1"]').click(); 'x'`); await sleep(400);
  await ev(`document.getElementById('btnPickStart').click(); 'x'`); await sleep(500);
  await ev(`document.querySelector('.scard[data-king="曹操"]').click(); 'x'`); await sleep(400);
  await ev(`document.getElementById('btnPickStart').click(); 'x'`); await sleep(2600);

  const pt = await ev(`(() => {
    const c = window.__v1.cities().find(x => x.name === '陳留');
    const xy = window.__v1.toScreen(c.xy[0], c.xy[1]);
    const cv = window.__v1.canvas();
    const v = window.__v1.view();
    return {
      name: window.__v1.hit(Math.round(xy[0]), Math.round(xy[1])),
      css: { x: Math.round(cv.rect.x + xy[0] * (cv.rect.w / v.w)), y: Math.round(cv.rect.y + xy[1] * (cv.rect.h / v.h)) },
      canvas: cv, view: v,
    };
  })()`);
  log('PT ' + JSON.stringify(pt));
  if (pt && pt.css) { await click(pt.css.x, pt.css.y); await sleep(1000); }
  const card = await ev(`(() => ({
    hidden: document.getElementById('cityCard')?.hidden,
    card: document.getElementById('cityCard')?.innerText?.replace(/\\s+/g, ' ') ?? null,
    red: [...document.querySelectorAll('#cityCard span')].filter(e => (e.getAttribute('style') || '').includes('E2554B')).map(e => e.innerText),
    hint: document.getElementById('hint')?.textContent ?? null,
  }))()`);
  log('CARD5 ' + JSON.stringify(card, null, 1).slice(0, 1600));
  const s = await shot('p1_map_card_overcap'); log('shot ' + JSON.stringify(s));
  return { pt, card };
}
