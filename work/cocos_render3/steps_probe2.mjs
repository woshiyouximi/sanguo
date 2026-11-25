// 诊断探针 2（w9-render3）：重载后逐秒等，直到 scene 出现，再报 CampaignRoot 的 cityTier。
export default async function ({ s, evaluate, sleep, log }) {
  const out = { ticks: [] };
  for (let i = 0; i < 20; i += 1) {
    await sleep(1000);
    const st = await evaluate(`(() => {
      try {
        const ccok = typeof cc !== 'undefined' && !!cc.director;
        const sc = ccok && cc.director.getScene();
        return JSON.stringify({ t: ${'${i}'}, ready: document.readyState, ccok, scene: sc ? sc.name : null });
      } catch (e) { return JSON.stringify({ err: String(e) }); }
    })()`);
    out.ticks.push(st);
    if (typeof st === 'string' && st.indexOf('"scene":"') >= 0 && st.indexOf('"scene":null') < 0) break;
  }
  log('ticks=' + JSON.stringify(out.ticks.slice(-6)));

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
      cityTierType: typeof found.cityTier,
      cityTierIsNull: found.cityTier === null,
      cities: found.cities ? found.cities.length : null,
      opened: found.opened,
    });
  })()`;
  out.probe = await evaluate(probe);
  log('probe=' + (typeof out.probe === 'string' ? out.probe : JSON.stringify(out.probe)));
  return out;
}
