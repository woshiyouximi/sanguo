// 断言前置（w9-render3）：把页面**留在** Campaign 场景、不关页面。
// assert_layout / layout_guard / hud_layout 都是外部 node 脚本，靠 CDP 连同一个页面读组件树，
// 所以这里只做「进场景 + 收起内政面板」，然后退出，让断言脚本接手。
export default async function ({ s, evaluate, sleep, log }) {
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await sleep(800);
  const name = await evaluate(`cc.director.getScene() && cc.director.getScene().name`);
  log('scene=' + name);
  if (name !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`);
    for (let i = 0; i < 40; i += 1) {
      await sleep(400);
      const n = await evaluate(`cc.director.getScene() && cc.director.getScene().name`);
      if (n === 'Campaign') break;
    }
    await sleep(2500);
  }
  const info = await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    if (comp && comp.cityPanel && comp.cityPanel.node && comp.cityPanel.node.active) comp.cityPanel.hide();
    if (comp) comp.refresh();
    return JSON.stringify({ scene: cc.director.getScene().name, cities: comp ? comp.cities.length : -1, frames: cc.director.getTotalFrames() });
  })()`);
  log('prep=' + JSON.stringify(info));
  return info;
}
