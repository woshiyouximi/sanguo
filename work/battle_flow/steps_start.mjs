// R210 复现：点 #start 后的开局镜头/位置（用户报「开局两将同屏」）。
//   PAGE_URL=http://127.0.0.1:5299/web/index.html MATCH=5299 PORT=9333 \
//     PROFILE=F:\sanguo\work\.edgeprof_flow OUTDIR=F:\sanguo\work\battle_flow \
//     node work\cocos_verify\cdpweb.mjs launch|run work\battle_flow\steps_start.mjs|close
export default async function steps({ s, evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  const snap = () =>
    ev(`(() => {
      const sg = window.__sanguo;
      const w = sg.state.world;
      const side = (k) => {
        const us = w.units.filter((u) => u.side === k && u.alive);
        const xs = us.map((u) => u.x);
        const gen = us.filter((u) => u.isGeneral).map((u) => ({ name: u.name || '', x: u.x, y: u.y }));
        return { n: us.length, xMin: Math.min(...xs), xMax: Math.max(...xs), gen };
      };
      return JSON.stringify({ tick: w.tick, camX: Math.round(sg.state.camX * 100) / 100, A: side('A'), B: side('B') });
    })()`);

  await s('Page.bringToFront', {});
  await sleep(1500);
  log('paused ' + JSON.stringify(await snap()));
  await shot('start_paused.png');

  const clicked = await evaluate(
    `(() => { const b = document.querySelector('#start'); if (!b) return 'nostart'; b.click(); return 'clicked'; })()`,
  );
  log('click ' + clicked);

  for (const [label, wait] of [['t_0.5s', 500], ['t_2s', 1500], ['t_4s', 2000]]) {
    await sleep(wait);
    log(label + ' ' + JSON.stringify(await snap()));
    await shot('start_' + label + '.png');
  }
}
