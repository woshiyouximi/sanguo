// 采集前置诊断：页面到底起没起来（readyState / cc / 场景 / canvas / 帧数）。
//   OUTDIR=F:\sanguo\work\cocos_hud2 node work\cocos_verify\cdpweb.mjs run work\cocos_hud2\steps_probe.mjs
export default async function steps({ s, evaluate, sleep, log }) {
  await s('Page.bringToFront');
  const ev = async (expr) => {
    try {
      const v = await evaluate(expr);
      return v && v.__throw ? { __throw: String(v.__throw).slice(0, 300) } : v;
    } catch (e) {
      return { __err: String(e).slice(0, 200) };
    }
  };
  const out = { samples: [] };
  out.basic = await ev('({ href: location.href, ready: document.readyState, ua: navigator.userAgent.slice(0, 60) })');
  out.hasCc = await ev('typeof cc');
  for (let i = 0; i < 20; i++) {
    const st = await ev('(function () { try { var sc = (typeof cc === "object" && cc.director) ? cc.director.getScene() : null; return { i: ' + i + ', scene: sc ? sc.name : null, frames: (cc.director ? cc.director.getTotalFrames() : null), canvas: (function () { var c = document.querySelector("canvas"); if (!c) return null; var b = c.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() }; } catch (e) { return { i: ' + i + ', err: String(e) }; } })()');
    out.samples.push(st);
    log('sample', JSON.stringify(st));
    if (st && st.scene && st.frames > 5) break;
    await sleep(1000);
  }
  out.res = await ev('performance.getEntriesByType("resource").filter(function (e) { return e.transferSize === 0 && e.decodedBodySize === 0; }).slice(0, 12).map(function (e) { return e.name.split("/").slice(-2).join("/"); })');
  out.sceneTree = await ev('(function () { try { var sc = cc.director.getScene(); if (!sc) return null; return sc.children.map(function (n) { return n.name; }); } catch (e) { return String(e); } })()');
  return out;
}
