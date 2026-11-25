// 把 work/cocos_layout/assert_layout.mjs:56-79 那一段 HELPERS 原樣注入頁面。
// assert_layout.mjs 自己在 :157 就先調 window.__comp()，但 HELPERS 只寫在後面的 CAMPAIGN_DUMP 裡
// —— 所以那段頁面必須「事先被別的東西注入過」（原本是 layout 會話裡的舊步驟腳本幹的）。
// 這裡不改別人的腳本，改用我自己的 steps 檔把同一份 HELPERS 補上，再跑 assert_layout。
export default async ({ evaluate, log, page }) => {
  log('page:', page.url);
  const sync = await evaluate(`(() => {
    window.__H = 1334;
    window.__box = (n) => {
      const t = n.getComponent('cc.UITransform');
      if (!t) return null;
      const b = t.getBoundingBoxToWorld();
      return { n: n.name, x: +b.x.toFixed(2), y: +(__H - b.y - b.height).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
    };
    window.__canvas = () => cc.director.getScene().getChildByName('Canvas');
    window.__comp = () => window.__canvas().components.find((x) => x && x.save && x.cities);
    window.__labelOf = (n) => (n && n.getComponent('cc.Label') ? n.getComponent('cc.Label').string : null);
    window.__walk = (n, acc, d) => {
      if (d > 4) return acc;
      const t = window.__labelOf(n);
      if (t) { const b = window.__box(n); if (b) acc.push({ t, x: b.x, y: b.y, w: b.w, h: b.h, active: n.active }); }
      for (const c of n.children) window.__walk(c, acc, d + 1);
      return acc;
    };
    window.__hit = (a, b) => {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? +(w * h).toFixed(2) : 0;
    };
    return 'ok';
  })()`);
  const probe = await evaluate(`(() => {
    const c = window.__comp();
    if (!c) return 'NO_COMP';
    const has = ['mapRect', 'logRect', 'consoleRects', 'refresh', 'openCityPanel', 'openItems'].map((k) => k + ':' + (typeof c[k]));
    return JSON.stringify({ cls: c.__classname__, classname: c.constructor && c.constructor.name, has, cities: c.cities ? c.cities.length : -1 });
  })()`);
  log('inject:', sync, '| comp:', probe);
  return { sync, probe };
};
