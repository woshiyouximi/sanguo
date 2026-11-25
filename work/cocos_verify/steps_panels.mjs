// 直接调用组件方法，判断内政/物品面板本身能不能打开（区分「点击坐标问题」vs「面板坏了」）
export default async function (ctx) {
  const { evaluate, sleep, shot, log } = ctx;
  const J = (s) => JSON.parse(s);

  const sc = J(await evaluate(`JSON.stringify({ scene: cc.director.getScene().name })`, { returnByValue: true }));
  if (sc.scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`, { returnByValue: true });
    await sleep(2500);
  }

  const r1 = J(await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find(x => x && x.save && x.cities);
    const out = { hasData: !!comp.data, dataKeys: comp.data ? Object.keys(comp.data) : null };
    try { comp.openCityPanel('襄平'); } catch (e) { out.cityErr = String(e && e.message || e); }
    out.cityPanelExists = !!comp.cityPanel;
    out.cityPanelIsOpen = comp.cityPanel ? !!comp.cityPanel.isOpen() : null;
    out.cityPanelNode = comp.cityPanel ? comp.cityPanel.node.name + ' active=' + comp.cityPanel.node.active : null;
    try { comp.openItems(); } catch (e) { out.itemsErr = String(e && e.message || e); }
    out.itemsPanelExists = !!comp.itemsPanel;
    out.itemsPanelNode = comp.itemsPanel ? comp.itemsPanel.node.name + ' active=' + comp.itemsPanel.node.active : null;
    return JSON.stringify(out);
  })()`, { returnByValue: true }));
  log('direct-call probe =', JSON.stringify(r1));
  await sleep(1500);
  const p = await shot('city_panel_direct.png');
  log('shot =', JSON.stringify(p));

  // 恢复
  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find(x => x && x.save && x.cities); try { comp.cityPanel && comp.cityPanel.close(); comp.itemsPanel && comp.itemsPanel.close && comp.itemsPanel.close(); } catch (e) {} return 'ok'; })()`, { returnByValue: true });
  await sleep(500);
  return r1;
}
