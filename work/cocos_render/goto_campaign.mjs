export default async function ({ evaluate, sleep, log }) {
  const scene = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
  log('scene now = ' + scene);
  if (scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
    for (let i = 0; i < 40; i += 1) { await sleep(700); const sn = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`); if (sn === 'Campaign') break; }
  }
  await sleep(2000);
  const ok = await evaluate(`(typeof window.__comp === 'function')`);
  log('comp helper = ' + ok + ' scene=' + await evaluate(`cc.director.getScene().name`));
}
