export default async ({ send, evaluate, sleep, log, shot }) => {
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await sleep(500);
  const a = await shot('dbg_before_black.png');
  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const k = c.children.find((x) => x.name === 'CampaignMapImage'); k.active = false; return 'off'; })()`);
  await sleep(500);
  const b = await shot('dbg_no_map.png');
  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const k = c.children.find((x) => x.name === 'CampaignMapImage'); k.active = true; return 'on'; })()`);
  await sleep(500);
  const c2 = await shot('dbg_with_map.png');
  log(JSON.stringify({ a: a.bytes, b: b.bytes, c: c2.bytes }));
  return { a: a.bytes, b: b.bytes, c: c2.bytes };
};
