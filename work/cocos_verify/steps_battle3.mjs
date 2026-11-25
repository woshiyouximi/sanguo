// 定位 Battle 黑屏根因：给 Node.prototype.addComponent 打补丁，记录「传进来的类是 falsy」的调用点
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};

  out.identity = await ev(`(() => {
    const m = window.__ccns || null;
    return JSON.stringify({ hasNs: !!m, nodeSame: m ? (m.Node === cc.Node) : null, labelSame: m ? (m.Label === cc.Label) : null,
      nsMask: m ? typeof m.Mask : 'no-ns', nsUIT: m ? typeof m.UITransform : 'no-ns', ccMask: typeof cc.Mask, ccUIT: typeof cc.UITransform });
  })()`);

  out.patch = await ev(`(() => {
    if (!window.__acHits) {
      window.__acHits = [];
      const proto = cc.Node.prototype;
      const orig = proto.addComponent;
      window.__acOrig = orig;
      proto.addComponent = function (cls) {
        if (!cls) {
          window.__acHits.push({ node: this && this.name, argc: arguments.length,
            ctor: cls === undefined ? 'undefined' : (cls === null ? 'null' : typeof cls),
            stack: String(new Error().stack).split('\\n').slice(1, 7).join(' | ') });
        }
        return orig.apply(this, arguments);
      };
      return JSON.stringify({ patched: true, sameProto: proto === cc.Node.prototype });
    }
    return JSON.stringify({ patched: 'already' });
  })()`);

  // 从 Campaign 进 Battle
  out.loadBattle = await ev(`(() => { try { cc.director.loadScene('Battle'); return JSON.stringify({ ok: true }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`);
  await sleep(5000);
  out.hits = await ev(`(() => JSON.stringify({ count: window.__acHits.length, hits: window.__acHits.slice(0, 4) }))()`);
  out.battleTree = await ev(`(() => {
    const sc = cc.director.getScene();
    if (!sc) return JSON.stringify({ scene: null });
    const dump = (n, d) => ({ name: n.name, active: n.active, children: d > 2 ? [] : n.children.map((c) => dump(c, d + 1)) });
    return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(), tree: dump(sc, 0) });
  })()`);
  out.shot = await shot('battle_scene');
  log('hits', JSON.stringify(out.hits).slice(0, 900));
  return out;
}
