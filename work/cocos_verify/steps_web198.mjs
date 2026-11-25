export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.bringToFront', {});
  await sleep(3000);
  const st0 = await ev("(() => { const w = window.__sanguo && window.__sanguo.world; return JSON.stringify({ has: !!w, tick: w ? w.tick : -1, generals: w ? w.sides.A.general.name : null }); })()");
  log('pre ' + JSON.stringify(st0));
  await evaluate("document.querySelector('#btnStart') ? (document.querySelector('#btnStart').click(), 'clicked') : 'nobtn'");
  for (let i = 0; i < 12; i++) { await sleep(1500); const t = await ev("(() => { const w = window.__sanguo && window.__sanguo.world; return JSON.stringify({ tick: w ? w.tick : -1, over: w ? !!w.over : null }); })()"); log('t' + i + ' ' + JSON.stringify(t)); if (t.tick > 240) break; }
  await shot('web_battle_persp');
}
