// 診斷 2：cc.sys.localStorage 裡的存檔 + DeployRoot 狀態
export default async function ({ evaluate, sleep, log }) {
  const ev = async (expr) => await evaluate(expr);
  const out = {};
  out.scene = await ev(`cc.director.getScene() ? cc.director.getScene().name : ''`);
  out.save = await ev(`(() => { try { const raw = cc.sys.localStorage.getItem('sanguo_campaign_v1'); if (!raw) return 'null'; const j = JSON.parse(raw); return JSON.stringify({ len: raw.length, owned: (j.owned || []).length, month: j.month, gold: j.gold, deployQueue: j.deployQueue || null }); } catch (e) { return 'ERR ' + e; } })()`);
  out.root = await ev(`(() => {
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(cc.director.getScene());
    if (!comp) return 'no comp';
    return JSON.stringify({ loaded: comp.loaded, soldiers: comp.soldiers, cavalry: comp.cavalry, soldierCap: comp.soldierCap, cavalryCap: comp.cavalryCap, pool: (comp.generals || []).length, hint: comp.labelHint ? comp.labelHint.string : null, target: comp.labelTarget ? comp.labelTarget.string : null });
  })()`);
  log('scene=' + out.scene + ' save=' + out.save + ' root=' + out.root);
  return out;
}
