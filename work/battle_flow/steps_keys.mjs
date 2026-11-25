// 探查战斗页开局：暂停状态、按钮、单位字段名。
//   PAGE_URL=http://127.0.0.1:5299/web/index.html MATCH=5299 PORT=9333 \
//     PROFILE=F:\sanguo\work\.edgeprof_flow OUTDIR=F:\sanguo\work\battle_flow \
//     node work\cocos_verify\cdpweb.mjs launch|run work\battle_flow\steps_keys.mjs|close
export default async function steps({ evaluate, sleep, log, shot }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? v : JSON.stringify(v);
  };
  await sleep(1200);
  log('keys ' + (await ev(`(() => {
    const w = window.__sanguo.state.world;
    const u = w.units[0];
    const g = w.units.find((x) => x.isGeneral);
    return JSON.stringify({
      unitKeys: Object.keys(u).sort(),
      unit0: { side: u.side, x: u.x, y: u.y, gx: u.gx, gy: u.gy, name: u.name, alive: u.alive },
      generalKeys: g ? Object.keys(g).sort() : null,
      stateKeys: Object.keys(window.__sanguo.state).sort(),
      dom: Array.from(document.querySelectorAll('button,[role=button]')).map((b) => b.id || b.textContent.trim().slice(0, 12)).slice(0, 12),
      phase: window.__sanguo.state.phase ?? null,
      paused: window.__sanguo.state.paused ?? null,
    });
  })()`)));
  await shot('battle_keys.png');
}
