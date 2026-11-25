// R84 复验：大地图（君主/势力页头 + 城点）+ 内政 + 物品 + 战斗，各拍一张
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};
  out.campaign = await ev(`(() => {
    const sc = cc.director.getScene();
    const labels = [];
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && typeof c.string === 'string' && c.string) labels.push(c.string); }); n.children.forEach(walk); };
    walk(sc);
    return JSON.stringify({ scene: sc.name, labels: labels.slice(0, 16) });
  })()`);
  out.shotCampaign = await shot('r84_01_campaign');

  // 内政：直接 load 不成立（面板不是场景），改为点城；这里只记录总节点数供比对
  out.counts = await ev(`(() => { const sc = cc.director.getScene(); const c = (n) => 1 + n.children.reduce((a, x) => a + c(x), 0); return JSON.stringify({ nodeCount: c(sc) }); })()`);
  log('campaign', JSON.stringify(out.campaign).slice(0, 900));
  log('counts', JSON.stringify(out.counts));
  return out;
}
