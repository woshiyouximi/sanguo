export default async ({ send, evaluate, sleep, log, shot }) => {
  const st = await evaluate(`JSON.stringify({ vis: document.visibilityState, hidden: document.hidden, focus: document.hasFocus() })`);
  log('state0:', st);
  await send('Target.activateTarget', { targetId: (await send('Target.getTargetInfo')).targetInfo.targetId }).catch((e) => log('activate fail', e.message));
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch((e) => log('focus fail', e.message));
  await send('Page.bringToFront').catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch((e) => log('lifecycle fail', e.message));
  await sleep(800);
  const f1 = await evaluate('cc.director.getTotalFrames()');
  await sleep(1000);
  const f2 = await evaluate('cc.director.getTotalFrames()');
  const st2 = await evaluate(`JSON.stringify({ vis: document.visibilityState, focus: document.hasFocus(), paused: cc.game && cc.game.isPaused ? cc.game.isPaused() : null })`);
  log('frames', f1, '->', f2, st2);
  const s = await shot('dbg_focus.png');
  log('shot', JSON.stringify(s));
  return { st, st2, f1, f2, bytes: s.bytes };
};
