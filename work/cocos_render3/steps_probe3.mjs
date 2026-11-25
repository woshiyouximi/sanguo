// 诊断探针 3（w9-render3）：不重载，只看页面现状 + CampaignRoot.cityTier。
export default async function ({ s, evaluate, sleep, log }) {
  const out = {};
  out.where = await evaluate(`JSON.stringify({ href: location.href, ready: document.readyState, cc: (typeof cc), canvas: !!document.querySelector('canvas') })`);
  log('where=' + out.where);
  await sleep(3000);
  out.scene = await evaluate(`(() => { try { const sc = cc.director.getScene(); return sc ? sc.name : 'null-scene'; } catch (e) { return 'throw:' + e; } })()`);
  log('scene=' + out.scene);

  const probe = `(() => {
    try {
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
        cities: found.cities ? found.cities.length : null,
      });
    } catch (e) { return 'throw:' + e; }
  })()`;
  out.probe = await evaluate(probe);
  log('probe=' + (typeof out.probe === 'string' ? out.probe : JSON.stringify(out.probe)));
  return out;
}
