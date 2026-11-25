/** R208 探针：名册行头像为什么没上图 —— 看面板队列/缓存状态 + bundle 里 face/thumb 是否存在。 */
export default async function ({ evaluate, sleep, shot, log }) {
  const J = (s) => JSON.parse(s);
  const ev = async (expr) => {
    const v = await evaluate(expr, { returnByValue: true });
    if (v && v.__throw) throw new Error(v.__throw);
    return typeof v === 'string' ? J(v) : v;
  };
  await sleep(300);
  const st = await ev(`(() => {
    const scene = cc.director.getScene();
    const find = (root, name) => { let hit = null; (function w(n) { if (!hit && n.name === name) hit = n; for (const c of n.children || []) w(c); })(root); return hit; };
    const node = find(scene, 'GeneralBookPanel');
    const comp = node ? node.getComponent('GeneralBookPanel') : null;
    const out = { node: !!node, comp: !!comp };
    if (comp) {
      out.faceBusy = comp.faceBusy;
      out.faceQueue = comp.faceQueue ? comp.faceQueue.length : null;
      out.facePumping = comp.facePumping;
      out.cacheSize = comp.faceFrames ? comp.faceFrames.size : null;
      out.cache = comp.faceFrames ? Array.from(comp.faceFrames.entries()).slice(0, 6).map(([k, v]) => [k, v ? (v.name || 'frame') : null]) : null;
      out.names = comp.rowFaceName ? comp.rowFaceName.slice(0, 5) : null;
      out.states = comp.rowFaces ? comp.rowFaces.slice(0, 5).map((f) => ({ state: f.state, active: f.node.active, frame: f.sprite.spriteFrame ? f.sprite.spriteFrame.name : null })) : null;
    }
    return JSON.stringify(out);
  })()`);
  log('panel =', JSON.stringify(st));

  const b = await ev(`(() => {
    const out = {};
    const am = cc.assetManager;
    out.bundles = am.bundles.map((x) => x.name);
    const bd = am.getBundle('res');
    out.hasRes = !!bd;
    if (bd) {
      out.info = ['face/thumb/001', 'face/full/001', 'hero/關羽', 'ui/battle/port'].map((p) => {
        let i = null;
        try { i = bd.getInfoWithPath(p); } catch (e) { i = 'ERR ' + e; }
        return [p, i ? (i.uuid ? 'uuid:' + String(i.uuid).slice(0, 8) : String(i)) : null];
      });
    }
    return JSON.stringify(out);
  })()`);
  log('bundle =', JSON.stringify(b));

  // 直接手載一張 thumb，看 loadFrame 是成功還是失敗（用面板的 public-ish 靜態入口不確定，這裡只查 bundle 載入）
  const ld = await ev(`(async () => {
    const bd = cc.assetManager.getBundle('res');
    if (!bd) return JSON.stringify({ err: 'no res bundle' });
    const got = await new Promise((res) => {
      bd.load('face/thumb/001', cc.ImageAsset, (err, asset) => res({ err: err ? String(err.message || err) : null, w: asset ? asset.width : null, h: asset ? asset.height : null }));
    });
    return JSON.stringify(got);
  })()`);
  log('load =', JSON.stringify(ld));
  await shot('book_probe.png');
}
