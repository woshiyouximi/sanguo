// 诊断探针（w9-render3）：干净重载后看 CampaignRoot 的 cityTier 是否被清成 null。
export default async function ({ s, evaluate, sleep, log }) {
  const out = {};
  await s('Page.reload', { ignoreCache: true }).catch((e) => log('reload fail ' + e));
  await sleep(9000);
  out.scene = await evaluate(`cc.director.getScene() && cc.director.getScene().name`);
  log('scene=' + out.scene);

  // Boot 会把 Campaign 拉起来；找 Canvas 上的 CampaignRoot 组件
  const probe = `(() => {
    const sc = cc.director.getScene();
    if (!sc) return 'no scene';
    const canvas = sc.getChildByName('Canvas');
    if (!canvas) return 'no canvas';
    let found = null;
    const walk = (n) => {
      if (found) return;
      for (const c of n.components || []) {
        if ((c.__classname__ || '') === 'CampaignRoot') { found = c; return; }
      }
      n.children.forEach(walk);
    };
    walk(canvas);
    if (!found) return 'no CampaignRoot comp';
    return JSON.stringify({
      hasCityTier: 'cityTier' in found,
      cityTierType: typeof found.cityTier,
      cityTierIsNull: found.cityTier === null,
      keys: Object.keys(found).length,
      cities: found.cities ? found.cities.length : null,
    });
  })()`;
  out.probe = await evaluate(probe);
  log('probe=' + (typeof out.probe === 'string' ? out.probe : JSON.stringify(out.probe)));
  return out;
}
