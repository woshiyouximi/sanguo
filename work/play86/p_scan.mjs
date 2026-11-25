// 在 ?v1check=1 页取 6 座我方城的 canvas 座标 + canvas 屏幕矩形（只读探测）
import { boot, BASE } from './cdp.mjs';
const c = await boot();
await c.goto(BASE + 'campaign.html?v1check=1');
await new Promise((r) => setTimeout(r, 1200));
const out = await c.eval(`(() => {
  const v = window.__v1;
  if (!v) return { err: 'no __v1' };
  const cv = v.canvas();
  const all = v.cities();
  const mine = ['南皮','平原','陳留','許昌','汝南','宛'];
  const rows = mine.map((n) => {
    const cc = all.find((x) => x.name === n);
    if (!cc) return { n, miss: true };
    const s = v.toScreen(cc.xy[0], cc.xy[1]);
    const o = { n, xy: cc.xy, cv: [Math.round(s[0]), Math.round(s[1])] };
    // 命中盒：从中心向外扩到 40px 半径边界，确认点得中
    let ok = 0;
    for (const d of [0, 10, 20, 30, 35, 39, 41]) {
      const r = v.hit(o.cv[0] + d, o.cv[1]);
      if (r === n) ok = d;
    }
    o.hitUpTo = ok;
    return o;
  });
  return { canvas: cv, view: v.view(), plot: v.plotRect ? v.plotRect() : null, rows };
})()`);
console.log(JSON.stringify(out));
await c.close();
