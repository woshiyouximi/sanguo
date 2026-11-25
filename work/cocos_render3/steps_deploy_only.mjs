// 编成页单页取证（lead m01600：换中性基色后拍 b4a_deploy_neutral.png 目检 + 复测色数）
// 用法（cd work\cocos_verify）：
//   $env:PORT=9401; ...; $env:PHASE=b4a; node cdp.mjs run F:\sanguo\work\cocos_render3\steps_deploy_only.mjs
const PREFIX = process.env.PHASE || 'b4a';

export default async function ({ s, evaluate, sleep, shot, log }) {
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1000);

  await evaluate(`cc.director.loadScene('Deploy'); 'go'`);
  for (let i = 0; i < 40; i += 1) {
    await sleep(400);
    if ((await evaluate(`cc.director.getScene() && cc.director.getScene().name`)) === 'Deploy') break;
  }
  await sleep(2600);

  const state = await evaluate(`(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    let comp = null;
    const w = (n) => { if (comp) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'DeployRoot'); if (k) { comp = k; return; } n.children.forEach(w); };
    w(canvas);
    return JSON.stringify({ art: comp && comp.artBg ? comp.artBg.state : null, queue: comp ? comp.queue.length : null });
  })()`);
  log('deploy state: ' + state);
  const out = { shot: await shot(PREFIX + '_deploy_neutral.png') };
  log('shot: ' + JSON.stringify(out.shot));
  return out;
}
