// 用 ?dev=1&v1check=1 的 window.__v1 量地图几何 + 60 城命中
export default async function ({ evaluate, sleep, log, navigate }) {
  if (navigate) await navigate('http://127.0.0.1:5173/web/campaign.html?dev=1&v1check=1');
  await sleep(2500);
  const raw = await evaluate(`(() => {
    const v = window.__v1;
    if (!v) return JSON.stringify({ err: 'no __v1' });
    const r = v.plotRect();
    const cv = v.canvas();
    const view = v.view();
    const cities = v.cities();
    // 城池在画布内的可见性：画布本地坐标 = toScreen - canvas.rect 偏移
    const bx = cv.rect.x, by = cv.rect.y;
    const list = cities.map((c) => {
      const [sx, sy] = v.toScreen(c.xy[0], c.xy[1]);
      const cx = sx + 0 /* canvas 与视口对齐 */;
      const inside = sx >= 0 && sx <= cv.w && sy >= 0 && sy <= cv.h;
      const hit = v.hit(cx - (bx - bx), sy);
      return { n: c.name, x: Math.round(sx), y: Math.round(sy), inside, hit };
    });
    const out = list.filter((c) => !c.inside);
    const missed = list.filter((c) => c.hit !== c.n);
    return JSON.stringify({ rect: r, canvas: cv, view, total: list.length, outside: out, hitMiss: missed });
  })()`, { returnByValue: true });
  const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
  log('v1check', JSON.stringify(j).slice(0, 1200));
  return j;
}
