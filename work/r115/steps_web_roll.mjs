// R115 真机验收（浏览器端）：确认网页战斗入口确实挂了原作乱数流，
// 并且开打后 tick 在涨、单位在动、roll 状态在消耗。
//
//   PAGE_URL=http://127.0.0.1:5299/web/index.html MATCH=5299 \
//     node work/cocos_verify/cdpweb.mjs launch|run work/r115/steps_web_roll.mjs|close
const OUT = process.env.OUTDIR || 'F:\\sanguo\\work\\r115';

export default async function steps({ s, evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const snap = () =>
    ev(`(() => {
      const sg = window.__sanguo;
      const w = sg && sg.state && sg.state.world;
      const r = w && w.roll;
      return JSON.stringify({
        hasWorld: !!w,
        tick: w ? w.tick : -1,
        over: w ? !!w.over : null,
        roll: r ? { a: r.stateA, b: r.stateB } : null,
        units: w ? w.units.length : 0,
        moved: w ? w.units.filter((u) => u.x !== Math.round(u.x) || u.lastActTick > 0).length : 0,
        general: w && w.sides.A.general ? w.sides.A.general.name : null,
      });
    })()`);

  await s('Page.bringToFront', {});
  await sleep(2500);
  const pre = await snap();
  log('pre ' + JSON.stringify(pre));

  const clicked = await evaluate(
    `(() => { const b = document.querySelector('#btnStart') || document.querySelector('#start'); if (!b) return 'nobtn'; b.click(); return 'clicked'; })()`,
  );
  log('click ' + clicked);

  let last = pre;
  for (let i = 0; i < 10; i += 1) {
    await sleep(1200);
    last = await snap();
    if (last.tick > (pre.tick ?? 0) + 120) break;
  }
  log('post ' + JSON.stringify(last));
  await shot('web_roll.png');
  log('OUT ' + OUT);
}
