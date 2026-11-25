// 诊断探针 4（w9-render3）：headless 下确认帧在推进、Boot 会自动进 Campaign，并查 cityTier。
export default async function ({ evaluate, sleep, log }) {
  const out = { ticks: [] };
  for (let i = 0; i < 24; i += 1) {
    await sleep(1000);
    const st = await evaluate(`JSON.stringify({ f: cc.director.getTotalFrames(), s: cc.director.getScene() ? cc.director.getScene().name : null })`);
    out.ticks.push(st);
    if (String(st).includes('"s":"Campaign"')) break;
  }
  log('ticks=' + JSON.stringify(out.ticks));

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
      cities: found.cities ? found.cities.length : null,
      selected: found.selected,
    });
  })()`;
  out.probe = await evaluate(probe);
  log('probe=' + (typeof out.probe === 'string' ? out.probe : JSON.stringify(out.probe)));
  return out;
}
