// 量 web 大地图的真实布局：地图区、图矩形、城池命中、按钮区、战报区
export default async function ({ evaluate, sleep, log }) {
  await sleep(1500);
  const raw = await evaluate(`(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const mw = document.querySelector('#mapwrap');
    const cv = document.querySelector('#map');
    const bg = document.querySelector('#bgmap');
    const out = {
      stage: r(document.querySelector('#stage')),
      mapwrap: r(mw),
      canvas: r(cv),
      bgmapStyle: bg ? { left: bg.style.left, top: bg.style.top, width: bg.style.width, height: bg.style.height } : null,
      logbox: r(document.querySelector('#logbox')),
      actions: r(document.querySelector('#actions')),
      footer: r(document.querySelector('footer')),
      advance: r(document.querySelector('[data-act="advance"]')),
      hint: r(document.querySelector('#hint')),
    };
    return JSON.stringify(out);
  })()`, { returnByValue: true });
  const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
  log('layout', JSON.stringify(j, null, 1));
  return j;
}
