// 只讀探針：看看 9333 上那個頁面現在是什麼狀態（有沒有 cc、有沒有 __comp、Canvas 底下有哪些節點）
export default async ({ evaluate, log, page, browserVersion }) => {
  log('page:', page.url, '| browser:', browserVersion);
  const raw = await evaluate(`(() => {
    const out = { cc: typeof window.cc, comp: typeof window.__comp, scene: null, canvas: false, children: [], vis: null };
    try {
      if (window.cc && cc.director && cc.director.getScene()) {
        out.scene = cc.director.getScene().name;
        const c = cc.director.getScene().getChildByName('Canvas');
        out.canvas = !!c;
        if (c) out.children = c.children.map((n) => n.name).slice(0, 40);
        out.vis = { w: cc.view.getVisibleSize().width, h: cc.view.getVisibleSize().height };
      }
    } catch (e) { out.err = String(e && e.message ? e.message : e); }
    return JSON.stringify(out);
  })()`);
  log('state:', raw);
  return raw;
};
