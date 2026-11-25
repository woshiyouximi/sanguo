// 收尾探针：cc.Mask 到底是什么、能否 addComponent；恢复补丁；回 Campaign 留一张最终图
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};
  out.maskInfo = await ev(`(() => {
    const M = cc.Mask;
    let trial = 'not-run';
    try { const n = new cc.Node('probeMask'); trial = String(n.addComponent(M)); n.destroy(); } catch (e) { trial = 'THROW: ' + String(e && e.message); }
    let proto = null;
    try { proto = M && M.prototype ? Object.getPrototypeOf(M.prototype).constructor.name : null; } catch (e) { proto = 'err'; }
    return JSON.stringify({ type: typeof M, name: M && M.name, protoChain: proto,
      isComponentSub: (typeof M === 'function' && cc.Component) ? (M === cc.Component || M.prototype instanceof cc.Component) : null,
      hasTypeProp: !!(M && M.Type), trial });
  })()`);
  out.restore = await ev(`(() => {
    if (window.__acOrig) { cc.Node.prototype.addComponent = window.__acOrig; window.__acOrig = null; return JSON.stringify({ restored: true }); }
    return JSON.stringify({ restored: false, note: 'no orig stored' });
  })()`);
  out.back = await ev(`(() => { try { cc.director.loadScene('Campaign'); return JSON.stringify({ ok: true }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`);
  await sleep(3000);
  out.campaign = await ev(`(() => {
    const sc = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.cities && c.actionRects && !comp) comp = c; }); n.children.forEach(find); };
    find(sc);
    return JSON.stringify({ scene: sc.name, month: comp && comp.labelMonth ? comp.labelMonth.string : null,
      stats: comp && comp.labelStats ? comp.labelStats.string : null, frames: cc.director.getTotalFrames() });
  })()`);
  out.shot = await shot('campaign_after_all');
  log('maskInfo', JSON.stringify(out.maskInfo));
  return out;
}
