// P1 補證：合成 click 直接打在 #map 上 → 城市卡（武將 12 / 10 · 超編 紅字）
export default async function ({ evaluate, sleep, log, shot, events }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(String(v.__throw).slice(0, 400));
    return v;
  };
  await ev(`location.href = 'http://127.0.0.1:5173/web/campaign.html?bg=0&dev=1&v1check=1&p7=' + Date.now(); 'go'`);
  await sleep(3000);
  const before = await ev(`(() => ({ ym: document.getElementById('ym')?.textContent, hidden: document.getElementById('cityCard')?.hidden, scrim: document.getElementById('scrim')?.className, pick: document.getElementById('pickSheet')?.className }))()`);
  log('BEFORE ' + JSON.stringify(before));

  const res = await ev(`(() => {
    const c = window.__v1.cities().find(x => x.name === '陳留');
    const xy = window.__v1.toScreen(c.xy[0], c.xy[1]);
    const cv = window.__v1.canvas();
    const v = window.__v1.view();
    const cx = cv.rect.x + xy[0] * (cv.rect.w / v.w);
    const cy = cv.rect.y + xy[1] * (cv.rect.h / v.h);
    const el = document.elementFromPoint(cx, cy);
    document.getElementById('map').dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }));
    return { cx: Math.round(cx), cy: Math.round(cy), target: el ? (el.id || el.tagName) : null };
  })()`);
  log('CLICK ' + JSON.stringify(res));
  await sleep(600);
  const card = await ev(`(() => ({
    hidden: document.getElementById('cityCard')?.hidden,
    card: document.getElementById('cityCard')?.innerText?.replace(/\\s+/g, ' ') ?? null,
    red: [...document.querySelectorAll('#cityCard span')].filter(e => (e.getAttribute('style') || '').includes('E2554B')).map(e => e.innerText),
    hint: document.getElementById('hint')?.textContent ?? null,
    actions: [...document.querySelectorAll('#actions .act, #actions button, #actions a')].map(e => e.innerText.replace(/\\s+/g, ' ')).slice(0, 8),
  }))()`);
  log('CARD6 ' + JSON.stringify(card, null, 1).slice(0, 1800));
  const s = await shot('p1_map_card_overcap'); log('shot ' + JSON.stringify(s));
  return { before, res, card };
}
