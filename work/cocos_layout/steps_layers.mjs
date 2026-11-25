// 找「地圖左下角淡色方塊」是誰畫的：逐層關掉再截圖（先 bringToFront，否則拿到凍結的舊幀）
export default async ({ send, evaluate, shot, sleep, log }) => {
  // 必須：分頁在前景 + lifecycle active + focus 模擬，否則 rAF 凍結、captureScreenshot 只給舊幀
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  const f1 = await evaluate('cc.director.getTotalFrames()');
  await sleep(700);
  const f2 = await evaluate('cc.director.getTotalFrames()');
  log('frames:', f1, '->', f2);
  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find((x) => x && x.save && x.cities); if (comp.cityPanel && comp.cityPanel.hide) comp.cityPanel.hide(); return 'ok'; })()`);
  await sleep(700);
  const names = ['CampaignBands', 'CampaignVeil', 'CampaignVeilScreen', 'CampaignCityIcons', 'CampaignUi', 'CampaignMap', 'CampaignBase', 'CampaignMapImage'];
  const out = [];
  const s0 = await shot('dbg_all.png');
  out.push({ n: '(all)', bytes: s0.bytes });
  for (const n of names) {
    const r = await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const k = c.children.find((x) => x.name === '${n}'); if (!k) return 'missing'; k.active = false; return 'off'; })()`);
    await sleep(400);
    const s = await shot('dbg_off_' + n + '.png');
    out.push({ n, r, bytes: s.bytes });
    await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const k = c.children.find((x) => x.name === '${n}'); if (k) k.active = true; return 'on'; })()`);
    await sleep(250);
  }
  log(JSON.stringify(out));
  return { frames: [f1, f2], out };
};
