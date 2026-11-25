// 一次性核对：页面到底加载了哪份 bundle、BattleHud 是新的还是旧的。
export default async function steps({ s, evaluate, sleep, log }) {
  await s('Page.bringToFront');
  const ev = async (e) => {
    const v = await evaluate(e);
    return v && v.__throw ? { __throw: String(v.__throw).slice(0, 300) } : v;
  };
  const out = {};
  out.url = await ev('location.href');
  out.js = await ev("performance.getEntriesByType('resource').map(function(e){return e.name;}).filter(function(n){return /index\\.[0-9a-f]+\\.js$/.test(n);})");
  out.hud = await ev('(function () { function walk(n, cb) { cb(n); var c = n.children || []; for (var i = 0; i < c.length; i++) walk(c[i], cb); } var sc = cc.director.getScene(); if (!sc) return { noScene: true, scene: null }; var h = null; walk(sc, function (n) { var cs = n.components || []; for (var i = 0; i < cs.length; i++) { var cn = cs[i].__classname__ || cs[i].constructor.name; if (cn === "BattleHud") h = cs[i]; } }); if (!h) return { noHud: true, scene: sc.name }; return { scene: sc.name, nodeName: h.node.name, bars: (h.cardBars || []).length, action: h.cardActionBar || null, hasHpA: !!h.cardHpA, labels: (h.node.children || []).length }; })()');
  out.childNames = await ev('(function () { var sc = cc.director.getScene(); if (!sc) return null; var names = []; function walk(n) { names.push(n.name); var c = n.children || []; for (var i = 0; i < c.length; i++) walk(c[i]); } walk(sc); return names.filter(function (s) { return /Card|General/i.test(s); }).slice(0, 40); })()');
  return out;
}
