// Battle 场景权威日志：直接 loadScene('Battle')，等 6s，dump 节点树 + 截图；最后回 Campaign
export default async function (ctx) {
  const { evaluate, shot, sleep, log, OUTDIR } = ctx;

  const before = JSON.parse(await evaluate(`JSON.stringify({ scene: cc.director.getScene().name, frames: cc.director.getTotalFrames() })`, { returnByValue: true }));
  log('before =', JSON.stringify(before));

  await evaluate(`cc.director.loadScene('Battle')`, { returnByValue: true });
  await sleep(6000);

  const after = JSON.parse(await evaluate(`(() => {
    const sc = cc.director.getScene();
    const walk = (n, d) => ({ name: n.name, comps: n.components.map(c => c && c.constructor && c.constructor.name || String(c)), children: n.children.map(c => walk(c, d + 1)) });
    const tree = walk(sc, 0);
    let nodes = 0, labels = 0, sprites = 0;
    const rec = (n) => { nodes++; for (const c of n.components) { const nm = (c && c.constructor && c.constructor.name) || ''; if (/Label/.test(nm)) labels++; if (/Sprite/.test(nm)) sprites++; } n.children.forEach(rec); };
    rec(sc);
    return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(), nodes, labels, sprites, tree });
  })()`, { returnByValue: true }));
  log('after =', JSON.stringify({ scene: after.scene, frames: after.frames, nodes: after.nodes, labels: after.labels, sprites: after.sprites }));
  log('tree =', JSON.stringify(after.tree));

  const p = await shot('battle_canon.png');
  log('shot =', p);

  await evaluate(`cc.director.loadScene('Campaign')`, { returnByValue: true });
  await sleep(2000);
  const back = JSON.parse(await evaluate(`JSON.stringify({ scene: cc.director.getScene().name, frames: cc.director.getTotalFrames() })`, { returnByValue: true }));
  log('back =', JSON.stringify(back));

  return { before, after: { scene: after.scene, frames: after.frames, nodes: after.nodes, labels: after.labels, sprites: after.sprites, tree: after.tree }, back };
}
