export default async ({ evaluate, send, shot, sleep, log }) => {
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  const r = await evaluate(`(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const c = canvas.components.find((x) => x && x.save && x.cities);
    const ip = c.itemsPanel;
    if (ip && typeof ip.close === 'function') ip.close();
    const node = canvas.getChildByName('ItemsPanel');
    if (node) node.active = false;
    c.battleLog = [];
    c.refreshBattleLog();
    c.refresh();
    return { closed: !!ip, nodeActive: node ? node.active : null, rows: c.battleLog.length };
  })()`);
  await sleep(1200);
  const s1 = await shot('campaign_empty_log.png');
  log('campaign_empty_log.png', JSON.stringify(s1), JSON.stringify(r));
  return { r, s1 };
};
