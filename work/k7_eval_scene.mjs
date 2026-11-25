(async () => {
  const out = { steps: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = (tag) => {
    let f = null, s = null;
    try { f = cc.director.getTotalFrames(); } catch (e) { f = 'ERR ' + e.message; }
    try { s = cc.director.getScene() ? cc.director.getScene().name : null; } catch (e) { s = 'ERR ' + e.message; }
    out.steps.push({ tag, frames: f, scene: s });
  };
  snap('t0');
  await sleep(500); snap('t0+500ms');

  // list bundles + their scene infos
  try {
    out.bundles = cc.assetManager.bundles.map((b) => ({
      name: b.name,
      scenes: b.config && b.config.scenes ? [...b.config.scenes.keys()] : null,
      getSceneInfoBoot: !!b.getSceneInfo && !!b.getSceneInfo('Boot'),
      getSceneInfoBattle: !!b.getSceneInfo && !!b.getSceneInfo('Battle'),
      getSceneInfoDburi: !!b.getSceneInfo && !!b.getSceneInfo('db://assets/scene/Boot.scene'),
    }));
  } catch (e) { out.bundles = 'ERR ' + e.message; }

  // try loadScene Battle
  out.loadBattle = await new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, timeout: true }); } }, 15000);
    try {
      const ret = cc.director.loadScene('Battle', (err) => {
        if (done) return; done = true; clearTimeout(t);
        resolve({ ok: !err, err: err ? (err.message + ' | ' + (err.stack || '').slice(0, 400)) : null, ret });
      });
      if (ret === false) { /* keep waiting for cb */ }
    } catch (e) { if (!done) { done = true; clearTimeout(t); resolve({ ok: false, threw: e.message }); } }
  });
  await sleep(1500);
  snap('afterBattle');

  // campaign
  out.loadCampaign = await new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, timeout: true }); } }, 15000);
    try {
      const ret = cc.director.loadScene('Campaign', (err) => {
        if (done) return; done = true; clearTimeout(t);
        resolve({ ok: !err, err: err ? (err.message + ' | ' + (err.stack || '').slice(0, 400)) : null, ret });
      });
    } catch (e) { if (!done) { done = true; clearTimeout(t); resolve({ ok: false, threw: e.message }); } }
  });
  await sleep(1500);
  snap('afterCampaign');

  out.warn = (window.__k7warn || []).slice(-12);
  return out;
})()
