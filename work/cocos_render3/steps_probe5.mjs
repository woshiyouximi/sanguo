// 诊断探针 5（w9-render3）：手动 loadScene('Campaign')，看是否停在 Campaign、cityTier 是否为 null。
export default async function ({ evaluate, sleep, log }) {
  const out = {};
  await evaluate(`cc.director.loadScene('Campaign'); 'go'`).catch((e) => log('loadScene eval fail ' + e));
  for (let i = 0; i < 20; i += 1) {
    await sleep(1000);
    const sn = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
    if (sn === 'Campaign') { out.loadedAt = i + 1; break; }
  }
  out.scene = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
  log('scene after load=' + out.scene + ' at=' + out.loadedAt);
  await sleep(1500);

  const probe = `(() => {
    const sc = cc.director.getScene();
    if (!sc) return 'no scene';
    const canvas = sc.getChildByName('Canvas');
    if (!canvas) return 'no canvas';
    let found = null;
    const walk = (n) => {
      if (found) return;
      const comps = n.components || [];
      for (let i = 0; i < comps.length; i += 1) {
        if ((comps[i].__classname__ || '') === 'CampaignRoot') { found = comps[i]; return; }
      }
      n.children.forEach(walk);
    };
    walk(canvas);
    if (!found) return 'no CampaignRoot comp';
    return JSON.stringify({
      cityTierType: typeof found.cityTier,
      cityTierIsNull: found.cityTier === null,
      cityTierSize: found.cityTier && found.cityTier.size,
      cities: found.cities ? found.cities.length : 0,
      hasSave: !!found.save,
    });
  })()`;
  out.probe = await evaluate(probe);
  log('probe=' + (typeof out.probe === 'string' ? out.probe : JSON.stringify(out.probe)));
  return out;
}
